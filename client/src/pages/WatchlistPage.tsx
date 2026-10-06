import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  fetchActiveProspects,
  removeProspect,
  removeProspectPortfolio,
  type ProspectIdea,
} from '@/lib/prospects'
import { CONVICTION_LABELS } from '@/lib/reviewLog'
import { fetchResearchReports, type ResearchReport } from '@/lib/researchReports'
import { fetchProfile, type Profile } from '@/lib/fmpMarket'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { AddProspectModal } from '@/components/AddProspectModal'
import { ResearchCard } from '@/components/icReviewCards'
import { getSecurityDisplayType, type SecurityDisplayType } from '@/lib/securities'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { fmtUsd } from '@/lib/formatters'

const ROLE_ORDER: Record<string, number> = {
  research_analyst: 0, devils_advocate: 1, quant_analyst: 2,
}
const RATING_LABEL: Record<string, string> = {
  buy: 'Buy', add: 'Add', hold: 'Hold', trim: 'Trim', sell: 'Sell',
}

const COLUMNS: { type: SecurityDisplayType; label: string; badge: string }[] = [
  { type: 'Stock',       label: 'Stocks',       badge: 'bg-blue-100 text-blue-700' },
  { type: 'ETF',         label: 'ETFs',         badge: 'bg-purple-100 text-purple-700' },
  { type: 'Mutual fund', label: 'Mutual Funds', badge: 'bg-green-100 text-green-700' },
]

/**
 * An idea is usually NOT in securities2 — that is the point of a watchlist — so
 * the securities2 classifier has no columns to read and would call everything a
 * stock. FMP's own profile flags are the only signal available before a ticker
 * is ever added.
 */
function displayTypeFor(entry: ProspectIdea, profile: Profile | null): SecurityDisplayType {
  if (entry.securities2) return getSecurityDisplayType(entry.securities2)
  if (profile?.isEtf) return 'ETF'
  if (profile?.isFund) return 'Mutual fund'
  return 'Stock'
}

function ProspectCard({
  entry,
  profile,
  displayType,
  streamable,
  onOpen,
  onRemove,
  onDetach,
  removePending,
}: {
  entry: ProspectIdea
  profile: Profile | null
  displayType: SecurityDisplayType
  streamable: boolean
  onOpen: (() => void) | null
  onRemove: () => void
  onDetach: (portfolio: string) => void
  removePending: boolean
}) {
  const sec = entry.securities2
  const name = sec?.security_name ?? profile?.companyName ?? null
  // Stream by the idea's own ticker so candidates not in securities2 still get a live price.
  const live = useLiveQuote(streamable ? entry.security_id : null)
  const [showResearch, setShowResearch] = useState(false)

  // AI research for this ticker, produced by the analysts in Claude Code. Reports
  // are portfolio-scoped, so keep the ones aimed at a portfolio this idea names
  // plus any unscoped report.
  const { data: allResearch = [] } = useQuery({
    queryKey: QUERY_KEYS.researchReports(entry.security_id),
    queryFn: () => fetchResearchReports(entry.security_id),
  })
  const research = allResearch
    .filter((r) => r.portfolio_name == null || entry.portfolios.includes(r.portfolio_name))
    .sort((a, b) => (ROLE_ORDER[a.author_role] ?? 9) - (ROLE_ORDER[b.author_role] ?? 9))

  // Grouped for display: one idea can now carry research for several portfolios.
  const grouped = useMemo(() => {
    const m = new Map<string, ResearchReport[]>()
    for (const r of research) {
      const key = r.portfolio_name ?? ''
      m.set(key, [...(m.get(key) ?? []), r])
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [research])

  const analysts = research.filter((r) => r.author_role === 'research_analyst')
  // With several portfolios the analyst ratings can legitimately disagree, so a
  // single headline pill would have to pick a winner. Say how many instead.
  const soleAnalyst = analysts.length === 1 ? analysts[0] : null

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div
        className={`px-4 py-3 ${onOpen ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={onOpen ?? undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{entry.security_id}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{name ?? '—'}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {live != null && (
              <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-gray-900">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                {fmtUsd(live.price)}
              </span>
            )}
            {entry.target_price != null && (
              <p className="text-xs tabular-nums text-gray-400">Target {fmtUsd(entry.target_price)}</p>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {entry.portfolios.length === 0 ? (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs italic text-gray-500">
              No portfolio yet
            </span>
          ) : (
            entry.portfolios.map((p) => (
              <span
                key={p}
                className="group flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
              >
                {p}
                <button
                  type="button"
                  onClick={() => onDetach(p)}
                  title={`Remove ${p}`}
                  className="text-indigo-300 hover:text-indigo-700"
                >
                  ×
                </button>
              </span>
            ))
          )}
          {soleAnalyst?.rating && (
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-white">
              {RATING_LABEL[soleAnalyst.rating] ?? soleAnalyst.rating}
            </span>
          )}
          {soleAnalyst?.conviction && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {CONVICTION_LABELS[soleAnalyst.conviction]}
            </span>
          )}
          {analysts.length > 1 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {analysts.length} analyst views
            </span>
          )}
          {research.length === 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              AI research pending
            </span>
          )}
        </div>
      </div>

      {/* AI research disclosure */}
      {research.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowResearch((v) => !v)}
            className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <span>AI Research ({research.length})</span>
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${showResearch ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showResearch && (
            <div className="space-y-4 border-t border-gray-100 bg-gray-50 px-3 py-3">
              {grouped.map(([portfolio, reports]) => (
                <div key={portfolio} className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {portfolio || 'Not portfolio-specific'}
                  </p>
                  {reports.map((r) => <ResearchCard key={r.id} r={r} />)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div
        className="flex items-center justify-between border-t border-gray-100 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-gray-400">
          {onOpen
            ? 'Open research →'
            : `${displayType} not in your securities`}
        </span>
        <button
          type="button"
          disabled={removePending}
          onClick={onRemove}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

export function WatchlistPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.prospects,
    queryFn: fetchActiveProspects,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.prospects })

  const removeMutation = useMutation({
    mutationFn: (entryId: number) => removeProspect(entryId),
    onSuccess: invalidate,
  })
  const detachMutation = useMutation({
    mutationFn: ({ id, portfolio }: { id: number; portfolio: string }) =>
      removeProspectPortfolio(id, portfolio),
    onSuccess: invalidate,
  })

  // Identity + asset type for ideas that are not in securities2. Shares the
  // profile cache with the research page, so opening an idea costs no extra call.
  const unknownSymbols = useMemo(
    () => [...new Set(entries.filter((e) => !e.securities2).map((e) => e.security_id))],
    [entries],
  )
  const profileQueries = useQueries({
    queries: unknownSymbols.map((sym) => ({
      queryKey: QUERY_KEYS.profile(sym),
      queryFn: () => fetchProfile(sym),
      staleTime: 1000 * 60 * 60 * 24,
      retry: false,
    })),
  })
  const profileBySymbol = new Map<string, Profile | null>(
    unknownSymbols.map((s, i) => [s, profileQueries[i]?.data ?? null]),
  )

  const resolved = entries.map((entry) => {
    const profile = entry.securities2 ? null : profileBySymbol.get(entry.security_id) ?? null
    return { entry, profile, type: displayTypeFor(entry, profile) }
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Watchlist</h1>
          <p className="mt-1 text-sm text-gray-500">
            Investment ideas you're considering — for one or more portfolios, or none yet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
            {entries.length} idea{entries.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add candidate
          </button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Failed to load watchlist</p>
            <p className="mt-1 text-sm text-red-600">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
            <p className="text-sm font-medium text-gray-500">No securities on the watchlist</p>
            <p className="mt-1 text-xs text-gray-400">
              Add any ticker you're considering — a portfolio can come later.
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {COLUMNS.map(({ type, label, badge }) => {
              const items = resolved.filter((r) => r.type === type)
              return (
                <div key={type}>
                  <div className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
                      {label}
                    </span>
                    <span className="text-xs text-gray-400">{items.length}</span>
                  </div>
                  <div className="space-y-3">
                    {items.length === 0 ? (
                      <p className="text-xs italic text-gray-400">None</p>
                    ) : (
                      items.map(({ entry, profile }) => {
                        // Stocks open the on-demand research page, which runs on a
                        // bare ticker — so an idea you don't own is no longer a
                        // dead card. The research page is stock-only, so a fund or
                        // ETF still opens its securities2 detail page when it has one.
                        const secId = entry.securities2?.id ?? null
                        const onOpen =
                          type === 'Stock'
                            ? () => navigate(`/research/${entry.security_id}`)
                            : secId != null
                              ? () => navigate(`/security/${secId}`)
                              : null
                        return (
                          <ProspectCard
                            key={entry.id}
                            entry={entry}
                            profile={profile}
                            displayType={type}
                            streamable={type !== 'Mutual fund'}
                            onOpen={onOpen}
                            onRemove={() => removeMutation.mutate(entry.id)}
                            onDetach={(portfolio) =>
                              detachMutation.mutate({ id: entry.id, portfolio })
                            }
                            removePending={removeMutation.isPending}
                          />
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AddProspectModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
