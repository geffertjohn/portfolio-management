import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBenchmarkTable } from '@/lib/benchmarks'
import { QUERY_KEYS } from '@/hooks/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>

type ColDef = {
  header: string
  field: string
  className?: string
  /** Render as a monospace identifier (symbol / security id). */
  mono?: boolean
}

type MetricFields = {
  oneYear: string
  threeYear: string
  fiveYear: string
}

const DEFAULT_METRICS: MetricFields = {
  oneYear:   'annualized_daily_one_year_total_return',
  threeYear: 'annualized_daily_three_year_return',
  fiveYear:  'annualized_daily_five_year_total_return',
}

const MODEL_METRICS: MetricFields = {
  oneYear:   'one_year_total_return',
  threeYear: 'annualized_three_year_total_return',
  fiveYear:  'annualized_five_year_total_return',
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: unknown): string {
  const n = Number(v)
  if (v == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(2)}%`
}

// ── Section table ─────────────────────────────────────────────────────────────

function SectionTable({
  title,
  rows,
  cols,
  metrics,
  isLoading,
}: {
  title: string
  rows: AnyRow[]
  cols: ColDef[]
  metrics: MetricFields
  isLoading: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center gap-2 text-left text-sm font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
      >
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
        {title}
      </button>
      {open &&
        (isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-sm text-gray-400">
          No data
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full table-fixed divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {cols.map((c) => (
                  <th key={c.field} className={`px-4 py-3 text-left font-semibold text-gray-900 ${c.className ?? ''}`}>
                    {c.header}
                  </th>
                ))}
                <th className="hidden w-28 whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900 md:table-cell">1Y Return</th>
                <th className="hidden w-28 whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900 lg:table-cell">3Y Ann.</th>
                <th className="hidden w-28 whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900 lg:table-cell">5Y Ann.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) =>
                    c.mono ? (
                      <td key={c.field} className={`px-4 py-3 font-mono font-medium text-gray-900 ${c.className ?? ''}`}>
                        {String(row[c.field] ?? '—')}
                      </td>
                    ) : (
                      <td key={c.field} className={`px-4 py-2 min-w-[140px] ${c.className ?? ''}`}>
                        <span className="text-sm text-gray-700">
                          {row[c.field] != null ? String(row[c.field]) : '—'}
                        </span>
                      </td>
                    ),
                  )}
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-700 md:table-cell">
                    {fmtPct(row[metrics.oneYear])}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-700 lg:table-cell">
                    {fmtPct(row[metrics.threeYear])}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-700 lg:table-cell">
                    {fmtPct(row[metrics.fiveYear])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Column definitions ─────────────────────────────────────────────────────────

// The three same-shape tables (Category / Peer Group / Sector) share an
// identical first-column width so their Benchmark Name and return columns line
// up across tables regardless of header/content length.
const LABEL_COL_CLASS = 'w-64'

const CATEGORY_COLS: ColDef[] = [
  { header: 'Category',       field: 'category', className: LABEL_COL_CLASS },
  { header: 'Benchmark Name', field: 'category_benchmark' },
]

const PEER_GROUP_COLS: ColDef[] = [
  { header: 'Peer Group Category', field: 'peer_group_category', className: LABEL_COL_CLASS },
  { header: 'Benchmark Name',      field: 'peer_group_benchmark' },
]

const SECTOR_COLS: ColDef[] = [
  { header: 'Sector',         field: 'sector', className: LABEL_COL_CLASS },
  { header: 'Benchmark Name', field: 'sector_benchmarks' },
]

const MODEL_COLS: ColDef[] = [
  { header: 'Allocation', field: 'allocation', className: LABEL_COL_CLASS },
  { header: 'Name',       field: 'security_name' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function BenchmarksPage() {

  const { data: categoryRows = [], isLoading: catLoading } = useQuery({
    queryKey: QUERY_KEYS.categoryBenchmarksTable,
    queryFn: () => fetchBenchmarkTable('category_benchmarks'),
  })

  const { data: peerGroupRows = [], isLoading: pgLoading } = useQuery({
    queryKey: QUERY_KEYS.peerGroupBenchmarksTable,
    queryFn: () => fetchBenchmarkTable('peer_group_benchmarks'),
  })

  const { data: sectorRows = [], isLoading: sectLoading } = useQuery({
    queryKey: QUERY_KEYS.sectorBenchmarksTable,
    queryFn: () => fetchBenchmarkTable('sector_benchmarks'),
  })

  const { data: modelRows = [], isLoading: modelLoading } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolioBenchmarksTable,
    queryFn: () => fetchBenchmarkTable('model_portfolio_benchmarks'),
  })

  // Asset Allocation shows only the five model benchmarks (the raw index ETFs
  // like SPY / AGG are filtered out), with a friendly Allocation label derived
  // from the "<Allocation> Benchmark (ETF)" name.
  const assetAllocationRows = useMemo(
    () =>
      modelRows
        .filter((r) => String(r.security_name ?? '').includes('Benchmark (ETF)'))
        .map((r) => ({
          ...r,
          allocation: String(r.security_name ?? '').replace(/\s*Benchmark \(ETF\)$/, ''),
        })),
    [modelRows],
  )

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Benchmarks</h1>
          <p className="mt-1 text-gray-600">
            Index and benchmark metrics sourced from YCharts. Refresh them from Settings → Import / Export.
          </p>
        </div>
      </div>

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div className="mt-8 space-y-8">
        <SectionTable
          title="Asset Allocation"
          rows={assetAllocationRows}
          cols={MODEL_COLS}
          metrics={MODEL_METRICS}
          isLoading={modelLoading}
        />
        <SectionTable
          title="Category"
          rows={categoryRows}
          cols={CATEGORY_COLS}
          metrics={DEFAULT_METRICS}
          isLoading={catLoading}
        />
        <SectionTable
          title="Peer Group"
          rows={peerGroupRows}
          cols={PEER_GROUP_COLS}
          metrics={DEFAULT_METRICS}
          isLoading={pgLoading}
        />
        <SectionTable
          title="Sector"
          rows={sectorRows}
          cols={SECTOR_COLS}
          metrics={DEFAULT_METRICS}
          isLoading={sectLoading}
        />
      </div>
    </div>
  )
}
