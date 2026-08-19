import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  beatRate, fetchTipRanksRatings, fetchTipRanksSymbolSummary, latestByAnalyst, netUpgrades,
  MIN_RATINGS_FOR_ACCURACY, type TipRanksRating,
} from '@/lib/fmpTipranks'
import { TipRanksAnalystModal } from '@/components/TipRanksAnalystModal'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { EMPTY, fmtDecimalPct, fmtSignedPct, fmtUsd } from '@/lib/formatters'
import { formatDate } from '@/lib/fundFormat'

/** Consensus split as a single proportional bar — buy / hold / sell. */
function ConsensusBar({ buy, hold, sell }: { buy: number; hold: number; sell: number }) {
  const total = buy + hold + sell
  if (total === 0) return null
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="bg-green-500" style={{ width: pct(buy) }} title={`${buy} buy`} />
      <div className="bg-amber-400" style={{ width: pct(hold) }} title={`${hold} hold`} />
      <div className="bg-red-500" style={{ width: pct(sell) }} title={`${sell} sell`} />
    </div>
  )
}

function Stat({ label, value, tone, hint }: {
  label: string; value: string; tone?: 'good' | 'bad'; hint?: string
}) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : 'text-gray-900'
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

const ratingTone = (r: string | null): string => {
  const s = r?.toLowerCase() ?? ''
  if (s === 'buy') return 'bg-green-50 text-green-700 ring-green-200'
  if (s === 'sell') return 'bg-red-50 text-red-700 ring-red-200'
  if (s === 'hold') return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-gray-100 text-gray-600 ring-gray-200'
}

const actionTone = (a: string | null): string =>
  a === 'upgraded' ? 'text-green-600' : a === 'downgraded' ? 'text-red-600' : 'text-gray-400'

/**
 * Whole-street coverage for one stock from TipRanks, weighted by track record.
 *
 * Complements the two research panels either side of it: `ExternalResearchPanel`
 * is the one broker whose PDFs are uploaded, `SecurityResearchPanel` is the AI
 * team's own view, and this is everyone else — with each analyst's hit rate on
 * THIS name, so opinions can be weighed rather than counted.
 *
 * Read-only and on demand (two calls, 1h cache); nothing is persisted.
 */
export function TipRanksPanel({ securityId }: { securityId: string }) {
  const [drilldown, setDrilldown] = useState<TipRanksRating | null>(null)

  const opts = { staleTime: 1000 * 60 * 60, retry: false as const, enabled: !!securityId }
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: QUERY_KEYS.tipranksSummary(securityId),
    queryFn: () => fetchTipRanksSymbolSummary(securityId),
    ...opts,
  })
  const { data: ratings = [], isLoading: ratLoading } = useQuery({
    queryKey: QUERY_KEYS.tipranksRatings(securityId),
    queryFn: () => fetchTipRanksRatings(securityId),
    ...opts,
  })

  const current = latestByAnalyst(ratings)
  const rate = summary ? beatRate(summary) : null
  const resolved = summary ? summary.beats + summary.misses : 0
  const net = summary ? netUpgrades(summary) : 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Street Coverage</h2>
      <p className="mt-1 text-xs text-gray-400">
        Every covering analyst via TipRanks, with their hit rate on this stock. Select an analyst for their record.
      </p>

      {sumLoading || ratLoading ? (
        <p className="mt-4 text-sm text-gray-400">Loading…</p>
      ) : !summary || summary.totalRecommendations === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No TipRanks coverage for this security.</p>
      ) : (
        <>
          {/* Headline scorecard */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Consensus"
              value={`${summary.buy} / ${summary.hold} / ${summary.sell}`}
              hint="buy / hold / sell"
            />
            <Stat
              label="Rating changes"
              value={`${summary.actions.upgraded} up · ${summary.actions.downgraded} down`}
              tone={net > 0 ? 'good' : net < 0 ? 'bad' : undefined}
              hint={`net ${net >= 0 ? '+' : ''}${net}`}
            />
            <Stat
              label="Targets beaten"
              value={rate != null ? fmtDecimalPct(rate) : EMPTY}
              hint={rate != null ? `of ${resolved} resolved` : `only ${resolved} resolved`}
            />
            <Stat
              label="Avg return"
              value={summary.averageReturn != null ? fmtSignedPct(summary.averageReturn) : EMPTY}
              tone={summary.averageReturn != null ? (summary.averageReturn >= 0 ? 'good' : 'bad') : undefined}
              hint={`${summary.distinctAnalysts} analysts · ${summary.totalRecommendations} calls`}
            />
          </div>

          <div className="mt-3">
            <ConsensusBar buy={summary.buy} hold={summary.hold} sell={summary.sell} />
          </div>

          {rate == null && resolved > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Fewer than {MIN_RATINGS_FOR_ACCURACY} resolved targets — too thin to read as a track record.
            </p>
          )}

          {/* Current standing call per analyst */}
          {current.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm" style={{ minWidth: 620 }}>
                <thead>
                  <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 text-left font-semibold">Analyst</th>
                    <th className="px-3 py-2 text-left font-semibold">Firm</th>
                    <th className="px-3 py-2 text-left font-semibold">Rating</th>
                    <th className="px-3 py-2 text-right font-semibold">Target</th>
                    <th className="px-3 py-2 text-right font-semibold">Hit rate here</th>
                    <th className="px-3 py-2 text-right font-semibold">Dated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {current.map((r) => (
                    <tr
                      key={r.expertUID ?? r.analystName ?? ''}
                      onClick={() => r.expertUID && setDrilldown(r)}
                      className={r.expertUID ? 'cursor-pointer hover:bg-gray-50' : ''}
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {r.analystName ?? EMPTY}
                        {r.action && (
                          <span className={`ml-1.5 text-xs ${actionTone(r.action)}`}>· {r.action}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.firmName ?? EMPTY}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${ratingTone(r.recommendation)}`}>
                          {r.recommendation ?? EMPTY}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {r.priceTarget != null ? fmtUsd(r.priceTarget) : EMPTY}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {r.stockSuccessRate != null ? fmtDecimalPct(r.stockSuccessRate) : EMPTY}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-gray-500">
                        {formatDate(r.recommendationDate ?? r.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {drilldown?.expertUID && (
        <TipRanksAnalystModal
          expertUID={drilldown.expertUID}
          analystName={drilldown.analystName}
          firmName={drilldown.firmName}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  )
}
