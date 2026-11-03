import { describe, expect, it } from 'vitest'
import {
  DERIVED_BLEND_PORTFOLIOS, comparePositionsToSnapshot, driftCount, isCurrentTargetDate,
} from '../positionsDrift'
import { isStorablePositionWeight } from '../portfolioAllocations'

/**
 * `positions` and the newest allocation snapshot are meant to be the same
 * statement twice. This is what notices when they are not — and the reason it
 * only REPORTS is in the module docstring: two live portfolios already diverge,
 * and an automatic re-point would delete rows from both.
 */

const pos = (rows: Record<string, number | null>) =>
  Object.entries(rows).map(([security_id, allocation_pct]) => ({ security_id, allocation_pct }))

const snap = (effectiveDate: string, weights: Record<string, number>) =>
  ({ effectiveDate, weights: new Map(Object.entries(weights)) })

describe('comparePositionsToSnapshot', () => {
  it('finds nothing when the two agree', () => {
    const d = comparePositionsToSnapshot(
      pos({ AAPL: 6, MSFT: 4 }),
      snap('2026-11-02', { AAPL: 6, MSFT: 4 }),
    )!
    expect(driftCount(d)).toBe(0)
    expect(d.effectiveDate).toBe('2026-11-02')
  })

  it('separates the three ways they can differ', () => {
    const d = comparePositionsToSnapshot(
      pos({ AAPL: 6, MSFT: 4, OLD: 2 }),
      snap('2026-11-02', { AAPL: 6.5, MSFT: 4, NEW: 1 }),
    )!
    expect(d).toMatchObject({ extra: ['OLD'], missing: ['NEW'], reweighted: ['AAPL'] })
    expect(driftCount(d)).toBe(3)
  })

  it('reads a zero weight as not held, the way the importer does', () => {
    // The importer skips zero rows rather than writing a position nobody holds,
    // so a zero in the snapshot must not read as a holding that is missing.
    const d = comparePositionsToSnapshot(
      pos({ AAPL: 6 }),
      snap('2026-11-02', { AAPL: 6, SOLD: 0 }),
    )!
    expect(driftCount(d)).toBe(0)
  })

  it('does not call float dust a reweight', () => {
    const d = comparePositionsToSnapshot(
      pos({ AAPL: 4 }),
      snap('2026-11-02', { AAPL: 4.000000000000001 }),
    )!
    expect(d.reweighted).toEqual([])
  })

  it('still reports a small but real reweight', () => {
    const d = comparePositionsToSnapshot(pos({ AAPL: 4 }), snap('2026-11-02', { AAPL: 4.01 }))!
    expect(d.reweighted).toEqual(['AAPL'])
  })

  it('treats a null weight as zero rather than throwing', () => {
    const d = comparePositionsToSnapshot(pos({ AAPL: null }), snap('2026-11-02', { AAPL: 6 }))!
    expect(d.reweighted).toEqual(['AAPL'])
  })

  it('reports nothing to compare when there is no snapshot', () => {
    expect(comparePositionsToSnapshot(pos({ AAPL: 6 }), null)).toBeNull()
    expect(comparePositionsToSnapshot(pos({ AAPL: 6 }), snap('2026-11-02', {}))).toBeNull()
    // An all-zero column is an empty snapshot, not a book that holds nothing.
    expect(comparePositionsToSnapshot(pos({ AAPL: 6 }), snap('2026-11-02', { AAPL: 0 }))).toBeNull()
  })

  it('reports every position as extra when the book holds what the snapshot does not', () => {
    const d = comparePositionsToSnapshot(
      pos({ AAPL: 6, MSFT: 4 }),
      snap('2026-11-02', { NVDA: 10 }),
    )!
    expect(d).toMatchObject({ extra: ['AAPL', 'MSFT'], missing: ['NVDA'], reweighted: [] })
  })

  it('sorts each list, so the banner reads the same every render', () => {
    const d = comparePositionsToSnapshot(
      pos({ ZZZ: 1, AAA: 1 }),
      snap('2026-11-02', { MMM: 1, BBB: 1 }),
    )!
    expect(d.extra).toEqual(['AAA', 'ZZZ'])
    expect(d.missing).toEqual(['BBB', 'MMM'])
  })
})

describe('derived blends are exempt', () => {
  /**
   * Equity Income & Core Growth is a computed 50/50 of its two parents, so its
   * positions are not derived from its own history and the two disagreeing is
   * expected. On the live book a re-point would delete 25 of its 80 rows.
   */
  it('names the blend whose positions are computed', () => {
    expect(DERIVED_BLEND_PORTFOLIOS.has('Equity Income & Core Growth')).toBe(true)
    expect(DERIVED_BLEND_PORTFOLIOS.has('Core Growth')).toBe(false)
    expect(DERIVED_BLEND_PORTFOLIOS.has('Equity Income')).toBe(false)
  })
})

describe('isCurrentTargetDate', () => {
  const dates = ['2026-03-10', '2026-09-24', '2026-11-02']

  it('is true for the newest column only', () => {
    expect(isCurrentTargetDate('2026-11-02', dates)).toBe(true)
    expect(isCurrentTargetDate('2026-09-24', dates)).toBe(false)
    expect(isCurrentTargetDate('2026-03-10', dates)).toBe(false)
  })

  it('finds the newest by value, not by position in the array', () => {
    // The answer decides whether a live book is written, so it does not rest on
    // the caller having sorted first.
    const unsorted = ['2026-11-02', '2026-03-10', '2026-09-24']
    expect(isCurrentTargetDate('2026-11-02', unsorted)).toBe(true)
    expect(isCurrentTargetDate('2026-03-10', unsorted)).toBe(false)
  })

  it('is false for a date that is not a column at all', () => {
    expect(isCurrentTargetDate('2027-01-01', dates)).toBe(false)
  })

  it('is false when there are no columns', () => {
    expect(isCurrentTargetDate('2026-11-02', [])).toBe(false)
  })

  it('handles a single column', () => {
    expect(isCurrentTargetDate('2026-11-02', ['2026-11-02'])).toBe(true)
  })
})

describe('isStorablePositionWeight', () => {
  /**
   * The two tables disagree about what is writable: `positions.allocation_pct`
   * carries CHECK (0..100) and `portfolio_allocations.weight` carries no check
   * at all. Without this guard a grid edit of 150 lands in history and then
   * throws on the position — History and Positions saying different things,
   * which is the divergence this whole path exists to close.
   */
  it('accepts the range positions can actually store', () => {
    for (const w of [0, 0.01, 4.5, 99.99, 100]) {
      expect(isStorablePositionWeight(w), String(w)).toBe(true)
    }
  })

  it('refuses what the CHECK constraint would reject', () => {
    for (const w of [-0.01, -5, 100.01, 150]) {
      expect(isStorablePositionWeight(w), String(w)).toBe(false)
    }
  })

  it('refuses a non-number rather than letting it reach the database', () => {
    for (const w of [NaN, Infinity, -Infinity]) {
      expect(isStorablePositionWeight(w), String(w)).toBe(false)
    }
  })
})
