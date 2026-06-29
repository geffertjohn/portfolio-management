/**
 * Shared primitives used by FundMonitoringPanel.
 */

import type { ReactNode } from 'react'

// ── Diverging reference bar ───────────────────────────────────────────────────

/**
 * Centered bar where the midpoint represents `neutral`.
 * `higherIsBetter` controls which direction is green.
 * `scale` is the half-width of the axis (values beyond are clamped).
 */
export function DivergingBar({
  value,
  neutral,
  scale,
  higherIsBetter,
  colorOverride,
}: {
  value: number
  neutral: number
  scale: number
  higherIsBetter: boolean
  colorOverride?: string
}) {
  const delta = value - neutral
  const clamped = Math.max(-scale, Math.min(scale, delta))
  const pct = Math.abs(clamped / scale) * 50 // max 50% of total width

  const isGood = higherIsBetter ? delta >= 0 : delta <= 0
  const color = colorOverride ?? (isGood ? '#22c55e' : '#ef4444')
  const goesRight = delta >= 0

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100">
      {/* center tick */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
      {/* fill */}
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          width: `${pct}%`,
          left: goesRight ? '50%' : `${50 - pct}%`,
          backgroundColor: color,
        }}
      />
    </div>
  )
}

// ── Individual metric card ────────────────────────────────────────────────────

function rankQuartileColor(rankPct: number): { text: string; bar: string } {
  if (rankPct < 0.25) return { text: 'text-green-600', bar: '#22c55e' }
  if (rankPct < 0.50) return { text: 'text-yellow-500', bar: '#eab308' }
  return { text: 'text-red-600', bar: '#ef4444' }
}

export function MetricCard({
  title,
  subtitle,
  displayValue,
  rawValue,
  neutral,
  higherIsBetter,
  benchmarkValue,
  benchmark2Value,
  rankPct,
  components,
}: {
  title: ReactNode
  subtitle: string
  displayValue: string
  rawValue: number | null
  neutral: number
  scale: number
  higherIsBetter: boolean
  benchmarkValue?: number | null
  benchmark2Value?: number | null
  rankPct?: number | null
  components: { label: string; value: string }[]
}) {
  const hasValue = rawValue !== null && Number.isFinite(rawValue)

  const beats = (v: number, b: number) => higherIsBetter ? v >= b : v <= b

  const quartile = rankPct != null && Number.isFinite(rankPct) ? rankQuartileColor(rankPct) : null

  const valueColor = (() => {
    if (!hasValue) return 'text-gray-400'
    if (quartile) return quartile.text
    const v = rawValue!
    const b1 = benchmarkValue ?? null
    const b2 = benchmark2Value ?? null

    if (b1 != null && b2 != null) {
      if (beats(v, b1) && beats(v, b2)) return 'text-green-600'
      if (!beats(v, b1) && !beats(v, b2)) return 'text-red-600'
      return 'text-yellow-500'
    }

    if (b1 != null) return beats(v, b1) ? 'text-green-600' : 'text-red-600'
    if (b2 != null) return beats(v, b2) ? 'text-green-600' : 'text-red-600'

    const threshold = neutral
    return beats(v, threshold) ? 'text-green-600' : 'text-red-600'
  })()

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        {subtitle ? <p className="mt-0.5 text-[11px] text-gray-400">{subtitle}</p> : null}
      </div>

      <div className="flex flex-1 items-center justify-center">
        <p className={`text-2xl font-semibold tabular-nums ${valueColor}`}>
          {displayValue}
        </p>
      </div>

      {components.length > 0 && (
        <div className="space-y-1 border-t border-gray-100 pt-2">
          {components.map((c) => (
            <div key={c.label} className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">{c.label}</span>
              <span className="text-[11px] tabular-nums text-gray-600">{c.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
