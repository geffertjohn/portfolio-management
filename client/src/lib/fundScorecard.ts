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
    return { label: def.label, weight: def.weight, displayVal: rank, size, tier, score, valueType: def.valueType }
  }

  // ── Value-based ───────────────────────────────────────────────────────────
  if (def.valueKey && def.valueType) {
    const val = numVal(s, def.valueKey)
    if (val == null) return { label: def.label, weight: def.weight, displayVal: null, size: null, tier: null, score: null, valueType: def.valueType }

    let tier: Tier
    let score: number

    if (def.valueType === 'tenure') {
      // Manager Tenure: ≤1yr scores 0 regardless of tier bucket
      tier = val > 7 ? 1 : val > 5 ? 2 : val > 3 ? 3 : 4
      score = val > 1 ? def.weight * TIER_MULTIPLIERS[tier] * 100 : 0
    } else if (def.valueType === 'rsquared') {
      // R-Squared: always scores at least 25% of weight (no zero case)
      tier = val >= 0.95 ? 1 : val >= 0.85 ? 2 : val >= 0.70 ? 3 : 4
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
    }

    return { label: def.label, weight: def.weight, displayVal: val, size: null, tier, score, valueType: def.valueType }
  }

  return { label: def.label, weight: def.weight, displayVal: null, size: null, tier: null, score: null, valueType: def.valueType }
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

/** Format a scorecard row's "Rank / Value" cell. */
export function fmtScorecardValue(val: number | null, valueType?: MetricDef['valueType']): string {
  if (val == null) return '—'
  if (valueType === 'tenure') return val.toFixed(1)
  if (valueType === 'rsquared') return val.toFixed(2)
  if (valueType === 'updown') return val.toFixed(2)
  return Math.round(val).toString() // rank — integer
}
