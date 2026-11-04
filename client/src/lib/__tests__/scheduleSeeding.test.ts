import { describe, it, expect } from 'vitest'
import { seededStockSchedules, type ScheduleSeedInput } from '../reviewSchedules'

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
