import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ASSET_CLASS_ROWS, type ModelPortfolio } from '@/lib/modelPortfolios'
import { fetchBenchmarkByName } from '@/lib/benchmarks'
import { computeAllocationBands, type BandRow, type BandStatus } from '@/lib/allocationBands'
import { useLatestActualAllocation } from '@/hooks/usePortfolio'
import { useSecurities } from '@/hooks/useSecurities'
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
    keys: ['large_cap_blend', 'large_cap_growth', 'large_cap_value', 'us_mid_cap', 'us_small_cap', 'non_us_developed', 'emerging_market'],
  },
  {
    label: 'Fixed Income',
    keys: ['ig_intermediate_fixed_income', 'ig_short_fixed_income', 'non_ig_fixed_income', 'non_us_fixed_income', 'multi_sector_fixed_income'],
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

/**
 * An allocation file older than this is called out on the card. A breach fired
 * from a stale file is worse than one not fired at all, and nothing else on the
 * page says how old the holdings are.
 */
const STALE_ALLOCATION_DAYS = 30

const STATUS_CLASS: Record<BandStatus, string> = {
  ok: 'text-gray-900',
  above: 'font-semibold text-amber-600',
  below: 'font-semibold text-amber-600',
  not_allowed: 'font-semibold text-red-600',
}

const STATUS_TITLE: Record<BandStatus, string> = {
  ok: 'Within band',
  above: 'Above the upper limit',
  below: 'Below the lower limit',
  not_allowed: 'This model does not permit this asset class',
}

/** One tier-1 / tier-2 table. Target is shown only where the model sets one. */
function BandTable({ rows, showActual }: { rows: BandRow[]; showActual: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-[#0f2d4d] text-white">
          <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Asset Class</th>
          <th className="w-20 px-3 py-2 text-center font-semibold">Lower</th>
          <th className="w-20 px-3 py-2 text-center font-semibold">Target</th>
          <th className={`w-20 px-3 py-2 text-center font-semibold ${showActual ? '' : 'rounded-tr-md'}`}>Upper</th>
          {showActual && <th className="w-20 px-3 py-2 text-center font-semibold rounded-tr-md">Actual</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <tr key={r.key} className="hover:bg-gray-50">
            <td className="px-3 py-2 font-medium text-gray-900">{r.label}</td>
            <td className="px-3 py-2 text-center text-gray-600">{fmtPct(r.lower)}</td>
            {/* No target set means the band alone governs -- showing 0.0% here
                would read as a breach against any real holding. */}
            <td className="px-3 py-2 text-center font-semibold text-gray-900">{fmtPct(r.target)}</td>
            <td className="px-3 py-2 text-center text-gray-600">{fmtPct(r.upper)}</td>
            {showActual && (
              <td className={`px-3 py-2 text-center tabular-nums ${STATUS_CLASS[r.status]}`} title={STATUS_TITLE[r.status]}>
                {r.actual.toFixed(2)}%
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function fmtPct(v: number | null) {
  return v != null ? `${v.toFixed(2)}%` : '—'
}

export function PortfolioOverview({ portfolio, overrideModelPortfolio }: PortfolioOverviewProps) {
  const modelPortfolio = overrideModelPortfolio

  const effectiveBenchmark = modelPortfolio?.benchmark ?? ''

  const { data: benchmarkReturns, isLoading: benchmarkLoading } = useQuery({
    queryKey: QUERY_KEYS.benchmarkByName(effectiveBenchmark),
    queryFn: () => fetchBenchmarkByName(effectiveBenchmark),
    enabled: !!effectiveBenchmark,
  })

  /**
   * One row per funded asset class, straight from ASSET_CLASS_ROWS.
   *
   * The intermediate and short IG sleeves used to be summed into a synthesized
   * "Investment Grade Fixed Income" row here, which made this table disagree
   * with the Model Portfolios settings page for the same numbers. They are
   * separate classes in the firm taxonomy, so they render separately.
   *
   * A class with neither a target nor an upper limit is unfunded and skipped.
   */
  const allocationRows = (() => {
    if (!modelPortfolio) return []
    const mp = modelPortfolio as unknown as Record<string, unknown>

    return ASSET_CLASS_ROWS.flatMap(({ label, key }) => {
      const target = mp[`${key}_target`]      as number | null
      const upper  = mp[`${key}_upper_limit`] as number | null
      if (!target && !upper) return []
      return [{ label, lower: mp[`${key}_lower_limit`] as number | null, target, upper }]
    })
  })()

  const pieData = modelPortfolio
    ? CATEGORY_GROUPS.map(({ label, keys }) => {
        const total = keys.reduce((sum, key) => {
          const v = (modelPortfolio as unknown as Record<string, unknown>)[`${key}_target`] as number | null
          return sum + (v ?? 0)
        }, 0)
        return { name: label, value: Math.round(total * 100) / 100 }
      }).filter((d) => d.value > 0)
    : []

  // ── Actual-vs-band (tiers 1 and 2) ────────────────────────────────────────
  // Actual weights come from the most recent file in the portfolio's Documents
  // folder. Only the all-stock portfolios get one; everywhere else this is null
  // and the card falls back to showing the model's bands alone.
  const { data: actualAllocation } = useLatestActualAllocation(portfolio.name)
  const { data: securities = [] } = useSecurities()
  const bands = actualAllocation
    ? computeAllocationBands(actualAllocation.weights, securities, modelPortfolio ?? null)
    : null

  const asOfDays = actualAllocation
    ? Math.floor((Date.now() - new Date(actualAllocation.asOf).getTime()) / 86_400_000)
    : null
  const asOfStale = asOfDays != null && asOfDays >= STALE_ALLOCATION_DAYS

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
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Asset Class Allocation</h3>
          {actualAllocation ? (
            <p className={`text-xs ${asOfStale ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
              Actual as of {new Date(actualAllocation.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {asOfStale && ` · ${asOfDays} days old`}
            </p>
          ) : (
            <p className="text-xs text-gray-400">
              No allocation file uploaded — showing model bands only
            </p>
          )}
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
                  <div className="w-[210px] shrink-0">
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" stroke="none">
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend doubles as tier 1: the pie is the model's targets,
                      the second figure is actual with band status. */}
                  <ul className="space-y-1.5 min-w-0">
                    {pieData.map((item, i) => {
                      const t1 = bands?.tier1.find((r) => r.label === item.name)
                      return (
                        <li key={item.name} className="flex items-center gap-1.5 text-xs">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                          <span className="whitespace-nowrap text-gray-600">{item.name}</span>
                          <span className="ml-auto pl-2 font-medium text-gray-900 tabular-nums">{item.value.toFixed(2)}%</span>
                          {t1 && (
                            <span
                              className={`w-16 pl-2 text-right tabular-nums ${STATUS_CLASS[t1.status]}`}
                              title={`Actual ${t1.actual.toFixed(2)}% · ${STATUS_TITLE[t1.status]}`}
                            >
                              {t1.actual.toFixed(2)}%
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {bands && (
                    <p className="sr-only">Second figure in each legend row is the actual allocation.</p>
                  )}
                </div>
              )}
            </div>

            {/* Allocation table — tier 2. With an allocation file this also carries
                the actual column and band status; without one it is the model's
                bands alone, exactly as before. */}
            <div className="overflow-x-auto">
              <BandTable
                rows={bands
                  ? bands.tier2
                  : allocationRows.map((r) => ({
                      key: r.label, label: r.label, target: r.target,
                      lower: r.lower, upper: r.upper, actual: 0, status: 'ok' as const,
                    }))}
                showActual={!!bands}
              />
              {bands && bands.unclassified.length > 0 && (
                // Never silently dropped: unclassified weight is why the column
                // would otherwise not sum to 100%.
                <p className="mt-2 text-xs font-medium text-amber-600">
                  {bands.unclassified.reduce((sum, u) => sum + u.weight, 0).toFixed(2)}% unclassified —{' '}
                  {bands.unclassified.map((u) => u.symbol).join(', ')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Total Returns — every portfolio, Equity included. These are YCharts' own
          model figures, refreshed daily by the workbook import. They were hidden
          for Equity portfolios in favour of a locally computed Performance panel;
          that engine zeroed a trading day per rebalance and has been removed. */}
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
