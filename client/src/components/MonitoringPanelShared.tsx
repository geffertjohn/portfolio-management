/**
 * Shared primitives used by FundMonitoringPanel.
 */

import type { ReactNode } from 'react'
import { scorecardColor, SCORECARD_TEXT_CLASS } from '@/lib/scorecardColor'

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
  // The rule itself lives in lib/scorecardColor.ts — the At-Risk list grades the
  // same six metrics and must not restate it.
  const color = scorecardColor({
    value: rawValue,
    benchmark: benchmarkValue,
    benchmark2: benchmark2Value,
    neutral,
    higherIsBetter,
    rankPct,
  })
  const valueColor = SCORECARD_TEXT_CLASS[color]

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
