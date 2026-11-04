import { describe, it, expect } from 'vitest'
import { advanceSchedule } from '../portfolioReviews'

/**
 * Three quarterly reviews and one annual per year, never two on the same day.
 *
 * Before Nov 2026 the two timers advanced independently — quarterly +3 months,
 * annual +12, each ignorant of the other — which gives FOUR quarterlies and an
 * annual every year and a guaranteed collision when the fourth quarterly lands
 * on the annual's own date. Foundation Conservative was sitting on exactly
 * that collision, both due 30 Sept 2026.
 */

const d = (iso: string) => new Date(`${iso}T12:00:00Z`)
const day = (x: Date) => x.toISOString().slice(0, 10)

describe('a full year from one annual', () => {
  it('runs three quarterlies, then the annual takes the fourth slot', () => {
    // Annual completed 4 Nov 2027.
    const annual = advanceSchedule('annual', d('2027-11-04'), d('2027-11-04'))
    expect(day(annual.nextReviewAt)).toBe('2028-11-04')
    expect(day(annual.quarterlyAt!)).toBe('2028-02-04')

    const nextAnnualDue = annual.nextReviewAt

    // Q1 completed on its due date -> Q2.
    const q1 = advanceSchedule('quarterly', d('2028-02-04'), nextAnnualDue)
    expect(day(q1.nextReviewAt)).toBe('2028-05-04')

    // Q2 -> Q3.
    const q2 = advanceSchedule('quarterly', d('2028-05-04'), nextAnnualDue)
    expect(day(q2.nextReviewAt)).toBe('2028-08-04')

    // Q3 would step onto the annual's own date — the annual covers that slot,
    // so the quarterly jumps past it. THREE quarterlies, then the annual.
    const q3 = advanceSchedule('quarterly', d('2028-08-04'), nextAnnualDue)
    expect(day(q3.nextReviewAt)).toBe('2029-02-04')
    expect(day(q3.nextReviewAt)).not.toBe(day(nextAnnualDue))
  })

  it('never schedules a quarterly on the annual date, over several years', () => {
    let annualDue = d('2027-11-04')
    let quarterlyDue = d('2027-02-04')
    const collisions: string[] = []

    for (let i = 0; i < 12; i++) {
      // Whichever is due first gets completed on its due date.
      if (day(quarterlyDue) === day(annualDue)) collisions.push(day(annualDue))
      if (quarterlyDue <= annualDue) {
        quarterlyDue = advanceSchedule('quarterly', quarterlyDue, annualDue).nextReviewAt
      } else {
        const r = advanceSchedule('annual', annualDue, annualDue)
        annualDue = r.nextReviewAt
        quarterlyDue = r.quarterlyAt!
      }
    }
    expect(collisions).toEqual([])
  })
})

describe('the quarterly step', () => {
  it('steps three months when the annual is far off', () => {
    expect(day(advanceSchedule('quarterly', d('2027-02-04'), d('2027-11-04')).nextReviewAt))
      .toBe('2027-05-04')
  })

  it('jumps past the annual when the step would land ON it', () => {
    expect(day(advanceSchedule('quarterly', d('2027-08-04'), d('2027-11-04')).nextReviewAt))
      .toBe('2028-02-04')
  })

  it('jumps past the annual when the step would land BEYOND it', () => {
    // Can happen after a late completion; the annual still owns its slot.
    expect(day(advanceSchedule('quarterly', d('2027-10-01'), d('2027-11-04')).nextReviewAt))
      .toBe('2028-02-04')
  })

  it('just steps when the portfolio has no annual row', () => {
    expect(day(advanceSchedule('quarterly', d('2027-02-04'), null).nextReviewAt))
      .toBe('2027-05-04')
  })
})

describe('completing the annual re-anchors the quarterly', () => {
  it('sets the next annual a year out and the quarterly a quarter out', () => {
    const r = advanceSchedule('annual', d('2026-09-30'), d('2026-09-30'))
    expect(day(r.nextReviewAt)).toBe('2027-09-30')
    expect(day(r.quarterlyAt!)).toBe('2026-12-30')
    // This is the repair for Foundation Conservative's live collision: doing
    // the annual moves the quarterly off the shared date rather than leaving
    // two reviews due the same day.
    expect(day(r.quarterlyAt!)).not.toBe(day(r.nextReviewAt))
  })
})

describe('a quarterly completed while the annual is OVERDUE', () => {
  /**
   * The annual only replaces a quarterly slot it can still occupy. An overdue
   * annual has already missed its slot, and pinning the quarterly to
   * `annual + 3 months` then produces a date on or before the completion.
   *
   * Foundation Conservative was live in exactly this state after the collision
   * repair: annual overdue 30 Sept 2026, quarterly due 30 Dec 2026.
   */
  const overdueAnnual = d('2026-09-30')

  it('advances instead of returning the day it was completed', () => {
    // The live case. This returned '2026-12-30' — the completion date itself,
    // so the review stayed due the instant it was signed off.
    const r = advanceSchedule('quarterly', d('2026-12-30'), overdueAnnual)
    expect(day(r.nextReviewAt)).toBe('2027-03-30')
    expect(r.nextReviewAt.getTime()).toBeGreaterThan(d('2026-12-30').getTime())
  })

  it('never returns a date in the past, however stale the annual', () => {
    // An annual overdue by more than a year returned '2025-12-30' — eleven
    // months BEFORE the completion, so the next quarterly was born overdue.
    const r = advanceSchedule('quarterly', d('2026-11-04'), d('2025-09-30'))
    expect(day(r.nextReviewAt)).toBe('2027-02-04')
    expect(r.nextReviewAt.getTime()).toBeGreaterThan(d('2026-11-04').getTime())
  })

  it('always lands strictly after the completion, over many stale annuals', () => {
    // The property, not the arithmetic: no annual due date, at any staleness,
    // may produce a next quarterly that is not in the future.
    const completed = d('2026-11-04')
    for (let monthsStale = 0; monthsStale <= 36; monthsStale++) {
      const annual = new Date(completed)
      annual.setMonth(annual.getMonth() - monthsStale)
      const r = advanceSchedule('quarterly', completed, annual)
      expect(
        r.nextReviewAt.getTime(),
        `annual ${monthsStale}mo stale gave ${day(r.nextReviewAt)}`,
      ).toBeGreaterThan(completed.getTime())
    }
  })

  it('still yields to an annual that is genuinely ahead', () => {
    // The fix must not disarm the rule it guards.
    expect(day(advanceSchedule('quarterly', d('2027-08-04'), d('2027-11-04')).nextReviewAt))
      .toBe('2028-02-04')
  })
})

describe('monthly is untouched', () => {
  it('steps a month and does not re-anchor anything', () => {
    // Equity-only, and not part of the quarterly/annual cycle.
    const r = advanceSchedule('monthly', d('2026-12-04'), d('2027-11-04'))
    expect(day(r.nextReviewAt)).toBe('2027-01-04')
    expect(r.quarterlyAt).toBeUndefined()
  })
})
