import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AddSecurityModal } from '@/components/AddSecurityModal'
import { useSecurities } from '@/hooks/useSecurities'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { addNewSecurityFromExcel } from '@/lib/securities2ExcelUpload'
import { bulkUploadFundsFromExcel } from '@/lib/fundBulkUpload'
import { fetchSecurities, getSecurityDisplayType, type Security } from '@/lib/securities'

export function SecuritiesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [addSecurityOpen, setAddSecurityOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const [uploadStatus, setUploadStatus] = useState<{ text: string; status: 'success' | 'error' } | null>(null)

  const { data: securities = [], isLoading, error } = useSecurities()

  // Close dropdown on outside click
  useEffect(() => {
    if (!addMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [addMenuOpen])

  const excelUploadMutation = useMutation({
    mutationFn: (file: File) => addNewSecurityFromExcel(file),
    onSuccess: async (symbol) => {
      setUploadStatus({ text: `"${symbol}" imported successfully.`, status: 'success' })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securities })
      const fresh = await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.securities,
        queryFn: () => fetchSecurities(),
      })
      const match = fresh.find((s) => s.security_id === symbol)
      if (match) {
        navigate(`/security/${match.id}`, { state: { from: 'securities' } })
      } else {
        setUploadStatus({ text: `"${symbol}" imported. Find it in the securities list.`, status: 'success' })
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadStatus({ text: msg.trim() || 'Could not import that Excel file.', status: 'error' })
    },
  })

  const bulkFundUploadMutation = useMutation({
    mutationFn: (file: File) => bulkUploadFundsFromExcel(file),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securities })
      const clean = result.failed === 0 && result.errors.length === 0
      const msg = clean
        ? `Bulk upload complete — ${result.succeeded} fund${result.succeeded !== 1 ? 's' : ''} upserted${result.relatedLinked > 0 ? `, ${result.relatedLinked} related links` : ''}.`
        : `Bulk upload: ${result.succeeded} succeeded, ${result.failed} failed. ${result.errors[0] ?? ''}`
      setUploadStatus({ text: msg, status: clean ? 'success' : 'error' })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadStatus({ text: msg.trim() || 'Bulk upload failed.', status: 'error' })
    },
  })

  // Split into stocks vs. ETFs & funds (by the displayed badge type)
  const stocks = securities.filter((s) => getSecurityDisplayType(s) === 'Stock')
  const fundsAndEtfs = securities.filter((s) => getSecurityDisplayType(s) !== 'Stock')

  function renderTable(title: string, rows: typeof securities, categoryOf: (s: Security) => string | null) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          {title} <span className="font-normal text-gray-400">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">None.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-900">Ticker</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-900">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-900">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/security/${s.id}`, { state: { from: 'securities' } })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/security/${s.id}`, { state: { from: 'securities' } })
                      }
                    }}
                    className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{s.security_id}</td>
                    <td className="px-4 py-3 text-gray-700">{s.security_name ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{categoryOf(s) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
            Securities
          </h1>
          <p className="mt-1 text-gray-600">
            Browse all securities in Supabase. Tap a row to view details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Split "Add security" button */}
          <div className="relative" ref={addMenuRef}>
            <div className="inline-flex rounded-md shadow-sm">
              <button
                type="button"
                onClick={() => { setAddSecurityOpen(true); setAddMenuOpen(false) }}
                className="inline-flex items-center rounded-l-md border border-transparent bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Add security
              </button>
              <button
                type="button"
                onClick={() => setAddMenuOpen((v) => !v)}
                className="inline-flex items-center rounded-r-md border-l border-gray-700 bg-gray-900 px-2 py-1.5 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                aria-label="More add options"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {addMenuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-52 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { setAddSecurityOpen(true); setAddMenuOpen(false) }}
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add by symbol
                </button>
                <label className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {excelUploadMutation.isPending ? 'Importing…' : 'Upload Excel (single)'}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    disabled={excelUploadMutation.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      setAddMenuOpen(false)
                      if (f) excelUploadMutation.mutate(f)
                    }}
                  />
                </label>
                <label className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {bulkFundUploadMutation.isPending ? 'Uploading…' : 'Bulk upload funds'}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    disabled={bulkFundUploadMutation.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      setAddMenuOpen(false)
                      if (f) bulkFundUploadMutation.mutate(f)
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {uploadStatus && (
        <div className={`mt-4 rounded-md p-3 text-sm ${uploadStatus.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {uploadStatus.text}
        </div>
      )}

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center py-8">
          <p className="text-gray-500">Loading securities…</p>
        </div>
      ) : error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">Failed to load securities</p>
          <p className="mt-1 text-sm text-red-700">
            {error instanceof Error
              ? error.message
              : (error as { message?: string })?.message ?? String(error)}
          </p>
        </div>
      ) : securities?.length === 0 ? (
        <p className="mt-6 text-gray-500">No securities found.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {renderTable('Stocks', stocks, (s) => s.category_name ?? s.equity_style_internal ?? s.peer_group_name)}
          {renderTable('ETFs & Funds', fundsAndEtfs, (s) => s.peer_group_name)}
        </div>
      )}

      <AddSecurityModal
        open={addSecurityOpen}
        onClose={() => setAddSecurityOpen(false)}
      />
    </div>
  )
}
