import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtText } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { fetchCategoryBenchmark, fetchPeerGroupBenchmark } from '@/lib/benchmarks'
import { DataAsOf } from '@/components/DataAsOf'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ReturnRanksTable } from './ReturnRanksTable'
import { CategoryScorecardTable, PeerGroupScorecardTable } from './FundScorecard'
import { categoryScorecardScore, peerGroupScorecardScore } from '@/lib/fundScorecard'

/**
 * Monitoring panel for funds/ETFs (both equity and fixed income). The equity and
 * fixed-income variants were byte-for-byte identical, so they were merged into
 * this single component.
 *
 * `showCohortReference` renders the Category/Peer group name + benchmark index
 * below the toggle — used in the review modal (which has no header identity block).
 *
 * The Alpha / Information Ratio / Sharpe / Expense Ratio headline cards were
 * REMOVED from the UI, here and therefore in the review modal that embeds this.
 * Presentation only: the underlying columns are untouched and still drive the
 * scorecard score (those four carry 57 of its 100 points), the At-Risk criteria,
 * and the review evidence PDF — which deliberately still prints them, so the
 * archived evidence is broader than the screen it was captured from.
 */
export function FundMonitoringPanel({
  security,
  showCohortReference = false,
}: {
  security: SecurityDetail
  showCohortReference?: boolean
}) {
  const [rankMode, setRankMode] = useState<'pg' | 'cat'>('pg')

  const categoryName = security.ycharts_benchmark_category ?? null
  const peerGroupName = security.peer_group_name ?? null
  const { data: categoryBenchmark } = useQuery({
    queryKey: QUERY_KEYS.categoryBenchmark(categoryName ?? ''),
    queryFn: () => fetchCategoryBenchmark(categoryName!),
    enabled: showCohortReference && !!categoryName,
  })
  const { data: peerGroupBenchmark } = useQuery({
    queryKey: QUERY_KEYS.peerGroupBenchmark(peerGroupName ?? ''),
    queryFn: () => fetchPeerGroupBenchmark(peerGroupName!),
    enabled: showCohortReference && !!peerGroupName,
  })

  const isPg = rankMode === 'pg'

  const catScore = categoryScorecardScore(security)
  const pgScore  = peerGroupScorecardScore(security)

  function dotClass(score: number | null) {
    if (score == null) return null
    if (score >= 70) return 'bg-green-500'
    if (score >= 60) return 'bg-yellow-400'
    return 'bg-red-500'
  }

  return (
    <section className="space-y-4">

      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setRankMode('cat')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 transition-colors ${!isPg ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Category
            {dotClass(catScore) && (
              <span className={`inline-block h-2 w-2 rounded-full ${dotClass(catScore)}`} title={`Score: ${catScore!.toFixed(1)} / 100`} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setRankMode('pg')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 transition-colors ${isPg ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Peer group
            {dotClass(pgScore) && (
              <span className={`inline-block h-2 w-2 rounded-full ${dotClass(pgScore)}`} title={`Score: ${pgScore!.toFixed(1)} / 100`} />
            )}
          </button>
        </div>
        <DataAsOf sources={['ycharts_funds', 'ycharts_benchmarks']} />
      </div>

      {/* Cohort reference — name + benchmark index for each side (modal only) */}
      {showCohortReference && (
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-md border px-3 py-2 ${!isPg ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50/60'}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Category</p>
            <p className="mt-0.5 text-sm text-gray-900">{fmtText(categoryName)}</p>
            {categoryBenchmark && <p className="mt-0.5 text-xs text-gray-400">{categoryBenchmark}</p>}
          </div>
          <div className={`rounded-md border px-3 py-2 ${isPg ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50/60'}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Peer group</p>
            <p className="mt-0.5 text-sm text-gray-900">{fmtText(peerGroupName)}</p>
            {peerGroupBenchmark && <p className="mt-0.5 text-xs text-gray-400">{peerGroupBenchmark}</p>}
          </div>
        </div>
      )}

      <ReturnRanksTable security={security} mode={rankMode} />
      {isPg ? <PeerGroupScorecardTable security={security} /> : <CategoryScorecardTable security={security} />}
    </section>
  )
}
