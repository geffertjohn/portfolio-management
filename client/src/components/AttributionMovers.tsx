import { useQuery } from '@tanstack/react-query'
import { fetchPortfolioMovers, type HoldingMover } from '@/lib/portfolioPerformance'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fmtSignedPct } from '@/lib/formatters'

interface AttributionMoversProps {
  portfolioId: string
  /** Trailing window in days. */
  days?: number
}

function MoverList({ title, rows }: { title: string; rows: HoldingMover[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.length === 0 ? (
          <li className="text-xs text-gray-400">—</li>
        ) : (
          rows.map((m) => (
            <li key={m.symbol} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-gray-700" title={m.name ?? m.symbol}>
                {m.symbol}
              </span>
              <span className={m.ret >= 0 ? 'text-green-600' : 'text-red-600'}>
                {fmtSignedPct(m.ret)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export function AttributionMovers({ portfolioId, days = 30 }: AttributionMoversProps) {
  const { data: movers = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.portfolioMovers(portfolioId, days),
    queryFn: () => fetchPortfolioMovers(portfolioId, days),
    staleTime: 5 * 60 * 1000,
  })

  const inner = () => {
    if (isLoading) return <p className="text-xs text-gray-400">Loading {days}-day movers…</p>
    if (error) {
      return (
        <p className="text-xs text-red-600">
          Could not load movers: {error instanceof Error ? error.message : String(error)}
        </p>
      )
    }
    if (movers.length === 0) {
      return <p className="text-xs text-gray-400">No priceable holdings to rank.</p>
    }
    const top = movers.slice(0, 5)
    // Take the worst up to 5 without overlapping the top slice; show worst-first.
    const bottomStart = Math.max(5, movers.length - 5)
    const bottom = movers.slice(bottomStart).reverse()
    return (
      <div className="grid grid-cols-2 gap-4">
        <MoverList title="Top 5" rows={top} />
        <MoverList title="Bottom 5" rows={bottom} />
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-600">Trailing {days}-day total return</p>
      <div className="mt-2">{inner()}</div>
    </div>
  )
}
