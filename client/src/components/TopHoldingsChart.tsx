import type { SecurityDetail } from '@/lib/securities'

interface Props {
  security: SecurityDetail
}

const DISPLAY_LIMIT = 10

export function TopHoldingsChart({ security }: Props) {
  const all = security.top_holdings
  if (!all || all.length === 0) return null

  const top = all.slice(0, DISPLAY_LIMIT)
  const maxWeight = Math.max(...top.map((h) => h.weight))
  const remaining = all.length - top.length

  // Sum of shown holdings for "covers X% of portfolio" sub-text
  const coveredWeight = top.reduce((s, h) => s + h.weight, 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Top {top.length} Holdings
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {security.number_of_holdings != null && (
            <span>{security.number_of_holdings.toLocaleString()} total holdings</span>
          )}
          <span>{coveredWeight.toFixed(2)}% of portfolio</span>
        </div>
      </div>

      {/* Bar rows */}
      <div className="mt-3 space-y-1.5">
        {top.map((holding, i) => {
          const barPct = maxWeight > 0 ? (holding.weight / maxWeight) * 100 : 0
          return (
            <div key={holding.symbol} className="flex items-center gap-3">
              {/* Rank */}
              <span className="w-4 shrink-0 text-right text-xs text-gray-300">{i + 1}</span>

              {/* Ticker */}
              <span className="w-14 shrink-0 text-xs font-semibold text-gray-800">
                {holding.symbol}
              </span>

              {/* Bar track */}
              <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-gray-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-gray-800 transition-all duration-300"
                  style={{ width: `${barPct}%` }}
                  aria-hidden
                />
              </div>

              {/* Weight label */}
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-gray-600">
                {holding.weight.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer — remaining holdings hint */}
      {remaining > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          +{remaining} more holding{remaining !== 1 ? 's' : ''} not shown
        </p>
      )}
    </div>
  )
}
