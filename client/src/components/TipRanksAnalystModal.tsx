import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  beatRate, fetchTipRanksAnalyst, fetchTipRanksAnalystRatings, fetchTipRanksAnalystSummary,
  MIN_RATINGS_FOR_ACCURACY,
} from '@/lib/fmpTipranks'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { EMPTY, fmtDecimalPct, fmtSignedPct, fmtUsd } from '@/lib/formatters'
import { formatDate } from '@/lib/fundFormat'

interface Props {
  expertUID: string
  /** Shown immediately so the header isn't empty while the fetches resolve. */
  analystName: string | null
  firmName: string | null
  onClose: () => void
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : 'text-gray-900'
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

/** ★ rating out of 5, TipRanks' own analyst score. */
function Stars({ n }: { n: number }) {
  const full = Math.round(n)
  return (
    <span className="text-amber-500" aria-label={`${n.toFixed(1)} out of 5 stars`}>
      {'★'.repeat(full)}<span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  )
}

/**
 * Drill-down on one sell-side analyst: their overall standing, their trailing
 * scorecard, and their recent calls ACROSS every name they cover — the context
 * you need to weigh their opinion on a stock you hold.
 *
 * Read-only and entirely on demand; nothing here is persisted.
 */
export function TipRanksAnalystModal({ expertUID, analystName, firmName, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogRef.current
    if (d && !d.open) d.showModal()
  }, [])

  const opts = { staleTime: 1000 * 60 * 60, retry: false as const, enabled: !!expertUID }

  const { data: summary } = useQuery({
    queryKey: QUERY_KEYS.tipranksAnalystSummary(expertUID),
    queryFn: () => fetchTipRanksAnalystSummary(expertUID),
    ...opts,
  })
  const { data: ratings = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.tipranksAnalystRatings(expertUID),
    queryFn: () => fetchTipRanksAnalystRatings(expertUID),
    ...opts,
  })
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.tipranksAnalyst(analystName ?? ''),
    queryFn: () => fetchTipRanksAnalyst(analystName as string),
    staleTime: 1000 * 60 * 60,
    retry: false,
    enabled: !!analystName,
  })

  const rate = summary ? beatRate(summary) : null
  const resolved = summary ? summary.beats + summary.misses : 0

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{analystName ?? 'Analyst'}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {firmName ?? EMPTY}
            {profile?.analystRank != null && <> · Rank #{profile.analystRank.toLocaleString()}</>}
            {profile?.numOfStars != null && <> · <Stars n={profile.numOfStars} /></>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
        {/* Overall standing + trailing scorecard */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Success rate"
            value={profile?.successRate != null ? fmtDecimalPct(profile.successRate) : EMPTY}
          />
          <Stat
            label="Excess return"
            value={profile?.excessReturn != null ? fmtSignedPct(profile.excessReturn) : EMPTY}
            tone={profile?.excessReturn != null ? (profile.excessReturn >= 0 ? 'good' : 'bad') : undefined}
          />
          <Stat
            label="Targets beaten"
            value={rate != null ? `${fmtDecimalPct(rate)} of ${resolved}` : `${resolved} resolved`}
          />
          <Stat
            label="Avg return"
            value={summary?.averageReturn != null ? fmtSignedPct(summary.averageReturn) : EMPTY}
            tone={summary?.averageReturn != null ? (summary.averageReturn >= 0 ? 'good' : 'bad') : undefined}
          />
        </div>

        {summary && (
          <p className="mt-3 text-xs text-gray-500">
            {summary.totalRecommendations} calls across {summary.distinctSymbols} name
            {summary.distinctSymbols === 1 ? '' : 's'} — {summary.buy} buy · {summary.hold} hold ·{' '}
            {summary.sell} sell, with{' '}
            {summary.actions.upgraded} upgrade{summary.actions.upgraded === 1 ? '' : 's'} and{' '}
            {summary.actions.downgraded} downgrade{summary.actions.downgraded === 1 ? '' : 's'}
            {summary.from && summary.to && <> · {formatDate(summary.from)} – {formatDate(summary.to)}</>}
          </p>
        )}
        {rate == null && resolved > 0 && (
          <p className="mt-1 text-xs text-amber-600">
            Fewer than {MIN_RATINGS_FOR_ACCURACY} resolved targets — too thin to read as a track record.
          </p>
        )}

        {/* Recent calls across every covered name */}
        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent calls</h3>
        {isLoading ? (
          <p className="mt-2 text-sm text-gray-400">Loading…</p>
        ) : ratings.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No individual calls returned for this analyst.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm" style={{ minWidth: 560 }}>
              <thead>
                <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Symbol</th>
                  <th className="px-3 py-2 text-left font-semibold">Call</th>
                  <th className="px-3 py-2 text-right font-semibold">Target</th>
                  <th className="px-3 py-2 text-right font-semibold">Return</th>
                  <th className="px-3 py-2 text-center font-semibold">Beat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ratings.slice(0, 40).map((r, i) => (
                  <tr key={`${r.expertUID}-${r.symbol}-${r.date}-${i}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatDate(r.recommendationDate ?? r.date)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.symbol ?? EMPTY}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.recommendation ?? EMPTY}
                      {r.action && <span className="ml-1 text-xs text-gray-400">· {r.action}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {r.priceTarget != null ? fmtUsd(r.priceTarget) : EMPTY}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      r.stockReturn == null ? 'text-gray-400' : r.stockReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {r.stockReturn != null ? fmtSignedPct(r.stockReturn) : EMPTY}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.beatTarget == null
                        ? <span className="text-gray-300">—</span>
                        : r.beatTarget
                          ? <span className="text-green-600">✓</span>
                          : <span className="text-red-500">✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-gray-100 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Close
        </button>
      </div>
    </dialog>
  )
}
