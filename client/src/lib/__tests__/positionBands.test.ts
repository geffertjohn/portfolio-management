import { describe, expect, it } from 'vitest'
import { computePositionBands, driftBandFor, isCashTicker, roundBand } from '../positionBands'
import type { PortfolioPosition } from '@/types/position'

/**
 * The band formula is a governed number — `equity_lower_limit` is rendered on
 * the Model Portfolios settings list — and it has broken twice (audit §3, §25).
 * These lock the rule, not the implementation.
 */

function pos(over: Partial<PortfolioPosition> & { ticker: string; weight: number }): PortfolioPosition {
  return {
    securityId: over.ticker, name: null, numericId: null,
    lowerLimit: null, upperLimit: null,
    ...over,
  } as PortfolioPosition
}

describe('roundBand', () => {
  it('rounds a comfortable band to the coarsest half-point step', () => {
    expect(roundBand(4.5, 5.5)).toEqual({ lower: 4.5, upper: 5.5 })
    expect(roundBand(5.6, 8.4)).toEqual({ lower: 5.5, upper: 8.5 })
  })

  // The defect itself: ±20% of a 1.0% target is 0.8–1.2, and a flat 0.5 step
  // rounds BOTH edges to 1.0 — a zero-width band where 0.99% reads as a breach.
  it('steps down rather than collapsing a band to zero width', () => {
    const band = roundBand(0.8, 1.2)
    expect(band.lower).toBeLessThan(band.upper)
    expect(band).toEqual({ lower: 0.75, upper: 1.25 })
  })

  it('keeps the half-scale targets of a blended book apart', () => {
    // The 50/50 blend clusters targets at 0.75–1.5, where a 0.5 step is wider
    // than the drift. Every one of these must still leave a usable band.
    for (const target of [0.75, 1.0, 1.25, 1.5]) {
      const band = roundBand(target * 0.8, target * 1.2)
      expect(band.lower, `lower < upper at target ${target}`).toBeLessThan(band.upper)
    }
  })

  it('returns a zero-width input unchanged — a 0% target has no band to save', () => {
    expect(roundBand(0, 0)).toEqual({ lower: 0, upper: 0 })
  })

  it('carries no float dust into a rendered figure', () => {
    for (const [lo, hi] of [[0.8, 1.2], [5.6, 8.4], [2.4, 3.6]]) {
      const band = roundBand(lo, hi)
      expect(String(band.lower)).not.toMatch(/\d{6,}/)
      expect(String(band.upper)).not.toMatch(/\d{6,}/)
    }
  })
})

describe('driftBandFor', () => {
  it('is null when the model sets no drift — absent is not zero', () => {
    expect(driftBandFor(5, null)).toBeNull()
    expect(driftBandFor(5, undefined)).toBeNull()
  })

  it('rounds both edges together, never independently', () => {
    // Rounding each edge on its own is what let a band collapse; the pair must
    // agree on one step, so the result is always the same as roundBand's.
    expect(driftBandFor(1, 20)).toEqual(roundBand(0.8, 1.2))
  })

  it('treats a zero drift as a real setting, not a missing one', () => {
    expect(driftBandFor(5, 0)).toEqual({ lower: 5, upper: 5 })
  })
})

describe('isCashTicker', () => {
  it('collapses every spelling of cash into one bucket', () => {
    for (const t of ['$Cash', 'CASH', '$:CASH', ' cash ', 'FDXCASH']) {
      expect(isCashTicker(t), t).toBe(true)
    }
  })

  it('does not swallow an ordinary ticker', () => {
    for (const t of ['AAPL', 'VMSAX', 'BRK.B']) {
      expect(isCashTicker(t), t).toBe(false)
    }
  })
})

describe('computePositionBands', () => {
  const model = { drift_percentage: 20, cash_lower_limit: 1, cash_upper_limit: 8 }

  it('lets an explicit per-position limit win over the derived band', () => {
    const [band] = computePositionBands(
      [pos({ ticker: 'AAPL', weight: 5, lowerLimit: 3, upperLimit: 9 })],
      model,
    )
    expect(band).toMatchObject({ target: 5, lower: 3, upper: 9 })
  })

  it('derives from drift when no explicit limit is set', () => {
    const [band] = computePositionBands([pos({ ticker: 'AAPL', weight: 5 })], model)
    expect(band).toMatchObject({ lower: 4, upper: 6 })
  })

  it('mixes an explicit edge with a derived one', () => {
    const [band] = computePositionBands(
      [pos({ ticker: 'AAPL', weight: 5, lowerLimit: 2 })],
      model,
    )
    expect(band).toMatchObject({ lower: 2, upper: 6 })
  })

  it('gives cash the model cash limits, not a drift band', () => {
    const [band] = computePositionBands([pos({ ticker: '$Cash', weight: 3 })], model)
    expect(band).toMatchObject({ lower: 1, upper: 8 })
  })

  it('leaves both edges null when there is no model at all', () => {
    const [band] = computePositionBands([pos({ ticker: 'AAPL', weight: 5 })], null)
    expect(band).toMatchObject({ target: 5, lower: null, upper: null })
  })
})
