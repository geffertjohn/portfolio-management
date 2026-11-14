/**
 * fundScorecard.ts
 *
 * Pure scoring logic for the fund/ETF Category and Peer Group scorecards. Metric
 * values are sourced from the securities2 table (SecurityDetail). Kept React-free
 * so both the on-page tables (`FundScorecard.tsx`) and the review-evidence PDF
 * (`reviewEvidencePdf.ts`) derive identical numbers from a single source.
 *
 * Tier logic (rank-based metrics):
 *   percentile = rank / size
 *   Tier 1: percentile < 0.10  → top 10%   → 100% of weight
 *   Tier 2: percentile < 0.25  → top 25%   →  75% of weight
 *   Tier 3: percentile < 0.50  → top 50%   →  50% of weight
 *   Tier 4: percentile ≥ 0.50  → bottom 50%→  25% of weight
 *
 * Value-based tiers (Manager Tenure, Tracking Error, Upside/Downside) use fixed thresholds
 * matching the original YCharts scorecard formulas.
 *
 * Upside/Downside 5Y uses custom fixed point values (not weight × multiplier):
 *   > 1.1  → 10 pts (Tier 1)  |  ≥ 1.0 → 8 pts (Tier 2)
 *   ≥ 0.9  → 6 pts  (Tier 3)  |  > 0.01 → 4 pts (Tier 4)  |  ≤ 0.01 → 0 pts
 */
import { getBroadAssetClass, type SecurityDetail } from './securities'

export type Tier = 1 | 2 | 3 | 4
export type ScorecardCohort = 'category' | 'peer'

export type MetricDef = {
  label: string
  /** Weight as a decimal (e.g. 0.05 = 5%). All weights sum to 1.0. */
  weight: number
  /** Rank column key — used for percentile-based tier calculation. */
  rankKey?: keyof SecurityDetail
  /** Denominator (cohort size) for the rank percentile. */
  sizeKey?: keyof SecurityDetail
  /** Actual value column — used for value-based tier calculation. */
  valueKey?: keyof SecurityDetail
  valueType?: 'tenure' | 'trackingError' | 'updown'
}

/**
 * Category scorecard metrics.
 * Sharpe, Info Ratio, and Alpha share the 3Y return rank category size as
 * denominator (matching the YCharts scorecard template behaviour).
 */
export const CATEGORY_METRICS: MetricDef[] = [
  { label: '1Y Total Return',      weight: 0.05, rankKey: 'one_year_total_return_rank_nav',    sizeKey: 'one_year_total_return_rank_category_size_nav' },
  { label: '3Y Total Return',      weight: 0.08, rankKey: 'three_year_total_return_rank_nav',  sizeKey: 'three_year_total_return_rank_category_size_nav' },
  { label: '5Y Total Return',      weight: 0.10, rankKey: 'five_year_total_return_rank_nav',   sizeKey: 'five_year_total_return_rank_category_size_nav' },
  { label: 'Sharpe Ratio 3Y',      weight: 0.20, rankKey: 'sharpe_rank',                       sizeKey: 'three_year_total_return_rank_category_size_nav' },
  { label: 'Information Ratio 3Y', weight: 0.20, rankKey: 'information_ratio_rank',            sizeKey: 'three_year_total_return_rank_category_size_nav' },
  { label: 'Expense Ratio',        weight: 0.07, rankKey: 'expense_ratio_rank',                sizeKey: 'one_year_total_return_rank_category_size_nav' },
  { label: 'Upside/Downside 5Y',   weight: 0.10, valueKey: 'upside_downside_5y_vs_category',   valueType: 'updown' },
  { label: 'Alpha 3Y',             weight: 0.10, rankKey: 'alpha_rank',                        sizeKey: 'three_year_total_return_rank_category_size_nav' },
  { label: 'Manager Tenure',       weight: 0.05, valueKey: 'max_manager_tenure',               valueType: 'tenure' },
  { label: 'Tracking Error 3Y',    weight: 0.05, valueKey: 'tracking_error_3y_vs_category',    valueType: 'trackingError' },
]

/** Peer group scorecard metrics. Same weights; peer group rank/size columns used. */
export const PEER_GROUP_METRICS: MetricDef[] = [
  { label: '1Y Total Return',      weight: 0.05, rankKey: 'one_year_total_return_peer_group_rank_nav',   sizeKey: 'one_year_total_return_peer_group_size_nav' },
  { label: '3Y Total Return',      weight: 0.08, rankKey: 'three_year_total_return_peer_group_rank_nav', sizeKey: 'three_year_total_return_peer_group_size_nav' },
  { label: '5Y Total Return',      weight: 0.10, rankKey: 'five_year_total_return_peer_group_rank_nav',  sizeKey: 'five_year_total_return_peer_group_size_nav' },
  { label: 'Sharpe Ratio 3Y',      weight: 0.20, rankKey: 'sharpe_peer_group_rank',                     sizeKey: 'three_year_total_return_peer_group_size_nav' },
  { label: 'Information Ratio 3Y', weight: 0.20, rankKey: 'information_ratio_peer_group_rank',          sizeKey: 'three_year_total_return_peer_group_size_nav' },
  { label: 'Expense Ratio',        weight: 0.07, rankKey: 'expense_ratio_peer_group_rank',              sizeKey: 'one_year_total_return_peer_group_size_nav' },
  { label: 'Upside/Downside 5Y',   weight: 0.10, valueKey: 'upside_downside_5y_vs_pg',                  valueType: 'updown' },
  { label: 'Alpha 3Y',             weight: 0.10, rankKey: 'alpha_peer_group_rank',                      sizeKey: 'three_year_total_return_peer_group_size_nav' },
  { label: 'Manager Tenure',       weight: 0.05, valueKey: 'max_manager_tenure',                        valueType: 'tenure' },
  { label: 'Tracking Error 3Y',    weight: 0.05, valueKey: 'tracking_error_3y_vs_pg',                   valueType: 'trackingError' },
]

/**
 * Tracking-error tier bands, as decimals, PER BROAD ASSET CLASS.
 *
 * **One set of thresholds cannot serve both, and that is measured rather than
 * assumed.** Across the 74 non-proxy funds carrying a 3Y figure on 13 Nov 2026:
 *
 *   fixed income (n=26)   p25 0.0065   p50 0.0106   p75 0.0192   max 0.0395
 *   equity       (n=48)   p25 0.0248   p50 0.0544   p75 0.0772   max 0.1787
 *
 * A bond fund at the very TOP of its class (395bp) sits below the equity
 * MEDIAN (544bp). Shared thresholds would score asset class, not manager
 * behaviour — every bond fund in the bottom tier, most equity funds in the top.
 *
 * The bands are those quartiles rounded to the nearest 5bp, so tier 1 is
 * roughly the top quartile of deviation within the fund's own broad class,
 * tier 2 above the median, tier 3 above the bottom quartile. They are a
 * snapshot of this book and will drift as it changes; re-derive them from the
 * same query rather than nudging them by hand.
 */
export const TRACKING_ERROR_TIERS: Record<'equity' | 'fixed income', [number, number, number]> = {
  // [tier 3 floor, tier 2 floor, tier 1 floor]
  'equity':       [0.0250, 0.0550, 0.0775],
  'fixed income': [0.0065, 0.0105, 0.0190],
}

/**
 * The bands for this security, or null when its broad asset class cannot be
 * placed. Null means NO TIER — see the caller. Reusing `getBroadAssetClass`
 * rather than reading `broad_asset_class` directly keeps this agreeing with
 * `FundPeerPanel`, which already decides which breakdown is meaningful.
 */
export function trackingErrorBands(s: SecurityDetail): [number, number, number] | null {
  const broad = getBroadAssetClass(s)
  return broad == null ? null : TRACKING_ERROR_TIERS[broad]
}

function numVal(s: SecurityDetail, key: keyof SecurityDetail): number | null {
  const v = s[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const TIER_MULTIPLIERS: Record<Tier, number> = { 1: 1.0, 2: 0.75, 3: 0.5, 4: 0.25 }

/** One computed scorecard row — carries everything the table and the PDF need. */
export interface ScorecardRow {
  label: string
  /** Weight as a decimal (0.05 = 5%). */
  weight: number
  /** Rank or raw value shown in the "Rank / Value" column. */
  displayVal: number | null
  size: number | null
  tier: Tier | null
  /** Points contributed (weight × multiplier × 100, or fixed for Upside/Downside). */
  score: number | null
  valueType?: MetricDef['valueType']
  /**
   * The readings at which this metric would reach tiers 3, 2 and 1, in the
   * same units as `displayVal`, with `higherIsBetter` saying which direction
   * clears them. `tier3Threshold` is the one that matters most: it is the line
   * out of tier 4, which is what "this metric has recovered" means.
   *
   * Exposed so the quarterly fund review can record WHY a holding was flagged
   * without restating the tier boundaries. They are decided in `computeMetric`
   * and nowhere else; a second copy is how a card ends up red while the list
   * that cites it says amber (the lesson `lib/scorecardColor.ts` carries).
   */
  tier3Threshold: number | null
  tier2Threshold: number | null
  tier1Threshold: number | null
  higherIsBetter: boolean
  /**
   * True when the TIER 1 boundary is strictly greater-than rather than
   * at-or-above. Only Upside/Downside is (`v > 1.1`), and it matters because
   * that metric rounds to 2dp before comparing, so exactly 1.10 is reachable
   * and lands in tier 2. Carried rather than re-derived: a tooltip that
   * restated the operator would be a second copy of the rule, which is how a
   * card ends up saying one thing and the table another.
   */
  tier1Exclusive: boolean
}

function computeMetric(def: MetricDef, s: SecurityDetail): ScorecardRow {
  // ── Rank-based ────────────────────────────────────────────────────────────
  if (def.rankKey && def.sizeKey) {
    const rank = numVal(s, def.rankKey)
    const size = numVal(s, def.sizeKey)
    const pct = rank != null && size != null && size > 0 ? rank / size : null
    const tier: Tier | null =
      pct == null ? null :
      pct < 0.10 ? 1 :
      pct < 0.25 ? 2 :
      pct < 0.50 ? 3 : 4
    const score = tier != null ? def.weight * TIER_MULTIPLIERS[tier] * 100 : null
    return {
      label: def.label, weight: def.weight, displayVal: rank, size, tier, score,
      valueType: def.valueType,
      // A rank: lower is better, and the boundaries are shares of the cohort.
      tier3Threshold: size != null && size > 0 ? size * 0.50 : null,
      tier2Threshold: size != null && size > 0 ? size * 0.25 : null,
      tier1Threshold: size != null && size > 0 ? size * 0.10 : null,
      higherIsBetter: false,
      tier1Exclusive: false,
    }
  }

  // ── Value-based ───────────────────────────────────────────────────────────
  if (def.valueKey && def.valueType) {
    const val = numVal(s, def.valueKey)
    if (val == null) {
      return {
        label: def.label, weight: def.weight, displayVal: null, size: null, tier: null, score: null,
        valueType: def.valueType, tier3Threshold: null, tier2Threshold: null, tier1Threshold: null,
        higherIsBetter: true, tier1Exclusive: false,
      }
    }

    let tier: Tier
    let score: number

    let tier3Threshold: number
    let tier2Threshold: number
    let tier1Threshold: number

    if (def.valueType === 'tenure') {
      // Manager Tenure: ≤1yr scores 0 regardless of tier bucket
      tier = val > 7 ? 1 : val > 5 ? 2 : val > 3 ? 3 : 4
      score = val > 1 ? def.weight * TIER_MULTIPLIERS[tier] * 100 : 0
      tier3Threshold = 3
      tier2Threshold = 5
      tier1Threshold = 7
    } else if (def.valueType === 'trackingError') {
      // HIGHER IS BETTER -- an active mandate is paid to deviate, and a fund
      // that does not is charging an active fee for index behaviour.
      const bands = trackingErrorBands(s)
      if (bands == null) {
        // Unplaceable asset class: NO TIER rather than a guessed one. Grading a
        // bond fund on equity bands would fail it for being a bond fund.
        return {
          label: def.label, weight: def.weight, displayVal: val, size: null,
          tier: null, score: null, valueType: def.valueType,
          tier3Threshold: null, tier2Threshold: null, tier1Threshold: null,
          higherIsBetter: true, tier1Exclusive: false,
        }
      }
      ;[tier3Threshold, tier2Threshold, tier1Threshold] = bands
      tier = val >= tier1Threshold ? 1 : val >= tier2Threshold ? 2 : val >= tier3Threshold ? 3 : 4
      // Like R-Squared before it, always worth at least 25% of weight: a fund
      // that hugs its index is still a holding, not a zero.
      score = def.weight * TIER_MULTIPLIERS[tier] * 100
    } else {
      // Upside/Downside — fixed point values (not weight × multiplier).
      // Round to 2 dp before comparing so a DB value like 0.9997 (displayed
      // as "1.00") correctly lands in Tier 2 rather than Tier 3.
      const v = Math.round(val * 100) / 100
      if (v > 1.1)        { tier = 1; score = 10 }
      else if (v >= 1.0)  { tier = 2; score = 8  }
      else if (v >= 0.9)  { tier = 3; score = 6  }
      else if (v > 0.01)  { tier = 4; score = 4  }
      else                { tier = 4; score = 0  }
      tier3Threshold = 0.9
      tier2Threshold = 1.0
      tier1Threshold = 1.1
    }

    return {
      label: def.label, weight: def.weight, displayVal: val, size: null, tier, score,
      valueType: def.valueType,
      tier3Threshold, tier2Threshold, tier1Threshold,
      higherIsBetter: true,  // every value-type metric here reads higher-is-better
      tier1Exclusive: def.valueType === 'updown',
    }
  }

  return {
    label: def.label, weight: def.weight, displayVal: null, size: null, tier: null, score: null,
    valueType: def.valueType, tier3Threshold: null, tier2Threshold: null, tier1Threshold: null,
    higherIsBetter: true, tier1Exclusive: false,
  }
}

/**
 * The tier bands this row was graded against, as display lines.
 *
 * Built ENTIRELY from the thresholds the row already carries — never by
 * re-deriving the rule. That is the whole reason `tier{1,2,3}Threshold`,
 * `higherIsBetter` and `tier1Exclusive` are on `ScorecardRow`: a second copy of
 * the thresholds is how a tooltip ends up disagreeing with the tier beside it.
 *
 * Empty when the row has no bands — an unscored metric, or a tracking error on
 * a fund whose broad asset class could not be placed.
 */
export function tierBandLines(r: ScorecardRow): string[] {
  const { tier1Threshold: t1, tier2Threshold: t2, tier3Threshold: t3 } = r
  if (t1 == null || t2 == null || t3 == null) return []

  const fmt = (v: number) => fmtScorecardValue(v, r.valueType)

  if (!r.higherIsBetter) {
    // A rank: lower is better, and the bands are shares of the cohort.
    const share = (v: number) => (r.size != null && r.size > 0 ? ` (top ${Math.round((v / r.size) * 100)}%)` : '')
    return [
      `Tier 1   rank ${fmt(t1)} or better${share(t1)}`,
      `Tier 2   rank ${fmt(t2)} or better${share(t2)}`,
      `Tier 3   rank ${fmt(t3)} or better${share(t3)}`,
      `Tier 4   anything below`,
    ]
  }

  return [
    `Tier 1   ${r.tier1Exclusive ? 'above' : 'at or above'} ${fmt(t1)}`,
    `Tier 2   at or above ${fmt(t2)}`,
    `Tier 3   at or above ${fmt(t3)}`,
    `Tier 4   below ${fmt(t3)}`,
  ]
}

/**
 * How this row's score was arrived at.
 *
 * Two shapes, because the scorer has two. Most metrics are
 * `weight x tier multiplier x 100`; Upside/Downside awards FIXED points and
 * says so, since presenting it as a weighted calculation would invite the
 * reader to check arithmetic that was never performed.
 */
export function scoreFormulaLines(r: ScorecardRow): string[] {
  if (r.tier == null || r.score == null) {
    return ['Not scored — no value for this metric.']
  }

  const pct = `${Math.round(r.weight * 100)}%`

  if (r.valueType === 'updown') {
    return [
      `Tier ${r.tier} -> ${r.score.toFixed(1)} points`,
      `Fixed points for this metric, not weight x multiplier.`,
    ]
  }

  const mult = TIER_MULTIPLIERS[r.tier]
  // Show the EXACT product, and name the rounding when the cell differs from
  // it. The table prints one decimal, so "5% x 25% x 100 = 1.3" is arithmetic
  // that does not add up — and an explanation whose sums are wrong is worse
  // than no explanation.
  const exact = r.weight * mult * 100
  const shown = r.score.toFixed(1)
  // Compare NUMERICALLY: "20" and "20.0" are the same number, and noting a
  // rounding that did not happen is its own small lie.
  const rounds = Math.abs(exact - Number(shown)) < 1e-9
  const exactStr = rounds ? shown : String(Number(exact.toFixed(4)))
  const tail = rounds ? '' : ` (shown as ${shown})`
  const lines = [
    `${pct} weight x ${Math.round(mult * 100)}% (tier ${r.tier}) x 100 = ${exactStr}${tail}`,
    `Tier 1 pays 100% of the weight, tier 2 75%, tier 3 50%, tier 4 25%.`,
  ]
  if (r.valueType === 'tenure' && r.score === 0) {
    lines.push(`Scored 0: a manager of 1 year or less pays nothing whatever the tier.`)
  }
  return lines
}

export interface FundScorecard {
  rows: ScorecardRow[]
  total: number
  hasData: boolean
}

/** Compute a full scorecard (rows + total) for the given cohort. */
export function buildFundScorecard(security: SecurityDetail, cohort: ScorecardCohort): FundScorecard {
  const metrics = cohort === 'category' ? CATEGORY_METRICS : PEER_GROUP_METRICS
  const rows = metrics.map((m) => computeMetric(m, security))
  const total = rows.reduce((sum, r) => sum + (r.score ?? 0), 0)
  const hasData = rows.some((r) => r.tier != null)
  return { rows, total, hasData }
}

/** Returns the total score (0–100) for a cohort, or null if no data. */
export function scorecardScore(security: SecurityDetail, cohort: ScorecardCohort): number | null {
  const { total, hasData } = buildFundScorecard(security, cohort)
  return hasData ? total : null
}

export function categoryScorecardScore(security: SecurityDetail): number | null {
  return scorecardScore(security, 'category')
}

export function peerGroupScorecardScore(security: SecurityDetail): number | null {
  return scorecardScore(security, 'peer')
}

// ── Banding a total score ────────────────────────────────────────────────────
//
// THE TWO NUMBERS LIVE HERE AND NOWHERE ELSE. They were written out in four
// places across `FundMonitoringPanel` and `FundScorecard` — the dot beside each
// cohort toggle, the dot on the card, the headline figure and the table's total
// row — so a change to the firm's definition of an acceptable fund had to be
// made in four files, and a miss would have shown one fund green in the header
// and amber in the table it heads. That is the `consensusColor` failure, where
// two copies of a colour rule drifted until "Moderate Buy" rendered as "Strong
// Buy"; `sharedHelpers.test.ts` names the helper to import rather than only
// saying not to re-implement it, and the same applies here.
//
// It matters more from here on: the planned fund-review automation grades
// Maintain against At-Risk on this same line, and a job restating the threshold
// would be a fifth copy — one the advisor cannot see on screen.
//
// **The band is the firm's rule, not a display choice**, which is why it is in
// the lib with the scoring rather than in the component with the Tailwind. The
// class maps stay at the call sites: those ARE display choices, and the two
// surfaces legitimately differ (a solid dot against a text colour).

/** Green at or above this; the firm's line for an acceptable fund. */
export const SCORE_GREEN_MIN = 70
/** Yellow at or above this, red below it. */
export const SCORE_YELLOW_MIN = 60

export type ScoreBand = 'green' | 'yellow' | 'red'

/**
 * Band a fund's total scorecard score.
 *
 * Null in, null out — "not scored" is not "scored badly". A fund whose cohort
 * columns the workbook has not filled has no reading at all, and painting it
 * red would report a data gap as a judgement about the fund.
 *
 * **A FULLY SCORED fund cannot land near zero, but a partly scored one can,
 * and the band cannot tell the two apart.** Tier 4 still pays 25% of each
 * metric's weight, so a fund in the bottom half of everything scores about 26 —
 * 20 from the rank metrics' floor, 1.25 each from tenure and R-square, 4 from
 * Upside/Downside. A missing metric, though, contributes 0 while the total is
 * still read against 100, and `hasData` asks only whether ANY metric scored. So
 * a 12 means "most of this fund's cohort columns are empty", not "worst in
 * class". Read the per-row tiers before acting on a low red.
 */
export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= SCORE_GREEN_MIN) return 'green'
  if (score >= SCORE_YELLOW_MIN) return 'yellow'
  return 'red'
}

/** Format a scorecard row's "Rank / Value" cell. */
export function fmtScorecardValue(val: number | null, valueType?: MetricDef['valueType']): string {
  if (val == null) return '—'
  if (valueType === 'tenure') return val.toFixed(1)
  // Tracking error is a decimal fraction and small: 0.0192 reads as "1.92%".
  // Two decimals of a raw fraction would print every bond fund as "0.01".
  if (valueType === 'trackingError') return `${(val * 100).toFixed(2)}%`
  if (valueType === 'updown') return val.toFixed(2)
  return Math.round(val).toString() // rank — integer
}
