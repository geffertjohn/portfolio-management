import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPortfolios } from '@/lib/portfolio'
import { bulkUploadPortfoliosFromExcel } from '@/lib/portfolioExcelUpload'
import { QUERY_KEYS } from '@/hooks/queryKeys'

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(2)}%`
}

function fmtNum(v: number | null) {
  if (v == null) return '—'
  return v.toFixed(2)
}

const SUFFIX_ORDER = [
  'Conservative',
  'Conservative Balanced',
  'Balanced',
  'Balanced with Growth',
  'Growth',
]

const GROUPS = [
  { label: 'Foundation Models', prefix: 'Foundation' },
  { label: 'ETF Models',        prefix: 'ETF' },
  { label: 'Hybrid Models',     prefix: 'Hybrid' },
  { label: 'Equity & Fixed Income Models', prefix: null },
]

export function PortfolioPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<{ text: string; ok: boolean } | null>(null)

  const { data: portfolios = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.portfolios,
    queryFn: fetchPortfolios,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => bulkUploadPortfoliosFromExcel(file),
    onSuccess: ({ succeeded, failed, errors }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolios })
      const msg = failed === 0
        ? `${succeeded} portfolio${succeeded !== 1 ? 's' : ''} updated.`
        : `${succeeded} updated, ${failed} failed. ${errors[0] ?? ''}`
      setUploadStatus({ text: msg, ok: failed === 0 })
      window.setTimeout(() => setUploadStatus(null), 5000)
    },
    onError: (err) => {
      setUploadStatus({ text: err instanceof Error ? err.message : 'Upload failed.', ok: false })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading portfolios…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Failed to load portfolios</p>
        <p className="mt-1 text-sm text-red-700">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    )
  }

  function sortBySuffix<T extends { name: string }>(items: T[], prefix: string): T[] {
    return [...items].sort((a, b) => {
      const ai = SUFFIX_ORDER.indexOf(a.name.replace(prefix, '').trim())
      const bi = SUFFIX_ORDER.indexOf(b.name.replace(prefix, '').trim())
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }

  const grouped = GROUPS.map(({ label, prefix }) => {
    const items = portfolios.filter((p) =>
      prefix
        ? p.name.startsWith(prefix)
        : !['Foundation', 'ETF', 'Hybrid'].some((pfx) => p.name.startsWith(pfx))
    )
    return { label, items: prefix ? sortBySuffix(items, prefix) : items }
  }).filter(({ items }) => items.length > 0)

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Portfolios</h1>
        <div className="flex flex-col items-end gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadMutation.mutate(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          </button>
          {uploadStatus && (
            <p className={`text-xs ${uploadStatus.ok ? 'text-green-600' : 'text-red-600'}`}>
              {uploadStatus.text}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 sm:table-cell">ID</th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 sm:table-cell">Strategy</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">1Y Return</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">Sharpe 1Y</th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">Sortino 1Y</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grouped.map(({ label, items }) => (
              <React.Fragment key={label}>
                <tr className="bg-gray-50">
                  <td colSpan={6} className="px-4 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {label}
                    </span>
                  </td>
                </tr>
                {items.map((p) => (
                  <tr
                    key={p.name}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/portfolio/${encodeURIComponent(p.name)}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-400 sm:table-cell">{p.security_id ?? '—'}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 sm:table-cell">
                      {p.portfolio_strategy || '—'}
                    </td>
                    <td className={`hidden whitespace-nowrap px-4 py-3 text-right tabular-nums md:table-cell ${p.one_year_total_return == null ? 'text-gray-400' : p.one_year_total_return >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtPct(p.one_year_total_return)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 md:table-cell">
                      {fmtNum(p.historical_sharpe_1y)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600 md:table-cell">
                      {fmtNum(p.historical_sortino_1y)}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
