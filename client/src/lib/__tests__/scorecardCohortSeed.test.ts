import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCORECARD_COHORT,
  needsDefaultCohort,
  type CohortSeedInput,
} from '../securities'

/**
 * `needsDefaultCohort` decides whether a `securities2` row is given
 * `scorecard_cohort = 'category'` automatically — on every workbook import and
 * on every watchlist add. It writes a GOVERNED column, so each of its four
 * refusals is tested against the real shape that provokes it.
 *
 * The second group is the one that matters most. On 9 Nov 2026 the live book
 * held 54 stocks carrying a hand-set `category_name` and no cohort, so
 * "has a category and no cohort" describes every stock in the book; a
 * predicate that only tested those two columns would have written a fund-only
 * setting onto all 54.
 */

/** A watched fund the workbook has filled: the case that SHOULD be seeded. */
function fund(over: Partial<CohortSeedInput> = {}): CohortSeedInput {
  return {
    detailed_security_type: 'mutual_fund',
    peer_group_name: 'Multi-Cap Core Funds',
    fund_company_name: 'Victory Capital',
    fund_family: 'Victory',
    expense_ratio_generic: 0.89,
    category_name: 'Mid-Cap Blend',
    scorecard_cohort: null,
    is_benchmark_proxy: false,
    ...over,
  }
}

/**
 * A held stock as the live rows actually look: `detailed_security_type`
 * 'stock', a hand-set category, and NONE of the fund signals. Measured across
 * all 55 stock rows — zero carry a peer group, fund company, fund family or
 * expense ratio — which is why the classifier's fallback never reaches them.
 */
function stock(over: Partial<CohortSeedInput> = {}): CohortSeedInput {
  return {
    detailed_security_type: 'stock',
    peer_group_name: null,
    fund_company_name: null,
    fund_family: null,
    expense_ratio_generic: null,
    category_name: 'Large Cap Growth',
    scorecard_cohort: null,
    is_benchmark_proxy: false,
    ...over,
  }
}

describe('the default itself', () => {
  // `peer` is a human judgment about a mandate the Morningstar category
  // mis-describes (AVERX, FTZIX, IDHIX, VFMO). Nothing derives it, so the
  // default has to be the other one.
  it('is category, never peer', () => {
    expect(DEFAULT_SCORECARD_COHORT).toBe('category')
  })
})

describe('a tracked fund with no cohort', () => {
  it('is seeded', () => {
    expect(needsDefaultCohort(fund())).toBe(true)
  })

  // An ETF reaches the same answer by a different branch of the classifier.
  it('is seeded for an ETF too', () => {
    expect(needsDefaultCohort(fund({ detailed_security_type: 'etf' }))).toBe(true)
  })

  // The classifier's fallback path: no type, but fund-only signals present.
  it('is seeded when the type is blank but the fund signals are there', () => {
    expect(needsDefaultCohort(fund({ detailed_security_type: null }))).toBe(true)
  })
})

describe('an existing cohort is never overwritten', () => {
  // The six `peer` funds are hand-set. Re-deriving on every import would
  // revert them silently — the trap `ensureReviewSchedules` avoids by
  // filtering to the unscheduled first.
  it('leaves a hand-set peer alone', () => {
    expect(needsDefaultCohort(fund({ scorecard_cohort: 'peer' }))).toBe(false)
  })

  it('leaves an already-default category alone', () => {
    expect(needsDefaultCohort(fund({ scorecard_cohort: 'category' }))).toBe(false)
  })

  // Whitespace is not a value, but it is not a cohort either; treat a blank
  // string as unset rather than writing over something that looks set.
  it('treats a blank string as unset', () => {
    expect(needsDefaultCohort(fund({ scorecard_cohort: '   ' }))).toBe(true)
  })
})

describe('a stock never gets a fund cohort', () => {
  // THE case this file exists for: 54 live rows look exactly like this.
  it('refuses a held stock carrying a hand-set category', () => {
    expect(needsDefaultCohort(stock())).toBe(false)
  })

  // BRK.B — no type and no fund signals, so the classifier calls it a stock.
  it('refuses a stock with no detailed_security_type at all', () => {
    expect(needsDefaultCohort(stock({ detailed_security_type: null }))).toBe(false)
  })

  // Every STOCK_CATEGORY_OPTIONS value is a stock-grid name, and none of them
  // should ever reach the fund scorecard.
  it('refuses whatever the hand-set stock category says', () => {
    for (const c of ['Large Cap Core', 'Mid Cap Value', 'Small Cap Growth']) {
      expect(needsDefaultCohort(stock({ category_name: c }))).toBe(false)
    }
  })
})

describe('a benchmark proxy never gets one', () => {
  // All 33 of the live null cohorts are these. A proxy exists so an index's
  // composition has somewhere to live; it is not reviewed.
  it('refuses a flagged proxy', () => {
    expect(needsDefaultCohort(fund({ is_benchmark_proxy: true }))).toBe(false)
  })

  // `is_benchmark_proxy` already subtracts held ∪ watched, so a proxy that
  // gets bought or watched arrives here unflagged and becomes eligible. That
  // is why the import re-flags proxies BEFORE seeding.
  it('seeds a former proxy once it is no longer flagged', () => {
    expect(needsDefaultCohort(fund({ is_benchmark_proxy: false }))).toBe(true)
  })
})

describe('a fund the workbook has not reached yet', () => {
  // Keeps the Watchlist card honest: "Category pending" and "No cohort"
  // resolve in one step rather than the card clearing one and keeping the
  // other. There is also nothing to grade it against yet.
  it('waits for its category', () => {
    expect(needsDefaultCohort(fund({ category_name: null }))).toBe(false)
    expect(needsDefaultCohort(fund({ category_name: '  ' }))).toBe(false)
  })
})
