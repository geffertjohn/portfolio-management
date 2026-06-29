import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ASSET_CLASS_ROWS, type ModelPortfolio } from '@/lib/modelPortfolios'
import { fetchBenchmarkByName } from '@/lib/benchmarks'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { Portfolio } from '@/types/portfolio'

interface PortfolioOverviewProps {
  portfolio: Portfolio
  overrideModelPortfolio: ModelPortfolio | null | undefined
}

const PALETTE = [
  '#0f2d4d', '#c9954c', '#4a7c59', '#6366f1', '#94a3b8',
  '#ef4444', '#f59e0b', '#06b6d4', '#8b5cf6', '#10b981',
]

const CATEGORY_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: 'Equity',
    keys: ['large_cap_blend', 'large_cap_value', 'large_cap_growth', 'us_mid_cap', 'us_small_cap', 'non_us_developed', 'emerging_market'],
  },
  {
    label: 'Fixed Income',
    keys: ['ig_intermediate_fixed_income', 'non_ig_fixed_income', 'ig_short_fixed_income', 'non_us_fixed_income', 'multi_sector_fixed_income'],
  },
  {
    label: 'Alternatives',
    keys: ['alternatives'],
  },
  {
    label: 'Cash',
    keys: ['cash'],
  },
]

function fmtPct(v: number | null) {
  return v != null ? `${v.toFixed(1)}%` : '—'
}

export function PortfolioOverview({ portfolio, overrideModelPortfolio }: PortfolioOverviewProps) {
  const modelPortfolio = overrideModelPortfolio

  const effectiveBenchmark = modelPortfolio?.benchmark ?? ''

  const { data: benchmarkReturns, isLoading: benchmarkLoading } = useQuery({
    queryKey: QUERY_KEYS.benchmarkByName(effectiveBenchmark),
    queryFn: () => fetchBenchmarkByName(effectiveBenchmark),
    enabled: !!effectiveBenchmark,
  })

  const IG_FIXED_INCOME_KEYS = ['ig_intermediate_fixed_income', 'ig_short_fixed_income']

  const allocationRows = (() => {
    if (!modelPortfolio) return []
    const mp = modelPortfolio as unknown as Record<string, unknown>

    const sumField = (keys: string[], field: string) =>
      keys.reduce((s, k) => s + ((mp[`${k}_${field}`] as number | null) ?? 0), 0)

    const rows: { label: string; lower: number | null; target: number | null; upper: number | null }[] = []

    for (const { label, key } of ASSET_CLASS_ROWS) {
      if (IG_FIXED_INCOME_KEYS.includes(key)) continue
      const target = (mp[`${key}_target`] as number | null) ?? 0
      const upper = (mp[`${key}_upper_limit`] as number | null) ?? 0
      if (!target && !upper) continue
      // Insert merged IG Fixed Income row before non-IG fixed income
      if (key === 'non_ig_fixed_income' && sumField(IG_FIXED_INCOME_KEYS, 'target') > 0) {
        rows.push({
          label: 'Investment Grade Fixed Income',
          lower:  sumField(IG_FIXED_INCOME_KEYS, 'lower_limit'),
          target: sumField(IG_FIXED_INCOME_KEYS, 'target'),
          upper:  sumField(IG_FIXED_INCOME_KEYS, 'upper_limit'),
        })
      }
      rows.push({
        label,
        lower:  mp[`${key}_lower_limit`] as number | null,
        target: mp[`${key}_target`]      as number | null,
        upper:  mp[`${key}_upper_limit`] as number | null,
      })
    }

    if (!rows.some((r) => r.label === 'Investment Grade Fixed Income') && sumField(IG_FIXED_INCOME_KEYS, 'target') > 0) {
      rows.push({
        label: 'Investment Grade Fixed Income',
        lower:  sumField(IG_FIXED_INCOME_KEYS, 'lower_limit'),
        target: sumField(IG_FIXED_INCOME_KEYS, 'target'),
        upper:  sumField(IG_FIXED_INCOME_KEYS, 'upper_limit'),
      })
    }

    return rows
  })()

  const pieData = modelPortfolio
    ? CATEGORY_GROUPS.map(({ label, keys }) => {
        const total = keys.reduce((sum, key) => {
          const v = (modelPortfolio as unknown as Record<string, unknown>)[`${key}_target`] as number | null
          return sum + (v ?? 0)
        }, 0)
        return { name: label, value: Math.round(total * 10) / 10 }
      }).filter((d) => d.value > 0)
    : []

  return (
    <div className="mt-6 space-y-6">

      {/* Risk metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {([
          { label: 'Alpha 1Y',   value: portfolio.market_alpha_12_month },
          { label: 'Beta 1Y',    value: portfolio.quarterly_market_beta_12_month },
          { label: 'Sharpe 1Y',  value: portfolio.historical_sharpe_1y },
          { label: 'Sortino 1Y', value: portfolio.historical_sortino_1y },
          { label: 'Treynor 1Y', value: portfolio.historical_treynor_measure_1y },
        ]).map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {value != null ? value.toFixed(2) : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Asset Class Allocation */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Asset Class Allocation</h3>
        </div>

        {!modelPortfolio ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">No model portfolio linked to this portfolio.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
            {/* Pie + legend */}
            <div className="flex items-center justify-center">
              {pieData.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No targets set on this model portfolio.</p>
              ) : (
                <div className="flex items-center gap-4 w-full">
                  <div className="w-[260px] shrink-0">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={125} dataKey="value" stroke="none">
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5 min-w-0">
                    {pieData.map((item, i) => (
                      <li key={item.name} className="flex items-center gap-1.5 text-xs">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                        <span className="truncate text-gray-600">{item.name}</span>
                        <span className="ml-auto pl-2 font-medium text-gray-900 tabular-nums">{item.value}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Allocation table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0f2d4d] text-white">
                    <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Asset Class</th>
                    <th className="w-20 px-3 py-2 text-center font-semibold">Lower</th>
                    <th className="w-20 px-3 py-2 text-center font-semibold">Target</th>
                    <th className="w-20 px-3 py-2 text-center font-semibold rounded-tr-md">Upper</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allocationRows.map(({ label, lower, target, upper }) => (
                    <tr key={label} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{label}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{fmtPct(lower)}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-900">{fmtPct(target)}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{fmtPct(upper)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Total Returns */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Total Returns</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0f2d4d] text-white">
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">1 Mo</th>
              <th className="px-4 py-2 text-left font-semibold">3 Mo</th>
              <th className="px-4 py-2 text-left font-semibold">YTD</th>
              <th className="px-4 py-2 text-left font-semibold">1 Yr</th>
              <th className="px-4 py-2 text-left font-semibold">3 Yr</th>
              <th className="px-4 py-2 text-left font-semibold">5 Yr</th>
              <th className="px-4 py-2 text-left font-semibold">10 Yr</th>
              <th className="px-4 py-2 text-left font-semibold">All Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Portfolio row */}
            <tr>
              <td className="px-4 py-3 font-medium text-gray-900">{portfolio.name}</td>
              {([
                portfolio.one_month_total_return,
                portfolio.three_month_total_return,
                portfolio.ytd_total_return,
                portfolio.one_year_total_return,
                portfolio.annualized_three_year_total_return,
                portfolio.annualized_five_year_total_return,
                portfolio.annualized_ten_year_total_return,
                portfolio.annualized_daily_all_time_total_return,
              ] as (number | null)[]).map((v, i) => {
                const isAllTime = i === 7
                return (
                  <td key={i} className={`px-4 py-3 font-medium tabular-nums ${v == null ? 'text-gray-400' : v >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {v != null ? `${(v * 100).toFixed(2)}%` : '—'}
                    {isAllTime && portfolio.earliest_performance_date && (
                      <div className="text-[10px] font-normal text-gray-400 tabular-nums">
                        {new Date(portfolio.earliest_performance_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
            {/* Benchmark row */}
            {effectiveBenchmark && (
              <tr className="bg-gray-50">
                <td className="px-4 py-3 text-gray-600">
                  <span className="font-medium">Benchmark</span>
                  {benchmarkLoading ? (
                    <span className="ml-1.5 text-xs text-gray-400 animate-pulse">Loading…</span>
                  ) : benchmarkReturns ? (
                    <span className="ml-1.5 text-xs text-gray-400">({benchmarkReturns.security_name ?? effectiveBenchmark})</span>
                  ) : (
                    <span className="ml-1.5 text-xs text-amber-500">No data</span>
                  )}
                </td>
                {([
                  benchmarkReturns?.one_month_total_return ?? null,
                  benchmarkReturns?.three_month_total_return ?? null,
                  benchmarkReturns?.ytd_total_return ?? null,
                  benchmarkReturns?.one_year_total_return ?? null,
                  benchmarkReturns?.annualized_three_year_total_return ?? null,
                  benchmarkReturns?.annualized_five_year_total_return ?? null,
                  benchmarkReturns?.annualized_ten_year_total_return ?? null,
                  benchmarkReturns?.annualized_daily_all_time_total_return ?? null,
                ] as (number | null)[]).map((v, i) => (
                  <td key={i} className={`px-4 py-3 tabular-nums ${benchmarkLoading ? 'text-gray-300 animate-pulse' : v == null ? 'text-gray-400' : v >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {benchmarkLoading ? '—' : v != null ? `${(v * 100).toFixed(2)}%` : '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
