import { describe, expect, it } from 'vitest'
import { gapToBuy, parsePriceTargets, scenarioFor, weightedValue } from '../priceTargets'

/**
 * These rows are written by an agent, so the parser's job is to be tolerant
 * without inventing anything. The property that matters most is that a null
 * `buyBelow` survives as null: it means "this hold is not about price", and a
 * computed number in its place would misstate why a name is held.
 */

const full = {
  scenarios: [
    { case: 'bull', value: 300, probability: 0.25, premise: 'margin holds' },
    { case: 'bear', value: 150, probability: 0.25, premise: 'share loss' },
    { case: 'base', value: 220, probability: 0.5, premise: 'in line' },
  ],
  method: '18x FY27 EPS, 10% discount rate',
  buyBelow: 180,
  buyBelowBasis: '15% required return',
}

describe('parsePriceTargets', () => {
  it('orders the scenarios bear → base → bull however they were stored', () => {
    expect(parsePriceTargets(full)!.scenarios.map((s) => s.case))
      .toEqual(['bear', 'base', 'bull'])
  })

  it('drops a scenario missing its case or value instead of rendering a blank row', () => {
    const t = parsePriceTargets({
      scenarios: [
        { case: 'base', value: 220 },
        { case: 'bull' },                       // no value
        { value: 150 },                         // no case
        { case: 'sideways', value: 200 },       // not a case we know
      ],
    })!
    expect(t.scenarios.map((s) => s.case)).toEqual(['base'])
  })

  it('is null when nothing usable is left — callers test for the block itself', () => {
    for (const input of [null, undefined, 'x', 42, [], {}, { scenarios: [] }, { scenarios: [{}] }]) {
      expect(parsePriceTargets(input), JSON.stringify(input)).toBeNull()
    }
  })

  it('prefers a stored weighted value over recomputing one', () => {
    expect(parsePriceTargets({ ...full, weighted: 999 })!.weighted).toBe(999)
  })

  it('computes the weighted value when the row stored none', () => {
    expect(parsePriceTargets(full)!.weighted).toBeCloseTo(222.5, 6)
  })

  it('reads a missing premise or method as empty, never as undefined', () => {
    const t = parsePriceTargets({ scenarios: [{ case: 'base', value: 220 }] })!
    expect(t.scenarios[0].premise).toBe('')
    expect(t.method).toBe('')
    expect(t.buyBelowBasis).toBe('')
  })
})

describe('priceLimited — whether price is the reason for the rating', () => {
  it('defaults to true only when a buy-below price is actually given', () => {
    expect(parsePriceTargets(full)!.priceLimited).toBe(true)
  })

  it('defaults to FALSE when the row says nothing about price', () => {
    // Silence must not be read as "price is the blocker".
    const t = parsePriceTargets({ scenarios: [{ case: 'base', value: 240 }] })!
    expect(t.priceLimited).toBe(false)
    expect(t.buyBelow).toBeNull()
  })

  it('lets an explicit false stand even with a price present', () => {
    // The MRVL case: a hold at $200 against a $240 fair value, because an
    // unresolved acquisition changed what was being bought.
    const t = parsePriceTargets({ ...full, priceLimited: false })!
    expect(t.priceLimited).toBe(false)
  })
})

describe('gapToBuy', () => {
  const t = parsePriceTargets(full)!

  it('measures how far the price still has to fall', () => {
    expect(gapToBuy(t, 200)).toBeCloseTo(-0.1, 6)
    expect(gapToBuy(t, 150)).toBeCloseTo(0.2, 6)
  })

  it('is null when the rating is not price-limited — never "0% away"', () => {
    const noPrice = parsePriceTargets({ scenarios: [{ case: 'base', value: 240 }] })!
    expect(gapToBuy(noPrice, 200)).toBeNull()
  })

  it('is null for a price that cannot be divided by', () => {
    for (const price of [null, undefined, 0, -5, NaN]) {
      expect(gapToBuy(t, price), String(price)).toBeNull()
    }
  })
})

describe('weightedValue', () => {
  const s = (c: 'bear' | 'base' | 'bull', value: number, probability: number | null) =>
    ({ case: c, value, probability, premise: '' })

  it('weights a complete set that sums to one', () => {
    expect(weightedValue([s('bear', 100, 0.2), s('base', 200, 0.5), s('bull', 300, 0.3)]))
      .toBeCloseTo(210, 6)
  })

  it('refuses a partial set rather than under-weighting the silent cases', () => {
    expect(weightedValue([s('bear', 100, 0.2), s('base', 200, null)])).toBeNull()
  })

  it('refuses probabilities that do not sum to one', () => {
    expect(weightedValue([s('bear', 100, 0.2), s('base', 200, 0.3)])).toBeNull()
  })

  it('tolerates rounding in a stated distribution', () => {
    // 0.33/0.33/0.34 is how a human writes thirds.
    expect(weightedValue([s('bear', 100, 0.33), s('base', 200, 0.33), s('bull', 300, 0.34)]))
      .not.toBeNull()
  })

  it('is null for no scenarios at all', () => {
    expect(weightedValue([])).toBeNull()
  })
})

describe('scenarioFor', () => {
  it('finds a case that is present and reports one that is not', () => {
    const t = parsePriceTargets({ scenarios: [{ case: 'base', value: 220 }] })!
    expect(scenarioFor(t, 'base')!.value).toBe(220)
    expect(scenarioFor(t, 'bull')).toBeNull()
  })
})
