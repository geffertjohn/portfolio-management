import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchActiveAtRisk, removeFromAtRisk } from '@/lib/atRisk'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ProposeSubstitutionModal } from '@/components/ProposeSubstitutionModal'
import { SubstitutionsList } from '@/components/SubstitutionsList'
import { AddToAtRiskModal } from '@/components/AddToAtRiskModal'
import { getSecurityDisplayType, type SecurityDisplayType } from '@/lib/securities'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { fmtUsd } from '@/lib/formatters'
import type { AtRiskEntryWithSecurity } from '@/lib/atRisk'

const METRIC_LABELS: Record<string, string> = {
  'Revenue Growth QoQ': 'QoQ',
  'Revenue Growth 1Y':  'Rev 1Y',
  'EPS Growth 1Y':      'EPS 1Y',
  'Sharpe 1Y':          'Sharpe 1Y',
  'Sortino 1Y':         'Sortino 1Y',
}

const COLUMNS: { type: SecurityDisplayType; label: string; badge: string }[] = [
  { type: 'Stock',       label: 'Stocks',       badge: 'bg-blue-100 text-blue-700' },
  { type: 'ETF',         label: 'ETFs',         badge: 'bg-purple-100 text-purple-700' },
  { type: 'Mutual fund', label: 'Mutual Funds', badge: 'bg-green-100 text-green-700' },
]

function AtRiskCard({
  entry,
  streamable,
  onNavigate,
  onPropose,
  onRemove,
  removePending,
}: {
  entry: AtRiskEntryWithSecurity
  streamable: boolean
  onNavigate: () => void
  onPropose: () => void
  onRemove: () => void
  removePending: boolean
}) {
  const [showSubs, setShowSubs] = useState(false)
  const sec = entry.securities2
  // Live last-trade for exchange-traded names; mutual funds don't stream.
  const live = useLiveQuote(streamable ? sec?.security_id ?? null : null)

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Clickable header */}
      <div
        className="cursor-pointer px-4 py-3 hover:bg-gray-50"
        onClick={onNavigate}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">{sec?.security_id ?? '—'}</p>
            <p className="mt-0.5 text-xs text-gray-500">{sec?.security_name ?? '—'}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {live != null && (
              <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-gray-900">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                {fmtUsd(live.price)}
              </span>
            )}
            {entry.removal_date && (
              <p className="text-xs tabular-nums text-gray-400">
                {new Date(entry.removal_date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {entry.metrics.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {entry.metrics.map((m) => (
              <span key={m} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {METRIC_LABELS[m] ?? m}
              </span>
            ))}
          </div>
        )}

        {entry.notes && (
          <p className="mt-2 text-xs text-gray-400 line-clamp-2">{entry.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center justify-between border-t border-gray-100 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setShowSubs((v) => !v)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {showSubs ? '▲ Subs' : '▼ Subs'}
        </button>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={!sec}
            onClick={onPropose}
            className="rounded border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-40"
          >
            + Propose
          </button>
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

      {/* Substitutions panel */}
      {showSubs && sec && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Substitutions for {sec.security_id}
          </p>
          <SubstitutionsList
            atRiskId={entry.id}
            securityStringId={sec.security_id}
          />
        </div>
      )}
    </div>
  )
}

export function AtRiskPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [proposeFor, setProposeFor] = useState<{
    atRiskId: number
    securityId: string
    symbol: string
  } | null>(null)

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.atRisk,
    queryFn: fetchActiveAtRisk,
  })

  const removeMutation = useMutation({
    mutationFn: (entryId: number) => removeFromAtRisk(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk }),
  })

  const grouped = COLUMNS.map(({ type, label, badge }) => ({
    type, label, badge,
    items: entries
      .filter((e) => getSecurityDisplayType(e.securities2 ?? {}) === type)
      .sort((a, b) => {
        if (!a.removal_date && !b.removal_date) return 0
        if (!a.removal_date) return 1
        if (!b.removal_date) return -1
        return new Date(a.removal_date).getTime() - new Date(b.removal_date).getTime()
      }),
  }))

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">At-Risk</h1>
          <p className="mt-1 text-sm text-gray-500">
            Held securities flagged for deteriorating scorecard metrics — review for replacement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
            {entries.length} active
          </span>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add stock
          </button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Failed to load at-risk list</p>
            <p className="mt-1 text-sm text-red-600">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
            <p className="text-sm font-medium text-gray-500">No securities flagged as at-risk</p>
            <p className="mt-1 text-xs text-gray-400">
              Flag a security from its Monitor tab when scorecard metrics deteriorate.
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
                        <AtRiskCard
                          key={entry.id}
                          entry={entry}
                          streamable={type !== 'Mutual fund'}
                          onNavigate={() => navigate(`/security/${sec?.id}`, { state: { tab: 'monitoring' } })}
                          onPropose={() => sec && setProposeFor({ atRiskId: entry.id, securityId: sec.security_id, symbol: sec.security_id })}
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

      <AddToAtRiskModal open={addOpen} onClose={() => setAddOpen(false)} />

      {proposeFor && (
        <ProposeSubstitutionModal
          open={proposeFor !== null}
          onClose={() => setProposeFor(null)}
          atRiskId={proposeFor.atRiskId}
          incumbentSecurityId={proposeFor.securityId}
          incumbentSymbol={proposeFor.symbol}
        />
      )}
    </div>
  )
}
