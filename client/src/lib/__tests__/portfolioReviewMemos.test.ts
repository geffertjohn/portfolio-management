import { describe, it, expect } from 'vitest'
import { committeeStage, type PortfolioReviewMemo } from '../portfolioReviewMemos'
import { reviewTasksFor } from '../portfolioReviews'

const memo = { id: 1, reviewLogId: 9 } as PortfolioReviewMemo

/**
 * The committee's stage is DERIVED from two facts — requested or not, and a
 * memo or not. There is deliberately no stored status column, because a third
 * fact could contradict either of the two it summarises.
 */
describe('committeeStage', () => {
  it('is not_requested before the handoff', () => {
    expect(committeeStage(null, null)).toBe('not_requested')
    expect(committeeStage(undefined, null)).toBe('not_requested')
  })

  it('is awaiting once handed off, while no memo exists', () => {
    expect(committeeStage('2026-11-04T18:00:00Z', null)).toBe('awaiting')
  })

  it('is delivered as soon as a memo exists', () => {
    expect(committeeStage('2026-11-04T18:00:00Z', memo)).toBe('delivered')
  })

  it('reports delivered even if the request stamp was cleared', () => {
    // Withdrawing a handoff after the committee has already written must not
    // hide their memo — the work exists and the review has to show it.
    expect(committeeStage(null, memo)).toBe('delivered')
  })
})

describe('the fund review task lists', () => {
  it('gives a fund ANNUAL the three evidence steps then the committee loop', () => {
    expect(reviewTasksFor('annual', 'Foundation').map((t) => t.key)).toEqual([
      'position_sizing',
      'performance_attribution',
      'scorecard_review',
      'considerations',
      'committee_review',
      'final_decision',
    ])
  })

  it('puts considerations BEFORE the committee, and the decision last', () => {
    // The order is the control. A proposal recorded after reading the
    // committee's view is not an independent one, and the record could not
    // show that it was.
    const keys = reviewTasksFor('annual', 'ETF').map((t) => t.key)
    expect(keys.indexOf('considerations')).toBeLessThan(keys.indexOf('committee_review'))
    expect(keys.indexOf('committee_review')).toBeLessThan(keys.indexOf('final_decision'))
  })

  it('drops the stock-shaped annual sections for fund books', () => {
    // deep_review asks whether the moat is intact and whether there is a
    // better STOCK for the same role; conviction_rankings ranks into 5-7% /
    // 3-5% bands that every holding in a five-fund book clears by construction.
    const keys = reviewTasksFor('annual', 'Hybrid').map((t) => t.key)
    expect(keys).not.toContain('deep_review')
    expect(keys).not.toContain('conviction_rankings')
    expect(keys).not.toContain('portfolio_construction')
  })

  it('leaves the EQUITY annual\u2019s own sections alone', () => {
    // Its four sections and their order are untouched by the fund work. The
    // two leading portfolio-level checks arrived later and for a different
    // reason: an annual absorbs the monthly that falls on its date, so it has
    // to carry that month's sizing and attribution.
    expect(reviewTasksFor('annual', 'Equity').map((t) => t.key)).toEqual([
      'position_sizing', 'performance_attribution',
      'deep_review', 'conviction_rankings', 'portfolio_construction', 'valuation_changes',
    ])
  })

  it('leaves the fund quarterly alone', () => {
    expect(reviewTasksFor('quarterly', 'Foundation').map((t) => t.key)).toEqual([
      'position_sizing', 'performance_attribution', 'scorecard_review',
    ])
  })
})
