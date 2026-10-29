/**
 * scorecardColor.ts
 *
 * The scorecard's red/amber/green rule, extracted from `MetricCard` so it has
 * exactly one definition.
 *
 * It was inlined in `MonitoringPanelShared.tsx` until the At-Risk list started
 * grading metrics too (Oct 2026). A colour rule living inside a React component
 * cannot be read by anything else, and the second reader would have had to
 * restate it — which is how a metric ends up red on the scorecard and green on
 * the At-Risk card. Same reason `lib/fundScorecard.ts` exists.
 *
 * **Three states, not two.** A metric with two comparators is green only when it
 * beats BOTH and red only when it beats NEITHER; beating one is amber. Anything
 * deciding "is this metric failing?" must treat amber as not-red, which is the
 * rule the At-Risk list clears on.
 */

export type ScorecardColor = 'green' | 'yellow' | 'red' | 'none'

export interface ScorecardColorInput {
  value: number | null | undefined
  /** Primary comparator — a prior fiscal year for margins, a benchmark for growth. */
  benchmark?: number | null
  /** Secondary comparator — the year before, or the peer/sector benchmark. */
  benchmark2?: number | null
  /** Used only when neither comparator is available. */
  neutral?: number
  higherIsBetter: boolean
  /**
   * Peer-rank percentile (funds). When present it OVERRIDES the comparators —
   * a rank already expresses the whole comparison.
   */
  rankPct?: number | null
}

/** Quartile bands for a peer-rank percentile (lower is better). */
export function rankQuartileColor(rankPct: number): ScorecardColor {
  if (rankPct < 0.25) return 'green'
  if (rankPct < 0.5) return 'yellow'
  return 'red'
}

export function scorecardColor(input: ScorecardColorInput): ScorecardColor {
  const { value, benchmark, benchmark2, neutral = 0, higherIsBetter, rankPct } = input

  if (value == null || !Number.isFinite(value)) return 'none'
  if (rankPct != null && Number.isFinite(rankPct)) return rankQuartileColor(rankPct)

  const beats = (v: number, b: number) => (higherIsBetter ? v >= b : v <= b)
  const b1 = benchmark ?? null
  const b2 = benchmark2 ?? null

  if (b1 != null && b2 != null) {
    if (beats(value, b1) && beats(value, b2)) return 'green'
    if (!beats(value, b1) && !beats(value, b2)) return 'red'
    return 'yellow'
  }
  if (b1 != null) return beats(value, b1) ? 'green' : 'red'
  if (b2 != null) return beats(value, b2) ? 'green' : 'red'
  return beats(value, neutral) ? 'green' : 'red'
}

/** Tailwind text class per state, for the metric cards. */
export const SCORECARD_TEXT_CLASS: Record<ScorecardColor, string> = {
  green: 'text-green-600',
  yellow: 'text-yellow-500',
  red: 'text-red-600',
  none: 'text-gray-400',
}

/** Bar fill per state, for the delta bars. */
export const SCORECARD_BAR_COLOR: Record<ScorecardColor, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  none: '#d1d5db',
}
