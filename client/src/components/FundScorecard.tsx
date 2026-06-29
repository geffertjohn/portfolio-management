/**
 * FundScorecard
 *
 * Renders a Category Scorecard and a Peer Group Scorecard for mutual fund / ETF
 * securities. Metric values are sourced from the securities2 table (SecurityDetail).
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
 *   > 1.1  → 10 pts (Tier 1)
 *   ≥ 1.0  → 8 pts  (Tier 2)
 *   ≥ 0.9  → 6 pts  (Tier 3)
 *   > 0.01 → 4 pts  (Tier 4)
 *   ≤ 0.01 → 0 pts
 *
 * Status dot thresholds (shown next to scorecard title):
 *   ≥ 70 → green  |  60–69 → yellow  |  < 60 → red
 */

import { useState } from 'react'
import type { SecurityDetail } from '@/lib/securities'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tier = 1 | 2 | 3 | 4

type MetricDef = {
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

// ── Metric definitions ────────────────────────────────────────────────────────

/**
 * Category scorecard metrics.
 * Sharpe, Info Ratio, and Alpha share the 3Y return rank category size as
 * denominator (matching the YCharts scorecard template behaviour).
 */
const CATEGORY_METRICS: MetricDef[] = [
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
const PEER_GROUP_METRICS: MetricDef[] = [
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

// ── Tier / score computation ───────────────────────────────────────────────────

function numVal(s: SecurityDetail, key: keyof SecurityDetail): number | null {
  const v = s[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const TIER_MULTIPLIERS: Record<Tier, number> = { 1: 1.0, 2: 0.75, 3: 0.5, 4: 0.25 }

type MetricResult = {
  displayVal: number | null  // rank or raw value shown in the Rank column
  size: number | null
  tier: Tier | null
  score: number | null       // points contributed (weight × multiplier × 100)
}

function computeMetric(def: MetricDef, s: SecurityDetail): MetricResult {
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
    return { displayVal: rank, size, tier, score }
  }

  // ── Value-based ───────────────────────────────────────────────────────────
  if (def.valueKey && def.valueType) {
    const val = numVal(s, def.valueKey)
    if (val == null) return { displayVal: null, size: null, tier: null, score: null }

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

    return { displayVal: val, size: null, tier, score }
  }

  return { displayVal: null, size: null, tier: null, score: null }
}

// ── Exported score helpers ────────────────────────────────────────────────────

/** Returns the total score (0–100) for a given metric set, or null if no data. */
export function computeScorecardScore(
  metrics: MetricDef[],
  security: SecurityDetail,
): number | null {
  const results = metrics.map((m) => computeMetric(m, security))
  if (!results.some((r) => r.tier != null)) return null
  return results.reduce((sum, r) => sum + (r.score ?? 0), 0)
}

export function categoryScorecardScore(security: SecurityDetail): number | null {
  return computeScorecardScore(CATEGORY_METRICS, security)
}

export function peerGroupScorecardScore(security: SecurityDetail): number | null {
  return computeScorecardScore(PEER_GROUP_METRICS, security)
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TIER_STYLES: Record<Tier, string> = {
  1: 'bg-green-100 text-green-800',
  2: 'bg-emerald-100 text-emerald-700',
  3: 'bg-amber-100 text-amber-800',
  4: 'bg-red-100 text-red-700',
}

function scoreDotClass(score: number): string {
  if (score >= 70) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-400'
  return 'bg-red-500'
}

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${TIER_STYLES[tier]}`}>
      {tier}
    </span>
  )
}

function fmtDisplayVal(val: number | null, valueType?: MetricDef['valueType']): string {
  if (val == null) return '—'
  if (valueType === 'tenure') return val.toFixed(1)
  if (valueType === 'rsquared') return val.toFixed(2)
  if (valueType === 'updown') return val.toFixed(2)
  // rank — integer
  return Math.round(val).toString()
}

function fmtScore(score: number | null): string {
  if (score == null) return '—'
  return score.toFixed(1)
}

// ── Single scorecard table ────────────────────────────────────────────────────

function ScorecardTable({
  title,
  subtitle,
  metrics,
  security,
}: {
  title: string
  subtitle: string | null
  metrics: MetricDef[]
  security: SecurityDetail
}) {
  const [collapsed, setCollapsed] = useState(false)
  const results = metrics.map((m) => ({ def: m, ...computeMetric(m, security) }))
  const totalScore = results.reduce((sum, r) => sum + (r.score ?? 0), 0)
  const hasAnyData = results.some((r) => r.tier != null)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="mb-3 flex w-full items-start justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              {title}
            </h3>
            {hasAnyData && (
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${scoreDotClass(totalScore)}`}
                title={`Score: ${totalScore.toFixed(1)} / 100`}
              />
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasAnyData && (
            <div className="text-right">
              <span className="text-xs text-gray-500">Total Score</span>
              <p className={`text-lg font-bold tabular-nums ${
                totalScore >= 70 ? 'text-green-700' :
                totalScore >= 60 ? 'text-amber-600' :
                'text-red-700'
              }`}>
                {totalScore.toFixed(1)}
                <span className="ml-0.5 text-xs font-normal text-gray-400">/ 100</span>
              </p>
            </div>
          )}
          <svg
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        !hasAnyData ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-600">
            No scorecard data available. Upload a securities Excel file to populate rank and metric values.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100">
                  <th scope="col" className="whitespace-nowrap py-2 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Metric
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-gray-700">
                    Weight
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-gray-700">
                    Rank / Value
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-gray-700">
                    Size
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold text-gray-700">
                    Tier
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-gray-700">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r, i) => (
                  <tr key={r.def.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                    <th scope="row" className="whitespace-nowrap py-2 pl-3 pr-4 text-left text-xs font-medium text-gray-800">
                      {r.def.label}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                      {Math.round(r.def.weight * 100)}%
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-800">
                      {fmtDisplayVal(r.displayVal, r.def.valueType)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                      {r.size != null ? Math.round(r.size).toString() : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      {r.tier != null ? <TierBadge tier={r.tier} /> : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs font-medium text-gray-900">
                      {fmtScore(r.score)}
                    </td>
                  </tr>
                ))}

                {/* Total row */}
                <tr className="border-t-2 border-gray-300 bg-gray-100">
                  <th scope="row" colSpan={5} className="py-2 pl-3 pr-4 text-left text-xs font-semibold text-gray-700">
                    Total Score
                  </th>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs font-bold ${
                    totalScore >= 70 ? 'text-green-700' :
                    totalScore >= 60 ? 'text-amber-600' :
                    'text-red-700'
                  }`}>
                    {hasAnyData ? totalScore.toFixed(1) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// ── Exported single-scorecard variants ───────────────────────────────────────

export function CategoryScorecardTable({ security }: { security: SecurityDetail }) {
  const subtitle = security.ycharts_benchmark_category?.trim() || security.category_name?.trim() || null
  return (
    <ScorecardTable
      title="Category Scorecard"
      subtitle={subtitle}
      metrics={CATEGORY_METRICS}
      security={security}
    />
  )
}

export function PeerGroupScorecardTable({ security }: { security: SecurityDetail }) {
  const subtitle = security.peer_group_name?.trim() || null
  return (
    <ScorecardTable
      title="Peer Group Scorecard"
      subtitle={subtitle}
      metrics={PEER_GROUP_METRICS}
      security={security}
    />
  )
}

