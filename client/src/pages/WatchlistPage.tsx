import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchActiveProspects, removeProspect, type ProspectEntryWithSecurity } from '@/lib/prospects'
import { CONVICTION_LABELS } from '@/lib/reviewLog'
import { fetchResearchReports } from '@/lib/researchReports'
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

function ProspectCard({
  entry,
  streamable,
  onNavigate,
  onRemove,
  removePending,
}: {
  entry: ProspectEntryWithSecurity
  streamable: boolean
  onNavigate: () => void
  onRemove: () => void
  removePending: boolean
}) {
  const sec = entry.securities2
  const navigable = sec?.id != null
  // Stream by the prospect's own ticker so watch candidates not in securities2 still get a live price.
  const live = useLiveQuote(streamable ? entry.security_id : null)
  const [showResearch, setShowResearch] = useState(false)

  // AI research for this candidate, scoped to its portfolio (the recommendation is
  // portfolio-specific). Produced by the research analysts in Claude Code.
  const { data: allResearch = [] } = useQuery({
    queryKey: QUERY_KEYS.researchReports(entry.security_id),
    queryFn: () => fetchResearchReports(entry.security_id),
  })
  const research = allResearch
    .filter((r) => r.portfolio_name === entry.target_portfolio || r.portfolio_name == null)
    .sort((a, b) => (ROLE_ORDER[a.author_role] ?? 9) - (ROLE_ORDER[b.author_role] ?? 9))
  const analyst = research.find((r) => r.author_role === 'research_analyst') ?? null

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className={`px-4 py-3 ${navigable ? 'cursor-pointer hover:bg-gray-50' : ''}`} onClick={navigable ? onNavigate : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">{entry.security_id}</p>
            <p className="mt-0.5 text-xs text-gray-500">{sec?.security_name ?? '—'}</p>
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

        <div className="mt-2 flex flex-wrap gap-1">
          {entry.target_portfolio && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {entry.target_portfolio}
            </span>
          )}
          {analyst?.rating && (
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-white">
              {RATING_LABEL[analyst.rating] ?? analyst.rating}
            </span>
          )}
          {analyst?.conviction && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {CONVICTION_LABELS[analyst.conviction]}
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
            <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-3 py-3">
              {research.map((r) => <ResearchCard key={r.id} r={r} />)}
            </div>
          )}
        </>
      )}

      <div
        className="flex items-center justify-end border-t border-gray-100 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
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

  const removeMutation = useMutation({
    mutationFn: (entryId: number) => removeProspect(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.prospects }),
  })

  const grouped = COLUMNS.map(({ type, label, badge }) => ({
    type, label, badge,
    items: entries.filter((e) => getSecurityDisplayType(e.securities2 ?? {}) === type),
  }))

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Watchlist</h1>
          <p className="mt-1 text-sm text-gray-500">
            Securities you're considering adding to a portfolio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
            {entries.length} candidates
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
              Add a candidate you're considering for a portfolio.
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {grouped.map(({ type, label, badge, items }) => (
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
                    items.map((entry) => {
                      const sec = entry.securities2
                      return (
                        <ProspectCard
                          key={entry.id}
                          entry={entry}
                          streamable={type !== 'Mutual fund'}
                          onNavigate={() => { if (sec?.id != null) navigate(`/security/${sec.id}`) }}
                          onRemove={() => removeMutation.mutate(entry.id)}
                          removePending={removeMutation.isPending}
                        />
                      )
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddProspectModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
