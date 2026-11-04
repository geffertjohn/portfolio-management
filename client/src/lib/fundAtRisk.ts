/**
 * fundAtRisk.ts
 *
 * Turning a fund's cohort scorecard into the readings that justify an At-Risk
 * flag — so a fund entry records WHAT failed and at what level, the way a stock
 * entry does.
 *
 * **Why this exists.** A fund reaches the At-Risk list through the review
 * modal's At-Risk outcome, which called `addToAtRisk(securityId, [], …)` — an
 * EMPTY metrics array. IAGG has sat on the list since with no metrics at all,
 * and the consequences are not cosmetic:
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
import type { ScorecardRow, ScorecardCohort } from './fundScorecard'
import type { AtRiskMetric } from './atRisk'

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
