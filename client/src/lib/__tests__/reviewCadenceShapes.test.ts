import { describe, it, expect } from 'vitest'
import { advanceSchedule } from '../portfolioReviews'

/**
 * The nineteen real portfolio shapes, as the database held them on
 * **4 Nov 2026**, walked three years forward.
 *
 * A SNAPSHOT kept as a regression corpus, not a live mirror — the dates below
 * do not track the database and are not meant to. What makes it worth keeping
 * is the MIX: eighteen healthy books plus Foundation Conservative, whose annual
 * was genuinely overdue and whose quarterly therefore sat three months PAST it
 * rather than nine months before.
 *
 * That one row is the point. Three cadence defects were shipped and fixed in a
 * single day — four quarterlies a year colliding with the annual, an overdue
 * annual pinning the quarterly to a date already past, and the monthly
 * colliding four times a year — and the simulation written alongside the first
 * fix passed throughout, because it only ever modelled healthy timers completed
 * on their due dates. Every one of those defects was found by querying the
 * database instead of re-reading the rule.
 *
 * Asserts three things per book: no two cadences ever fall on one day, every
 * sitting moves forward in time, and a full year holds the RIGHT NUMBER AND
 * MIX of reviews — 8 monthly + 3 quarterly + 1 annual for an Equity book, 3
 * quarterly + 1 annual for a fund book. The last matters because "no
 * collisions" is also what you get by silently dropping reviews.
 */
const LIVE = [
  ['Core Growth','Equity','2027-02-04','2027-11-04','2026-12-04'],
  ['Equity Income','Equity','2027-02-04','2027-11-04','2026-12-04'],
  ['Equity Income & Core Growth','Equity','2027-02-04','2027-11-04','2026-12-04'],
  ['ETF Balanced','ETF','2027-02-04','2027-11-04',null],
  ['ETF Balanced with Growth','ETF','2027-02-04','2027-11-04',null],
  ['ETF Conservative','ETF','2027-02-04','2027-11-04',null],
  ['ETF Conservative Balanced','ETF','2027-02-04','2027-11-04',null],
  ['ETF Growth','ETF','2027-02-04','2027-11-04',null],
  ['Fixed Income Total Return','Fixed Income','2027-02-04','2027-11-04',null],
  ['Foundation Balanced','Foundation','2027-02-04','2027-11-04',null],
  ['Foundation Balanced with Growth','Foundation','2027-02-04','2027-11-04',null],
  ['Foundation Conservative','Foundation','2026-12-30','2026-09-30',null], // overdue annual
  ['Foundation Conservative Balanced','Foundation','2027-02-04','2027-11-04',null],
  ['Foundation Growth','Foundation','2027-02-04','2027-11-04',null],
  ['Hybrid Balanced','Hybrid','2027-02-04','2027-11-04',null],
  ['Hybrid Balanced with Growth','Hybrid','2027-02-04','2027-11-04',null],
  ['Hybrid Conservative','Hybrid','2027-02-04','2027-11-04',null],
  ['Hybrid Conservative Balanced','Hybrid','2027-02-04','2027-11-04',null],
  ['Hybrid Growth','Hybrid','2027-02-04','2027-11-04',null],
] as const

const d = (s: string) => new Date(`${s}T12:00:00Z`)
const day = (x: Date) => x.toISOString().slice(0, 10)

describe('three years forward from the real shapes of 4 Nov 2026', () => {
  it.each(LIVE.map((r) => [r[0], r]))('%s never double-books a day', (_n, row) => {
    const [name, , q0, a0, m0] = row as unknown as [string, string, string, string, string | null]
    let q = d(q0), a = d(a0)
    let m = m0 ? d(m0) : null
    const collisions: string[] = []
    const sittings: string[] = []
    const kinds: Array<[string, string]> = []

    for (let i = 0; i < 200; i++) {
      const pending = [q, a, ...(m ? [m] : [])]
      const next = pending.reduce((lo, x) => (+x < +lo ? x : lo))
      if (+next > +d('2029-11-04')) break

      const same = pending.filter((x) => day(x) === day(next))
      if (same.length > 1) collisions.push(`${day(next)} x${same.length}`)
      sittings.push(day(next))
      kinds.push([day(next), day(next) === day(a) ? 'annual' : day(next) === day(q) ? 'quarterly' : 'monthly'])

      if (day(next) === day(a)) {
        const r = advanceSchedule('annual', a, { annual: a })
        a = r.nextReviewAt; q = r.quarterlyAt!
      } else if (day(next) === day(q)) {
        q = advanceSchedule('quarterly', q, { annual: a }).nextReviewAt
      } else {
        m = advanceSchedule('monthly', m!, { annual: a, quarterly: q }).nextReviewAt
      }
    }

    expect(collisions, `${name}: ${collisions.join(', ')}`).toEqual([])
    // every sitting must move forward in time
    const sorted = [...sittings].sort()
    expect(sittings, `${name} went backwards`).toEqual(sorted)

    // No collisions is also what you get by DROPPING reviews, so count them.
    // 2028 is a clean full year for every book here.
    const n2028 = sittings.filter((x) => x.startsWith('2028-')).length
    const isEquity = Boolean((row as unknown as string[])[4])
    const expected = isEquity ? 12 : 4
    expect(n2028, `${name} held ${n2028} reviews in 2028, expected ${expected}`).toBe(expected)

    // And of the RIGHT kinds: 8 monthly + 3 quarterly + 1 annual for an Equity
    // book, 3 quarterly + 1 annual for a fund book.
    const by2028 = kinds.filter(([x]) => x.startsWith('2028-')).map(([, k]) => k)
    const tally = (k: string) => by2028.filter((x) => x === k).length
    expect([tally('monthly'), tally('quarterly'), tally('annual')],
      `${name} 2028 mix`).toEqual(isEquity ? [8, 3, 1] : [0, 3, 1])
  })
})
