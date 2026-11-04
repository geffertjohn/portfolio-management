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

describe('monthly is untouched', () => {
  it('steps a month and does not re-anchor anything', () => {
    // Equity-only, and not part of the quarterly/annual cycle.
    const r = advanceSchedule('monthly', d('2026-12-04'), d('2027-11-04'))
    expect(day(r.nextReviewAt)).toBe('2027-01-04')
    expect(r.quarterlyAt).toBeUndefined()
  })
})
