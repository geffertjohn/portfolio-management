import { describe, expect, it } from 'vitest'
import { buildCommentaryTimeline, standingReports, TIMELINE_QUARTERS } from '../commentaryTimeline'
import type { ResearchReport } from '../researchReports'
import type { EarningsCallSummary } from '../earningsCallSummaries'

/**
 * The timeline is the surface that proves a print was graded, so a quarter it
 * drops is evidence that silently stops existing. Gotcha 22 is the live hazard:
 * FMP stamps the wrong calendar YEAR on some Q4/Q1 rows, and sorting by that
 * date pushed two real quarters off the bottom of GOOGL's eight-row window.
 */

let nextId = 1
function report(over: Partial<ResearchReport> = {}): ResearchReport {
  return {
    id: nextId++, security_id: 'TEST', report_type: 'pre_earnings',
    fiscal_year: null, quarter: null, created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as ResearchReport
}

function summary(fiscalYear: number, quarter: number): EarningsCallSummary {
  return { id: nextId++, securityId: 'TEST', fiscalYear, quarter } as EarningsCallSummary
}

const d = (fiscalYear: number, quarter: number, date: string) => ({ fiscalYear, quarter, date })

describe('ordering', () => {
  it('sorts by fiscal period, newest first', () => {
    const rows = buildCommentaryTimeline(
      [d(2026, 1, '2026-02-01'), d(2026, 3, '2026-08-01'), d(2026, 2, '2026-05-01')],
      [], [],
    )
    expect(rows.map((r) => r.key)).toEqual(['2026-Q3', '2026-Q2', '2026-Q1'])
  })

  /**
   * The real GOOGL data. FMP dates the FY2025 Q4 call a year early, so a date
   * sort puts it below FY2024's calls and the two newest quarters fall off the
   * end of the window. Period ordering is immune.
   */
  it('is not fooled by a call date stamped a year early', () => {
    const rows = buildCommentaryTimeline(
      [
        d(2024, 3, '2024-10-29'),
        d(2025, 4, '2024-02-04'), // wrong year — the transcript itself says 2025
        d(2026, 1, '2024-04-24'), // likewise
      ],
      [], [],
    )
    expect(rows.map((r) => r.key)).toEqual(['2026-Q1', '2025-Q4', '2024-Q3'])
  })

  it('flags a contradicted date but still shows it, never rewrites it', () => {
    const rows = buildCommentaryTimeline(
      [d(2024, 3, '2024-10-29'), d(2025, 4, '2024-02-04')],
      [], [],
    )
    const bad = rows.find((r) => r.key === '2025-Q4')!
    expect(bad.dateSuspect).toBe(true)
    // Shown unasserted — inventing a corrected year would be fabricating a figure.
    expect(bad.callDate).toBe('2024-02-04')
    expect(rows.find((r) => r.key === '2024-Q3')!.dateSuspect).toBe(false)
  })

  /**
   * Both of GOOGL's bad dates are wrong, and the later one is wrong by less. A
   * neighbour-only check compares Q1 against the already-dragged-back Q4 and
   * clears it; comparing against the running max of ALL lower periods does not.
   */
  it('flags the second of a consecutive bad pair', () => {
    const rows = buildCommentaryTimeline(
      [d(2024, 3, '2024-10-29'), d(2025, 4, '2024-02-04'), d(2026, 1, '2024-04-24')],
      [], [],
    )
    expect(rows.find((r) => r.key === '2025-Q4')!.dateSuspect).toBe(true)
    expect(rows.find((r) => r.key === '2026-Q1')!.dateSuspect).toBe(true)
  })
})

describe('rows come from every source, not just transcripts', () => {
  it('gives a period with only a pre-brief its own row', () => {
    // A pre-brief is written BEFORE the call, so the newest quarter has no
    // transcript. Dropping it hides the forward-looking document at the one
    // moment it is the only document that exists.
    const rows = buildCommentaryTimeline(
      [d(2026, 2, '2026-05-01')],
      [report({ fiscal_year: 2026, quarter: 3, report_type: 'pre_earnings' })],
      [],
    )
    expect(rows[0]).toMatchObject({ key: '2026-Q3', callDate: null, dateBasis: null })
    expect(rows[0].pre).toHaveLength(1)
  })

  it('gives a period with only a call summary its own row', () => {
    const rows = buildCommentaryTimeline([], [], [summary(2026, 2)])
    expect(rows.map((r) => r.key)).toEqual(['2026-Q2'])
    expect(rows[0].summary).not.toBeNull()
  })

  it('keeps standing research out of the quarters entirely', () => {
    const standing = report({ report_type: 'initial' })
    const rows = buildCommentaryTimeline([d(2026, 2, '2026-05-01')], [standing], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].pre).toHaveLength(0)
    expect(standingReports([standing])).toEqual([standing])
  })

  it('does NOT collapse several briefs of one type in one period', () => {
    // TJX carries three pre-briefs for Q2 2027. Showing one and dropping two
    // would misreport the record.
    const rows = buildCommentaryTimeline([], [
      report({ fiscal_year: 2027, quarter: 2, created_at: '2026-08-01T00:00:00Z' }),
      report({ fiscal_year: 2027, quarter: 2, created_at: '2026-08-03T00:00:00Z' }),
      report({ fiscal_year: 2027, quarter: 2, created_at: '2026-08-02T00:00:00Z' }),
    ], [])
    expect(rows[0].pre).toHaveLength(3)
    // Newest first, so the operative document reads first.
    expect(rows[0].pre.map((r) => r.created_at)).toEqual([
      '2026-08-03T00:00:00Z', '2026-08-02T00:00:00Z', '2026-08-01T00:00:00Z',
    ])
  })

  it('separates pre- from post-briefs within a period', () => {
    const rows = buildCommentaryTimeline([], [
      report({ fiscal_year: 2026, quarter: 2, report_type: 'pre_earnings' }),
      report({ fiscal_year: 2026, quarter: 2, report_type: 'post_earnings' }),
    ], [])
    expect(rows[0].pre).toHaveLength(1)
    expect(rows[0].post).toHaveLength(1)
  })
})

describe('dating the newest row', () => {
  const dates = [d(2026, 2, '2026-05-01')]
  const pre = [report({ fiscal_year: 2026, quarter: 3 })]

  /**
   * The ORLY defect. A quarter that reported on 28 October but is not yet
   * transcribed read "Feb 3, 2027 (expected)" — the NEXT call — because the two
   * states were collapsed into one.
   */
  it('reads a release newer than any transcript as reported, not expected', () => {
    const rows = buildCommentaryTimeline(dates, pre, [], {
      lastEarnings: '2026-10-28', nextEarnings: '2027-02-03',
    })
    expect(rows[0]).toMatchObject({ key: '2026-Q3', callDate: '2026-10-28', dateBasis: 'reported' })
  })

  it('reads a release older than the newest transcript as a call still to come', () => {
    const rows = buildCommentaryTimeline(dates, pre, [], {
      lastEarnings: '2026-05-01', nextEarnings: '2026-08-05',
    })
    expect(rows[0]).toMatchObject({ callDate: '2026-08-05', dateBasis: 'expected' })
  })

  it('leaves the row undated when the calendar says nothing', () => {
    const rows = buildCommentaryTimeline(dates, pre, [], {})
    expect(rows[0]).toMatchObject({ callDate: null, dateBasis: null })
  })

  it('never overwrites a transcript date', () => {
    const rows = buildCommentaryTimeline(dates, [], [], {
      lastEarnings: '2026-10-28', nextEarnings: '2027-02-03',
    })
    expect(rows[0]).toMatchObject({ callDate: '2026-05-01', dateBasis: 'transcript' })
  })

  /**
   * The transcript icon gates on dateBasis, not on callDate being set — both
   * of the states above carry a date and neither has a transcript to open.
   */
  it('marks only a transcript-dated row as having a transcript', () => {
    const rows = buildCommentaryTimeline(dates, pre, [], {
      lastEarnings: '2026-10-28', nextEarnings: '2027-02-03',
    })
    expect(rows.filter((r) => r.dateBasis === 'transcript').map((r) => r.key)).toEqual(['2026-Q2'])
  })
})

describe('the window', () => {
  it('keeps the newest eight quarters and drops the rest', () => {
    const many = Array.from({ length: 12 }, (_, i) => d(2024 + Math.floor(i / 4), (i % 4) + 1, `20${24 + Math.floor(i / 4)}-0${(i % 4) + 1}-01`))
    const rows = buildCommentaryTimeline(many, [], [])
    expect(rows).toHaveLength(TIMELINE_QUARTERS)
    expect(rows[0].key).toBe('2026-Q4')
  })

  it('returns nothing at all when there is nothing to show', () => {
    expect(buildCommentaryTimeline([], [], [])).toEqual([])
  })
})
