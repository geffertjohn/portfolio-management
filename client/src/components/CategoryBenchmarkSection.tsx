/**
 * CategoryBenchmarkSection
 *
 * Shown inside the monitoring panel when the Category tab is active.
 * Fetches the matching row from `category_benchmarks` using the security's
 * `ycharts_benchmark_category` field and renders MetricCards comparing the
 * fund's returns/ratios against the category benchmark.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fmtDecimalPct, fmtNum, EMPTY } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { MetricCard } from './MonitoringPanelShared'

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoryBenchmark = {
  category_ticker: string
  category_benchmark: string
  category: string
  etf_proxy: string | null
  annualized_daily_one_year_total_return: number | null
  annualized_daily_three_year_return: number | null
  annualized_daily_five_year_total_return: number | null
  historical_sharpe_1y: number | null
  historical_sortino_1y: number | null
  historical_sharpe_3y: number | null
  historical_sortino_3y: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns both the original string and a hyphen-normalized variant. */
function hyphenVariants(s: string): string[] {
  const normalized = s.replace(/-/g, ' ')
  return normalized === s ? [s] : [s, normalized]
}

async function fetchCategoryBenchmark(category: string): Promise<CategoryBenchmark | null> {
  const { data } = await supabase
    .from('category_benchmarks')
    .select(
      'category_ticker, category_benchmark, category, etf_proxy, ' +
      'annualized_daily_one_year_total_return, annualized_daily_three_year_return, ' +
      'annualized_daily_five_year_total_return, ' +
      'historical_sharpe_1y, historical_sortino_1y, historical_sharpe_3y, historical_sortino_3y',
    )
    .in('category', hyphenVariants(category))
    .limit(1)
    .maybeSingle()
  return (data as CategoryBenchmark | null) ?? null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CategoryBenchmarkSection({ security }: { security: SecurityDetail }) {
  const category = security.ycharts_benchmark_category

  const { data: bench, isLoading } = useQuery({
    queryKey: ['cat-benchmark-row', category],
    queryFn: () => fetchCategoryBenchmark(category!),
    enabled: !!category,
  })

  if (!category) return null
  if (isLoading) return <p className="text-xs text-gray-400">Loading benchmark…</p>
  if (!bench) return (
    <p className="text-xs text-gray-400">
      No category benchmark found for &quot;{category}&quot;
    </p>
  )

  const {
    category_benchmark,
    category_ticker,
    etf_proxy,
    annualized_daily_one_year_total_return: bmk1y,
    annualized_daily_three_year_return:     bmk3y,
    annualized_daily_five_year_total_return: bmk5y,
    historical_sharpe_3y:   bmkSharpe,
    historical_sortino_3y:  bmkSortino,
  } = bench

  const fund1y     = security.one_year_total_return_nav
  const fund3y     = security.annualized_three_year_total_return_nav
  const fund5y     = security.annualized_five_year_total_return_nav
  const fundSharpe = security.historical_sharpe_3y
  const fundSortino = security.historical_sortino_3y

  return (
    <div className="space-y-3">
      {/* Benchmark label */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-700">{category_benchmark}</span>
        <span className="font-mono text-xs text-gray-400">{category_ticker}</span>
        {etf_proxy && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            ETF proxy: {etf_proxy}
          </span>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard
          title="1Y Return"
          subtitle="vs category benchmark"
          displayValue={fund1y !== null ? fmtDecimalPct(fund1y) : EMPTY}
          rawValue={fund1y}
          neutral={bmk1y ?? 0}
          scale={0.3}
          higherIsBetter={true}
          benchmarkValue={bmk1y}
          components={bmk1y !== null ? [{ label: 'Benchmark', value: fmtDecimalPct(bmk1y) }] : []}
        />

        <MetricCard
          title="3Y Ann."
          subtitle="vs category benchmark"
          displayValue={fund3y !== null ? fmtDecimalPct(fund3y) : EMPTY}
          rawValue={fund3y}
          neutral={bmk3y ?? 0}
          scale={0.2}
          higherIsBetter={true}
          benchmarkValue={bmk3y}
          components={bmk3y !== null ? [{ label: 'Benchmark', value: fmtDecimalPct(bmk3y) }] : []}
        />

        <MetricCard
          title="5Y Ann."
          subtitle="vs category benchmark"
          displayValue={fund5y !== null ? fmtDecimalPct(fund5y) : EMPTY}
          rawValue={fund5y}
          neutral={bmk5y ?? 0}
          scale={0.2}
          higherIsBetter={true}
          benchmarkValue={bmk5y}
          components={bmk5y !== null ? [{ label: 'Benchmark', value: fmtDecimalPct(bmk5y) }] : []}
        />

        <MetricCard
          title="Sharpe 3Y"
          subtitle="vs category benchmark"
          displayValue={fundSharpe !== null ? fmtNum(fundSharpe) : EMPTY}
          rawValue={fundSharpe}
          neutral={bmkSharpe ?? 0}
          scale={2}
          higherIsBetter={true}
          benchmarkValue={bmkSharpe}
          components={bmkSharpe !== null ? [{ label: 'Benchmark', value: fmtNum(bmkSharpe) }] : []}
        />

        <MetricCard
          title="Sortino 3Y"
          subtitle="vs category benchmark"
          displayValue={fundSortino !== null ? fmtNum(fundSortino) : EMPTY}
          rawValue={fundSortino}
          neutral={bmkSortino ?? 0}
          scale={3}
          higherIsBetter={true}
          benchmarkValue={bmkSortino}
          components={bmkSortino !== null ? [{ label: 'Benchmark', value: fmtNum(bmkSortino) }] : []}
        />
      </div>
    </div>
  )
}
