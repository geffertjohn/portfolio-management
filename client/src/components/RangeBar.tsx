interface RangeBarProps {
  pct: number
  low: string
  high: string
  markerLabel: string
  /** Renders a faint filled track behind the marker (used for the target range). */
  filled?: boolean
  /** Wrapper class — defaults to the analyst-coverage spacing. */
  className?: string
}

/**
 * Horizontal range bar with a pinned marker. Shared by AnalystCoveragePanel and
 * AnalystSummaryCards (previously a near-duplicate component in each).
 */
export function RangeBar({ pct, low, high, markerLabel, filled = false, className = 'mt-1' }: RangeBarProps) {
  const c = Math.max(0, Math.min(100, pct))
  return (
    <div className={className}>
      <div className="relative h-6">
        <div className="absolute -translate-x-1/2 bottom-1" style={{ left: `${c}%` }}>
          <span className="inline-block rounded bg-indigo-600 px-1.5 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap">
            {markerLabel}
          </span>
          <div className="mx-auto h-0 w-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-indigo-600" />
        </div>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-gray-200">
        {filled && (
          <div className="absolute h-full w-full rounded-full bg-indigo-100" />
        )}
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
