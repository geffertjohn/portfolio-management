import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSecurities, isFundOrEtfSecurity, type Security } from '@/lib/securities'
import { fetchPortfolios } from '@/lib/portfolio'
import { fetchPositionsByPortfolioId } from '@/lib/positions'
import { fetchActiveAtRisk } from '@/lib/atRisk'
import { fetchActionItems } from '@/lib/actionItems'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { syncStockFromFMP } from '@/lib/fmpSync'
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

      {/* ── FMP Sync ─────────────────────────────────────── */}
      <FmpBulkSync securities={securities} secLoading={secLoading} />

      {/* ── Import ──────────────────────────────────────── */}
      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Import</h2>
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">Securities — Excel upload</p>
            <p className="mt-1 text-xs text-gray-500">
              Import or update securities metrics from an Excel file. Use the{' '}
              <strong>Upload Excel</strong> button on any Security detail page to map columns and
              upsert into <code className="rounded bg-gray-100 px-1">securities2</code> by symbol.
            </p>
          </div>
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

// ── FMP bulk sync component ──────────────────────────────────────────────────

interface FmpBulkSyncProps {
  securities: Security[]
  secLoading: boolean
}

function FmpBulkSync({ securities, secLoading }: FmpBulkSyncProps) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [finished, setFinished] = useState(false)

  const stocks = securities.filter(s => !isFundOrEtfSecurity(s))

  async function handleBulkSync() {
    if (running) return
    setRunning(true)
    setFinished(false)
    setErrors([])
    setDone(0)
    setTotal(stocks.length)

    const errs: string[] = []
    for (const s of stocks) {
      try {
        await syncStockFromFMP(s.security_id)
      } catch (e) {
        errs.push(`${s.security_id}: ${e instanceof Error ? e.message : String(e)}`)
      }
      setDone(prev => prev + 1)
    }

    setErrors(errs)
    setRunning(false)
    setFinished(true)
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">FMP Data Sync</h2>
      <div className="mt-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Sync all stocks from FMP</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Fetches price, fundamentals, risk metrics, and analyst data for all{' '}
                {secLoading ? '…' : stocks.length} non-fund securities. Runs sequentially (~5–10 s per symbol).
              </p>
            </div>
            <button
              type="button"
              disabled={secLoading || running}
              onClick={handleBulkSync}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {running ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                  </svg>
                  Syncing…
                </>
              ) : 'Sync All'}
            </button>
          </div>

          {/* Progress bar */}
          {(running || finished) && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{done} / {total}</span>
                <span>{pct}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {finished && (
                <p className={`mt-2 text-xs font-medium ${errors.length === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                  {errors.length === 0
                    ? `All ${total} stocks synced successfully.`
                    : `${total - errors.length} synced, ${errors.length} failed.`}
                </p>
              )}
            </div>
          )}

          {/* Error list */}
          {finished && errors.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-red-600 hover:underline">
                Show {errors.length} error{errors.length > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-red-100 bg-red-50 p-2 text-xs text-red-700">
                {errors.map((e, i) => (
                  <li key={i} className="py-0.5 font-mono">{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
