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
 * Value-based tiers (Manager Tenure, R-Square, Upside/Downside) use fixed thresholds
 * matching the original YCharts scorecard formulas.
 *
 * Upside/Downside 5Y uses custom fixed point values (not weight × multiplier):
 *   > 1.1  → 10 pts (Tier 1)  |  ≥ 1.0 → 8 pts (Tier 2)
 *   ≥ 0.9  → 6 pts  (Tier 3)  |  > 0.01 → 4 pts (Tier 4)  |  ≤ 0.01 → 0 pts
 */
import type { SecurityDetail } from './securities'

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
  valueType?: 'tenure' | 'rsquared' | 'updown'
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
  { label: 'R-Square 3Y',          weight: 0.05, valueKey: 'rsquared_3y_vs_category',          valueType: 'rsquared' },
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
  { label: 'R-Square 3Y',          weight: 0.05, valueKey: 'rsquared_3y_vs_pg',                         valueType: 'rsquared' },
]

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
    }
  }

  // ── Value-based ───────────────────────────────────────────────────────────
  if (def.valueKey && def.valueType) {
    const val = numVal(s, def.valueKey)
    if (val == null) {
      return {
        label: def.label, weight: def.weight, displayVal: null, size: null, tier: null, score: null,
        valueType: def.valueType, tier3Threshold: null, tier2Threshold: null, tier1Threshold: null, higherIsBetter: true,
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
    } else if (def.valueType === 'rsquared') {
      // R-Squared: always scores at least 25% of weight (no zero case)
      tier = val >= 0.95 ? 1 : val >= 0.85 ? 2 : val >= 0.70 ? 3 : 4
      score = def.weight * TIER_MULTIPLIERS[tier] * 100
      tier3Threshold = 0.70
      tier2Threshold = 0.85
      tier1Threshold = 0.95
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
    }
  }

  return {
    label: def.label, weight: def.weight, displayVal: null, size: null, tier: null, score: null,
    valueType: def.valueType, tier3Threshold: null, tier2Threshold: null, tier1Threshold: null, higherIsBetter: true,
  }
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
  if (valueType === 'rsquared') return val.toFixed(2)
  if (valueType === 'updown') return val.toFixed(2)
  return Math.round(val).toString() // rank — integer
}
