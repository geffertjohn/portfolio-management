import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { addToAtRisk, metricsForAssetClass } from '@/lib/atRisk'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface Props {
  open: boolean
  onClose: () => void
}

export function AddToAtRiskModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const { data: securities = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
    enabled: open,
  })

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) { d.showModal(); reset() } else d.close()
  }, [open])

  function reset() {
    setSearch('')
    setSelectedId(null)
    setSelectedMetrics([])
    setNotes('')
  }

  const handleClose = () => { if (!mutation.isPending) onClose() }

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('No security selected')
      return addToAtRisk(selectedId, selectedMetrics, notes || null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk })
      if (selectedId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRiskBySecurity(selectedId) })
      onClose()
    },
  })

  const filtered = securities.filter((s) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      s.security_id.toLowerCase().includes(q) ||
      (s.security_name ?? '').toLowerCase().includes(q)
    )
  }).slice(0, 50)

  const selected = securities.find((s) => s.security_id === selectedId) ?? null
  const metricOptions = selected ? metricsForAssetClass('stock') : []

  function toggleMetric(m: string) {
    setSelectedMetrics((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Flag stock as at-risk</h2>
        <p className="mt-0.5 text-xs text-gray-500">Search for a security, then select deteriorated metrics.</p>
      </div>

      <div className="space-y-5 px-6 py-5">
        {/* Security search */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Security
          </label>
          {selected ? (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <div>
                <span className="font-mono text-sm font-semibold text-gray-900">{selected.security_id}</span>
                {selected.security_name && (
                  <span className="ml-2 text-xs text-gray-500">{selected.security_name}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setSelectedId(null); setSelectedMetrics([]) }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Search by symbol or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
              {search.trim() && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-400">No results</p>
                  ) : (
                    filtered.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setSelectedId(s.security_id); setSearch('') }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                      >
                        <span className="font-mono text-sm font-medium text-gray-900">{s.security_id}</span>
                        {s.security_name && (
                          <span className="text-xs text-gray-500 truncate">{s.security_name}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metrics */}
        {selected && metricOptions.length > 0 && (
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Deteriorated metrics <span className="font-normal normal-case text-gray-400">(optional)</span>
            </legend>
            <div className="mt-2 space-y-2">
              {metricOptions.map((metric) => (
                <label
                  key={metric}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric)}
                    onChange={() => toggleMetric(metric)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                  <span className="text-sm text-gray-800">{metric}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* Notes */}
        {selected && (
          <div>
            <label htmlFor="add-at-risk-notes" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <textarea
              id="add-at-risk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context for this flag…"
              className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>
        )}

        {mutation.isError && (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to add to at-risk list'}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
        <button
          type="button"
          onClick={handleClose}
          disabled={mutation.isPending}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!selectedId || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {mutation.isPending ? 'Adding…' : 'Add to at-risk'}
        </button>
      </div>
    </dialog>
  )
}
