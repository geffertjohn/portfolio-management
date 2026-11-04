import { describe, it, expect } from 'vitest'
import { advanceSchedule, reviewTasksFor } from '../portfolioReviews'

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
const dayKey = day

describe('a full year from one annual', () => {
  it('runs three quarterlies, then the annual takes the fourth slot', () => {
    // Annual completed 4 Nov 2027.
    const annual = advanceSchedule('annual', d('2027-11-04'), { annual: d('2027-11-04') })
    expect(day(annual.nextReviewAt)).toBe('2028-11-04')
    expect(day(annual.quarterlyAt!)).toBe('2028-02-04')

    const nextAnnualDue = annual.nextReviewAt

    // Q1 completed on its due date -> Q2.
    const q1 = advanceSchedule('quarterly', d('2028-02-04'), { annual: nextAnnualDue })
    expect(day(q1.nextReviewAt)).toBe('2028-05-04')

    // Q2 -> Q3.
    const q2 = advanceSchedule('quarterly', d('2028-05-04'), { annual: nextAnnualDue })
    expect(day(q2.nextReviewAt)).toBe('2028-08-04')

    // Q3 would step onto the annual's own date — the annual covers that slot,
    // so the quarterly jumps past it. THREE quarterlies, then the annual.
    const q3 = advanceSchedule('quarterly', d('2028-08-04'), { annual: nextAnnualDue })
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
        quarterlyDue = advanceSchedule('quarterly', quarterlyDue, { annual: annualDue }).nextReviewAt
      } else {
        const r = advanceSchedule('annual', annualDue, { annual: annualDue })
        annualDue = r.nextReviewAt
        quarterlyDue = r.quarterlyAt!
      }
    }
    expect(collisions).toEqual([])
  })
})

describe('the quarterly step', () => {
  it('steps three months when the annual is far off', () => {
    expect(day(advanceSchedule('quarterly', d('2027-02-04'), { annual: d('2027-11-04') }).nextReviewAt))
      .toBe('2027-05-04')
  })

  it('jumps past the annual when the step would land ON it', () => {
    expect(day(advanceSchedule('quarterly', d('2027-08-04'), { annual: d('2027-11-04') }).nextReviewAt))
      .toBe('2028-02-04')
  })

  it('jumps past the annual when the step would land BEYOND it', () => {
    // Can happen after a late completion; the annual still owns its slot.
    expect(day(advanceSchedule('quarterly', d('2027-10-01'), { annual: d('2027-11-04') }).nextReviewAt))
      .toBe('2028-02-04')
  })

  it('just steps when the portfolio has no annual row', () => {
    expect(day(advanceSchedule('quarterly', d('2027-02-04'), { annual: null }).nextReviewAt))
      .toBe('2027-05-04')
  })
})

describe('completing the annual re-anchors the quarterly', () => {
  it('sets the next annual a year out and the quarterly a quarter out', () => {
    const r = advanceSchedule('annual', d('2026-09-30'), { annual: d('2026-09-30') })
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
    const r = advanceSchedule('quarterly', d('2026-12-30'), { annual: overdueAnnual })
    expect(day(r.nextReviewAt)).toBe('2027-03-30')
    expect(r.nextReviewAt.getTime()).toBeGreaterThan(d('2026-12-30').getTime())
  })

  it('never returns a date in the past, however stale the annual', () => {
    // An annual overdue by more than a year returned '2025-12-30' — eleven
    // months BEFORE the completion, so the next quarterly was born overdue.
    const r = advanceSchedule('quarterly', d('2026-11-04'), { annual: d('2025-09-30') })
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
      const r = advanceSchedule('quarterly', completed, { annual: annual })
      expect(
        r.nextReviewAt.getTime(),
        `annual ${monthsStale}mo stale gave ${day(r.nextReviewAt)}`,
      ).toBeGreaterThan(completed.getTime())
    }
  })

  it('still yields to an annual that is genuinely ahead', () => {
    // The fix must not disarm the rule it guards.
    expect(day(advanceSchedule('quarterly', d('2027-08-04'), { annual: d('2027-11-04') }).nextReviewAt))
      .toBe('2028-02-04')
  })
})

describe('the monthly dodges a larger review', () => {
  /**
   * A quarterly or annual ABSORBS the monthly that falls on its date — it
   * carries position sizing and performance attribution itself — so the
   * monthly skips that month instead of standing beside it.
   *
   * The three Equity books collided four times a year before this: monthly on
   * the 4th, quarterlies on 4 Feb / 4 May / 4 Aug and the annual on 4 Nov.
   */
  const annual = d('2027-11-04')

  it('skips a month when the step lands on the quarterly', () => {
    // Jan -> Feb would be 4 Feb, which is the quarterly's own date.
    const r = advanceSchedule('monthly', d('2027-01-04'), { annual, quarterly: d('2027-02-04') })
    expect(day(r.nextReviewAt)).toBe('2027-03-04')
  })

  it('skips a month when the step lands on the annual', () => {
    const r = advanceSchedule('monthly', d('2027-10-04'), { annual, quarterly: d('2027-08-04') })
    expect(day(r.nextReviewAt)).toBe('2027-12-04')
  })

  it('steps normally when nothing is in the way', () => {
    const r = advanceSchedule('monthly', d('2027-03-04'), { annual, quarterly: d('2027-05-04') })
    expect(day(r.nextReviewAt)).toBe('2027-04-04')
  })

  it('does not dodge a larger review in the same month on a different day', () => {
    // The rule is one day, not one month: two reviews a fortnight apart are
    // fine and the monthly should keep its own day.
    const r = advanceSchedule('monthly', d('2027-03-20'), { annual, quarterly: d('2027-04-04') })
    expect(day(r.nextReviewAt)).toBe('2027-04-20')
  })

  it('runs a full year with twelve sittings and no collisions', () => {
    // The property. Walk the real Equity shape for a year and assert that no
    // two cadences ever fall on one day, and that the monthly still runs in
    // every month a larger review does not claim.
    let monthly = d('2026-12-04')
    let quarterly = d('2027-02-04')
    let annualDue = d('2027-11-04')
    const days: string[] = []
    const collisions: string[] = []

    for (let i = 0; i < 40; i++) {
      const next = [monthly, quarterly, annualDue].sort((a, b) => +a - +b)[0]
      if (+next > +d('2027-12-31')) break
      const alsoDue = [monthly, quarterly, annualDue].filter((x) => dayKey(x) === dayKey(next))
      if (alsoDue.length > 1) collisions.push(dayKey(next))
      days.push(dayKey(next))

      if (dayKey(next) === dayKey(annualDue)) {
        const r = advanceSchedule('annual', annualDue, { annual: annualDue })
        annualDue = r.nextReviewAt
        quarterly = r.quarterlyAt!
      } else if (dayKey(next) === dayKey(quarterly)) {
        quarterly = advanceSchedule('quarterly', quarterly, { annual: annualDue }).nextReviewAt
      } else {
        monthly = advanceSchedule('monthly', monthly, { annual: annualDue, quarterly }).nextReviewAt
      }
    }

    expect(collisions).toEqual([])
    // 2027 should hold 8 monthly + 3 quarterly + 1 annual = 12 sittings.
    const in2027 = days.filter((x) => x.startsWith('2027-'))
    expect(in2027).toHaveLength(12)
    expect(new Set(in2027).size).toBe(12)
  })
})

describe('what an absorbing review has to carry', () => {
  it('gives the EQUITY quarterly the monthly two, first', () => {
    // Without these, the month a quarterly absorbs loses its sizing and
    // attribution check — 8 of those a year instead of 12.
    expect(reviewTasksFor('quarterly', 'Equity').map((t) => t.key)).toEqual([
      'position_sizing', 'performance_attribution',
      'full_monitoring', 'thesis_scorecards', 'watchlist_status', 'valuation_changes',
    ])
  })

  it('gives the EQUITY annual the same two, first', () => {
    expect(reviewTasksFor('annual', 'Equity').map((t) => t.key)).toEqual([
      'position_sizing', 'performance_attribution',
      'deep_review', 'conviction_rankings', 'portfolio_construction', 'valuation_changes',
    ])
  })

  it('leaves the monthly itself alone', () => {
    expect(reviewTasksFor('monthly', 'Equity').map((t) => t.key))
      .toEqual(['performance_attribution', 'position_sizing'])
  })

  it('leaves the fund lists alone', () => {
    expect(reviewTasksFor('quarterly', 'Foundation').map((t) => t.key)).toEqual([
      'position_sizing', 'performance_attribution', 'scorecard_review',
    ])
  })
})

describe('monthly otherwise steps a month', () => {
  it('steps a month and does not re-anchor anything', () => {
    // Equity-only, and not part of the quarterly/annual cycle.
    const r = advanceSchedule('monthly', d('2026-12-04'), { annual: d('2027-11-04') })
    expect(day(r.nextReviewAt)).toBe('2027-01-04')
    expect(r.quarterlyAt).toBeUndefined()
  })
})
