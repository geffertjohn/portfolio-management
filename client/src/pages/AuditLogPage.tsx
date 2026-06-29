import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAuditLog,
  exportAuditLogCSV,
  PAGE_SIZE,
  AUDITED_TABLES,
  type AuditedTable,
  type AuditLogEntry,
} from '@/lib/auditLog'
import { QUERY_KEYS } from '@/hooks/queryKeys'

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
}

const TABLE_LABELS: Record<AuditedTable, string> = {
  review_schedules: 'Review Schedules',
  compliance_rules: 'Compliance Rules',
  clients: 'Clients',
  at_risk: 'At-Risk',
  prospects: 'Watchlist',
  action_items: 'Action Items',
  positions: 'Positions',
  portfolio_allocations: 'Allocations',
  investment_policy_statements: 'IPS',
}

function JsonDiff({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false)
  if (!entry.old_data && !entry.new_data) return null
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-gray-400 hover:text-gray-600 underline"
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {entry.old_data && (
            <div>
              <p className="text-xs font-medium text-red-600 mb-0.5">Before</p>
              <pre className="overflow-x-auto rounded bg-red-50 p-2 text-xs text-red-800">
                {JSON.stringify(entry.old_data, null, 2)}
              </pre>
            </div>
          )}
          {entry.new_data && (
            <div>
              <p className="text-xs font-medium text-green-600 mb-0.5">After</p>
              <pre className="overflow-x-auto rounded bg-green-50 p-2 text-xs text-green-800">
                {JSON.stringify(entry.new_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AuditLogPage() {
  const [tableFilter, setTableFilter] = useState<AuditedTable | 'all'>('all')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.auditLog(tableFilter === 'all' ? undefined : tableFilter, page),
    queryFn: () =>
      fetchAuditLog({
        tableName: tableFilter === 'all' ? undefined : tableFilter,
        page,
      }),
    staleTime: 1000 * 30,
  })

  const entries = data?.entries ?? []
  const hasMore = data?.hasMore ?? false

  function handleFilterChange(filter: AuditedTable | 'all') {
    setTableFilter(filter)
    setPage(0)
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportAuditLogCSV(tableFilter === 'all' ? undefined : tableFilter)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Audit Log</h1>
          <p className="mt-1 text-gray-600">
            Automatic change trail across key tables. Entries are append-only and cannot be modified.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {/* Table filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => handleFilterChange('all')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tableFilter === 'all'
              ? 'bg-gray-900 text-white'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          All tables
        </button>
        {AUDITED_TABLES.map((t) => (
          <button
            key={t}
            onClick={() => handleFilterChange(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tableFilter === t
                ? 'bg-gray-900 text-white'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {TABLE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Failed to load audit log</p>
            <p className="mt-1 text-sm text-red-600">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-14 text-center">
            <p className="text-gray-500">No audit entries found.</p>
            <p className="mt-1 text-sm text-gray-400">
              Entries appear automatically when audited tables are modified.
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[entry.action] ?? 'bg-gray-100 text-gray-700'}`}>
                      {entry.action}
                    </span>
                    <span className="font-medium text-gray-900">
                      {TABLE_LABELS[entry.table_name as AuditedTable] ?? entry.table_name}
                    </span>
                    {entry.record_id != null && (
                      <span className="text-gray-400">#{entry.record_id}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(entry.changed_at).toLocaleString()}
                  </span>
                </div>
                <JsonDiff entry={entry} />
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && (entries.length > 0 || page > 0) && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + entries.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
