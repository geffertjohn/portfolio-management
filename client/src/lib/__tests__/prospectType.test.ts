import { describe, it, expect } from 'vitest'
import { getProspectDisplayType, isFundIdea } from '../securities'

/**
 * A watchlist idea is usually NOT in `securities2` — that is the point of a
 * watchlist — so the classifier has no columns to read and its honest answer
 * with nothing to read is `stock`. These cover the seam where that matters:
 * whether an idea is offered a PORTFOLIO (stocks) or carries a CATEGORY
 * (funds), and whether the research job is allowed to run on it.
 */

describe('classifying a watchlist idea', () => {
  it('trusts securities2 over FMP when there is a row', () => {
    // YCharts owns fund classification here; FMP is the fallback, not the
    // authority. A disagreement must not flip a held fund to a stock.
    expect(getProspectDisplayType(
      { detailed_security_type: 'mutual_fund', peer_group_name: 'Core Bond Funds' },
      { isEtf: true, isFund: false },
    )).toBe('Mutual fund')
  })

  it('falls back to the FMP flags when the ticker is not in securities2', () => {
    // VUG on the day it was added: watched, not yet in securities2.
    expect(getProspectDisplayType(null, { isEtf: true, isFund: false })).toBe('ETF')
    expect(getProspectDisplayType(null, { isEtf: false, isFund: true })).toBe('Mutual fund')
  })

  it('calls an idea with NOTHING to read a stock', () => {
    // The honest answer, and the reason the research job may not rely on this
    // alone: it must ask FMP before running two company analysts on a ticker.
    expect(getProspectDisplayType(null, null)).toBe('Stock')
  })

  it('treats both fund shapes as funds and only a stock as a stock', () => {
    // isFundIdea drives three separate decisions — no portfolio picker, a
    // category pill instead of portfolio pills, and no "Awaiting committee"
    // badge — so an ETF must not fall through any of them.
    expect(isFundIdea('ETF')).toBe(true)
    expect(isFundIdea('Mutual fund')).toBe(true)
    expect(isFundIdea('Stock')).toBe(false)
  })
})
