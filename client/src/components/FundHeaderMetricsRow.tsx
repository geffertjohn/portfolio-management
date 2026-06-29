import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fmtText } from '@/lib/formatters'

/** Returns both the original value and a hyphen-normalized variant (hyphens → spaces). */
function hyphenVariants(s: string): string[] {
  const normalized = s.replace(/-/g, ' ')
  return normalized === s ? [s] : [s, normalized]
}

/**
 * Looks up the category_benchmark from category_benchmarks where category matches
 * the security's ycharts_benchmark_category value. Matches with or without hyphens.
 */
async function fetchCategoryBenchmark(category: string): Promise<string | null> {
  const { data } = await supabase
    .from('category_benchmarks')
    .select('category_benchmark')
    .in('category', hyphenVariants(category))
    .not('category_benchmark', 'is', null)
    .limit(1)
    .maybeSingle()
  return data?.category_benchmark ?? null
}

/**
 * Looks up the peer_group_benchmark from peer_group_benchmarks where peer_group_category
 * matches the security's peer_group_name value. Matches with or without hyphens.
 */
async function fetchPeerGroupBenchmark(peerGroupName: string): Promise<string | null> {
  const { data } = await supabase
    .from('peer_group_benchmarks')
    .select('peer_group_benchmark')
    .in('peer_group_category', hyphenVariants(peerGroupName))
    .not('peer_group_benchmark', 'is', null)
    .limit(1)
    .maybeSingle()
  return data?.peer_group_benchmark ?? null
}

type Props = {
  assetClass: string | null
  /** ycharts_benchmark_category from securities2 */
  category: string | null
  /** peer_group_name from securities2 */
  peerGroupName: string | null
}

export function FundHeaderMetricsRow({ assetClass, category, peerGroupName }: Props) {
  const { data: categoryBenchmark } = useQuery({
    queryKey: ['cat-benchmark', category],
    queryFn: () => fetchCategoryBenchmark(category!),
    enabled: !!category,
  })

  const { data: peerGroupBenchmark } = useQuery({
    queryKey: ['pg-benchmark', peerGroupName],
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
