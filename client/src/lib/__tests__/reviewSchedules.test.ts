import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDueSoon, isOverdue, redatedStockSchedules, reviewDueDay } from '../reviewSchedules'

/**
 * Every assertion here is about a DAY being read as a day. The column is a
 * calendar date stored as `timestamptz` by writers that disagree on the time of
 * day, which is how MSI showed "Oct 29" from a row holding Oct 30 (gotcha 24),
 * and how a date due tomorrow read overdue from 20:00 local tonight.
 *
 * The clock is pinned per test; the zone is pinned in vitest.config.ts — in UTC
 * the whole class of defect is invisible.
 */

describe('the test harness itself', () => {
  it('runs west of Greenwich, or these tests prove nothing', () => {
    // A UTC-midnight instant must render as the previous day here.
    expect(new Date('2027-02-11T00:00:00Z').getDate()).toBe(10)
  })
})

describe('reviewDueDay', () => {
  it('reads the UTC date part, whichever writer stored the row', () => {
    // Local midnight in EST, as the review modal writes it...
    expect(reviewDueDay('2027-01-28T05:00:00Z')).toBe('2027-01-28')
    // ...and UTC midnight, as everything else writes it.
    expect(reviewDueDay('2027-01-28T00:00:00Z')).toBe('2027-01-28')
  })

  it('leaves a bare calendar day alone', () => {
    expect(reviewDueDay('2027-01-28')).toBe('2027-01-28')
  })
})

describe('isOverdue / isDueSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Late evening local — the hour at which a UTC-midnight date for TOMORROW
    // used to read as already overdue.
    vi.setSystemTime(new Date('2026-11-03T20:00:00-05:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('does not call tomorrow overdue from this evening', () => {
    expect(isOverdue(reviewDueDay('2026-11-04T00:00:00Z'))).toBe(false)
  })

  it('treats a review due TODAY as due, not overdue', () => {
    expect(isOverdue('2026-11-03')).toBe(false)
    expect(isDueSoon('2026-11-03')).toBe(true)
  })

  it('calls yesterday overdue', () => {
    expect(isOverdue('2026-11-02')).toBe(true)
  })

  it('reads a real instant as an instant, not a day', () => {
    // A portfolio review schedule holds now()-with-microseconds from its seed
    // trigger; that genuinely is in the past.
    expect(isOverdue('2026-11-03T19:00:00-05:00')).toBe(true)
    expect(isOverdue('2026-11-03T21:00:00-05:00')).toBe(false)
  })

  it('bounds due-soon at both ends', () => {
    expect(isDueSoon('2026-11-17')).toBe(true)   // day 14
    expect(isDueSoon('2026-11-18')).toBe(false)  // day 15
    expect(isDueSoon('2026-11-02')).toBe(false)  // already overdue is not due soon
  })

  it('takes a caller-supplied window', () => {
    expect(isDueSoon('2026-11-10', 7)).toBe(true)
    expect(isDueSoon('2026-11-11', 7)).toBe(false)
  })
})

describe('redatedStockSchedules', () => {
  const row = (over: Partial<Parameters<typeof redatedStockSchedules>[0][0]> = {}) => ({
    security_id: 'MSI',
    next_review_at: '2026-10-30T00:00:00Z',
    last_earnings_release: '2026-08-05',
    next_earnings_release: '2026-11-04',
    ...over,
  })

  it('moves a schedule that disagrees with its earnings date to that date plus one', () => {
    expect(redatedStockSchedules([row()])).toEqual([
      { securityId: 'MSI', from: '2026-10-30', nextReviewAt: '2026-11-05T00:00:00Z' },
    ])
  })

  it('returns nothing when the schedule already agrees', () => {
    expect(redatedStockSchedules([row({ next_review_at: '2026-11-05T00:00:00Z' })])).toEqual([])
  })

  it('agrees across the two storage conventions', () => {
    // Local midnight EST for the same calendar day must not look like a mismatch.
    expect(redatedStockSchedules([row({ next_review_at: '2026-11-05T04:00:00Z' })])).toEqual([])
  })

  it('leaves an outstanding review for a call that already happened', () => {
    // Due on/before last earnings + 1: the advisor still owes that review, and
    // pushing it to the next call would erase the obligation.
    expect(redatedStockSchedules([row({ next_review_at: '2026-08-06T00:00:00Z' })])).toEqual([])
  })

  it('skips a row with no earnings date to derive from', () => {
    expect(redatedStockSchedules([row({ next_earnings_release: null })])).toEqual([])
  })

  it('crosses a month and a year boundary without slipping a day', () => {
    expect(redatedStockSchedules([row({
      next_earnings_release: '2026-12-31', next_review_at: '2026-06-01T00:00:00Z',
      last_earnings_release: '2026-05-01',
    })])[0].nextReviewAt).toBe('2027-01-01T00:00:00Z')
  })
})
