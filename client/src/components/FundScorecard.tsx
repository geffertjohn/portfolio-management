/**
 * FundScorecard
 *
 * Renders a Category Scorecard and a Peer Group Scorecard for mutual fund / ETF
 * securities. The tier/score computation lives in `lib/fundScorecard.ts` (React-free,
 * shared with the review-evidence PDF); this file is just the presentation.
 *
 * Status dot thresholds (shown next to scorecard title):
 *   ≥ 70 → green  |  60–69 → yellow  |  < 60 → red
 */

import { useState } from 'react'
import type { SecurityDetail } from '@/lib/securities'
import {
  buildFundScorecard, fmtScorecardValue,
  type Tier, type ScorecardCohort,
} from '@/lib/fundScorecard'

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

function fmtScore(score: number | null): string {
  if (score == null) return '—'
  return score.toFixed(1)
}

// ── Single scorecard table ────────────────────────────────────────────────────

function ScorecardTable({
  title,
  subtitle,
  cohort,
  security,
}: {
  title: string
  subtitle: string | null
  cohort: ScorecardCohort
  security: SecurityDetail
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { rows: results, total: totalScore, hasData: hasAnyData } = buildFundScorecard(security, cohort)

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
                  <tr key={r.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                    <th scope="row" className="whitespace-nowrap py-2 pl-3 pr-4 text-left text-xs font-medium text-gray-800">
                      {r.label}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                      {Math.round(r.weight * 100)}%
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-800">
                      {fmtScorecardValue(r.displayVal, r.valueType)}
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
      cohort="category"
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
      cohort="peer"
      security={security}
    />
  )
}

