/**
 * AnalystSummaryCards
 *
 * Compact scorecard-style row summarising analyst coverage for a stock, used on
 * the Research page above the Scorecard. Three cards, all live FMP / on-demand:
 *   1. Price (52-Week Range) — the range bar (unchanged), wrapped in a card.
 *   2. Price Target          — consensus target (green if above the current
 *                              price, red if below) + 52-week low / high.
 *   3. Consensus             — consensus label (green buy / yellow hold / red
 *                              sell) + Buy / Hold / Sell totals, where Buy folds
 *                              in Strong Buy and Sell folds in Strong Sell.
 *
 * Kept separate from AnalystCoveragePanel (still used on the stock detail page)
 * so that panel's layout is unaffected.
 */
import { useQuery } from '@tanstack/react-query'
import type { SecurityDetail } from '@/lib/securities'
import { fetchAnalystData } from '@/lib/fmpAnalyst'
import { fetchQuote } from '@/lib/fmpMarket'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { QUERY_KEYS } from '@/hooks/queryKeys'

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

/** Green when the consensus leans buy, yellow when hold/neutral, red when sell. */
function consensusColor(label: string | null): string {
  if (!label) return 'text-gray-400'
  const l = label.toLowerCase()
  if (l.includes('buy') || l.includes('overweight') || l.includes('outperform')) return 'text-green-600'
  if (l.includes('sell') || l.includes('underweight') || l.includes('underperform')) return 'text-red-600'
  if (l.includes('hold') || l.includes('neutral') || l.includes('market perform') || l.includes('equal')) return 'text-yellow-500'
  return 'text-gray-700'
}

/** Horizontal range bar with a pinned marker (matches AnalystCoveragePanel). */
function RangeBar({
  pct,
  low,
  high,
  markerLabel,
}: {
  pct: number
  low: string
  high: string
  markerLabel: string
}) {
  const c = Math.max(0, Math.min(100, pct))
  return (
    <div className="w-full">
      <div className="relative h-6">
        <div className="absolute bottom-1 -translate-x-1/2" style={{ left: `${c}%` }}>
          <span className="inline-block whitespace-nowrap rounded bg-indigo-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {markerLabel}
          </span>
          <div className="mx-auto h-0 w-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-indigo-600" />
        </div>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-gray-200">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500 ring-2 ring-white"
          style={{ left: `${c}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-400">
        <span>Low: {low}</span>
        <span>High: {high}</span>
      </div>
    </div>
  )
}

/** Card shell matching the Scorecard MetricCard dimensions. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      </div>
      {children}
    </div>
  )
}

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="space-y-1 border-t border-gray-100 pt-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{r.label}</span>
          <span className="text-[11px] tabular-nums text-gray-600">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function AnalystSummaryCards({ security }: Props) {
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
  const price = num(live?.price) ?? num(quote?.price)
  const yearHigh = num(quote?.yearHigh)
  const yearLow = num(quote?.yearLow)

  const pt = data?.priceTarget ?? null
  const grades = data?.grades ?? null

  // ── 52-week range ──────────────────────────────────────────────────────────
  const has52w = price != null && yearHigh != null && yearLow != null && yearHigh > yearLow
  const pricePct = has52w ? ((price! - yearLow!) / (yearHigh! - yearLow!)) * 100 : 50

  // ── Price target ───────────────────────────────────────────────────────────
  const target = pt?.targetConsensus ?? pt?.targetMedian ?? null
  const targetLow = num(pt?.targetLow)
  const targetHigh = num(pt?.targetHigh)
  const upside = target != null && price != null && price > 0 ? ((target - price) / price) * 100 : null
  const targetColor =
    target == null || price == null
      ? 'text-gray-700'
      : target >= price
        ? 'text-green-600'
        : 'text-red-600'

  // ── Grades / consensus ─────────────────────────────────────────────────────
  const buyTotal = grades ? grades.strongBuy + grades.buy : 0
  const holdTotal = grades ? grades.hold : 0
  const sellTotal = grades ? grades.sell + grades.strongSell : 0
  const totalGrades = buyTotal + holdTotal + sellTotal
  const consensus = grades?.consensus ?? null

  const hasAnyData = has52w || target != null || totalGrades > 0 || consensus != null

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
        ))}
      </div>
    )
  }

  if (!hasAnyData) return null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* ── Price (52-Week Range) ─────────────────────────────────────────── */}
      <Card title="Price (52-Week Range)">
        <div className="flex flex-1 items-center justify-center">
          {has52w ? (
            <RangeBar
              pct={pricePct}
              low={`$${fmtDollar(yearLow!)}`}
              high={`$${fmtDollar(yearHigh!)}`}
              markerLabel={`$${fmtDollar(price!)}`}
            />
          ) : (
            <p className="text-2xl font-semibold tabular-nums text-gray-400">—</p>
          )}
        </div>
        {live != null && (
          <div className="flex items-center justify-center border-t border-gray-100 pt-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Live
            </span>
          </div>
        )}
      </Card>

      {/* ── Price Target ──────────────────────────────────────────────────── */}
      <Card title="Price Target">
        <div className="flex flex-1 items-center justify-center">
          <p className={`text-2xl font-semibold tabular-nums ${targetColor}`}>
            {target != null ? `$${fmtDollar(target)}` : '—'}
          </p>
        </div>
        <Rows
          rows={[
            { label: 'Target Low', value: targetLow != null ? `$${fmtDollar(targetLow)}` : '—' },
            { label: 'Target High', value: targetHigh != null ? `$${fmtDollar(targetHigh)}` : '—' },
            { label: 'Upside', value: upside != null ? fmtSignedPct(upside) : '—' },
          ]}
        />
      </Card>

      {/* ── Consensus ─────────────────────────────────────────────────────── */}
      <Card title="Consensus">
        <div className="flex flex-1 items-center justify-center">
          <p className={`text-2xl font-semibold ${consensusColor(consensus)}`}>
            {consensus ?? '—'}
          </p>
        </div>
        <Rows
          rows={[
            { label: 'Buy', value: String(buyTotal) },
            { label: 'Hold', value: String(holdTotal) },
            { label: 'Sell', value: String(sellTotal) },
          ]}
        />
      </Card>
    </div>
  )
}
