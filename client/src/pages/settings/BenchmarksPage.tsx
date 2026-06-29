import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchBenchmarkTable } from '@/lib/benchmarks'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { uploadYchartBenchmarks, type UploadResult } from '@/lib/ychartBenchmarksUpload'

// ── Types ─────────────────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>

type ColDef = {
  header: string
  field: string
  className?: string
}

type MetricFields = {
  oneYear: string
  threeYear: string
  fiveYear: string
  sharpe3y: string
}

const DEFAULT_METRICS: MetricFields = {
  oneYear:   'annualized_daily_one_year_total_return',
  threeYear: 'annualized_daily_three_year_return',
  fiveYear:  'annualized_daily_five_year_total_return',
  sharpe3y:  'historical_sharpe_3y',
}

const MODEL_METRICS: MetricFields = {
  oneYear:   'one_year_total_return',
  threeYear: 'annualized_three_year_total_return',
  fiveYear:  'annualized_five_year_total_return',
  sharpe3y:  'historical_sharpe_3y',
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: unknown): string {
  const n = Number(v)
  if (v == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(2)}%`
}

function fmtNum(v: unknown): string {
  const n = Number(v)
  if (v == null || !Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

// ── Section table ─────────────────────────────────────────────────────────────

function SectionTable({
  title,
  rows,
  symbolField,
  symbolLabel = 'Symbol',
  cols,
  metrics,
  isLoading,
}: {
  title: string
  rows: AnyRow[]
  symbolField: string
  symbolLabel?: string
  cols: ColDef[]
  metrics: MetricFields
  isLoading: boolean
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-sm text-gray-400">
          No data
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">{symbolLabel}</th>
                {cols.map((c) => (
                  <th key={c.field} className={`px-4 py-3 text-left font-semibold text-gray-900 ${c.className ?? ''}`}>
                    {c.header}
                  </th>
                ))}
                <th className="hidden px-4 py-3 text-right font-semibold text-gray-900 md:table-cell">1Y Return</th>
                <th className="hidden px-4 py-3 text-right font-semibold text-gray-900 lg:table-cell">3Y Ann.</th>
                <th className="hidden px-4 py-3 text-right font-semibold text-gray-900 lg:table-cell">5Y Ann.</th>
                <th className="hidden px-4 py-3 text-right font-semibold text-gray-900 xl:table-cell">Sharpe 3Y</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">
                    {String(row[symbolField] ?? '—')}
                  </td>
                  {cols.map((c) => (
                    <td key={c.field} className={`px-4 py-2 min-w-[140px] ${c.className ?? ''}`}>
                      <span className="text-sm text-gray-700">
                        {row[c.field] != null ? String(row[c.field]) : '—'}
                      </span>
                    </td>
                  ))}
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-700 md:table-cell">
                    {fmtPct(row[metrics.oneYear])}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-700 lg:table-cell">
                    {fmtPct(row[metrics.threeYear])}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-700 lg:table-cell">
                    {fmtPct(row[metrics.fiveYear])}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-700 xl:table-cell">
                    {fmtNum(row[metrics.sharpe3y])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Column definitions ─────────────────────────────────────────────────────────

const CATEGORY_COLS: ColDef[] = [
  { header: 'Benchmark Name', field: 'category_benchmark' },
  { header: 'Category',       field: 'category' },
  { header: 'ETF Proxy',      field: 'etf_proxy' },
]

const PEER_GROUP_COLS: ColDef[] = [
  { header: 'Peer Group Category', field: 'peer_group_category' },
]

const SECTOR_COLS: ColDef[] = [
  { header: 'Benchmark Name', field: 'sector_benchmarks' },
  { header: 'Sector',         field: 'sector' },
  { header: 'ETF Proxy',      field: 'etf_proxy' },
]

const MODEL_COLS: ColDef[] = [
  { header: 'Name', field: 'security_name' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function BenchmarksPage() {
  const queryClient = useQueryClient()
  const ychartFileInputRef = useRef<HTMLInputElement>(null)

  const [ychartUploading, setYchartUploading] = useState(false)
  const [ychartResult, setYchartResult] = useState<UploadResult | null>(null)
  const [ychartError, setYchartError] = useState<string | null>(null)

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

  async function handleYchartUpload(file: File) {
    setYchartUploading(true)
    setYchartResult(null)
    setYchartError(null)
    try {
      const result = await uploadYchartBenchmarks(file)
      setYchartResult(result)
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categoryBenchmarksTable })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.peerGroupBenchmarksTable })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sectorBenchmarksTable })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modelPortfolioBenchmarksTable })
    } catch (err) {
      setYchartError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setYchartUploading(false)
    }
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Benchmarks</h1>
          <p className="mt-1 text-gray-600">
            Index and benchmark metrics sourced from YCharts. Upload the template to refresh all data.
          </p>
        </div>
      </div>

      {/* ── YCharts upload card ──────────────────────────────────────────── */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">YCharts Benchmark Data</h2>
            <p className="mt-1 text-xs text-gray-500">
              Upload the Benchmark Upload Template (.xlsx) to refresh category, peer group, and sector benchmark metrics.
            </p>
          </div>
          <div className="shrink-0">
            <input
              type="file"
              accept=".xlsx,.xls"
              ref={ychartFileInputRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleYchartUpload(file)
                e.target.value = ''
              }}
            />
            <button
              disabled={ychartUploading}
              onClick={() => {
                setYchartResult(null)
                setYchartError(null)
                ychartFileInputRef.current?.click()
              }}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {ychartUploading ? 'Uploading…' : 'Upload Template'}
            </button>
          </div>
        </div>
        {ychartError && (
          <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{ychartError}</p>
        )}
        {ychartResult && (
          <div className="mt-3 rounded bg-green-50 px-3 py-2 text-xs text-green-800">
            <span className="font-medium">Upload complete.</span>{' '}
            {ychartResult.inserted} rows upserted.
            {ychartResult.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-red-700">
                {ychartResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div className="mt-8 space-y-8">
        <SectionTable
          title="Category"
          rows={categoryRows}
          symbolField="category_ticker"
          cols={CATEGORY_COLS}
          metrics={DEFAULT_METRICS}
          isLoading={catLoading}
        />
        <SectionTable
          title="Peer Group"
          rows={peerGroupRows}
          symbolField="peer_group_benchmark"
          cols={PEER_GROUP_COLS}
          metrics={DEFAULT_METRICS}
          isLoading={pgLoading}
        />
        <SectionTable
          title="Sector"
          rows={sectorRows}
          symbolField="ticker"
          cols={SECTOR_COLS}
          metrics={DEFAULT_METRICS}
          isLoading={sectLoading}
        />
        <SectionTable
          title="Asset Allocation"
          rows={modelRows}
          symbolField="security_id"
          symbolLabel="Security ID"
          cols={MODEL_COLS}
          metrics={MODEL_METRICS}
          isLoading={modelLoading}
        />
      </div>
    </div>
  )
}
