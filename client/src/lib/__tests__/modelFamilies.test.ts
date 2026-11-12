import { describe, it, expect } from 'vitest'
import {
  modelFamily,
  groupModelsByFamily,
  MODEL_FAMILIES,
  type ModelFamily,
} from '../modelPortfolios'
import type { ModelPortfolio } from '../modelPortfolios'

/**
 * The fourteen models in the live book on 12 Nov 2026 — a SNAPSHOT, not a
 * mirror. The point is that every real name lands in exactly one column, which
 * is the claim the page makes and the one a reader cannot check by eye.
 */
const LIVE: { id: number; name: string; benchmark: string | null; family: ModelFamily }[] = [
  { id: 1,   name: 'Income with Capital Preservation', benchmark: 'Conservative Benchmark (ETF)',          family: 'fund' },
  { id: 2,   name: 'Income with Moderate Growth',      benchmark: 'Conservative Balanced Benchmark (ETF)', family: 'fund' },
  { id: 3,   name: 'Growth with Income',               benchmark: 'Balanced Benchmark (ETF)',              family: 'fund' },
  { id: 4,   name: 'Growth',                           benchmark: 'Balanced w/ Growth Benchmark (ETF)',    family: 'fund' },
  { id: 5,   name: 'Aggressive',                       benchmark: 'Growth Benchmark (ETF)',                family: 'fund' },
  { id: 10,  name: 'Core Growth',                      benchmark: 'Russell 1000',                          family: 'strategy' },
  { id: 11,  name: 'Equity Income',                    benchmark: 'S&P 500',                               family: 'strategy' },
  { id: 12,  name: 'Fixed Income Total Return',        benchmark: 'Bloomberg US Aggregate',                family: 'strategy' },
  { id: 13,  name: 'Equity Income & Core Growth',      benchmark: 'S&P 500',                               family: 'strategy' },
  { id: 14,  name: 'Foundation Conservative Balanced', benchmark: 'Conservative Balanced Benchmark (ETF)', family: 'foundation' },
  { id: 90,  name: 'Foundation Balanced with Growth',  benchmark: 'Balanced w/ Growth Benchmark (ETF)',    family: 'foundation' },
  { id: 166, name: 'Foundation Conservative',          benchmark: 'Conservative Benchmark (ETF)',          family: 'foundation' },
  { id: 242, name: 'Foundation Growth',                benchmark: 'Growth Benchmark (ETF)',                family: 'foundation' },
  { id: 318, name: 'Foundation Balanced',              benchmark: 'Balanced Benchmark (ETF)',              family: 'foundation' },
]

const model = (r: { id: number; name: string; benchmark: string | null }) =>
  ({ id: r.id, name: r.name, benchmark: r.benchmark } as unknown as ModelPortfolio)

describe('modelFamily', () => {
  it.each(LIVE)('files $name under $family', ({ name, family }) => {
    expect(modelFamily(name)).toBe(family)
  })

  // The Strategy set is derived from EQUITY_MODEL_NAMES, so the three equity
  // books cannot drift out of it without that constant changing too.
  it('keeps the three equity books with Fixed Income Total Return', () => {
    for (const n of ['Core Growth', 'Equity Income', 'Equity Income & Core Growth', 'Fixed Income Total Return']) {
      expect(modelFamily(n)).toBe('strategy')
    }
  })

  // Matched on the family PREFIX, so a sixth Foundation book lands correctly
  // without an edit — the same reasoning as hasConvictionTiers.
  it('files an unseen Foundation book by prefix', () => {
    expect(modelFamily('Foundation Ultra Conservative')).toBe('foundation')
  })

  // `fund` is the fallback, so a genuinely new shared tier needs no edit either.
  it('falls back to fund for an unknown name', () => {
    expect(modelFamily('Something New')).toBe('fund')
    expect(modelFamily(null)).toBe('fund')
  })

  // 'Foundation' with no trailing space is NOT the family prefix — guards the
  // same off-by-one hasConvictionTiers guards.
  it('does not match a name that merely starts with the word', () => {
    expect(modelFamily('Foundational Income')).toBe('fund')
  })
})

describe('groupModelsByFamily', () => {
  const grouped = groupModelsByFamily(LIVE.map(model))

  it('renders every family, in order, even when empty', () => {
    expect(grouped.map((g) => g.key)).toEqual(MODEL_FAMILIES.map((f) => f.key))
    expect(groupModelsByFamily([]).map((g) => g.models.length)).toEqual([0, 0, 0])
  })

  // A model silently dropped from every column is the failure this page could
  // have and a reader could not see.
  it('places all fourteen models exactly once', () => {
    const placed = grouped.flatMap((g) => g.models.map((m) => m.id))
    expect(placed.sort((a, b) => a - b)).toEqual(LIVE.map((r) => r.id).sort((a, b) => a - b))
    expect(new Set(placed).size).toBe(LIVE.length)
  })

  it('orders the two laddered families conservative → growth', () => {
    const names = (k: ModelFamily) => grouped.find((g) => g.key === k)!.models.map((m) => m.name)
    expect(names('fund')).toEqual([
      'Income with Capital Preservation', 'Income with Moderate Growth',
      'Growth with Income', 'Growth', 'Aggressive',
    ])
    expect(names('foundation')).toEqual([
      'Foundation Conservative', 'Foundation Conservative Balanced',
      'Foundation Balanced', 'Foundation Balanced with Growth', 'Foundation Growth',
    ])
  })

  // No Strategy benchmark is on the ladder, so they fall through to name order.
  it('orders the Strategy column by name', () => {
    expect(grouped.find((g) => g.key === 'strategy')!.models.map((m) => m.name)).toEqual([
      'Core Growth', 'Equity Income', 'Equity Income & Core Growth', 'Fixed Income Total Return',
    ])
  })
})
