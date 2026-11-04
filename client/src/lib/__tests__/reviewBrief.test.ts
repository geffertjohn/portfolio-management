import { describe, expect, it, vi } from 'vitest'

/**
 * `fetchReviewQuarterlyBrief` decides WHICH quarter a review's evidence PDF
 * carries. Keying that on the brief rather than on the review date is the whole
 * point of `review_log.source_report_id`, so the two cases worth locking are
 * the ones where a date-derived guess would differ: a review recorded late, and
 * a brief with no fiscal period at all.
 */

const mocks = vi.hoisted(() => ({ reports: [] as unknown[], summary: null as unknown }))

vi.mock('../researchReports', () => ({ fetchResearchReports: async () => mocks.reports }))
vi.mock('../earningsCallSummaries', () => ({ fetchCallSummary: async () => mocks.summary }))

const { fetchReviewQuarterlyBrief } = await import('../reviewBrief')

const post = (over: Record<string, unknown> = {}) => ({
  id: 900, security_id: 'GOOGL', report_type: 'post_earnings',
  fiscal_year: 2026, quarter: 3, parent_report_id: 800,
  created_at: '2026-10-29T00:00:00Z', thesis: 'The quarter in prose.',
  thesis_status: 'at_risk', estimates: [], street_questions: [],
  thesis_checks: [], risk_checks: [],
  ...over,
}) as never

describe('fetchReviewQuarterlyBrief', () => {
  it('builds the brief for the period the BRIEF names, not the review date', async () => {
    mocks.reports = [post()]
    mocks.summary = null
    const r = await fetchReviewQuarterlyBrief('GOOGL', 'Alphabet Inc.', post())
    expect(r.brief).not.toBeNull()
    expect(r.brief).toMatchObject({ fiscalYear: 2026, quarter: 3, ticker: 'GOOGL' })
    expect(r.absentReason).toBeNull()
  })

  it('records which report the review was drafted from', async () => {
    mocks.reports = [post()]
    const r = await fetchReviewQuarterlyBrief('GOOGL', null, post())
    expect(r.sourceReportId).toBe(900)
  })

  it('has no brief, and says why, when no post-brief exists', async () => {
    // The common case: most quarters carry nothing. The review is still
    // recorded; the document states the absence rather than omitting it.
    const r = await fetchReviewQuarterlyBrief('GOOGL', null, null)
    expect(r.brief).toBeNull()
    expect(r.sourceReportId).toBeNull()
    expect(r.absentReason).toMatch(/no post-earnings brief/i)
  })

  it('keeps the report link even when the period cannot be resolved', async () => {
    // A brief with no fiscal period still tells us what the review was drafted
    // from — losing that too would discard a fact we actually have.
    const r = await fetchReviewQuarterlyBrief('GOOGL', null, post({ fiscal_year: null, quarter: null }))
    expect(r.brief).toBeNull()
    expect(r.sourceReportId).toBe(900)
    expect(r.absentReason).toMatch(/no fiscal period/i)
  })

  it('pulls the pre-brief in through the post-brief’s parent, not by date', async () => {
    const pre = post({ id: 800, report_type: 'pre_earnings', parent_report_id: null,
                       created_at: '2026-10-20T00:00:00Z' })
    const decoy = post({ id: 801, report_type: 'pre_earnings', parent_report_id: null,
                         created_at: '2026-10-25T00:00:00Z' })
    mocks.reports = [decoy, pre]
    const r = await fetchReviewQuarterlyBrief('GOOGL', null, post())
    // The brief names its sources; the parent is the one that belongs to it.
    expect(r.brief!.sources.join(' ')).toMatch(/pre-earnings brief of Oct 20, 2026/)
  })
})
