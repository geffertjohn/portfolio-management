/**
 * AnalystCoveragePanel
 *
 * Live FMP data (all on-demand):
 *   - Quote / 52-week range   (/stable/quote)
 *   - Price target consensus  (/stable/price-target-consensus)
 *   - Grades consensus        (/stable/grades-consensus)
 */
import { useQuery } from '@tanstack/react-query'
import type { SecurityDetail } from '@/lib/securities'
import { fetchAnalystData } from '@/lib/fmpAnalyst'
import { fetchQuote } from '@/lib/fmpMarket'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { consensusColor } from '@/lib/formatters'
import { RangeBar } from './RangeBar'

interface Props {
  security: SecurityDetail
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function fmtDollar(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtSignedPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

const GRADES_CONFIG: { key: keyof { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }; label: string; color: string }[] = [
  { key: 'strongBuy',   label: 'Strong Buy',  color: 'bg-green-600' },
  { key: 'buy',         label: 'Buy',         color: 'bg-green-400' },
  { key: 'hold',        label: 'Hold',        color: 'bg-yellow-300' },
  { key: 'sell',        label: 'Sell',        color: 'bg-orange-400' },
  { key: 'strongSell',  label: 'Strong Sell', color: 'bg-red-500'   },
]

export function AnalystCoveragePanel({ security }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.analystData(security.security_id),
    queryFn: () => fetchAnalystData(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  const { data: quote } = useQuery({
    queryKey: QUERY_KEYS.quote(security.security_id),
    queryFn: () => fetchQuote(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  // Live last-trade overlays the REST quote; REST stands in until the first tick.
  const live = useLiveQuote(security.security_id)
  const price    = num(live?.price) ?? num(quote?.price)
  const yearHigh = num(quote?.yearHigh)
  const yearLow  = num(quote?.yearLow)

  const pt = data?.priceTarget ?? null
  const grades = data?.grades ?? null

  // 52-week range
  const has52w = price != null && yearHigh != null && yearLow != null && yearHigh > yearLow
  const pricePct = has52w ? ((price! - yearLow!) / (yearHigh! - yearLow!)) * 100 : 50

  // Price target range
  const ptConsensus = pt?.targetConsensus ?? null
  const ptHigh      = pt?.targetHigh ?? null
  const ptLow       = pt?.targetLow ?? null
  const hasPtRange  = ptConsensus != null && ptHigh != null && ptLow != null && ptHigh > ptLow
  const ptPct       = hasPtRange ? ((ptConsensus! - ptLow!) / (ptHigh! - ptLow!)) * 100 : 50
  const upside      = ptConsensus != null && price != null && price > 0
    ? (ptConsensus - price) / price * 100
    : null

  // Grades breakdown
  const gradeCounts = grades
    ? GRADES_CONFIG.map((g) => ({ ...g, count: grades[g.key] }))
    : []
  const totalGrades = gradeCounts.reduce((s, g) => s + g.count, 0)

  const hasAnyData = has52w || ptConsensus != null || totalGrades > 0 || grades?.consensus != null

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Analyst Coverage</p>
        <div className="mt-4 space-y-3 animate-pulse">
          <div className="h-4 w-48 rounded bg-gray-100" />
          <div className="h-8 w-full rounded bg-gray-100" />
          <div className="h-4 w-40 rounded bg-gray-100" />
          <div className="h-8 w-full rounded bg-gray-100" />
        </div>
      </div>
    )
  }

  if (!hasAnyData) return null

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Analyst Coverage
      </p>

      <div className="mt-4 space-y-5">

        {/* ── 52-Week Price Range ──────────────────────────────────────────── */}
        {has52w && (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              Price (52-Week Range)
              {live != null && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  Live
                </span>
              )}
            </p>
            <RangeBar
              pct={pricePct}
              low={`$${fmtDollar(yearLow!)}`}
              high={`$${fmtDollar(yearHigh!)}`}
              markerLabel={`$${fmtDollar(price!)}`}
            />
          </div>
        )}

        {/* ── Price Target Consensus ───────────────────────────────────────── */}
        {ptConsensus != null && (
          <div>
            <p className="text-xs font-medium text-gray-600">Price Target</p>

            {hasPtRange ? (
              <RangeBar
                pct={ptPct}
                low={`$${fmtDollar(ptLow!)}`}
                high={`$${fmtDollar(ptHigh!)}`}
                markerLabel={`$${fmtDollar(ptConsensus)}`}
                filled
              />
            ) : (
              <p className="mt-1 text-sm font-semibold text-gray-900">
                ${fmtDollar(ptConsensus)}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
              {upside != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Upside</span>
                  <span className={`text-xs font-semibold ${upside >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmtSignedPct(upside)}
                  </span>
                </div>
              )}
              {pt?.targetMedian != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Median</span>
                  <span className="text-xs font-semibold text-gray-700">
                    ${fmtDollar(pt.targetMedian)}
                  </span>
                </div>
              )}
            </div>
            {pt?.numberOfAnalysts != null && (
              <p className="mt-1 text-xs text-gray-400">{pt.numberOfAnalysts}</p>
            )}
          </div>
        )}

        {/* ── Grades Breakdown ─────────────────────────────────────────────── */}
        {totalGrades > 0 && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-xs font-medium text-gray-600">Analyst Recommendations</p>
              <span className="text-xs text-gray-400">{totalGrades}</span>
            </div>
            <div className="space-y-1.5">
              {gradeCounts.map((g) => (
                <div key={g.label} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-gray-600">{g.label}</span>
                  <span className="w-6 text-right text-xs font-medium text-gray-700">{g.count}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    {g.count > 0 && (
                      <div
                        className={`h-full rounded-full ${g.color}`}
                        style={{ width: `${(g.count / totalGrades) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Consensus Label ───────────────────────────────────────────────── */}
        {grades?.consensus != null && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Consensus
            </span>
            <span className={`text-sm font-semibold ${consensusColor(grades.consensus)}`}>
              {grades.consensus}
            </span>
          </div>
        )}

      </div>
    </div>
  )
}
