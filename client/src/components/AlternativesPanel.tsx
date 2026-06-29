/**
 * AlternativesPanel
 *
 * Stock "Alternatives" tab: two comparison tables (Scorecard metrics and
 * Trailing returns) with one row per security:
 *   Security (current) · Alt 1 · Alt 2 · Alt 3 · Benchmark 1 · Benchmark 2
 *
 * The three Alt slots are editable ticker fields persisted to securities2
 * (alt_1/alt_2/alt_3). Their metrics are fetched on-demand from FMP and are
 * NOT persisted. Benchmark rows come from the security's preferred benchmarks.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fmtDecimalPct, stripTotalReturn, EMPTY } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { saveAlternatives } from '@/lib/securities'
import { fetchBenchmarkOptions, fetchSectorBenchmarkOptions, type BenchmarkOption } from './BenchmarkPickerModal'
import { fetchScorecardMetrics, type ScorecardMetrics } from '@/lib/fmpRatios'
import { fetchStockReturns, fetchProfile, type TrailingReturns } from '@/lib/fmpMarket'
import { QUERY_KEYS } from '@/hooks/queryKeys'

// ── Column definitions ──────────────────────────────────────────────────────

const SCORE_COLS: { label: string; metric: keyof ScorecardMetrics; bench: keyof BenchmarkOption | null }[] = [
  { label: 'Operating Margin TTM', metric: 'operatingMargin', bench: null },
  { label: 'FCF Margin TTM',       metric: 'fcfMargin',       bench: null },
  { label: 'Revenue Growth TTM',   metric: 'revGrowthTtm',    bench: 'sales_growth_1_yr_generic' },
  { label: 'EPS Growth TTM',       metric: 'epsGrowthTtm',    bench: 'eps_growth_1_yr_generic' },
  { label: 'Revenue Growth 3Y',    metric: 'revCagr3y',       bench: 'sales_growth_3_yr_generic' },
  { label: 'EPS Growth 3Y',        metric: 'epsCagr3y',       bench: 'eps_growth_3_yr_generic' },
]

const RET_COLS: { label: string; metric: keyof TrailingReturns; bench: keyof BenchmarkOption }[] = [
  { label: '1M',  metric: 'oneMonth',   bench: 'one_month_total_return' },
  { label: '3M',  metric: 'threeMonth', bench: 'three_month_total_return' },
  { label: 'YTD', metric: 'ytd',        bench: 'ytd_total_return' },
  { label: '1Y',  metric: 'oneYear',    bench: 'annualized_daily_one_year_total_return' },
  { label: '3Y',  metric: 'threeYear',  bench: 'annualized_daily_three_year_return' },
  { label: '5Y',  metric: 'fiveYear',   bench: 'annualized_daily_five_year_total_return' },
]

const CELL = 'whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900'

function pct(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? fmtDecimalPct(v) : EMPTY
}

function benchNum(b: BenchmarkOption, key: keyof BenchmarkOption): number | null {
  const v = b[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// ── Metric cell rows (on-demand FMP per symbol) ─────────────────────────────

// Company name (from FMP /profile) for an Alt row's Position cell
function AltName({ symbol }: { symbol: string | null }) {
  const { data } = useQuery({
    queryKey: QUERY_KEYS.profile(symbol ?? ''),
    queryFn: () => fetchProfile(symbol!),
    enabled: !!symbol,
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
  })
  return <>{symbol ? (data?.companyName ?? EMPTY) : EMPTY}</>
}

function ScorecardCells({ symbol }: { symbol: string | null }) {
  const { data } = useQuery({
    queryKey: QUERY_KEYS.scorecardMetrics(symbol ?? ''),
    queryFn: () => fetchScorecardMetrics(symbol!),
    enabled: !!symbol,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  return (
    <>
      {SCORE_COLS.map((c) => (
        <td key={c.label} className={CELL}>{symbol ? pct(data?.[c.metric]) : EMPTY}</td>
      ))}
    </>
  )
}

function ReturnsCells({ symbol }: { symbol: string | null }) {
  const { data } = useQuery({
    queryKey: QUERY_KEYS.stockReturns(symbol ?? ''),
    queryFn: () => fetchStockReturns(symbol!),
    enabled: !!symbol,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  return (
    <>
      {RET_COLS.map((c) => (
        <td key={c.label} className={CELL}>{symbol ? pct(data?.[c.metric]) : EMPTY}</td>
      ))}
    </>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function AlternativesPanel({ security }: { security: SecurityDetail }) {
  const [alts, setAlts] = useState<[string, string, string]>([
    security.alt_1 ?? '', security.alt_2 ?? '', security.alt_3 ?? '',
  ])

  // Re-sync only when navigating to a DIFFERENT security. Intentionally excludes
  // alt_1/2/3: a background refetch (TanStack refetchOnWindowFocus fires whenever
  // the user tabs back from looking up a ticker) must NOT overwrite in-progress
  // local edits — doing so wiped unsaved Alt rows.
  useEffect(() => {
    setAlts([security.alt_1 ?? '', security.alt_2 ?? '', security.alt_3 ?? ''])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [security.id])

  const queryClient = useQueryClient()

  function persist(next: [string, string, string]) {
    if (security.id != null) {
      saveAlternatives(security.id, [next[0] || null, next[1] || null, next[2] || null])
        // Refresh the security record so the header "Related" tags (which read
        // alt_1/2/3 for stocks) update live as alternatives change here.
        .then(() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.security(security.id) }))
        .catch(() => {})
    }
  }

  function onAltChange(i: 0 | 1 | 2, value: string) {
    setAlts((prev) => {
      const next: [string, string, string] = [...prev]
      next[i] = value.toUpperCase()
      return next
    })
  }

  const { data: allBenchmarks = [] } = useQuery({
    queryKey: QUERY_KEYS.benchmarks,
    queryFn: fetchBenchmarkOptions,
  })
  const { data: allSectorBenchmarks = [] } = useQuery({
    queryKey: QUERY_KEYS.sectorBenchmarks,
    queryFn: fetchSectorBenchmarkOptions,
  })

  const bench1 = allBenchmarks.find((b) => b.id === security.preferred_benchmark1_id) ?? null
  const bench2 = allSectorBenchmarks.find((b) => b.id === security.preferred_benchmark2_id) ?? null
  const bench1Label = bench1 ? stripTotalReturn(bench1.category_benchmark ?? bench1.ticker) : 'Benchmark 1'
  const bench2Label = bench2 ? stripTotalReturn(bench2.sector ?? bench2.ticker) : 'Benchmark 2'

  const secLabel = security.security_name?.trim() || security.security_id

  // Editable label cell for an Alt row
  function altLabelCell(i: 0 | 1 | 2) {
    return (
      <input
        type="text"
        value={alts[i]}
        placeholder={`Alt ${i + 1}`}
        onChange={(e) => onAltChange(i, e.target.value)}
        onBlur={() => persist(alts)}
        className="w-28 rounded border border-gray-200 px-2 py-1 text-sm uppercase placeholder:normal-case placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
      />
    )
  }

  // Plain render function (NOT a component) — called inline so the editable Alt
  // <input> subtree is preserved across re-renders and never loses focus.
  function renderTable({
    title,
    columns,
    cells,
    benchCell,
  }: {
    title: string
    columns: { label: string }[]
    cells: (symbol: string | null) => ReactNode
    benchCell: (b: BenchmarkOption | null, colIdx: number) => string
  }) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                <th className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Position
                </th>
                <th className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Ticker
                </th>
                {columns.map((c) => (
                  <th key={c.label} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-700">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <th scope="row" className="max-w-[14rem] truncate py-2 pl-3 pr-4 text-left font-medium text-gray-900">
                  {secLabel}
                </th>
                <td className="py-2 pl-3 pr-4 text-left font-medium text-gray-700">{security.security_id}</td>
                {cells(security.security_id)}
              </tr>
              {([0, 1, 2] as const).map((i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                  <th scope="row" className="max-w-[14rem] truncate py-2 pl-3 pr-4 text-left text-gray-900">
                    <AltName symbol={alts[i].trim() || null} />
                  </th>
                  <td className="py-2 pl-3 pr-4 text-left">{altLabelCell(i)}</td>
                  {cells(alts[i].trim() || null)}
                </tr>
              ))}
              <tr className="bg-gray-50/80">
                <th scope="row" className="max-w-[14rem] truncate py-2 pl-3 pr-4 text-left font-medium text-gray-800">
                  {bench1Label}
                </th>
                <td className="py-2 pl-3 pr-4 text-left text-gray-600">{bench1?.ticker ?? EMPTY}</td>
                {columns.map((_, idx) => (
                  <td key={idx} className={CELL.replace('text-gray-900', 'text-gray-700')}>{benchCell(bench1, idx)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="max-w-[14rem] truncate py-2 pl-3 pr-4 text-left font-medium text-gray-800">
                  {bench2Label}
                </th>
                <td className="py-2 pl-3 pr-4 text-left text-gray-600">{bench2?.ticker ?? EMPTY}</td>
                {columns.map((_, idx) => (
                  <td key={idx} className={CELL.replace('text-gray-900', 'text-gray-700')}>{benchCell(bench2, idx)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {renderTable({
        title: 'Scorecard',
        columns: SCORE_COLS,
        cells: (symbol) => <ScorecardCells symbol={symbol} />,
        benchCell: (b, idx) => {
          const key = SCORE_COLS[idx].bench
          return b && key ? pct(benchNum(b, key)) : EMPTY
        },
      })}
      {renderTable({
        title: 'Trailing Returns',
        columns: RET_COLS,
        cells: (symbol) => <ReturnsCells symbol={symbol} />,
        benchCell: (b, idx) => (b ? pct(benchNum(b, RET_COLS[idx].bench)) : EMPTY),
      })}
    </div>
  )
}
