import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { addProspect } from '@/lib/prospects'
import { CONVICTION_OPTIONS, CONVICTION_LABELS, type Conviction } from '@/lib/reviewLog'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface Props {
  open: boolean
  onClose: () => void
  /** Optional preset symbol (e.g. opened from a security detail page). */
  presetSecurityId?: string | null
}

export function AddProspectModal({ open, onClose, presetSecurityId }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [targetPortfolio, setTargetPortfolio] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [conviction, setConviction] = useState<Conviction | ''>('')
  const [thesis, setThesis] = useState('')

  const { data: securities = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
    enabled: open,
  })

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      d.showModal()
      setSearch('')
      setSelectedId(presetSecurityId ?? null)
      setTargetPortfolio('')
      setTargetPrice('')
      setConviction('')
      setThesis('')
      mutation.reset()
    } else {
      d.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetSecurityId])

  const handleClose = () => { if (!mutation.isPending) onClose() }

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('No security selected')
      const price = targetPrice.trim() ? Number(targetPrice) : null
      return addProspect({
        securityId: selectedId,
        targetPortfolio: targetPortfolio || null,
        targetPrice: price != null && Number.isFinite(price) ? price : null,
        conviction: conviction || null,
        thesis: thesis || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.prospects })
      if (selectedId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.prospectsBySecurity(selectedId) })
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

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Add to watchlist</h2>
        <p className="mt-0.5 text-xs text-gray-500">A security you're considering buying for a portfolio.</p>
      </div>

      <div className="space-y-5 px-6 py-5">
        {/* Security search */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Security</label>
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
                onClick={() => setSelectedId(null)}
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

        {selected && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="prospect-portfolio" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Target portfolio <span className="font-normal normal-case text-gray-400">(optional)</span>
                </label>
                <input
                  id="prospect-portfolio"
                  type="text"
                  value={targetPortfolio}
                  onChange={(e) => setTargetPortfolio(e.target.value)}
                  placeholder="e.g. Core Growth"
                  className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
              <div>
                <label htmlFor="prospect-price" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Target price <span className="font-normal normal-case text-gray-400">(optional)</span>
                </label>
                <input
                  id="prospect-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="0.00"
                  className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Conviction <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <div className="mt-2 flex gap-2">
                {CONVICTION_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setConviction(conviction === c ? '' : c)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      conviction === c
                        ? 'border-gray-700 bg-gray-800 text-white'
                        : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {CONVICTION_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="prospect-thesis" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Thesis <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <textarea
                id="prospect-thesis"
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                rows={3}
                placeholder="Why this is a candidate — what you're watching for before buying."
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </>
        )}

        {mutation.isError && (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to add to watchlist'}
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
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Adding…' : 'Add to watchlist'}
        </button>
      </div>
    </dialog>
  )
}
