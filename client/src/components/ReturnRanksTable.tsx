import { useQuery } from '@tanstack/react-query'
import { fmtInt, fmtDecimalPct } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import {
  fetchCategoryBenchmarkById, fetchCategoryBenchmarkRow, fetchPeerGroupBenchmarkRow,
  type BenchmarkOption,
} from '@/lib/benchmarks'
import { QUERY_KEYS } from '@/hooks/queryKeys'

const PERIODS = [
  {
    label:      '1 M',
    fundReturn: 'one_month_total_return_nav',
    benchReturn:'one_month_total_return',
    catRank:    'one_month_total_return_rank_nav',
    catSize:    'one_month_total_return_rank_category_size_nav',
    pgRank:     'one_month_total_return_peer_group_rank_nav',
    pgSize:     'one_month_total_return_peer_group_size_nav',
  },
  {
    label:      '3 M',
    fundReturn: 'three_month_total_return_nav',
    benchReturn:'three_month_total_return',
    catRank:    'three_month_total_return_rank_nav',
    catSize:    'three_month_total_return_rank_category_size_nav',
    pgRank:     'three_month_total_return_peer_group_rank_nav',
    pgSize:     'three_month_total_return_peer_group_size_nav',
  },
  {
    label:      'YTD',
    fundReturn: 'ytd_total_return_nav',
    benchReturn:'ytd_total_return',
    catRank:    'ytd_total_return_rank_nav',
    catSize:    'ytd_total_return_rank_category_size_nav',
    pgRank:     'ytd_total_return_peer_group_rank_nav',
    pgSize:     'ytd_total_return_peer_group_size_nav',
  },
  {
    label:      '1 Y',
    fundReturn: 'one_year_total_return_nav',
    benchReturn:'annualized_daily_one_year_total_return',
    catRank:    'one_year_total_return_rank_nav',
    catSize:    'one_year_total_return_rank_category_size_nav',
    pgRank:     'one_year_total_return_peer_group_rank_nav',
    pgSize:     'one_year_total_return_peer_group_size_nav',
  },
  {
    label:      '3 Y',
    fundReturn: 'annualized_three_year_total_return_nav',
    benchReturn:'annualized_daily_three_year_return',
    catRank:    'three_year_total_return_rank_nav',
    catSize:    'three_year_total_return_rank_category_size_nav',
    pgRank:     'three_year_total_return_peer_group_rank_nav',
    pgSize:     'three_year_total_return_peer_group_size_nav',
  },
  {
    label:      '5 Y',
    fundReturn: 'annualized_five_year_total_return_nav',
    benchReturn:'annualized_daily_five_year_total_return',
    catRank:    'five_year_total_return_rank_nav',
    catSize:    'five_year_total_return_rank_category_size_nav',
    pgRank:     'five_year_total_return_peer_group_rank_nav',
    pgSize:     'five_year_total_return_peer_group_size_nav',
  },
] as const

function num(s: SecurityDetail, key: keyof SecurityDetail): number | null {
  const v = s[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function benchNum(b: BenchmarkOption, key: typeof PERIODS[number]['benchReturn']): number | null {
  const v = b[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function RankTable({
  title,
  security,
  rankKey,
  sizeKey,
  returnLabel,
  rankLabel,
  sizeLabel,
  benchmarkOverride = null,
}: {
  title: string
  security: SecurityDetail
  rankKey: keyof typeof PERIODS[number]
  sizeKey: keyof typeof PERIODS[number]
  returnLabel: string
  rankLabel: string
  sizeLabel: string
  /**
   * The cohort's benchmark row, supplying the cohort-return figures. Both tables
   * derive it (category from `ycharts_benchmark_category`, peer group from
   * `peer_group_name`) rather than reading the stored per-security averages, so
   * a fund whose cohort resolves to no benchmark row shows a dash instead of
   * quietly substituting a different number under the same label.
   */
  benchmarkOverride: BenchmarkOption | null
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 flex-1 min-w-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-100">
              <th scope="col" className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Trailing returns
              </th>
              {PERIODS.map((p) => (
                <th key={p.label} scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-700">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr className="bg-white">
              <th scope="row" className="max-w-[12rem] py-2 pl-3 pr-4 text-left text-xs font-medium text-gray-700">
                Total return (NAV)
              </th>
              {PERIODS.map((p) => (
                <td key={p.label} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs font-medium text-gray-900">
                  {fmtDecimalPct(num(security, p.fundReturn as keyof SecurityDetail))}
                </td>
              ))}
            </tr>
            {/* The cohort's own return, so the rank above it has something to be a
                rank OF. A rank of 8 means nothing without knowing whether the
                cohort made 3% or 30%. */}
            <tr className="bg-white">
              <th scope="row" className="max-w-[12rem] py-2 pl-3 pr-4 text-left text-xs font-medium text-gray-700">
                {returnLabel}
              </th>
              {PERIODS.map((p) => {
                const v = benchmarkOverride ? benchNum(benchmarkOverride, p.benchReturn) : null
                return (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-900">
                    {fmtDecimalPct(v)}
                  </td>
                )
              })}
            </tr>
            <tr className="bg-gray-50/80">
              <th scope="row" className="max-w-[12rem] py-2 pl-3 pr-4 text-left text-xs font-medium text-gray-500">
                {rankLabel}
              </th>
              {PERIODS.map((p) => (
                <td key={p.label} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                  {fmtInt(num(security, p[rankKey] as keyof SecurityDetail))}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50/80">
              <th scope="row" className="max-w-[12rem] py-2 pl-3 pr-4 text-left text-xs font-medium text-gray-500">
                {sizeLabel}
              </th>
              {PERIODS.map((p) => (
                <td key={p.label} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                  {fmtInt(num(security, p[sizeKey] as keyof SecurityDetail))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ReturnRanksTable({ security, mode }: { security: SecurityDetail; mode: 'cat' | 'pg' }) {
  // The category benchmark is derived, not configured: ycharts_benchmark_category
  // ("US Multi-Cap Growth") matches category_benchmarks.category, and that row's
  // returns are the ones shown. It is the SAME row the page header already names,
  // so header and table describe one index instead of two things.
  const categoryName = security.ycharts_benchmark_category
  const { data: categoryBench = null } = useQuery({
    queryKey: QUERY_KEYS.categoryBenchmarkRow(categoryName ?? ''),
    queryFn: () => fetchCategoryBenchmarkRow(categoryName!),
    enabled: !!categoryName,
  })

  // Explicit per-fund override, and the only route for the 9 funds whose
  // ycharts_benchmark_category matches no benchmark row. Wins when set.
  const benchId = security.preferred_benchmark1_id
  const { data: preferredBench = null } = useQuery({
    queryKey: QUERY_KEYS.categoryBenchmarkById(benchId ?? 0),
    queryFn: () => fetchCategoryBenchmarkById(benchId!),
    enabled: benchId != null,
  })

  const preferred = preferredBench ?? categoryBench

  // Same derivation on the peer-group side: peer_group_name ("Multi-Cap Growth
  // Funds") matches peer_group_benchmarks.peer_group_category, and that row's
  // benchmark supplies the cohort return. No per-fund override exists here —
  // preferred_benchmark1_id points at category_benchmarks.
  const peerGroupName = security.peer_group_name
  const { data: peerBench = null } = useQuery({
    queryKey: QUERY_KEYS.peerGroupBenchmarkRow(peerGroupName ?? ''),
    queryFn: () => fetchPeerGroupBenchmarkRow(peerGroupName!),
    enabled: !!peerGroupName,
  })

  if (mode === 'cat') {
    return (
      <RankTable
        title="Rank in Category"
        security={security}
        benchmarkOverride={preferred}
        rankKey="catRank"
        sizeKey="catSize"
        returnLabel="Category return"
        rankLabel="Category rank"
        sizeLabel="Category size"
      />
    )
  }
  return (
    <RankTable
      title="Rank in Peer Group"
      security={security}
      benchmarkOverride={peerBench}
      rankKey="pgRank"
      sizeKey="pgSize"
      returnLabel="Peer group return"
      rankLabel="Peer group rank"
      sizeLabel="Peer group size"
    />
  )
}
