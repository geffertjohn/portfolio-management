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
  // MSI's real situation: schedule dated Oct 30 from a superseded estimate while
  // the stored next-earnings date read Nov 4. TODAY sits before both, so the
  // correction is a plain forward re-date of a row not yet due.
  const TODAY = '2026-10-28'
  const row = (over: Partial<Parameters<typeof redatedStockSchedules>[0][0]> = {}) => ({
    security_id: 'MSI',
    next_review_at: '2026-10-30T00:00:00Z',
    last_earnings_release: '2026-08-05',
    next_earnings_release: '2026-11-04',
    ...over,
  })

  it('moves a schedule that disagrees with its earnings date to that date plus one', () => {
    expect(redatedStockSchedules([row()], TODAY)).toEqual([
      { securityId: 'MSI', from: '2026-10-30', nextReviewAt: '2026-11-05T00:00:00Z' },
    ])
  })

  it('returns nothing when the schedule already agrees', () => {
    expect(redatedStockSchedules([row({ next_review_at: '2026-11-05T00:00:00Z' })], TODAY)).toEqual([])
  })

  it('agrees across the two storage conventions', () => {
    // Local midnight EST for the same calendar day must not look like a mismatch.
    expect(redatedStockSchedules([row({ next_review_at: '2026-11-05T04:00:00Z' })], TODAY)).toEqual([])
  })

  it('leaves an outstanding review for a call that already happened', () => {
    // Due on/before last earnings + 1: the advisor still owes that review, and
    // pushing it to the next call would erase the obligation.
    expect(redatedStockSchedules([row({ next_review_at: '2026-08-06T00:00:00Z' })], TODAY)).toEqual([])
  })

  it('skips a row with no earnings date to derive from', () => {
    expect(redatedStockSchedules([row({ next_earnings_release: null })], TODAY)).toEqual([])
  })

  it('crosses a month and a year boundary without slipping a day', () => {
    // Both dates ahead of TODAY, so only the arithmetic is under test.
    expect(redatedStockSchedules([row({
      next_earnings_release: '2026-12-31', next_review_at: '2026-06-01T00:00:00Z',
      last_earnings_release: '2026-05-01',
    })], '2026-05-15')[0].nextReviewAt).toBe('2027-01-01T00:00:00Z')
  })

  describe('a review that has already fallen due is never deferred', () => {
    /**
     * HOOD, live on 5 Nov 2026, and the reason this guard exists.
     *
     * Its stored `next_earnings_release` read 4 Nov, so the schedule was dated
     * 5 Nov — but the call had actually been held on 27 Oct and was never
     * reviewed (last reviewed 4 May). The FMP top-up corrected the dates to
     * `last = 27 Oct, next = 9 Feb`, and because 5 Nov falls AFTER 28 Oct the
     * outstanding-review guard above could not see it. The re-date then moved a
     * review due that very day out to 10 Feb 2027, cancelling the review of the
     * October call outright.
     *
     * A schedule dated off an estimate that never happened lands in exactly
     * that blind spot: between the real call and the next one.
     */
    const hood = {
      security_id: 'HOOD',
      next_review_at: '2026-11-05T00:00:00Z',
      last_earnings_release: '2026-10-27',
      next_earnings_release: '2027-02-09',
    }

    it('does not push a review due TODAY into the next quarter', () => {
      expect(redatedStockSchedules([hood], '2026-11-05')).toEqual([])
    })

    it('does not push an OVERDUE review into the next quarter', () => {
      expect(redatedStockSchedules([hood], '2026-11-20')).toEqual([])
    })

    it('still re-dates a row that is not yet due', () => {
      // The guard must not disarm the feature it sits inside.
      expect(redatedStockSchedules([hood], '2026-11-04')).toEqual([
        { securityId: 'HOOD', from: '2026-11-05', nextReviewAt: '2027-02-10T00:00:00Z' },
      ])
    })

    it('still corrects a due row when the target is also due', () => {
      // Nothing is being deferred here — both dates are in the past, so the
      // correction makes the row agree with the call it belongs to.
      expect(redatedStockSchedules(
        [{ ...hood, next_earnings_release: '2026-10-20' }],
        '2026-11-05',
      )).toEqual([
        { securityId: 'HOOD', from: '2026-11-05', nextReviewAt: '2026-10-21T00:00:00Z' },
      ])
    })
  })
})
