/**
 * positionBands.ts
 *
 * Effective lower/target/upper allocation bands for a portfolio's positions —
 * the same values shown on the Allocation tab. Explicit per-position limits win;
 * otherwise the band is derived from the model portfolio's drift percentage
 * (cash uses the model's cash limits). `driftBandFor` is the single source for
 * that derivation — PortfolioDetailPage imports it rather than inlining a copy.
 */
import type { PortfolioPosition } from '@/types/position'
import type { ModelPortfolio } from './modelPortfolios'

export type BandModel = Pick<
  ModelPortfolio,
  'drift_percentage' | 'cash_lower_limit' | 'cash_upper_limit'
> | null

export interface PositionBand {
  symbol: string
  name: string | null
  numericId: number | null
  target: number
  lower: number | null
  upper: number | null
}

/**
 * Rounding steps for a drift band, coarsest first. Bands are rounded so they
 * land on tradeable numbers rather than on figures like 1.6%–2.4%.
 */
const BAND_STEPS = [0.5, 0.25, 0.1, 0.05]

/** Kill float dust from `n * step` (7 * 0.1 = 0.7000000000000001). */
function clean(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Round a drift band to the COARSEST step that still leaves a band.
 *
 * Rounding to a flat 0.5 swallows the band whole once the target is small
 * enough: ±20% of a 1.0% target is 0.8–1.2, and both edges round to 1.0, so the
 * band is zero-width and any deviation at all — 0.99% — reads as a breach. That
 * bit the 50/50 blended portfolio, whose half-scale targets cluster at 0.75–1.5
 * where the rounding step is wider than the drift itself.
 *
 * Stepping down only when 0.5 collapses means no existing non-degenerate band
 * moves: every band that was already valid still rounds to exactly what it did
 * before, and only the broken ones change.
 */
export function roundBand(lower: number, upper: number): { lower: number; upper: number } {
  for (const step of BAND_STEPS) {
    const lo = clean(Math.round(lower / step) * step)
    const hi = clean(Math.round(upper / step) * step)
    if (lo < hi) return { lower: lo, upper: hi }
  }
  // A zero-width input (a 0% target) has no band to preserve — return it as is.
  return { lower: clean(lower), upper: clean(upper) }
}

/**
 * The drift band around a target, or null when the model sets no drift.
 * Both edges are rounded TOGETHER; rounding them independently is what let a
 * band collapse.
 */
export function driftBandFor(
  target: number,
  driftPct: number | null | undefined,
): { lower: number; upper: number } | null {
  if (driftPct == null) return null
  return roundBand(target * (1 - driftPct / 100), target * (1 + driftPct / 100))
}

/**
 * A cash bucket — `$Cash`, `CASH`, `$:CASH`, and money-market sweep tickers like
 * `FDXCASH` all collapse to one bucket. (Cash uses the model's cash limits, not a
 * drift band.) Match the same predicate wherever cash is special-cased.
 */
export function isCashTicker(ticker: string): boolean {
  return ticker.trim().toUpperCase().includes('CASH')
}

function isCashPosition(p: PortfolioPosition): boolean {
  return isCashTicker(p.securityId) || isCashTicker(p.ticker)
}

export function computePositionBands(
  positions: PortfolioPosition[],
  modelPortfolio: BandModel,
): PositionBand[] {
  const driftPct = modelPortfolio?.drift_percentage ?? null
  return positions.map((p) => {
    const target = p.weight
    const cash = isCashPosition(p)
    const drift = driftBandFor(target, driftPct)
    let lower = p.lowerLimit
    let upper = p.upperLimit
    if (lower == null) {
      if (cash && modelPortfolio?.cash_lower_limit != null) lower = modelPortfolio.cash_lower_limit
      else if (drift) lower = drift.lower
    }
    if (upper == null) {
      if (cash && modelPortfolio?.cash_upper_limit != null) upper = modelPortfolio.cash_upper_limit
      else if (drift) upper = drift.upper
    }
    return { symbol: p.ticker, name: p.name, numericId: p.numericId, target, lower, upper }
  })
}
