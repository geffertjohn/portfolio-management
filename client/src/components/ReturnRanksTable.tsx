import { fmtInt, fmtDecimalPct } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'

const PERIODS = [
  {
    label:      '1 M',
    fundReturn: 'one_month_total_return_nav',
    catRank:    'one_month_total_return_rank_nav',
    catSize:    'one_month_total_return_rank_category_size_nav',
    pgRank:     'one_month_total_return_peer_group_rank_nav',
    pgSize:     'one_month_total_return_peer_group_size_nav',
  },
  {
    label:      '3 M',
    fundReturn: 'three_month_total_return_nav',
    catRank:    'three_month_total_return_rank_nav',
    catSize:    'three_month_total_return_rank_category_size_nav',
    pgRank:     'three_month_total_return_peer_group_rank_nav',
    pgSize:     'three_month_total_return_peer_group_size_nav',
  },
  {
    label:      'YTD',
    fundReturn: 'ytd_total_return_nav',
    catRank:    'ytd_total_return_rank_nav',
    catSize:    'ytd_total_return_rank_category_size_nav',
    pgRank:     'ytd_total_return_peer_group_rank_nav',
    pgSize:     'ytd_total_return_peer_group_size_nav',
  },
  {
    label:      '1 Y',
    fundReturn: 'one_year_total_return_nav',
    catRank:    'one_year_total_return_rank_nav',
    catSize:    'one_year_total_return_rank_category_size_nav',
    pgRank:     'one_year_total_return_peer_group_rank_nav',
    pgSize:     'one_year_total_return_peer_group_size_nav',
  },
  {
    label:      '3 Y',
    fundReturn: 'annualized_three_year_total_return_nav',
    catRank:    'three_year_total_return_rank_nav',
    catSize:    'three_year_total_return_rank_category_size_nav',
    pgRank:     'three_year_total_return_peer_group_rank_nav',
    pgSize:     'three_year_total_return_peer_group_size_nav',
  },
  {
    label:      '5 Y',
    fundReturn: 'annualized_five_year_total_return_nav',
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

function RankTable({
  title,
  security,
  rankKey,
  sizeKey,
  rankLabel,
  sizeLabel,
}: {
  title: string
  security: SecurityDetail
  rankKey: keyof typeof PERIODS[number]
  sizeKey: keyof typeof PERIODS[number]
  rankLabel: string
  sizeLabel: string
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
  if (mode === 'cat') {
    return (
      <RankTable
        title="Rank in Category"
        security={security}
        rankKey="catRank"
        sizeKey="catSize"
        rankLabel="Category rank"
        sizeLabel="Category size"
      />
    )
  }
  return (
    <RankTable
      title="Rank in Peer Group"
      security={security}
      rankKey="pgRank"
      sizeKey="pgSize"
      rankLabel="Peer group rank"
      sizeLabel="Peer group size"
    />
  )
}
