/**
 * fundAtRisk.ts
 *
 * Turning a fund's cohort scorecard into the readings that justify an At-Risk
 * flag — so a fund entry records WHAT failed and at what level, the way a stock
 * entry does.
 *
 * **Why this exists.** A fund reaches the At-Risk list through the review
 * modal's At-Risk outcome, which called `addToAtRisk(securityId, [], …)` — an
 * EMPTY metrics array. IAGG sat on the list since with no metrics at all, and
 * the consequences were not cosmetic (backfilled 12 Nov 2026 by
 * `scripts/atrisk/backfill-fund-metrics.ts`; this closes it for NEW flags):
 *
 *   - **The sell timer cannot tier.** `calcRemovalDate` sizes the deadline on
 *     the number of failing readings, so a count of zero takes the longest rung
 *     on the day table. IAGG drew a timer into Sept 2027.
 *   - **The entry is not re-measurable.** "Has this improved since we flagged
 *     it" has nothing to compare against, which is the one question the timer
 *     promises to answer.
 *   - **`AT_RISK_METRICS_BY_ASSET_CLASS`'s fund sets have no live reader** —
 *     documented as "funds use them, unchanged", which was not true.
 *
 * **The mapping, and why these comparators.** A stock metric is a value graded
 * against two comparators; a fund scorecard metric is a rank (or a raw reading)
 * bucketed into tiers 1–4. The honest translation is to grade against the tier
 * boundaries, taken from `ScorecardRow` rather than restated here:
 *
 *   - `flaggedBenchmark`  = **tier 3** threshold — the line OUT of tier 4
 *   - `flaggedBenchmark2` = **tier 2** threshold
 *
 * That makes the shared colour rule say the right thing: a reading still in
 * tier 4 beats neither line and grades RED (the flag stands); back in tier 3 it
 * beats one and grades AMBER, and amber clears the flag — which is exactly what
 * "no longer in the bottom tier" should mean. Tier 2 or better beats both and
 * grades green.
 *
 * `basis` is **`benchmarks`**, i.e. live rather than frozen. A fund's cohort
 * re-ranks every quarter and the comparator is external to us, so the real test
 * is beating the cohort *as it is now* — the same reasoning that keeps a stock's
 * growth comparators live while its margin comparators are frozen.
 */
import {
  buildFundScorecard, scoreBand, SCORE_YELLOW_MIN,
  type FundScorecard, type ScorecardRow, type ScorecardCohort, type ScoreBand,
} from './fundScorecard'
import type { SecurityDetail } from './securities'
import type { AtRiskMetric } from './atRisk'
import { fmtUtcLongDate } from './formatters'

/** `Information Ratio 3Y` → `information_ratio_3y`. */
export function metricKeyFor(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * The readings that would justify flagging this fund — the tier-4 rows.
 *
 * Tier 4 is the scorecard's own definition of a bottom-tier reading, so this
 * invents no threshold. A row with no data (`tier === null`) is NOT failing:
 * a metric we could not measure is not evidence against the fund, and counting
 * it would inflate the sell timer on missing data.
 */
export function failingScorecardRows(rows: ScorecardRow[]): ScorecardRow[] {
  return rows.filter((r) => r.tier === 4)
}

/**
 * Those rows as `AtRiskMetric`s, ready for `addToAtRisk`.
 *
 * `cohort` is recorded in the label so a reading can be read back against the
 * right comparison a year later — the same metric ranks differently against a
 * Morningstar category and against a peer group, and an entry that does not say
 * which is not re-measurable.
 */
export function atRiskMetricsFromScorecard(
  rows: ScorecardRow[],
  cohort: ScorecardCohort,
): AtRiskMetric[] {
  const suffix = cohort === 'category' ? 'category' : 'peer group'
  return failingScorecardRows(rows).map((r) => ({
    key: `${metricKeyFor(r.label)}_${cohort}`,
    label: `${r.label} (vs ${suffix})`,
    basis: 'benchmarks' as const,
    higherIsBetter: r.higherIsBetter,
    flaggedValue: r.displayVal,
    flaggedBenchmark: r.tier3Threshold,
    flaggedBenchmark2: r.tier2Threshold,
    currentValue: null,
    currentBenchmark: null,
    currentBenchmark2: null,
    measuredAt: null,
  }))
}

// ── The automatic flag ───────────────────────────────────────────────────────
//
// A fund that meets the firm's bar is added to the At-Risk list BY the review
// rather than by remembering to click, because the review is the moment the
// evidence is in front of someone and a flag nobody remembered to raise is a
// position nobody is watching.
//
// **TWO DIALS, like the stock rule, and for the same reason.** On the live book
// "any bottom-tier metric" would flag EIGHT of the 45 held funds, and six of
// them are fine: VVIAX and VIGAX fail only Manager Tenure at a total of 94.3,
// FAGIX and FTZIX only R-Square. Those metrics describe a fund rather than
// judge it — an index fund's manager tenure says nothing about whether it is
// failing — so a one-dial rule would put healthy funds on a sell timer and
// teach the reader to dismiss the list, which is what `never_run` and "AI
// research pending" already cost.
//
// So: the total score is in the RED band, OR enough readings are bottom-tier
// that the failure is broad. On today's book both dials select exactly IAGG,
// which is already flagged.

/** Bottom-tier readings that make a failure broad enough to flag on its own. */
export const AUTO_FLAG_MIN_FAILING = 3

export type FundFlagReason = 'red_score' | 'broad_failure' | 'both'

export interface FundFlagAssessment {
  /** Meets the bar AND can be recorded — see `blockedNoReadings`. */
  qualifies: boolean
  /** Null unless it qualifies. */
  reason: FundFlagReason | null
  band: ScoreBand | null
  score: number | null
  failing: ScorecardRow[]
  /**
   * It scores in the red band but has NO bottom-tier reading to record.
   *
   * Surfaced rather than silently skipped: that combination means the total is
   * low because cohort columns are MISSING — a missing metric contributes zero
   * points against a denominator that stays 100 — so it is a workbook gap
   * wearing the costume of a failing fund, and the advisor should see it.
   */
  blockedNoReadings: boolean
}

const NOT_ASSESSED: FundFlagAssessment = {
  qualifies: false, reason: null, band: null, score: null, failing: [], blockedNoReadings: false,
}

/**
 * Does this scorecard meet the bar for an automatic At-Risk flag?
 *
 * **An unscored fund is never flagged.** `buildFundScorecard` returns a total
 * of 0 when nothing could be graded, and 0 bands RED — so without this guard a
 * fund whose cohort columns the workbook has not filled would be put on a sell
 * timer for a data gap. "Not scored" is not "scored badly".
 *
 * **A flag must carry its readings.** `addToAtRisk` sizes the sell timer on how
 * many readings failed, so flagging with an empty array takes the longest rung
 * and leaves nothing to re-measure — the exact defect that left IAGG with a
 * timer into Sept 2027 and no metrics at all. A qualifying score with nothing
 * in the bottom tier therefore does NOT flag; it reports `blockedNoReadings`.
 */
export function assessFundFlag(scorecard: FundScorecard | null): FundFlagAssessment {
  if (!scorecard?.hasData) return NOT_ASSESSED

  const failing = failingScorecardRows(scorecard.rows)
  const band = scoreBand(scorecard.total)
  const red = band === 'red'
  const broad = failing.length >= AUTO_FLAG_MIN_FAILING
  const met: FundFlagReason | null =
    red && broad ? 'both' : red ? 'red_score' : broad ? 'broad_failure' : null

  if (met !== null && failing.length === 0) {
    return { ...NOT_ASSESSED, band, score: scorecard.total, blockedNoReadings: true }
  }
  return {
    qualifies: met !== null,
    reason: met,
    band,
    score: scorecard.total,
    failing,
    blockedNoReadings: false,
  }
}

/**
 * The cohort a fund is JUDGED against, from `securities2.scorecard_cohort`.
 *
 * Anything other than an explicit `peer` reads as category, so an unset cohort
 * is graded rather than skipped — and the surfaces say on screen that nothing
 * was designated. Extracted here because the automatic flag must use the
 * GOVERNED cohort, never whichever one the advisor happens to be looking at:
 * the toggle is for looking, and a write that followed it would make the book
 * depend on a view.
 */
export function designatedCohort(security: Pick<SecurityDetail, 'scorecard_cohort'>): ScorecardCohort {
  return security.scorecard_cohort === 'peer' ? 'peer' : 'category'
}

export interface AutoFlagEntry {
  securityId: string
  cohort: ScorecardCohort
  rows: ScorecardRow[]
  assessment: FundFlagAssessment
}

/**
 * Every holding this review would flag, against its designated cohort.
 *
 * Pure and shared, so the badge that warns "this will be flagged" and the write
 * that flags it cannot disagree about which holdings those are — the same
 * reason `buildFundScorecard` is read by both the table and the PDF.
 *
 * Already-flagged securities are excluded here rather than at the write, so the
 * count the advisor is shown is the count that will actually be added.
 */
export function autoFlagPlan(
  securities: SecurityDetail[],
  alreadyFlagged: ReadonlySet<string>,
): AutoFlagEntry[] {
  const out: AutoFlagEntry[] = []
  for (const s of securities) {
    if (alreadyFlagged.has(s.security_id)) continue
    const cohort = designatedCohort(s)
    const scorecard = buildFundScorecard(s, cohort)
    const assessment = assessFundFlag(scorecard)
    if (!assessment.qualifies) continue
    out.push({ securityId: s.security_id, cohort, rows: scorecard.rows, assessment })
  }
  return out
}

/**
 * The note recorded on an automatically raised flag.
 *
 * Every sentence stands on its own and names the measure and the threshold, the
 * rule the briefing jobs follow: this note is read a year later beside a sell
 * timer, by someone who does not have the review open.
 */
export function autoFlagNote(
  entry: AutoFlagEntry,
  portfolioName: string,
  cadence: string,
  when: Date = new Date(),
): string {
  const cohortLabel = entry.cohort === 'category' ? 'category' : 'peer group'
  const { score, failing, reason } = entry.assessment
  const parts: string[] = []
  if (reason === 'red_score' || reason === 'both') {
    parts.push(
      `its total scorecard score of ${score?.toFixed(1)} against its ${cohortLabel} is below the ${SCORE_YELLOW_MIN} the firm treats as the bottom of acceptable`,
    )
  }
  if (reason === 'broad_failure' || reason === 'both') {
    parts.push(
      `${failing.length} of its readings sit in the bottom tier (${failing.map((r) => r.label).join(', ')})`,
    )
  }
  return `Flagged automatically by the ${portfolioName} ${cadence} review on ${fmtUtcLongDate(when.toISOString())}, because ${parts.join(' and ')}.`
}
