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

  it('distinguishes "FMP has no record" from "FMP says stock"', () => {
    // fetchProfile builds a zero-valued Profile from an EMPTY response, so both
    // arrive as isEtf=false, isFund=false. Without `found` they are identical
    // and the unknown ticker is filed as a stock — which is exactly what
    // happened to RSIYX.
    expect(getProspectDisplayType(null, { isEtf: false, isFund: false, found: false }))
      .toBe('Mutual fund')
    expect(getProspectDisplayType(null, { isEtf: false, isFund: false, found: true }))
      .toBe('Stock')
  })

  it('calls a ticker FMP HAS NEVER HEARD OF a mutual fund, not a stock', () => {
    // This test asserted the opposite and was wrong. FMP covers US stocks
    // comprehensively but misses 11 of this book's 27 mutual funds, all
    // institutional share classes — so an empty profile is evidence, not
    // ignorance. RSIYX (Victory RS Investors Fund Y) is the live case: filed as
    // a stock, offered a portfolio picker and an "Awaiting committee" badge for
    // research that was never coming.
    //
    // `watchlist-tickers.cjs` had always defaulted this way, so the two
    // classifiers disagreed about the same ticker on the same day.
    expect(getProspectDisplayType(null, { found: false })).toBe('Mutual fund')
  })

  it('does not guess from a profile it has not fetched yet', () => {
    // `undefined` is "not asked", `null` is "asked, nothing came back". The
    // page must not collapse them: reading the second as the first is the bug
    // above. Pending stays provisional and settles within a request.
    expect(getProspectDisplayType(null, undefined)).toBe('Stock')
  })

  it('lets YCharts overrule FMP whenever it has an answer', () => {
    // The securities2 row comes from the workbook, which is the authority for
    // fund classification; FMP is only the stopgap before the next refresh.
    expect(getProspectDisplayType(
      { detailed_security_type: 'mutual_fund', peer_group_name: 'Core Bond Funds' },
      null,
    )).toBe('Mutual fund')
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
