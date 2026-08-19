import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  beatRate, consensusFromRatings, fetchTipRanksRatings, fetchTipRanksSymbolSummary,
  latestByAnalyst, netUpgrades, stockHitRate, targetsFromRatings,
  MIN_RATINGS_FOR_ACCURACY, type StreetConsensus, type TipRanksRating,
} from '@/lib/fmpTipranks'
import { fetchQuote } from '@/lib/fmpMarket'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { TipRanksAnalystModal } from '@/components/TipRanksAnalystModal'
import { RangeBar } from '@/components/RangeBar'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { EMPTY, fmtDecimalPct, fmtSignedPct, fmtUsd } from '@/lib/formatters'
import { formatDate } from '@/lib/fundFormat'

/* ── Consensus donut ───────────────────────────────────────────────────────── */

const DONUT = { size: 132, stroke: 16 }
const SEGMENT_COLORS = { buy: '#16a34a', hold: '#d1d5db', sell: '#be123c' }

/**
 * Buy / hold / sell split as a ring with the analyst count in the middle.
 * Drawn with stroke-dasharray arcs rather than hand-authored paths so the
 * segments stay exact at any split.
 */
function ConsensusDonut({ c }: { c: StreetConsensus }) {
  const { size, stroke } = DONUT
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const total = c.analysts || 1

  let offset = 0
  const segments = ([['buy', c.buy], ['hold', c.hold], ['sell', c.sell]] as const)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => {
      const len = (n / total) * circ
      const seg = { key, len, offset }
      offset += len
      return seg
    })

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={`${c.buy} buy, ${c.hold} hold, ${c.sell} sell`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={SEGMENT_COLORS[s.key]}
            strokeWidth={stroke}
            strokeDasharray={`${s.len} ${circ - s.len}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-gray-900">{c.analysts}</span>
        <span className="text-[11px] uppercase tracking-wide text-gray-400">Analysts</span>
      </div>
    </div>
  )
}

const consensusColor = (label: string): string =>
  label.includes('Buy') ? 'text-green-700' : label.includes('Sell') ? 'text-red-600' : 'text-amber-600'

function Legend({ swatch, label, n }: { swatch: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />
      <span className="font-medium tabular-nums text-gray-900">{n}</span> {label}
    </span>
  )
}

/* ── Table helpers ─────────────────────────────────────────────────────────── */

const ratingTone = (r: string | null): string => {
  const s = r?.toLowerCase() ?? ''
  if (s === 'buy') return 'bg-green-50 text-green-700 ring-green-200'
  if (s === 'sell') return 'bg-red-50 text-red-700 ring-red-200'
  if (s === 'hold') return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-gray-100 text-gray-600 ring-gray-200'
}

const actionTone = (a: string | null): string =>
  a === 'upgraded' ? 'text-green-600' : a === 'downgraded' ? 'text-red-600' : 'text-gray-400'

/* ── Panel ─────────────────────────────────────────────────────────────────── */

/**
 * Whole-street coverage for one stock from TipRanks.
 *
 * Leads with the summary a reader actually wants — the consensus split and the
 * 12-month target range against the live price — and keeps the full analyst
 * list collapsed behind it, since 40+ rows buried the headline.
 *
 * Sits above `SecurityResearchPanel` (the AI team's own view): this is the
 * outside world, with each analyst's hit rate on THIS name so opinions can be
 * weighed rather than counted.
 *
 * Read-only and on demand; nothing is persisted.
 */
export function TipRanksPanel({ securityId }: { securityId: string }) {
  const [drilldown, setDrilldown] = useState<TipRanksRating | null>(null)
  const [showAll, setShowAll] = useState(false)

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
  // Same key as AnalystCoveragePanel so the quote is fetched once per page.
  const { data: quote } = useQuery({
    queryKey: QUERY_KEYS.quote(securityId),
    queryFn: () => fetchQuote(securityId),
    ...opts,
  })
  const live = useLiveQuote(securityId)
  const price = live?.price ?? quote?.price ?? null

  const current = latestByAnalyst(ratings)
  const consensus = consensusFromRatings(current)
  const targets = targetsFromRatings(current)
  const rate = summary ? beatRate(summary) : null
  const resolved = summary ? summary.beats + summary.misses : 0
  const net = summary ? netUpgrades(summary) : 0

  const upside =
    targets.average != null && price != null && price > 0 ? targets.average / price - 1 : null
  const markerPct =
    targets.average != null && targets.high != null && targets.low != null && targets.high > targets.low
      ? ((targets.average - targets.low) / (targets.high - targets.low)) * 100
      : 50

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Street Coverage</h2>
      <p className="mt-1 text-xs text-gray-400">
        Analyst ratings and 12-month price targets via TipRanks.
      </p>

      {sumLoading || ratLoading ? (
        <p className="mt-4 text-sm text-gray-400">Loading…</p>
      ) : !summary || summary.totalRecommendations === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No TipRanks coverage for this security.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
            {/* Ratings */}
            <div className="flex items-center gap-5">
              <ConsensusDonut c={consensus} />
              <div>
                <p className={`text-xl font-semibold ${consensusColor(consensus.label)}`}>
                  {consensus.label}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  <Legend swatch={SEGMENT_COLORS.buy} label="Buy" n={consensus.buy} />
                  <Legend swatch={SEGMENT_COLORS.hold} label="Hold" n={consensus.hold} />
                  <Legend swatch={SEGMENT_COLORS.sell} label="Sell" n={consensus.sell} />
                </div>
                <p className="mt-2 text-[11px] text-gray-400">Current standing call per analyst</p>
              </div>
            </div>

            {/* 12-month forecast */}
            <div className="border-t border-gray-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                12-month price target
              </p>
              {targets.average == null ? (
                <p className="mt-2 text-sm text-gray-400">No price targets published.</p>
              ) : (
                <>
                  <div className="mt-1 flex flex-wrap items-baseline gap-3">
                    <span className="text-3xl font-semibold tabular-nums text-gray-900">
                      {fmtUsd(targets.average)}
                    </span>
                    {upside != null && (
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          upside >= 0 ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {fmtSignedPct(upside)} vs {fmtUsd(price)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Average of {targets.count} target{targets.count === 1 ? '' : 's'}
                  </p>
                  <RangeBar
                    className="mt-4"
                    pct={markerPct}
                    low={fmtUsd(targets.low)}
                    high={fmtUsd(targets.high)}
                    markerLabel={fmtUsd(targets.average)}
                    filled
                  />
                </>
              )}
            </div>
          </div>

          {/* Activity + accuracy */}
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-gray-100 pt-4 text-xs">
            <span className="text-gray-500">
              Rating changes{' '}
              <span
                className={`font-medium ${
                  net > 0 ? 'text-green-700' : net < 0 ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {summary.actions.upgraded} up · {summary.actions.downgraded} down
              </span>{' '}
              <span className="text-gray-400">
                (net {net >= 0 ? '+' : ''}
                {net})
              </span>
            </span>
            <span className="text-gray-500">
              Targets beaten{' '}
              <span className="font-medium text-gray-900">
                {rate != null ? fmtDecimalPct(rate) : EMPTY}
              </span>{' '}
              <span className="text-gray-400">
                {rate != null ? `of ${resolved} resolved` : `only ${resolved} resolved`}
              </span>
            </span>
            <span className="text-gray-500">
              Avg return{' '}
              <span
                className={`font-medium ${
                  summary.averageReturn == null
                    ? 'text-gray-900'
                    : summary.averageReturn >= 0
                      ? 'text-green-700'
                      : 'text-red-600'
                }`}
              >
                {summary.averageReturn != null ? fmtSignedPct(summary.averageReturn) : EMPTY}
              </span>{' '}
              <span className="text-gray-400">over {summary.totalRecommendations} calls</span>
            </span>
          </div>

          {rate == null && resolved > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Fewer than {MIN_RATINGS_FOR_ACCURACY} resolved targets — too thin to read as a track record.
            </p>
          )}

          {/* Full analyst list — collapsed by default */}
          {current.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${showAll ? 'rotate-90' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
                {showAll ? 'Hide' : 'Show'} all {current.length} analyst ratings
              </button>

              {showAll && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm" style={{ minWidth: 620 }}>
                    <thead>
                      <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 text-left font-semibold">Analyst</th>
                        <th className="px-3 py-2 text-left font-semibold">Firm</th>
                        <th className="px-3 py-2 text-left font-semibold">Rating</th>
                        <th className="px-3 py-2 text-right font-semibold">Target</th>
                        <th
                          className="px-3 py-2 text-right font-semibold"
                          title="This analyst's hit rate on this stock, as of their latest call. Blank when TipRanks reports none."
                        >
                          Hit rate here
                        </th>
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
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${ratingTone(r.recommendation)}`}
                            >
                              {r.recommendation ?? EMPTY}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {r.priceTarget != null ? fmtUsd(r.priceTarget) : EMPTY}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {stockHitRate(r) != null ? fmtDecimalPct(stockHitRate(r)) : EMPTY}
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
