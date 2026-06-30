import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtDecimalPct, stripTotalReturn } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { saveSecurityBenchmarks } from '@/lib/securities'
import { BenchmarkPickerModal } from './BenchmarkPickerModal'
import { fetchBenchmarkOptions, fetchSectorBenchmarkOptions, benchmarkEtfProxy, type BenchmarkOption } from '@/lib/benchmarks'
import { fetchStockReturns, type TrailingReturns } from '@/lib/fmpMarket'
import { QUERY_KEYS } from '@/hooks/queryKeys'

// ── Period column definitions ─────────────────────────────────────────────────

type Period = {
  label: string
  retKey: keyof TrailingReturns
  benchKey: keyof BenchmarkOption
}

const PERIODS: Period[] = [
  { label: '1 M',  retKey: 'oneMonth',   benchKey: 'one_month_total_return' },
  { label: '3 M',  retKey: 'threeMonth', benchKey: 'three_month_total_return' },
  { label: 'YTD',  retKey: 'ytd',        benchKey: 'ytd_total_return' },
  { label: '1 Y',  retKey: 'oneYear',    benchKey: 'annualized_daily_one_year_total_return' },
  { label: '3 Y',  retKey: 'threeYear',  benchKey: 'annualized_daily_three_year_return' },
  { label: '5 Y',  retKey: 'fiveYear',   benchKey: 'annualized_daily_five_year_total_return' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function benchVal(b: BenchmarkOption, key: keyof BenchmarkOption): number | null {
  const v = b[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}


// ── Sub-components ────────────────────────────────────────────────────────────

function BenchmarkRowLabel({
  bench,
  placeholder,
  onClick,
}: {
  bench: BenchmarkOption | null
  placeholder: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to select a benchmark"
      className="group flex items-center gap-1.5 text-left font-medium text-gray-800 hover:text-gray-900"
    >
      <span className={bench ? 'text-gray-800' : 'text-gray-400 italic'}>
        {bench ? stripTotalReturn(bench.category_benchmark ?? bench.sector ?? bench.ticker) : placeholder}
      </span>
      <svg
        className="h-3 w-3 shrink-0 text-gray-400 group-hover:text-gray-600"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function StockReturnTable({ security }: { security: SecurityDetail }) {
  const secLabel = security.security_name?.trim() || security.security_id

  // ── Picker state ──────────────────────────────────────────────────────────
  const [bench1Id, setBench1Id] = useState<number | null>(security.preferred_benchmark1_id ?? null)
  const [bench2Id, setBench2Id] = useState<number | null>(security.preferred_benchmark2_id ?? null)
  const [pickerOpen, setPickerOpen] = useState<1 | 2 | null>(null)

  // Re-sync only when navigating to a *different* security (by stable id).
  // Depending on the editable benchmark fields would let a background refetch
  // (refetchOnWindowFocus) clobber an in-progress picker edit — see gotcha #9.
  useEffect(() => {
    setBench1Id(security.preferred_benchmark1_id ?? null)
    setBench2Id(security.preferred_benchmark2_id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [security.id])

  const { data: allBenchmarks = [] } = useQuery({
    queryKey: QUERY_KEYS.benchmarks,
    queryFn: fetchBenchmarkOptions,
  })

  const { data: allSectorBenchmarks = [] } = useQuery({
    queryKey: QUERY_KEYS.sectorBenchmarks,
    queryFn: fetchSectorBenchmarkOptions,
  })

  // Security trailing returns — fetched live from FMP (price-based), not securities2
  const { data: returns, isLoading: returnsLoading } = useQuery({
    queryKey: QUERY_KEYS.stockReturns(security.security_id),
    queryFn: () => fetchStockReturns(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  const bench1 = allBenchmarks.find((b) => b.id === bench1Id) ?? null
  const bench2 = allSectorBenchmarks.find((b) => b.id === bench2Id) ?? null

  // Benchmark trailing returns come from the representative ETF (total return),
  // since FMP doesn't serve the TR index symbols. Falls back to the stored
  // YCharts columns when no ETF proxy is mapped.
  const proxy1 = benchmarkEtfProxy(bench1?.ticker)
  const proxy2 = benchmarkEtfProxy(bench2?.ticker)
  const { data: bench1Returns } = useQuery({
    queryKey: QUERY_KEYS.stockReturns(proxy1 ?? ''),
    queryFn: () => fetchStockReturns(proxy1!),
    enabled: !!proxy1,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const { data: bench2Returns } = useQuery({
    queryKey: QUERY_KEYS.stockReturns(proxy2 ?? ''),
    queryFn: () => fetchStockReturns(proxy2!),
    enabled: !!proxy2,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const benchCell = (
    bench: BenchmarkOption | null,
    proxy: string | null,
    proxyReturns: TrailingReturns | undefined,
    p: Period,
  ): string => {
    if (!bench) return '—'
    if (proxy) return fmtDecimalPct(proxyReturns?.[p.retKey] ?? null)
    return fmtDecimalPct(benchVal(bench, p.benchKey))
  }

  function applyBenchmarks(next1: number | null, next2: number | null) {
    setBench1Id(next1)
    setBench2Id(next2)
    if (security.id) {
      saveSecurityBenchmarks(security.id, next1, next2).catch(() => {})
      window.dispatchEvent(
        new CustomEvent('benchmark-changed', {
          detail: { securityId: security.id, bench1Id: next1, bench2Id: next2 },
        })
      )
    }
  }

  function selectBench(slot: 1 | 2, bench: BenchmarkOption) {
    applyBenchmarks(slot === 1 ? bench.id : bench1Id, slot === 2 ? bench.id : bench2Id)
  }

  function clearBench(slot: 1 | 2) {
    applyBenchmarks(slot === 1 ? null : bench1Id, slot === 2 ? null : bench2Id)
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  // Empty only once the fetch has resolved with no usable returns; while loading
  // the table renders with placeholder cells.
  const empty = !returnsLoading && (!returns || !PERIODS.some((p) => returns[p.retKey] != null))

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        Total Performance
      </h3>

      {empty ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-600">
          No return data available from FMP for this security.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                <th
                  scope="col"
                  className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                >
                  Trailing returns
                </th>
                {PERIODS.map((p) => (
                  <th
                    key={p.label}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-700"
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {/* ── Security row ── */}
              <tr className="bg-white">
                <th scope="row" className="max-w-[14rem] py-2.5 pl-3 pr-4 text-left font-medium text-gray-900">
                  {secLabel}
                </th>
                {PERIODS.map((p) => (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-900">
                    {fmtDecimalPct(returns?.[p.retKey] ?? null)}
                  </td>
                ))}
              </tr>

              {/* ── Benchmark 1 row (category_benchmarks) ── */}
              <tr className="bg-gray-50/80">
                <th scope="row" className="max-w-[14rem] py-2.5 pl-3 pr-4 text-left font-medium text-gray-800">
                  <BenchmarkRowLabel
                    bench={bench1}
                    placeholder="Select benchmark 1"
                    onClick={() => setPickerOpen(1)}
                  />
                  {proxy1 && <span className="ml-1 text-xs font-normal text-gray-400" title={`Total-return proxy: ${proxy1}`}>· {proxy1}</span>}
                </th>
                {PERIODS.map((p) => (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-800">
                    {benchCell(bench1, proxy1, bench1Returns, p)}
                  </td>
                ))}
              </tr>

              {/* ── Benchmark 2 row (sector_benchmarks) ── */}
              <tr className="bg-white">
                <th scope="row" className="max-w-[14rem] py-2.5 pl-3 pr-4 text-left font-medium text-gray-800">
                  <BenchmarkRowLabel
                    bench={bench2}
                    placeholder="Select benchmark 2"
                    onClick={() => setPickerOpen(2)}
                  />
                  {proxy2 && <span className="ml-1 text-xs font-normal text-gray-400" title={`Total-return proxy: ${proxy2}`}>· {proxy2}</span>}
                </th>
                {PERIODS.map((p) => (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-800">
                    {benchCell(bench2, proxy2, bench2Returns, p)}
                  </td>
                ))}
              </tr>

            </tbody>
          </table>
        </div>
      )}

      {/* ── Benchmark picker modal ── */}
      {pickerOpen != null && (
        <BenchmarkPickerModal
          slot={pickerOpen}
          source={pickerOpen === 2 ? 'sector_benchmarks' : 'category_benchmarks'}
          currentId={pickerOpen === 1 ? (bench1?.id ?? null) : (bench2?.id ?? null)}
          onSelect={(bench) => selectBench(pickerOpen, bench)}
          onClear={() => clearBench(pickerOpen)}
          onClose={() => setPickerOpen(null)}
        />
      )}
    </div>
  )
}
