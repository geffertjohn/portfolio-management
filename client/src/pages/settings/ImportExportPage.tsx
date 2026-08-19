import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { fetchPortfolios } from '@/lib/portfolio'
import { fetchPositionsByPortfolioId } from '@/lib/positions'
import { fetchActiveAtRisk } from '@/lib/atRisk'
import { fetchActionItems } from '@/lib/actionItems'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { uploadYchartBenchmarks } from '@/lib/ychartBenchmarksUpload'
import { bulkUploadFundsFromExcel } from '@/lib/fundBulkUpload'
import { bulkUploadPortfoliosFromExcel } from '@/lib/portfolioExcelUpload'
import { addNewSecurityFromExcel, uploadSecurities2FromExcel } from '@/lib/securities2ExcelUpload'
import { importAllocationSnapshots, parseYchartsDynamic } from '@/lib/portfolioAllocations'
import * as XLSX from 'xlsx'
import type { Portfolio } from '@/types/portfolio'

// ── CSV helpers ─────────────────────────────────────────────────────────────

function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ── Export cards ────────────────────────────────────────────────────────────

interface ExportCardProps {
  title: string
  desc: string
  onExport: () => Promise<void> | void
  disabled?: boolean
}

function ExportCard({ title, desc, onExport, disabled }: ExportCardProps) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handle() {
    setLoading(true)
    try {
      await onExport()
      setDone(true)
      window.setTimeout(() => setDone(false), 3000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {done && <span className="text-xs text-green-600">Downloaded ✓</span>}
        <button
          type="button"
          disabled={disabled || loading}
          onClick={handle}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {loading ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export function ImportExportPage() {
  const { data: securities = [], isLoading: secLoading } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
  })

  const queryClient = useQueryClient()
  const [targetSymbol, setTargetSymbol] = useState('')
  const [targetPortfolio, setTargetPortfolio] = useState('')

  const { data: portfolios = [], isLoading: portLoading } = useQuery<Portfolio[]>({
    queryKey: QUERY_KEYS.portfolios,
    queryFn: fetchPortfolios,
  })

  const { data: atRisk = [] } = useQuery({
    queryKey: QUERY_KEYS.atRisk,
    queryFn: fetchActiveAtRisk,
  })

  const { data: actionItems = [] } = useQuery({
    queryKey: [...QUERY_KEYS.actionItems, 'all'],
    queryFn: () => fetchActionItems(),
  })

  async function exportSecurities() {
    const csv = toCSV(
      ['id', 'security_id', 'security_name', 'detailed_security_type', 'fund_company_name', 'peer_group_name'],
      securities.map((s) => [s.id, s.security_id, s.security_name, s.detailed_security_type, s.fund_company_name, s.peer_group_name])
    )
    downloadCSV(csv, `securities_${today()}.csv`)
  }

  async function exportPortfolios() {
    const csv = toCSV(
      ['name', 'portfolio_strategy', 'created_at'],
      portfolios.map((p) => [p.name, p.portfolio_strategy, p.created_at])
    )
    downloadCSV(csv, `portfolios_${today()}.csv`)
  }

  async function exportAllPositions() {
    // Fetch positions for every portfolio in parallel
    const rows: (string | number | null | undefined)[][] = []
    await Promise.all(
      portfolios.map(async (p) => {
        const positions = await fetchPositionsByPortfolioId(p.name)
        for (const pos of positions) {
          rows.push([p.name, pos.ticker, pos.name, pos.weight, pos.updatedAt])
        }
      })
    )
    const csv = toCSV(
      ['portfolio_name', 'ticker', 'security_name', 'weight_pct', 'updated_at'],
      rows
    )
    downloadCSV(csv, `positions_${today()}.csv`)
  }

  async function exportAtRisk() {
    const csv = toCSV(
      ['symbol', 'name', 'asset_class', 'date_added', 'flagged_metrics', 'notes', 'removal_date'],
      atRisk.map((w) => [
        w.securities2?.security_id,
        w.securities2?.security_name,
        w.securities2?.broad_asset_class,
        w.date_added,
        w.metrics.join('; '),
        w.notes,
        w.removal_date,
      ])
    )
    downloadCSV(csv, `at_risk_${today()}.csv`)
  }

  async function exportActionItems() {
    const csv = toCSV(
      ['id', 'title', 'description', 'security_symbol', 'portfolio_name', 'due_date', 'priority', 'status', 'created_at', 'closed_at'],
      actionItems.map((a) => [
        a.id, a.title, a.description, a.security_symbol, a.portfolio_name,
        a.due_date, a.priority, a.status, a.created_at, a.closed_at,
      ])
    )
    downloadCSV(csv, `action_items_${today()}.csv`)
  }

  const isLoading = secLoading || portLoading

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Import / Export</h1>
        <p className="mt-1 text-gray-600">Download your data as CSV for reporting or backup.</p>
      </div>

      {/* ── Exports ─────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Exports</h2>
        <div className="mt-3 space-y-3">
          <ExportCard
            title="Securities"
            desc={`All ${securities.length} securities — symbol, name, type, asset class, expense ratio.`}
            disabled={isLoading}
            onExport={exportSecurities}
          />
          <ExportCard
            title="Portfolios"
            desc={`All ${portfolios.length} portfolios — name, strategy, risk profile, benchmark.`}
            disabled={isLoading}
            onExport={exportPortfolios}
          />
          <ExportCard
            title="All Positions"
            desc="Every position across all portfolios — ticker, weight, last updated."
            disabled={isLoading}
            onExport={exportAllPositions}
          />
          <ExportCard
            title="At-Risk"
            desc={`${atRisk.length} active at-risk entries — symbol, date added, flagged metrics.`}
            onExport={exportAtRisk}
          />
          <ExportCard
            title="Action Items"
            desc={`All ${actionItems.length} action items — title, linked security/portfolio, priority, status.`}
            onExport={exportActionItems}
          />
        </div>
      </div>

      {/* ── Import ──────────────────────────────────────── */}
      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Import</h2>
        <p className="mt-1 text-xs text-gray-500">
          Every spreadsheet import lives here — entity pages no longer carry upload buttons.
        </p>
        <div className="mt-3 space-y-3">
          <ImportCard
            title="Benchmarks — YCharts template"
            desc="Refreshes category, peer group, sector, and model-portfolio benchmark metrics from the Benchmark Upload Template."
            run={async (file) => {
              const r = await uploadYchartBenchmarks(file)
              for (const k of [QUERY_KEYS.categoryBenchmarksTable, QUERY_KEYS.peerGroupBenchmarksTable,
                               QUERY_KEYS.sectorBenchmarksTable, QUERY_KEYS.modelPortfolioBenchmarksTable,
                               QUERY_KEYS.benchmarks, QUERY_KEYS.sectorBenchmarks]) {
                await queryClient.invalidateQueries({ queryKey: k })
              }
              return r.errors.length === 0
                ? `${r.inserted} rows upserted across the four benchmark tables.`
                : `${r.inserted} rows upserted, ${r.errors.length} error(s): ${r.errors[0]}`
            }}
          />

          <ImportCard
            title="Funds — New Fund Template"
            desc="Loads the Securities sheet into securities2, plus the optional Related sheet into fund_alternatives."
            run={async (file) => {
              const r = await bulkUploadFundsFromExcel(file)
              await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securities })
              return r.failed === 0 && r.errors.length === 0
                ? `${r.succeeded} fund${r.succeeded !== 1 ? 's' : ''} imported.`
                : `${r.succeeded} imported, ${r.failed} failed. ${r.errors[0] ?? ''}`
            }}
          />

          <ImportCard
            title="Securities — add or update by symbol"
            desc="Reads the ticker from the file and upserts that security into securities2."
            run={async (file) => {
              const symbol = await addNewSecurityFromExcel(file)
              await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securities })
              return `"${symbol}" imported.`
            }}
          />

          <ImportCard
            title="Security metrics — into a chosen symbol"
            desc="Maps an Excel export onto one existing security, ignoring any ticker inside the file."
            disabled={!targetSymbol}
            picker={
              <select value={targetSymbol} onChange={(e) => setTargetSymbol(e.target.value)} className={SELECT_CLS}>
                <option value="">Select a security…</option>
                {securities.map((sec) => (
                  <option key={sec.security_id} value={sec.security_id}>
                    {sec.security_id} — {sec.security_name ?? ''}
                  </option>
                ))}
              </select>
            }
            run={async (file) => {
              await uploadSecurities2FromExcel(targetSymbol, file)
              await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securities })
              return `${targetSymbol} updated.`
            }}
          />

          <ImportCard
            title="Portfolios — Excel"
            desc="Bulk-updates portfolio metrics (name, strategy, risk profile, benchmark, returns)."
            run={async (file) => {
              const { succeeded, failed, errors } = await bulkUploadPortfoliosFromExcel(file)
              await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolios })
              return failed === 0
                ? `${succeeded} portfolio${succeeded !== 1 ? 's' : ''} updated.`
                : `${succeeded} updated, ${failed} failed. ${errors[0] ?? ''}`
            }}
          />

          <ImportCard
            title="Portfolio allocations — YCharts dynamic file"
            desc="Long format (Date · Symbol · Target Weight) pivoted into dated allocation snapshots."
            accept=".xlsx,.xls,.csv"
            disabled={!targetPortfolio}
            picker={
              <select value={targetPortfolio} onChange={(e) => setTargetPortfolio(e.target.value)} className={SELECT_CLS}>
                <option value="">Select a portfolio…</option>
                {portfolios.map((pf) => (
                  <option key={pf.name} value={pf.name}>{pf.name}</option>
                ))}
              </select>
            }
            run={async (file) => {
              const parsed = parseYchartsDynamic(await firstSheetRows(file))
              const r = await importAllocationSnapshots(targetPortfolio, parsed, true)
              await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allocationGrid(targetPortfolio) })
              return `Imported ${r.inserted} weights across ${r.dates} dates into ${targetPortfolio}.`
            }}
          />

          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-700">Bulk position import — coming soon</p>
            <p className="mt-1 text-xs text-gray-500">
              Upload a CSV of <code className="rounded bg-gray-100 px-1">portfolio_id, symbol, weight</code> to
              replace or merge positions across multiple portfolios at once.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Import cards ─────────────────────────────────────────────────────────────

const EXCEL_ACCEPT =
  '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

interface ImportCardProps {
  title: string
  desc: React.ReactNode
  /** Runs the import and returns the success summary to display. */
  run: (file: File) => Promise<string>
  accept?: string
  /** Optional target selector (e.g. which portfolio / security to import into). */
  picker?: React.ReactNode
  /** Blocks the file button until a target is chosen. */
  disabled?: boolean
}

/**
 * One data import. Owns its own file input, busy state, and result banner so the
 * page stays a flat list of cards — this is the single place the app accepts a
 * spreadsheet; entity pages no longer carry upload buttons.
 */
function ImportCard({ title, desc, run, accept = EXCEL_ACCEPT, picker, disabled }: ImportCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function handle(file: File) {
    setBusy(true); setOk(null); setErr(null)
    try {
      setOk(await run(file))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
          {picker && <div className="mt-2">{picker}</div>}
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handle(f) }}
          />
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Choose file'}
          </button>
        </div>
      </div>
      {ok && <p className="mt-3 rounded bg-green-50 px-3 py-2 text-xs text-green-800">{ok}</p>}
      {err && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
    </div>
  )
}

const SELECT_CLS =
  'rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500'

/** Reads the first worksheet of a workbook as a raw row matrix. */
async function firstSheetRows(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })
}
