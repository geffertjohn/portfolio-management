import { describe, expect, it } from 'vitest'
import { buildQuarterlyBrief, canBuildQuarterlyBrief } from '../quarterlyBrief'
import type { ResearchReport } from '../researchReports'
import type { EarningsCallSummary } from '../earningsCallSummaries'

/**
 * The quarterly brief is shaped to be safe to hand to a CLIENT — that is the
 * whole reason it is not the internal brief with a new cover. So the test that
 * matters most is not what it contains but what it must never leak.
 */

const SECRET = 'SENTINEL_MUST_NOT_LEAK'

function post(): ResearchReport {
  return {
    id: 1, security_id: 'META', report_type: 'post_earnings',
    fiscal_year: 2026, quarter: 3, created_at: '2026-10-30T00:00:00Z',
    thesis: 'Operating margin fell on a one-time legal charge; ex-charge it rose.',
    thesis_status: 'intact',
    estimates: [
      { key: 'eps', label: 'EPS', unit: 'usd', estimate: 6.7, actual: 7.25, surprisePct: 0.082,
        low: 6.1, high: 7.4, analysts: 42, source: `${SECRET}_source` },
    ],
    thesis_checks: [
      { key: 'ads', title: 'Ad revenue growth', status: 'supported',
        finding: 'Ad revenue grew 26%, above the 15% the thesis requires.',
        metric: 'ad revenue YoY', test: `${SECRET}_breaktest`, watchFor: `${SECRET}_watchfor` },
      { key: 'quiet', title: 'Reality Labs', status: 'not_addressed', finding: '',
        metric: '', test: '', watchFor: '' },
    ],
    risk_checks: [
      { key: 'capex', title: 'Capex intensity', status: 'undermined',
        finding: 'Capex reached 43% of revenue, past the 30% the thesis treats as the limit.',
        metric: 'capex/revenue', test: `${SECRET}_breaktest2`, watchFor: '' },
    ],
    street_questions: [
      { key: 'q1', question: `${SECRET}_streetq`, why: `${SECRET}_why`, answered: 'no', answer: `${SECRET}_answer` },
    ],
    review_recommendations: [
      { portfolioName: 'Core Growth', weightPct: 7, recommendation: 'trim',
        rationale: `${SECRET}_rationale`, scorecardRead: `${SECRET}_scorecard`,
        openQuestions: [`${SECRET}_openq`] },
    ],
  } as unknown as ResearchReport
}

function summary(): EarningsCallSummary {
  return {
    id: 2, securityId: 'META', fiscalYear: 2026, quarter: 3, callDate: '2026-10-29',
    sentiment: 'neutral', sentimentSummary: 'Revenue beat; spending guidance dominated the call.',
    guidance: 'Capex guided higher again for next year.',
    highlights: [{ title: 'Ad revenue', detail: 'Grew 26% year over year.' }],
    lowlights: [{ title: 'Capex', detail: 'Rose to 43% of revenue.' }],
    transcriptDate: '2026-10-29', status: 'final',
  } as unknown as EarningsCallSummary
}

const input = (over: Partial<Parameters<typeof buildQuarterlyBrief>[0]> = {}) => ({
  ticker: 'META', companyName: 'Meta Platforms, Inc.',
  fiscalYear: 2026, quarter: 3, callDate: '2026-10-29',
  preBrief: null, postBrief: post(), summary: summary(),
  ...over,
})

describe('canBuildQuarterlyBrief', () => {
  it('needs a post-brief or a call summary', () => {
    expect(canBuildQuarterlyBrief({ post: [post()], summary: null })).toBe(true)
    expect(canBuildQuarterlyBrief({ post: [], summary: summary() })).toBe(true)
  })

  it('refuses a pre-brief alone — that quarter has not been lived through', () => {
    expect(canBuildQuarterlyBrief({ post: [], summary: null })).toBe(false)
  })
})

describe('what the brief must never carry', () => {
  /**
   * One assertion over the whole serialized document, so a field added to
   * `ResearchReport` later cannot quietly ride along into a client's hands.
   * Every held-back field in the fixture is tagged with the same sentinel:
   * allocation recommendations, open questions, the thesis BREAK TESTS, the
   * estimate ranges and analyst counts, and the street questions.
   */
  it('leaks no held-back field into any part of the output', () => {
    const source = input()
    // Self-validating: if the fixture ever stops carrying the sentinel, the
    // assertion below would pass while proving nothing.
    expect(JSON.stringify(source)).toContain(SECRET)
    expect(JSON.stringify(buildQuarterlyBrief(source))).not.toContain(SECRET)
  })

  it('keeps the plain-English finding while dropping the tripwire that produced it', () => {
    const brief = buildQuarterlyBrief(input())
    const capex = brief.view.find((v) => v.title === 'Capex intensity')!
    expect(capex.finding).toContain('43% of revenue')
    expect(JSON.stringify(capex)).not.toContain(SECRET)
  })

  it('drops a check the quarter did not speak to', () => {
    // A legitimate internal outcome, but noise in a document about what happened.
    expect(buildQuarterlyBrief(input()).view.map((v) => v.title))
      .toEqual(['Ad revenue growth', 'Capex intensity'])
  })
})

describe('what the brief does carry', () => {
  it('prefers the post-brief commentary as the account of the quarter', () => {
    expect(buildQuarterlyBrief(input()).headline).toContain('one-time legal charge')
  })

  it('falls back to the call summary when no post-brief was written', () => {
    const brief = buildQuarterlyBrief(input({ postBrief: null }))
    expect(brief.headline).toContain('spending guidance')
    expect(brief.thesisStatus).toBeNull()
    expect(brief.view).toEqual([])
  })

  it('reports expected against actual, and knows when nothing has printed', () => {
    const withActuals = buildQuarterlyBrief(input())
    expect(withActuals.hasActuals).toBe(true)
    expect(withActuals.results[0]).toMatchObject({ label: 'EPS', expected: 6.7, actual: 7.25 })

    const pre = { ...post(), estimates: [{ key: 'eps', label: 'EPS', unit: 'usd', estimate: 6.7 }] }
    const expectationsOnly = buildQuarterlyBrief(
      input({ postBrief: null, summary: summary(), preBrief: pre as unknown as ResearchReport }),
    )
    expect(expectationsOnly.hasActuals).toBe(false)
  })

  it('names every document it was drawn from', () => {
    const sources = buildQuarterlyBrief(input({ preBrief: post() })).sources
    expect(sources).toHaveLength(3)
    expect(sources.join(' ')).toMatch(/pre-earnings brief.*call summary.*post-earnings brief/)
  })
})
