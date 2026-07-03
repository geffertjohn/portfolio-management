import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { fetchPortfolios } from '@/lib/portfolio'
import { addProspect } from '@/lib/prospects'
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
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>([])
  const [targetPrice, setTargetPrice] = useState('')

  const { data: securities = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
    enabled: open,
  })

  const { data: portfolios = [] } = useQuery({
    queryKey: QUERY_KEYS.portfolios,
    queryFn: fetchPortfolios,
    enabled: open,
  })

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      d.showModal()
      setSearch('')
      setSelectedId(presetSecurityId ?? null)
      setSelectedPortfolios([])
      setTargetPrice('')
      mutation.reset()
    } else {
      d.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetSecurityId])

  const handleClose = () => { if (!mutation.isPending) onClose() }

  const togglePortfolio = (name: string) =>
    setSelectedPortfolios((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]))

  const mutation = useMutation({
    // One watchlist entry per selected portfolio, so each gets its own
    // portfolio-specific AI research + recommendation.
    mutationFn: async () => {
      if (!selectedId) throw new Error('No security selected')
      if (selectedPortfolios.length === 0) throw new Error('Select at least one portfolio')
      const price = targetPrice.trim() ? Number(targetPrice) : null
      const targetPriceVal = price != null && Number.isFinite(price) ? price : null
      await Promise.all(
        selectedPortfolios.map((portfolio) =>
          addProspect({ securityId: selectedId, targetPortfolio: portfolio, targetPrice: targetPriceVal }),
        ),
      )
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
  const typedTicker = search.trim().toUpperCase()
  const hasExactMatch = securities.some((s) => s.security_id.toUpperCase() === typedTicker)

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
          {selectedId ? (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <div>
                <span className="font-mono text-sm font-semibold text-gray-900">{selectedId}</span>
                {selected?.security_name ? (
                  <span className="ml-2 text-xs text-gray-500">{selected.security_name}</span>
                ) : (
                  <span className="ml-2 text-xs text-gray-400">Not in your securities — will be watched by ticker.</span>
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
                placeholder="Enter or search any ticker…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && typedTicker) {
                    e.preventDefault()
                    setSelectedId(typedTicker); setSearch('')
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
              {search.trim() && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
                  {filtered.map((s) => (
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
                  ))}
                  {/* Always allow watching the typed ticker as-is (any security). */}
                  {typedTicker && !hasExactMatch && (
                    <button
                      type="button"
                      onClick={() => { setSelectedId(typedTicker); setSearch('') }}
                      className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-left hover:bg-indigo-50"
                    >
                      <span className="text-sm text-indigo-600">Watch</span>
                      <span className="font-mono text-sm font-semibold text-indigo-700">{typedTicker}</span>
                      <span className="text-xs text-gray-400">— not in your securities</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedId && (
          <>
            {/* Which portfolio(s) is this being considered for — one entry each. */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Considered for portfolio(s)
              </label>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-1">
                {portfolios.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-gray-400">No portfolios found.</p>
                ) : (
                  portfolios.map((p) => (
                    <label
                      key={p.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPortfolios.includes(p.name)}
                        onChange={() => togglePortfolio(p.name)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-gray-900">{p.name}</span>
                    </label>
                  ))
                )}
              </div>
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

            <p className="rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              The AI research team will draft the thesis, bull &amp; bear case, conviction, and
              recommendation for each selected portfolio.
            </p>
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
          disabled={!selectedId || selectedPortfolios.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Adding…' : 'Add to watchlist'}
        </button>
      </div>
    </dialog>
  )
}
