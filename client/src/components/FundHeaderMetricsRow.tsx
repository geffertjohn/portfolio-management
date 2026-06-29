import { useQuery } from '@tanstack/react-query'
import { fetchCategoryBenchmark, fetchPeerGroupBenchmark } from '@/lib/benchmarks'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fmtText } from '@/lib/formatters'

type Props = {
  assetClass: string | null
  /** ycharts_benchmark_category from securities2 */
  category: string | null
  /** peer_group_name from securities2 */
  peerGroupName: string | null
}

export function FundHeaderMetricsRow({ assetClass, category, peerGroupName }: Props) {
  const { data: categoryBenchmark } = useQuery({
    queryKey: QUERY_KEYS.categoryBenchmark(category ?? ''),
    queryFn: () => fetchCategoryBenchmark(category!),
    enabled: !!category,
  })

  const { data: peerGroupBenchmark } = useQuery({
    queryKey: QUERY_KEYS.peerGroupBenchmark(peerGroupName ?? ''),
    queryFn: () => fetchPeerGroupBenchmark(peerGroupName!),
    enabled: !!peerGroupName,
  })

  return (
    <>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Asset class</dt>
        <dd className="mt-1 text-sm text-gray-900">{fmtText(assetClass)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Category</dt>
        <dd className="mt-1 text-sm text-gray-900">{fmtText(category)}</dd>
        {categoryBenchmark && (
          <dd className="mt-0.5 text-xs text-gray-400">{categoryBenchmark}</dd>
        )}
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Peer group</dt>
        <dd className="mt-1 text-sm text-gray-900">{fmtText(peerGroupName)}</dd>
        {peerGroupBenchmark && (
          <dd className="mt-0.5 text-xs text-gray-400">{peerGroupBenchmark}</dd>
        )}
      </div>
    </>
  )
}
