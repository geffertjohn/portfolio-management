import { describe, expect, it } from 'vitest'
import { deriveAllocationChanges, type AllocationSnapshotLike } from '../allocationChanges'

/**
 * The change log is DERIVED on read rather than stored, so that it cannot drift
 * from the allocation history it reports on — the stored `holdings_change_log`
 * had a reader and no writer and showed six legacy rows for one portfolio and
 * nothing for the rest.
 */

const snap = (effective_date: string, weights: Record<string, number>): AllocationSnapshotLike =>
  ({ effective_date, weights: new Map(Object.entries(weights)) })

describe('deriveAllocationChanges', () => {
  it('reports the earliest snapshot as additions, not as nothing', () => {
    // The opening position. A log starting at the second change reads as though
    // the book appeared from nowhere.
    const out = deriveAllocationChanges([snap('2026-01-01', { AAPL: 5, MSFT: 4 })])
    expect(out).toHaveLength(2)
    expect(out.every((c) => c.changeType === 'add')).toBe(true)
    expect(out.map((c) => [c.securityId, c.oldWeight, c.newWeight]))
      .toEqual([['AAPL', null, 5], ['MSFT', null, 4]])
  })

  it('classifies an add, a remove and a re-weight against the prior snapshot', () => {
    const out = deriveAllocationChanges([
      snap('2026-01-01', { AAPL: 5, MSFT: 4 }),
      snap('2026-04-01', { AAPL: 6, NVDA: 3 }),
    ]).filter((c) => c.effectiveDate === '2026-04-01')

    expect(out.map((c) => [c.securityId, c.changeType])).toEqual([
      ['NVDA', 'add'], ['MSFT', 'remove'], ['AAPL', 'weight_change'],
    ])
    expect(out.find((c) => c.securityId === 'MSFT')).toMatchObject({ oldWeight: 4, newWeight: null })
    expect(out.find((c) => c.securityId === 'AAPL')).toMatchObject({ oldWeight: 5, newWeight: 6 })
  })

  it('suppresses float dust rather than printing "4.0% → 4.0%"', () => {
    const out = deriveAllocationChanges([
      snap('2026-01-01', { AAPL: 4 }),
      snap('2026-04-01', { AAPL: 4.000000000000001 }),
    ]).filter((c) => c.effectiveDate === '2026-04-01')
    expect(out).toEqual([])
  })

  it('still reports a move that is small but real', () => {
    const out = deriveAllocationChanges([
      snap('2026-01-01', { AAPL: 4 }),
      snap('2026-04-01', { AAPL: 4.01 }),
    ]).filter((c) => c.effectiveDate === '2026-04-01')
    expect(out).toHaveLength(1)
  })

  it('orders newest date first, structural changes above re-weights', () => {
    // "We sold X" is the headline; "Y moved a point" is the detail.
    const out = deriveAllocationChanges([
      snap('2026-01-01', { AAPL: 5, MSFT: 4 }),
      snap('2026-04-01', { AAPL: 6, NVDA: 3 }),
    ])
    expect(out.map((c) => `${c.effectiveDate} ${c.changeType} ${c.securityId}`)).toEqual([
      '2026-04-01 add NVDA',
      '2026-04-01 remove MSFT',
      '2026-04-01 weight_change AAPL',
      '2026-01-01 add AAPL',
      '2026-01-01 add MSFT',
    ])
  })

  it('diffs in date order however the snapshots arrive', () => {
    const unordered = [
      snap('2026-04-01', { AAPL: 6 }),
      snap('2026-01-01', { AAPL: 5 }),
    ]
    const out = deriveAllocationChanges(unordered)
    expect(out.map((c) => [c.effectiveDate, c.changeType])).toEqual([
      ['2026-04-01', 'weight_change'], ['2026-01-01', 'add'],
    ])
  })

  it('keys each change by date and symbol so the list renders stably', () => {
    const out = deriveAllocationChanges([snap('2026-01-01', { AAPL: 5 })])
    expect(out[0].key).toBe('2026-01-01:AAPL')
    expect(new Set(out.map((c) => c.key)).size).toBe(out.length)
  })

  it('returns nothing for no snapshots', () => {
    expect(deriveAllocationChanges([])).toEqual([])
  })

  it('carries a cash bucket like any other holding', () => {
    const out = deriveAllocationChanges([
      snap('2026-01-01', { $Cash: 2 }),
      snap('2026-04-01', { $Cash: 5 }),
    ])
    expect(out[0]).toMatchObject({ securityId: '$Cash', changeType: 'weight_change', oldWeight: 2, newWeight: 5 })
  })
})
