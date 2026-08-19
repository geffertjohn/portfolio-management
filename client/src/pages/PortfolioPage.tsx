import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchPortfolios } from '@/lib/portfolio'
import { QUERY_KEYS } from '@/hooks/queryKeys'

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(2)}%`
}

const SUFFIX_ORDER = [
  'Conservative',
  'Conservative Balanced',
  'Balanced',
  'Balanced with Growth',
  'Growth',
]

const GROUPS = [
  { label: 'Foundation Models', prefix: 'Foundation' },
  { label: 'ETF Models',        prefix: 'ETF' },
  { label: 'Hybrid Models',     prefix: 'Hybrid' },
  { label: 'Equity & Fixed Income Models', prefix: null },
]

export function PortfolioPage() {
  const navigate = useNavigate()

  const { data: portfolios = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.portfolios,
    queryFn: fetchPortfolios,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading portfolios…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Failed to load portfolios</p>
        <p className="mt-1 text-sm text-red-700">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    )
  }

  function sortBySuffix<T extends { name: string }>(items: T[], prefix: string): T[] {
    return [...items].sort((a, b) => {
      const ai = SUFFIX_ORDER.indexOf(a.name.replace(prefix, '').trim())
      const bi = SUFFIX_ORDER.indexOf(b.name.replace(prefix, '').trim())
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }

  const grouped = GROUPS.map(({ label, prefix }) => {
    const items = portfolios.filter((p) =>
      prefix
        ? p.name.startsWith(prefix)
        : !['Foundation', 'ETF', 'Hybrid'].some((pfx) => p.name.startsWith(pfx))
    )
    return { label, items: prefix ? sortBySuffix(items, prefix) : items }
  }).filter(({ items }) => items.length > 0)

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Portfolios</h1>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 sm:table-cell">Dividend Yield</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">1M Return</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">3M Return</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">1Y Return</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">Std Dev</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">Max Drawdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grouped.map(({ label, items }) => (
              <React.Fragment key={label}>
                <tr className="bg-gray-50">
                  <td colSpan={7} className="px-4 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {label}
                    </span>
                  </td>
                </tr>
                {items.map((p) => (
                  <tr
                    key={p.name}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/portfolio/${encodeURIComponent(p.name)}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 sm:table-cell">
                      {fmtPct(p.dividend_yield)}
                    </td>
                    <td className={`hidden whitespace-nowrap px-4 py-3 text-right tabular-nums md:table-cell ${p.one_month_total_return == null ? 'text-gray-400' : p.one_month_total_return >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtPct(p.one_month_total_return)}
                    </td>
                    <td className={`hidden whitespace-nowrap px-4 py-3 text-right tabular-nums md:table-cell ${p.three_month_total_return == null ? 'text-gray-400' : p.three_month_total_return >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtPct(p.three_month_total_return)}
                    </td>
                    <td className={`hidden whitespace-nowrap px-4 py-3 text-right tabular-nums md:table-cell ${p.one_year_total_return == null ? 'text-gray-400' : p.one_year_total_return >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtPct(p.one_year_total_return)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 md:table-cell">
                      {fmtPct(p.monthly_standard_deviation_annualized_all)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 md:table-cell">
                      {fmtPct(p.max_drawdown_all)}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
