import { describe, it, expect } from 'vitest'
import {
  seededStockSchedules, newScheduleWrites, retiredSchedules,
  type ScheduleSeedInput,
} from '../reviewSchedules'

/**
 * Nothing creates a `review_schedules` row when a stock is bought — the only
 * live writer is `markReviewed`. HCA and TSM sat held in two books each, never
 * reviewed, and visible on NO surface: the Review Calendar and the Actions hub
 * both read `fetchReviewSchedules`, so a security with no row raises nothing.
 * In a tool built for audit defence that is the whole finding.
 */

const TODAY = '2026-11-04'

const stock = (over: Partial<ScheduleSeedInput> & { security_id: string }): ScheduleSeedInput => ({
  next_earnings_release: null,
  detailed_security_type: 'stock',
  peer_group_name: null,
  fund_company_name: null,
  fund_family: null,
  expense_ratio_generic: null,
  ...over,
})

describe('seeding a schedule for a held stock that has none', () => {
  it('dates HCA from its next call, not its last', () => {
    // HCA: Equity Income 2.50% + EI&CG 1.25%, reported 2026-10-27, next
    // 2027-01-26, never reviewed. Dating from the LAST call would assert a
    // review was missed on 28 Oct — nobody knows that; the position may have
    // been added last week or reviewed outside the system. Scheduling the next
    // one makes no retrospective claim.
    const seeds = seededStockSchedules(
      [stock({ security_id: 'HCA', next_earnings_release: '2027-01-26T00:00:00Z' })],
      TODAY,
    )
    expect(seeds).toEqual([
      { securityId: 'HCA', cadence: 'quarterly', nextReviewAt: '2027-01-27T00:00:00Z' },
    ])
  })

  it('refuses to seed TSM from its STALE stored date', () => {
    // TSM's next_earnings_release read 2026-10-15 — three weeks past — so a
    // seed from it would be born overdue for a call nobody logged. It is
    // skipped here; the caller refreshes from FMP first and seeds on the
    // same mount.
    const seeds = seededStockSchedules(
      [stock({ security_id: 'TSM', next_earnings_release: '2026-10-15T00:00:00Z' })],
      TODAY,
    )
    expect(seeds).toEqual([])
  })

  it('seeds a call happening TODAY, due tomorrow', () => {
    // Not in the past, so it claims nothing. Strictly-past is the disqualifier.
    const seeds = seededStockSchedules(
      [stock({ security_id: 'NOW', next_earnings_release: `${TODAY}T00:00:00Z` })],
      TODAY,
    )
    expect(seeds[0]?.nextReviewAt).toBe('2026-11-05T00:00:00Z')
  })

  it('skips a stock with no earnings date at all', () => {
    // $Cash is held in 19 portfolios and has nothing to schedule. It never
    // reaches here (the fetcher excludes nothing, the rule does).
    expect(seededStockSchedules([stock({ security_id: '$Cash' })], TODAY)).toEqual([])
  })

  it('skips funds and ETFs — they are cadence-driven, not earnings-driven', () => {
    const rows: ScheduleSeedInput[] = [
      stock({ security_id: 'VBILX', detailed_security_type: 'mutual_fund',
              next_earnings_release: '2027-01-26T00:00:00Z', peer_group_name: 'Interm Bond' }),
      stock({ security_id: 'SCHD', detailed_security_type: 'etf',
              next_earnings_release: '2027-01-26T00:00:00Z', expense_ratio_generic: 0.06 }),
    ]
    expect(seededStockSchedules(rows, TODAY)).toEqual([])
  })

  it('classifies an ambiguous row by fund signals, as the shared classifier does', () => {
    // It calls `isFundOrEtfSecurity` rather than re-implementing the test, so a
    // blank type with a peer group is a fund here too.
    const rows: ScheduleSeedInput[] = [
      stock({ security_id: 'AMBIG', detailed_security_type: null,
              peer_group_name: 'Large Blend', next_earnings_release: '2027-01-26T00:00:00Z' }),
    ]
    expect(seededStockSchedules(rows, TODAY)).toEqual([])
  })

  it('writes a cadence the CHECK constraint accepts', () => {
    // review_schedules.cadence is NOT NULL and CHECKed to
    // quarterly/semi_annual/annual. It is hidden from the stock review UI,
    // which is earnings-driven; quarterly is what all 94 live rows carry.
    const seeds = seededStockSchedules(
      [stock({ security_id: 'X', next_earnings_release: '2027-01-26T00:00:00Z' })],
      TODAY,
    )
    expect(['quarterly', 'semi_annual', 'annual']).toContain(seeds[0]!.cadence)
  })

  it('never produces a review date in the past, over a year of inputs', () => {
    // The property. Whatever the stored date, a seeded schedule is either
    // skipped or lands strictly after today.
    const rows: ScheduleSeedInput[] = []
    for (let i = -200; i <= 200; i += 7) {
      const d = new Date(`${TODAY}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + i)
      rows.push(stock({ security_id: `S${i}`, next_earnings_release: d.toISOString() }))
    }
    for (const s of seededStockSchedules(rows, TODAY)) {
      // String compare, not toBeGreaterThan — these are ISO dates, and that
      // matcher demands a number.
      expect(s.nextReviewAt.slice(0, 10) > TODAY, `${s.securityId} seeded into the past`)
        .toBe(true)
    }
  })
})

/**
 * Wiring the purchase path (Nov 2026). Until then NOTHING created a schedule
 * when a security entered a book — `upsertReviewSchedule` existed for exactly
 * this and had no caller — so a bought stock showed on no review surface until
 * somebody happened to open the Review Calendar.
 */
describe('what a newly held security gets', () => {
  it('schedules a stock from its next call', () => {
    const w = newScheduleWrites(
      [stock({ security_id: 'NVDA', next_earnings_release: '2027-02-25T00:00:00Z' })],
      TODAY,
    )
    expect(w).toEqual([
      { securityId: 'NVDA', cadence: 'quarterly', nextReviewAt: '2027-02-26T00:00:00Z' },
    ])
  })

  it('schedules a fund on its CADENCE, with no date of its own', () => {
    // A fund has no earnings date to read, so the writer falls back to
    // `calcNextReview(cadence)`. null is the instruction to do that — not a
    // missing value.
    const w = newScheduleWrites(
      [stock({ security_id: 'VBILX', detailed_security_type: 'mutual_fund',
               peer_group_name: 'Interm Bond' })],
      TODAY,
    )
    expect(w).toEqual([{ securityId: 'VBILX', cadence: 'quarterly', nextReviewAt: null }])
  })

  it('uses the cadence default for a fund EVEN IF it carries an earnings date', () => {
    // No fund carries one today, which is exactly why this needs pinning: a
    // fixture with a null date cannot tell the rule from the accident. This
    // codebase has form for stale residue on columns a dead sync once wrote
    // (`*_total_return_nav` on stocks), and a fund scheduled from an earnings
    // date would silently stop being cadence-driven.
    const w = newScheduleWrites(
      [stock({ security_id: 'RESIDUE', detailed_security_type: 'mutual_fund',
               peer_group_name: 'Interm Bond',
               next_earnings_release: '2027-02-25T00:00:00Z' })],
      TODAY,
    )
    expect(w).toEqual([{ securityId: 'RESIDUE', cadence: 'quarterly', nextReviewAt: null }])
  })

  it('gives a stock with a STALE earnings date nothing, not a bad date', () => {
    // It would be born overdue. The calendar seed refreshes from FMP and
    // catches it there; writing a wrong date here would look like an answer.
    expect(newScheduleWrites(
      [stock({ security_id: 'TSM', next_earnings_release: '2026-10-15T00:00:00Z' })],
      TODAY,
    )).toEqual([])
  })

  it('handles a mixed batch — an allocation import adding both at once', () => {
    const w = newScheduleWrites([
      stock({ security_id: 'NVDA', next_earnings_release: '2027-02-25T00:00:00Z' }),
      stock({ security_id: 'VBILX', detailed_security_type: 'mutual_fund', peer_group_name: 'Interm Bond' }),
      stock({ security_id: 'STALE', next_earnings_release: '2026-01-01T00:00:00Z' }),
    ], TODAY)
    expect(w.map((x) => x.securityId).sort()).toEqual(['NVDA', 'VBILX'])
  })

  it('never writes a cadence the CHECK constraint would reject', () => {
    const w = newScheduleWrites([
      stock({ security_id: 'A', next_earnings_release: '2027-02-25T00:00:00Z' }),
      stock({ security_id: 'B', detailed_security_type: 'etf', expense_ratio_generic: 0.03 }),
    ], TODAY)
    for (const x of w) expect(['quarterly', 'semi_annual', 'annual']).toContain(x.cadence)
  })

  it('counts each security once, never twice', () => {
    // A row must not land in both arms: the stock arm and the fund arm are
    // partitioned by the same classifier, and a double write would make the
    // upsert overwrite the date it had just derived.
    const w = newScheduleWrites([
      stock({ security_id: 'X', next_earnings_release: '2027-02-25T00:00:00Z' }),
      stock({ security_id: 'Y', detailed_security_type: 'etf', expense_ratio_generic: 0.03,
              next_earnings_release: '2027-02-25T00:00:00Z' }),
    ], TODAY)
    expect(w).toHaveLength(2)
    expect(new Set(w.map((x) => x.securityId)).size).toBe(2)
  })
})

describe('retiring the schedule of a security that has left every book', () => {
  /**
   * The mirror of the seeding above, and the gap it closes was found by the
   * same kind of query. The purchase path creates a schedule; until Nov 2026
   * nothing retired one. VTABX left its last book in Mar 2026 and was still
   * carrying a review due 9 Dec 2026; APDFX, sold out of its last book on
   * 1 Oct, one due 29 Dec. Both would have come up on the Review Calendar and
   * in the Actions hub as reviews due for funds the firm does not own.
   */
  it('retires a schedule once no book holds the security', () => {
    expect(retiredSchedules(['VTABX', 'APDFX', 'VOO'], ['VOO'])).toEqual(['APDFX', 'VTABX'])
  })

  it('KEEPS the schedule of a security still held in another book', () => {
    // The case that makes a per-position check wrong. APDFX sat in six books;
    // leaving one of them is a rebalance, not a sale, and retiring on the first
    // departure would have stopped a live holding being reviewed.
    expect(retiredSchedules(['APDFX'], ['APDFX'])).toEqual([])
  })

  it('retires nothing when every scheduled security is held', () => {
    expect(retiredSchedules(['VOO', 'AAPL'], ['AAPL', 'VOO', 'MSFT'])).toEqual([])
  })

  it('ignores a held security that has no schedule', () => {
    // That is the seeding side's job, not this one's. Returning it here would
    // make the two halves fight over the same row.
    expect(retiredSchedules(['VOO'], ['VOO', 'HCA'])).toEqual([])
  })

  it('dedupes and trims, since `held` arrives one row per position', () => {
    // `positions` is keyed (portfolio_name, security_id), so a security in four
    // books arrives four times.
    expect(retiredSchedules([' VTABX ', 'VTABX'], ['VOO', 'VOO', ' VOO '])).toEqual(['VTABX'])
  })

  it('retires everything when the book is empty', () => {
    // Stated so the behaviour is deliberate rather than incidental: the caller
    // scopes the read, and `syncPositionsFromLatestSnapshot` deletes per
    // portfolio for symbols absent from the target, so `positions` is never
    // globally emptied mid-import.
    expect(retiredSchedules(['VOO'], [])).toEqual(['VOO'])
  })
})
