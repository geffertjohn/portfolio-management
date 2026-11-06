import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { fetchPortfolios } from '@/lib/portfolio'

/**
 * Portfolios you cannot consider a security *for*, because they hold nothing
 * of their own. Equity Income & Core Growth is a 50/50 derived blend of the
 * two books named in it — its positions and history are computed, never
 * uploaded — so a stock enters it only by being bought in Core Growth or in
 * Equity Income. Offering it here invites an idea that no book can act on.
 */
const DERIVED_BLEND_PORTFOLIOS = new Set(['Equity Income & Core Growth'])
import { addProspect } from '@/lib/prospects'
import { fetchProfile } from '@/lib/fmpMarket'
import { getProspectDisplayType, isFundIdea } from '@/lib/securities'
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
  const selectablePortfolios = useMemo(
    () => portfolios.filter((p) => !DERIVED_BLEND_PORTFOLIOS.has(p.name)),
    [portfolios],
  )

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      d.showModal()
      setSearch('')
      setSelectedId(presetSecurityId ?? null)
      setSelectedPortfolios([])
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
    // ONE idea per ticker, with its portfolios attached. Portfolios are optional:
    // a ticker you have not placed yet is still an idea worth recording. Adding a
    // ticker that is already watched attaches the new portfolios to it.
    mutationFn: async () => {
      if (!selectedId) throw new Error('No security selected')
      await addProspect({
        securityId: selectedId,
        // Never for a fund, even if a selection survives from a ticker chosen
        // before this one: the picker is not shown for one, so a portfolio
        // here could only be a leftover the user cannot see.
        portfolios: isFund ? [] : selectedPortfolios,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.prospects })
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

  /*
    A ticker that is not in securities2 has no columns to classify, and the
    classifier's honest answer with nothing to read is "stock" — so without
    this every unheld fund would be offered a portfolio picker. Only asked for
    when securities2 cannot answer, and it shares `QUERY_KEYS.profile` with the
    Watchlist page and the research page, so selecting a ticker here usually
    costs no request at all.
  */
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.profile(selectedId ?? ''),
    queryFn: () => fetchProfile(selectedId as string),
    enabled: open && !!selectedId && !selected,
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
  })

  /*
    A FUND IS NOT IDENTIFIED BY A PORTFOLIO. Which book a fund would go in
    follows from the sleeve it fills, which `category_name` already names, so
    the question is not asked for one — asking it would invite an answer the
    Watchlist does not show and nothing reads.
  */
  const isFund = selectedId ? isFundIdea(getProspectDisplayType(selected, profile ?? null)) : false
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
        <p className="mt-0.5 text-xs text-gray-500">
          A security you're considering buying. Stocks are considered for a portfolio;
          funds are identified by their category.
        </p>
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
                  {/* Any ticker is watchable, held or not — that is what a watchlist is
                      for. Listed FIRST because below 50 matched securities it was
                      effectively invisible and the field read as a securities picker. */}
                  {typedTicker && !hasExactMatch && (
                    <button
                      type="button"
                      onClick={() => { setSelectedId(typedTicker); setSearch('') }}
                      className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2.5 text-left hover:bg-indigo-50"
                    >
                      <span className="text-sm text-indigo-600">Watch</span>
                      <span className="font-mono text-sm font-semibold text-indigo-700">{typedTicker}</span>
                      <span className="text-xs text-gray-400">— not in your securities</span>
                    </button>
                  )}
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
                </div>
              )}
            </div>
          )}
        </div>

        {selectedId && !isFund && (
          <>
            {/* Which portfolio(s) is this being considered for — one entry each. */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Considered for portfolio(s){' '}
                <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-1">
                {selectablePortfolios.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-gray-400">No portfolios found.</p>
                ) : (
                  selectablePortfolios.map((p) => (
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

            <p className="rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              The AI research team will rate the company on its own merits — thesis, bull &amp;
              bear case, conviction and a buy/hold/sell — not against any one book. Sizing and
              the comparison with current holdings happen later, when you move it to a candidate.
            </p>
          </>
        )}

        {/*
          A FUND IS CATEGORISED, NOT PLACED. Which book it would go in follows
          from the sleeve it fills, which `category_name` already names, so no
          portfolio is asked for — and the research team is not run on it
          either: those two roles rate a COMPANY, with a bull and bear case on
          a business, which is not what a fund is judged by.
        */}
        {selectedId && isFund && (
          <div className="space-y-2 rounded-md bg-teal-50 px-3 py-2.5">
            <p className="text-xs text-teal-800">
              <span className="font-semibold">Categorised, not placed.</span> A fund is
              identified by its category rather than a portfolio, so there is nothing to
              choose here.
            </p>
            {selected?.category_name ? (
              <p className="text-xs text-teal-700">
                Category: <span className="font-semibold">{selected.category_name}</span>
              </p>
            ) : (
              <p className="text-xs text-teal-700">
                The category arrives with the next YCharts refresh, which picks the ticker
                up automatically — no spreadsheet edit needed.
              </p>
            )}
            <p className="text-xs text-teal-700">
              The AI research team is not run on funds: it rates a company's business with a
              bull and bear case, which is not how a fund is judged. Its scorecard against
              the cohort is.
            </p>
          </div>
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
