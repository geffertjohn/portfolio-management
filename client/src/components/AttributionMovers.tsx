import { useQuery } from '@tanstack/react-query'
import { fetchPortfolioMovers, type HoldingMover } from '@/lib/portfolioPerformance'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fmtSignedPct, fmtDecimalPct } from '@/lib/formatters'
import { formatDate } from '@/lib/fundFormat'

interface AttributionMoversProps {
  portfolioId: string
}

/** Trailing windows shown in the attribution block. */
const WINDOWS: { label: string; days: number }[] = [
  { label: '1 Month', days: 30 },
  { label: '3 Month', days: 90 },
]

function MoverList({ title, rows }: { title: string; rows: HoldingMover[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1.5 text-xs text-gray-400">—</p>
      ) : (
        <table className="mt-1.5 w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400">
              <th className="text-left font-medium">Holding</th>
              <th className="text-right font-medium">Weight</th>
              <th className="text-right font-medium">Return</th>
              {/* The column the ranking is by, so it reads last and in ink. */}
              <th className="text-right font-medium">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.symbol}>
                <td className="truncate pr-2 font-medium text-gray-700" title={m.name ?? m.symbol}>
                  {m.symbol}
                </td>
                <td className="whitespace-nowrap pr-2 text-right tabular-nums text-gray-500">
                  {fmtDecimalPct(m.weight)}
                </td>
                {/* Return is context for the contribution beside it, so it is
                    muted: a big move in a small sleeve is not a big deal. */}
                <td className="whitespace-nowrap pr-2 text-right tabular-nums text-gray-500">
                  {fmtSignedPct(m.ret)}
                </td>
                <td className={`whitespace-nowrap text-right tabular-nums font-medium ${
                  m.contribution >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {fmtSignedPct(m.contribution)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * Below this many holdings, a top/bottom split is not worth making.
 *
 * Splitting only tells the reader something when it HIDES something. At ten
 * holdings or fewer the two lists name every position between them, and at
 * exactly five the bottom list came out EMPTY — `Math.max(5, 5 - 5)` is 5, so
 * `slice(5)` returns nothing — while the book's worst performers sat under a
 * heading reading "Top 5". Foundation Conservative showed VFWAX at -3.51%
 * ranked fifth of five under "Top 5", against a "Bottom 5" column containing a
 * dash that reads as missing data.
 *
 * That is the COMMON case here, not an edge one: a Foundation book holds a
 * handful of funds at twenty-odd percent each by construction, and this section
 * is shown on exactly those fund/ETF quarterly reviews. The Equity books that
 * carry twenty-plus single stocks still get the split.
 */
const SPLIT_MIN_HOLDINGS = 11

/** One trailing window: top-5 / bottom-5 holdings by total return over `days`. */
function MoverWindow({ portfolioId, days, label }: { portfolioId: string; days: number; label: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.portfolioMovers(portfolioId, days),
    queryFn: () => fetchPortfolioMovers(portfolioId, days),
    staleTime: 5 * 60 * 1000,
  })

  const inner = () => {
    if (isLoading) return <p className="text-xs text-gray-400">Loading {label} movers…</p>
    if (error) {
      return (
        <p className="text-xs text-red-600">
          Could not load movers: {error instanceof Error ? error.message : String(error)}
        </p>
      )
    }
    const movers = data?.rows ?? []
    if (movers.length === 0) {
      return <p className="text-xs text-gray-400">No priceable holdings to rank.</p>
    }
    // Few enough that a split would conceal nothing — rank them all instead,
    // so no holding is filed under a heading that misdescribes it.
    if (movers.length < SPLIT_MIN_HOLDINGS) {
      return (
        <MoverList title={`All ${movers.length} holdings · by contribution`} rows={movers} />
      )
    }
    const top = movers.slice(0, 5)
    // Take the worst up to 5 without overlapping the top slice; show worst-first.
    const bottomStart = Math.max(5, movers.length - 5)
    const bottom = movers.slice(bottomStart).reverse()
    return (
      <div className="grid grid-cols-2 gap-4">
        <MoverList title="Top 5 by contribution" rows={top} />
        <MoverList title="Bottom 5 by contribution" rows={bottom} />
      </div>
    )
  }

  // Name the basis. A contribution measured against position TARGETS describes
  // a book nobody necessarily holds, and that is not something to leave implied.
  const basisNote = data == null ? null
    : data.basis === 'actual'
      ? `actual holdings uploaded ${formatDate(data.asOf)}`
      : 'position targets — no allocation file uploaded'

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {basisNote && <span className="text-xs text-gray-400">vs {basisNote}</span>}
      </div>
      <div className="mt-1.5">{inner()}</div>
    </div>
  )
}

export function AttributionMovers({ portfolioId }: AttributionMoversProps) {
  return (
    <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Trailing Returns</p>
      <div className="mt-3 space-y-4">
        {WINDOWS.map((w) => (
          <MoverWindow key={w.days} portfolioId={portfolioId} days={w.days} label={w.label} />
        ))}
      </div>
    </div>
  )
}
