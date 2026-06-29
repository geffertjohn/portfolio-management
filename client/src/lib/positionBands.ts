/**
 * positionBands.ts
 *
 * Effective lower/target/upper allocation bands for a portfolio's positions —
 * the same values shown on the Allocation tab. Explicit per-position limits win;
 * otherwise the band is derived from the model portfolio's drift percentage
 * (cash uses the model's cash limits). Keep this in sync with the inline
 * driftLower/driftUpper logic in PortfolioDetailPage.
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

function roundToHalf(v: number): number {
  return Math.round(v / 0.5) * 0.5
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
    const target = p.targetWeight ?? p.weight
    const cash = isCashPosition(p)
    let lower = p.lowerLimit
    let upper = p.upperLimit
    if (lower == null) {
      if (cash && modelPortfolio?.cash_lower_limit != null) lower = modelPortfolio.cash_lower_limit
      else if (driftPct != null) lower = roundToHalf(target * (1 - driftPct / 100))
    }
    if (upper == null) {
      if (cash && modelPortfolio?.cash_upper_limit != null) upper = modelPortfolio.cash_upper_limit
      else if (driftPct != null) upper = roundToHalf(target * (1 + driftPct / 100))
    }
    return { symbol: p.ticker, name: p.name, numericId: p.numericId, target, lower, upper }
  })
}
