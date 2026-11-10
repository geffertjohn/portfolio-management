import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { addProspects, type AddProspectResult } from '@/lib/prospects'
import { fetchProfile, type Profile } from '@/lib/fmpMarket'
import {
  getProspectDisplayType, hasClassificationSignal, isFundIdea,
  type SecurityDisplayType,
} from '@/lib/securities'
import { looksLikeList, parseTickerList } from '@/lib/tickerList'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface Props {
  open: boolean
  onClose: () => void
  /** Optional preset symbol (e.g. opened from a security detail page). */
  presetSecurityId?: string | null
}

/**
 * Add one or several ideas to the watchlist.
 *
 * **Several, because that is how ideas arrive.** A screen, a fund family's
 * line-up or a research note gives a LIST, and adding it one modal at a time
 * meant re-opening and re-choosing portfolios for each. The tickers become
 * chips, and `lib/tickerList.ts` owns the rules for turning typed or pasted
 * text into them.
 *
 * The single-ticker flow is unchanged in feel: type a symbol, pick it from the
 * dropdown or press Enter. The dropdown stops filtering once the text carries a
 * separator, because at that point the field is a list rather than a search.
 */
export function AddProspectModal({ open, onClose, presetSecurityId }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  /** Chips, in the order the advisor gave them. */
  const [picked, setPicked] = useState<string[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>([])
  const [results, setResults] = useState<AddProspectResult[] | null>(null)

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

  const rowFor = useMemo(() => {
    const m = new Map(securities.map((s) => [s.security_id.toUpperCase(), s]))
    return (sym: string) => m.get(sym.toUpperCase()) ?? null
  }, [securities])

  /*
    A ticker `securities2` cannot answer for needs FMP, or the classifier's
    honest answer with nothing to read is "stock" and every unheld fund would
    be offered a portfolio picker.

    **A row that exists but is EMPTY cannot answer either.** The watchlist sync
    creates the row as soon as the macro adds the ticker to column B, so for one
    refresh cycle it carries no classification columns at all — and taking that
    as an answer is what put three mutual funds in the Stocks column on the
    Watchlist page. Same gate here.

    Shares `QUERY_KEYS.profile` with the Watchlist and research pages, so a
    ticker already seen costs no request.
  */
  const needProfile = useMemo(
    () => picked.filter((sym) => {
      const row = rowFor(sym)
      return !row || !hasClassificationSignal(row)
    }),
    [picked, rowFor],
  )
  const profileQueries = useQueries({
    queries: needProfile.map((sym) => ({
      queryKey: QUERY_KEYS.profile(sym),
      queryFn: () => fetchProfile(sym),
      staleTime: 1000 * 60 * 60 * 24,
      retry: false,
      enabled: open,
    })),
  })
  /*
    `undefined` is "not asked yet", `null` is "asked, and FMP had nothing".
    Collapsing them with `?? null` is what filed RSIYX — a mutual fund FMP does
    not cover — as a stock, and offered it a portfolio picker.
  */
  // Deliberately NOT memoised, the same way `WatchlistPage` builds its own
  // profile map. Correct memoisation here needs a fabricated dependency key
  // over the query statuses, and a key that is wrong goes STALE — the chips
  // would keep reading "checking…" after FMP answered. The work saved is a
  // Map over a handful of tickers.
  const profileBySymbol = new Map<string, Profile | null | undefined>(
    needProfile.map((sym, i) => [sym, profileQueries[i]?.data]),
  )
  const loadingBySymbol = new Map<string, boolean>(
    needProfile.map((sym, i) => [sym, !!profileQueries[i]?.isLoading]),
  )

  /** The resolved display type of one chip, or null while FMP is still out. */
  const typeOf = (sym: string): SecurityDisplayType | null => {
    const row = rowFor(sym)
    const rowAnswers = !!row && hasClassificationSignal(row)
    if (!rowAnswers && loadingBySymbol.get(sym)) return null
    return getProspectDisplayType(row, rowAnswers ? null : profileBySymbol.get(sym))
  }

  const stockPicks = picked.filter((s) => { const t = typeOf(s); return t != null && !isFundIdea(t) })
  const identifyingAny = picked.some((s) => typeOf(s) == null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      d.showModal()
      setSearch('')
      setPicked(presetSecurityId ? [presetSecurityId.toUpperCase()] : [])
      setRejected([])
      setSelectedPortfolios([])
      setResults(null)
      mutation.reset()
    } else {
      d.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetSecurityId])

  const handleClose = () => { if (!mutation.isPending) onClose() }

  const togglePortfolio = (name: string) =>
    setSelectedPortfolios((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]))

  /** Commit whatever is in the box as one or more chips. */
  const commit = (text: string) => {
    const { tickers, rejected: bad } = parseTickerList(text)
    if (tickers.length === 0 && bad.length === 0) return
    setPicked((prev) => [...prev, ...tickers.filter((t) => !prev.includes(t))])
    setRejected(bad)
    setSearch('')
  }

  const removeChip = (sym: string) => setPicked((prev) => prev.filter((p) => p !== sym))

  const mutation = useMutation({
    // ONE idea per ticker, with its portfolios attached. Portfolios are optional:
    // a ticker you have not placed yet is still an idea worth recording. Adding a
    // ticker that is already watched attaches the new portfolios to it.
    mutationFn: () => addProspects(picked, (sym) => {
      // Never for a fund. The picker is not shown for one, so a portfolio here
      // could only be a leftover the user cannot see — and in a mixed batch
      // the selection genuinely belongs to the stocks in it.
      const t = typeOf(sym)
      return t != null && !isFundIdea(t) ? selectedPortfolios : []
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.prospects })
      const failed = res.filter((r) => !r.ok)
      if (failed.length === 0) { onClose(); return }
      // Keep the failures on screen AS CHIPS, so the obvious next move —
      // press the button again — retries exactly those. `addProspect` merges
      // rather than colliding, so a retry is always safe.
      setResults(res)
      setPicked(failed.map((r) => r.securityId))
    },
  })

  const filtered = securities.filter((s) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      s.security_id.toLowerCase().includes(q) ||
      (s.security_name ?? '').toLowerCase().includes(q)
    )
  }).slice(0, 50)

  const typedTicker = search.trim().toUpperCase()
  const hasExactMatch = securities.some((s) => s.security_id.toUpperCase() === typedTicker)
  // Once a separator appears the field is a LIST, and a dropdown of partial
  // matches on the last fragment is noise.
  const showDropdown = !!search.trim() && !looksLikeList(search)

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Add to watchlist</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Securities you're considering buying. Add several at once — paste or type a list.
          Stocks are considered for a portfolio; funds are identified by their category.
        </p>
      </div>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Securities{picked.length > 0 && <span className="ml-1 font-normal normal-case text-gray-400">({picked.length})</span>}
          </label>

          {picked.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {picked.map((sym) => {
                const row = rowFor(sym)
                const t = typeOf(sym)
                return (
                  <span
                    key={sym}
                    title={row?.security_name ?? undefined}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1.5 text-sm"
                  >
                    <span className="font-mono font-semibold text-gray-900">{sym}</span>
                    <span className="text-xs text-gray-400">
                      {t == null ? 'checking…' : t === 'Stock' ? 'Stock' : t === 'ETF' ? 'ETF' : 'Fund'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeChip(sym)}
                      aria-label={`Remove ${sym}`}
                      className="rounded-full px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          <div className="mt-2 space-y-2">
            <input
              autoFocus
              type="text"
              placeholder="Enter or paste tickers — VTI, SCHD, JEPI"
              value={search}
              onChange={(e) => {
                const v = e.target.value
                // A paste of a list commits straight away rather than sitting
                // in the box looking like one long ticker.
                if (looksLikeList(v) && /[,;\n\t]/.test(v)) commit(v)
                else setSearch(v)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) { e.preventDefault(); commit(search) }
                if (e.key === 'Backspace' && !search && picked.length > 0) {
                  setPicked((prev) => prev.slice(0, -1))
                }
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
            {showDropdown && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
                {/* Any ticker is watchable, held or not — that is what a watchlist is
                    for. Listed FIRST because below 50 matched securities it was
                    effectively invisible and the field read as a securities picker. */}
                {typedTicker && !hasExactMatch && (
                  <button
                    type="button"
                    onClick={() => commit(typedTicker)}
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
                    onClick={() => commit(s.security_id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                  >
                    <span className="font-mono text-sm font-medium text-gray-900">{s.security_id}</span>
                    {s.security_name && (
                      <span className="truncate text-xs text-gray-500">{s.security_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reported rather than dropped: a paste that silently loses two of
              its eight rows is worse than one that says so. */}
          {rejected.length > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Not recognised as {rejected.length === 1 ? 'a ticker' : 'tickers'}, so{' '}
              {rejected.length === 1 ? 'it was' : 'they were'} skipped:{' '}
              <span className="font-mono">{rejected.join(', ')}</span>
            </p>
          )}
        </div>

        {identifyingAny && (
          <p className="rounded-md bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
            Checking which of these are stocks and which are funds&hellip;
          </p>
        )}

        {stockPicks.length > 0 && (
          <>
            {/* Which portfolio(s) are these being considered for — one entry each. */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Considered for portfolio(s){' '}
                <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              {/* In a mixed batch the selection belongs to the stocks. Saying so
                  beats letting the advisor wonder whether the funds took it too. */}
              <p className="mt-1 text-xs text-gray-400">
                {stockPicks.length === picked.length
                  ? 'Applies to every ticker above.'
                  : `Applies to the ${stockPicks.length} stock${stockPicks.length === 1 ? '' : 's'} above (${stockPicks.join(', ')}) — a fund is identified by its category instead.`}
              </p>
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
              The AI research team will rate each company on its own merits — thesis, bull &amp;
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
        {picked.length > stockPicks.length && !identifyingAny && (
          <div className="space-y-2 rounded-md bg-teal-50 px-3 py-2.5">
            <p className="text-xs text-teal-800">
              <span className="font-semibold">Categorised, not placed.</span>{' '}
              {picked.length - stockPicks.length === 1 ? 'One is a fund' : `${picked.length - stockPicks.length} are funds`}
              , identified by category rather than a portfolio, so there is nothing to choose
              for {picked.length - stockPicks.length === 1 ? 'it' : 'them'}.
            </p>
            <p className="text-xs text-teal-700">
              Any category not already known arrives with the next YCharts refresh, which picks
              the ticker up automatically — no spreadsheet edit needed.
            </p>
            <p className="text-xs text-teal-700">
              The AI research team is not run on funds: it rates a company's business with a
              bull and bear case, which is not how a fund is judged. Its scorecard against
              the cohort is.
            </p>
          </div>
        )}

        {/* A partial failure keeps its tickers as chips, so pressing the button
            again retries exactly those. */}
        {results && results.some((r) => !r.ok) && (
          <div className="rounded-md bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <p className="font-semibold">
              {results.filter((r) => r.ok).length} added,{' '}
              {results.filter((r) => !r.ok).length} failed — still listed above, try again:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {results.filter((r) => !r.ok).map((r) => (
                <li key={r.securityId}><span className="font-mono">{r.securityId}</span> — {r.error}</li>
              ))}
            </ul>
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
          disabled={picked.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending
            ? 'Adding…'
            : picked.length > 1 ? `Add ${picked.length} to watchlist` : 'Add to watchlist'}
        </button>
      </div>
    </dialog>
  )
}
