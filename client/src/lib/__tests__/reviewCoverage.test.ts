import { describe, it, expect } from 'vitest'
import {
  buildSecurityCoverage, coverageWindowStart, sortCoverageByGap,
  coverageTotals, buildCoverageCsv, type SecurityCoverage,
} from '../reviewCoverage'

/**
 * The coverage report answers what `outstandingCallReviewDay` deliberately
 * does not: which calls were never answered, ever. That rule names only the
 * MOST RECENT unreviewed call, so a stock reporting again while still
 * unreviewed moves its obligation forward and the older miss stops being
 * counted — and an examiner's question is about every print, not the latest.
 *
 * Every fixture below is a real row from the live book on 5 Nov 2026.
 */

const PROCESS_START = '2026-04-13' // the first review this system ever recorded
const TODAY = '2026-11-05'

describe('the coverage window', () => {
  it('starts at the process start when the holding is older', () => {
    // All 55 held stocks are in this case today: held well before the tool
    // recorded its first review, so the process floor is the binding one.
    expect(coverageWindowStart('2024-04-25', PROCESS_START))
      .toEqual({ from: '2026-04-13', basis: 'process_start' })
  })

  it('starts at the purchase when the holding is newer', () => {
    // Binds for nothing today and for everything bought from now on. You
    // cannot owe a review for a print you did not own through.
    expect(coverageWindowStart('2026-09-24', PROCESS_START))
      .toEqual({ from: '2026-09-24', basis: 'first_held' })
  })

  it('falls back to the process start when the holding date is unknown', () => {
    expect(coverageWindowStart(null, PROCESS_START))
      .toEqual({ from: '2026-04-13', basis: 'process_start' })
  })

  it('makes NO claim when no review was ever recorded', () => {
    // An absence, not a zero. With no process to measure against, every call
    // would otherwise read as missed and the report would be pure noise.
    expect(coverageWindowStart('2024-04-25', null)).toEqual({ from: null, basis: null })
  })
})

describe('matching a review to the call it answers', () => {
  /**
   * DUK, live: calls on 5 May, 4 Aug and 5 Nov 2026, one review on 18 May.
   * The 4 Aug call was never answered, which is the same gap #98 surfaced as
   * "overdue since 5 Aug" — the two rules agree about this row from opposite
   * directions, which is the point of building the second one.
   */
  const duk = () => buildSecurityCoverage({
    securityId: 'DUK',
    callDates: ['2027-02-09', '2026-11-05', '2026-08-04', '2026-05-05', '2026-02-10'],
    reviewedAt: ['2026-05-18'],
    firstHeld: '2024-04-25',
    processStart: PROCESS_START,
    today: TODAY,
  })

  it('credits the review to the call it followed', () => {
    const c = duk().calls.find((x) => x.date === '2026-05-05')!
    expect(c.status).toBe('reviewed')
    expect(c.reviewedAt).toBe('2026-05-18')
    expect(c.daysToReview).toBe(13)
  })

  it('reports the call nobody answered', () => {
    const c = duk().calls.find((x) => x.date === '2026-08-04')!
    expect(c.status).toBe('missed')
    expect(c.reviewDueOn).toBe('2026-08-05')
    expect(c.reviewedAt).toBeNull()
  })

  it('calls this morning’s print PENDING, not missed', () => {
    // DUK reported on the day this was built. Its review is due tomorrow, and
    // "due today is not overdue" is the same boundary `isOverdue` draws — a
    // report that charged the firm for it would be wrong by a day and would
    // have led the list with a false finding.
    const c = duk().calls.find((x) => x.date === '2026-11-05')!
    expect(c.status).toBe('pending')
    expect(c.reviewDueOn).toBe('2026-11-06')
  })

  it('drops the SCHEDULED release entirely', () => {
    // A call that has not happened is not a gap in anything, so it is absent
    // rather than pending.
    expect(duk().calls.map((c) => c.date)).not.toContain('2027-02-09')
  })

  it('drops the call from BEFORE the window', () => {
    // 10 Feb 2026 predates the first review this system recorded; charging for
    // it would be a finding nobody could have acted on.
    expect(duk().calls.map((c) => c.date)).not.toContain('2026-02-10')
  })

  it('counts and leads with the oldest gap', () => {
    const r = duk()
    expect([r.reviewed, r.missed, r.pending]).toEqual([1, 1, 1])
    expect(r.oldestMissed).toBe('2026-08-04')
    expect(r.coverageFrom).toBe('2026-04-13')
    expect(r.coverageBasis).toBe('process_start')
  })

  it('returns calls newest first', () => {
    expect(duk().calls.map((c) => c.date)).toEqual(['2026-11-05', '2026-08-04', '2026-05-05'])
  })

  it('credits a review the DAY AFTER a call', () => {
    // NVDA, live: call 20 May, reviewed the 21st.
    const r = buildSecurityCoverage({
      securityId: 'NVDA',
      callDates: ['2026-08-26', '2026-05-20'],
      reviewedAt: ['2026-05-21'],
      firstHeld: '2024-04-25', processStart: PROCESS_START, today: TODAY,
    })
    expect(r.calls.find((c) => c.date === '2026-05-20')!.status).toBe('reviewed')
    expect(r.calls.find((c) => c.date === '2026-08-26')!.status).toBe('missed')
  })

  it('credits a review recorded ON the call day', () => {
    // Earnings land pre-market or post-close and the review is scheduled for
    // the day after, so same-day is reviewing that print.
    const r = buildSecurityCoverage({
      securityId: 'X', callDates: ['2026-08-04'], reviewedAt: ['2026-08-04'],
      firstHeld: null, processStart: PROCESS_START, today: TODAY,
    })
    expect(r.calls[0].status).toBe('reviewed')
    expect(r.calls[0].daysToReview).toBe(0)
  })

  it('does NOT credit a review the day BEFORE a call', () => {
    // It cannot have reviewed a print that had not happened. Crediting it would
    // turn the report into a rubber stamp.
    const r = buildSecurityCoverage({
      securityId: 'X', callDates: ['2026-08-04'], reviewedAt: ['2026-08-03'],
      firstHeld: null, processStart: PROCESS_START, today: TODAY,
    })
    expect(r.calls[0].status).toBe('missed')
  })

  it('does not let one review cover two calls', () => {
    // A review sits in exactly one window. Letting a late review answer both
    // the call it followed and the one before it is how a gap disappears.
    const r = buildSecurityCoverage({
      securityId: 'X', callDates: ['2026-05-05', '2026-08-04'], reviewedAt: ['2026-08-10'],
      firstHeld: null, processStart: PROCESS_START, today: TODAY,
    })
    expect(r.calls.map((c) => [c.date, c.status])).toEqual([
      ['2026-08-04', 'reviewed'], ['2026-05-05', 'missed'],
    ])
  })

  it('credits the call a LATE review followed, not the nearest one', () => {
    // The window rule, stated as its own case. A review 80 days after call n
    // is 10 days before call n+1; nearest-call matching would credit n+1,
    // which had not happened when the review was written. On a book where most
    // names run more than 45 days behind, the two rules differ constantly.
    const r = buildSecurityCoverage({
      securityId: 'X', callDates: ['2026-05-05', '2026-08-04'], reviewedAt: ['2026-07-25'],
      firstHeld: null, processStart: PROCESS_START, today: TODAY,
    })
    expect(r.calls.find((c) => c.date === '2026-05-05')!.status).toBe('reviewed')
    expect(r.calls.find((c) => c.date === '2026-05-05')!.daysToReview).toBe(81)
    expect(r.calls.find((c) => c.date === '2026-08-04')!.status).toBe('missed')
  })

  it('reports every call missed for a holding never reviewed', () => {
    // MU, live: held, zero review_log rows.
    const r = buildSecurityCoverage({
      securityId: 'MU', callDates: ['2026-09-30', '2026-06-25'], reviewedAt: [],
      firstHeld: '2024-04-25', processStart: PROCESS_START, today: TODAY,
    })
    expect([r.reviewed, r.missed, r.pending]).toEqual([0, 2, 0])
    expect(r.oldestMissed).toBe('2026-06-25')
  })

  it('reports a clean holding as clean', () => {
    // PG, live: call 22 Oct, reviewed the 28th.
    const r = buildSecurityCoverage({
      securityId: 'PG', callDates: ['2026-10-22'], reviewedAt: ['2026-04-27', '2026-10-28'],
      firstHeld: '2024-04-25', processStart: PROCESS_START, today: TODAY,
    })
    expect([r.reviewed, r.missed, r.pending]).toEqual([1, 0, 0])
    expect(r.oldestMissed).toBeNull()
  })

  it('dedupes repeated call dates', () => {
    // FMP has been seen to list a corrected release twice; two rows for one
    // call would double-count the gap.
    const r = buildSecurityCoverage({
      securityId: 'X', callDates: ['2026-08-04', '2026-08-04'], reviewedAt: [],
      firstHeld: null, processStart: PROCESS_START, today: TODAY,
    })
    expect(r.calls).toHaveLength(1)
  })

  it('reads a full timestamp the same as a bare day', () => {
    // `review_log.reviewed_at` is a timestamptz; compared on its UTC date part
    // like every other calendar-day column here (gotcha 24).
    const r = buildSecurityCoverage({
      securityId: 'X', callDates: ['2026-08-04'], reviewedAt: ['2026-08-04T20:00:00Z'],
      firstHeld: null, processStart: PROCESS_START, today: TODAY,
    })
    expect(r.calls[0].status).toBe('reviewed')
  })

  it('makes no claim at all when no review was ever recorded', () => {
    const r = buildSecurityCoverage({
      securityId: 'X', callDates: ['2026-08-04'], reviewedAt: [],
      firstHeld: '2024-04-25', processStart: null, today: TODAY,
    })
    expect(r.calls).toEqual([])
    expect(r.coverageFrom).toBeNull()
    expect(r.missed).toBe(0)
  })
})

describe('the report', () => {
  const row = (securityId: string, over: Partial<SecurityCoverage> = {}): SecurityCoverage => ({
    securityId, coverageFrom: '2026-04-13', coverageBasis: 'process_start',
    calls: [], reviewed: 0, missed: 0, pending: 0, oldestMissed: null, ...over,
  })

  it('orders by the OLDEST gap, not by how many', () => {
    // One call unanswered for a year is a worse finding than three unanswered
    // last quarter, and the list is read from the top.
    const sorted = sortCoverageByGap([
      row('A', { missed: 3, oldestMissed: '2026-09-30' }),
      row('B', { missed: 1, oldestMissed: '2026-05-05' }),
    ])
    expect(sorted.map((r) => r.securityId)).toEqual(['B', 'A'])
  })

  it('puts clean securities after every security with a gap', () => {
    const sorted = sortCoverageByGap([
      row('CLEAN'), row('GAP', { missed: 1, oldestMissed: '2026-08-04' }),
    ])
    expect(sorted.map((r) => r.securityId)).toEqual(['GAP', 'CLEAN'])
  })

  it('rates coverage over ANSWERABLE calls, excluding pending', () => {
    // Counting this morning's print against the firm would make the figure
    // drift down and back up every quarter for reasons unrelated to the work.
    const t = coverageTotals([
      row('A', { reviewed: 3, missed: 1, pending: 1 }),
      row('B', { reviewed: 1, missed: 0, pending: 0 }),
    ])
    expect(t).toEqual({
      securities: 2, withGaps: 1, calls: 6, reviewed: 4, missed: 1, pending: 1, rate: 0.8,
    })
  })

  it('reports a null rate rather than 0% when nothing is answerable', () => {
    expect(coverageTotals([row('A', { pending: 1 })]).rate).toBeNull()
    expect(coverageTotals([]).rate).toBeNull()
  })

  it('exports one CSV row per CALL, worst security first', () => {
    // Per call, because "DUK, 2 of 3" invites the next question while the 4 Aug
    // call and the date its review fell due answers it.
    const csv = buildCoverageCsv([
      row('CLEAN', {
        reviewed: 1,
        calls: [{ date: '2026-10-22', reviewDueOn: '2026-10-23', status: 'reviewed',
                  reviewedAt: '2026-10-28', daysToReview: 6 }],
      }),
      row('DUK', {
        missed: 1, oldestMissed: '2026-08-04',
        calls: [{ date: '2026-08-04', reviewDueOn: '2026-08-05', status: 'missed',
                  reviewedAt: null, daysToReview: null }],
      }),
    ])
    expect(csv.split('\n')).toEqual([
      'Security,Earnings call,Review due,Status,Reviewed on,Days to review,Coverage from,Coverage basis',
      'DUK,2026-08-04,2026-08-05,missed,,,2026-04-13,process_start',
      'CLEAN,2026-10-22,2026-10-23,reviewed,2026-10-28,6,2026-04-13,process_start',
    ])
  })
})
