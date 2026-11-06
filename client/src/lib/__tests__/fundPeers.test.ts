import { describe, it, expect } from 'vitest'
import { buildFundPeerComparison, buildComposition, type HeldWeight } from '../fundPeers'
import type { SecurityDetail } from '../securities'

/**
 * These cover the rules the comparison encodes, each traceable to the Nov 2026
 * Foundation Conservative review — the case that showed the scorecard cannot
 * say whether two funds in a category are the same thing.
 */

const fund = (over: Record<string, unknown>) => ({
  security_id: 'X', security_name: 'X Fund', category_name: 'Intermediate Core Bond',
  scorecard_cohort: 'category', expense_ratio_generic: 0.05,
  ...over,
} as unknown as SecurityDetail)

const held = (m: Record<string, HeldWeight>) => new Map(Object.entries(m))

describe('one cohort for the whole table', () => {
  it('grades every row on the SUBJECT’s cohort, not each fund’s own', () => {
    // VBILX is graded on category and VBTLX on peer despite sharing both a
    // category and a peer group, and the printed totals reversed the order
    // every underlying metric produced. Forcing one cohort is the fix.
    const subject = fund({ security_id: 'VBILX', scorecard_cohort: 'category' })
    const mate = fund({ security_id: 'VBTLX', scorecard_cohort: 'peer' })
    const c = buildFundPeerComparison(subject, [subject, mate],
      held({ VBILX: { books: [{ portfolio: 'Foundation Conservative', pct: 33 }] },
             VBTLX: { books: [{ portfolio: 'Foundation Conservative', pct: 25 }] } }), new Set())
    expect(c.cohort).toBe('category')
    expect(c.rows).toHaveLength(2)
  })

  it('reports when the funds do NOT all designate that cohort', () => {
    // The scores stay comparable — that is the point — but they differ from
    // what each fund's own page shows, and the reader has to be told.
    const subject = fund({ security_id: 'VBILX', scorecard_cohort: 'category' })
    const mate = fund({ security_id: 'VBTLX', scorecard_cohort: 'peer' })
    // The mate has to be HELD to be in the table at all — a fund the firm has
    // no relationship with is excluded, so an unheld one could not disagree.
    const both = held({ VBTLX: { books: [{ portfolio: 'Foundation Conservative', pct: 25 }] } })
    expect(buildFundPeerComparison(subject, [subject, mate], both, new Set())
      .cohortIsUnanimous).toBe(false)
    expect(buildFundPeerComparison(subject, [subject], both, new Set())
      .cohortIsUnanimous).toBe(true)
  })

  it('defaults to category when the subject designates nothing', () => {
    // The house convention: 38 of 44 funds.
    const s = fund({ scorecard_cohort: null })
    expect(buildFundPeerComparison(s, [s], held({}), new Set()).cohort).toBe('category')
  })
})

describe('the breakdown reconciles, or says it cannot', () => {
  it('sums the FIVE bond sectors — cash and derivative sit outside them', () => {
    // Measured, not assumed: across the 29 funds reporting a bond breakdown,
    // these five land within 0.5pp of 100% on 28 (the 29th is an equity ETF
    // reporting zeros), while adding cash and derivative holds for only 14 and
    // reaches 120%. VBTLX's real figures.
    const c = buildComposition(fund({
      government_fixed_income_exposure_generic: 0.514,
      corporate_fixed_income_exposure_generic: 0.268,
      securitized_fixed_income_exposure_generic: 0.207,
      municipal_fixed_income_exposure_generic: 0.007,
      other_fixed_income_exposure_generic: 0.005,
      cash_fixed_income_exposure: 0.010,
      derivative_fixed_income_exposure: 0,
    }))
    expect(c.fixedIncomeSum).toBeCloseTo(1.0, 2)
    expect(c.fixedIncomeReconciles).toBe(true)
    expect(c.fixedIncome.map((f) => f.label))
      .toEqual(['Government', 'Corporate', 'Securitized', 'Municipal', 'Other'])
    // Reported, but deliberately outside the sleeve's 100%.
    expect(c.cashExposure).toBe(0.010)
    expect(c.derivativeExposure).toBe(0)
  })

  it('returns NULL reconciliation for a fund with no bond sleeve', () => {
    // IDEQ, an international equity ETF, reports the five as ZEROS rather than
    // nulls. Calling that a failed reconciliation would cry wolf on every
    // equity row in the book.
    const c = buildComposition(fund({
      government_fixed_income_exposure_generic: 0,
      corporate_fixed_income_exposure_generic: 0,
      securitized_fixed_income_exposure_generic: 0,
      municipal_fixed_income_exposure_generic: 0,
      other_fixed_income_exposure_generic: 0,
    }))
    expect(c.fixedIncomeSum).toBe(0)
    expect(c.fixedIncomeReconciles).toBeNull()
  })

  it('flags a sleeve that does NOT reconcile', () => {
    const c = buildComposition(fund({
      government_fixed_income_exposure_generic: 0.50,
      corporate_fixed_income_exposure_generic: 0.30,
      securitized_fixed_income_exposure_generic: 0.10,
      municipal_fixed_income_exposure_generic: 0,
      other_fixed_income_exposure_generic: 0,
    }))
    expect(c.fixedIncomeReconciles).toBe(false)
  })

  it('cannot reconcile a partial set, and says so', () => {
    // A sum over a partial set looks like a complete one.
    const partial = buildComposition(fund({
      government_fixed_income_exposure_generic: 0.514,
      corporate_fixed_income_exposure_generic: 0.268,
    }))
    expect(partial.fixedIncomeSum).toBeNull()
    expect(partial.fixedIncomeReconciles).toBeNull()
    // The gap is in the reconciliation, not the figures.
    expect(partial.fixedIncome.find((f) => f.label === 'Government')?.value).toBe(0.514)
  })

  it('carries a NEGATIVE derivative leg rather than clamping it', () => {
    // IAGG is the live case at -0.2%.
    expect(buildComposition(fund({ derivative_fixed_income_exposure: -0.002 }))
      .derivativeExposure).toBe(-0.002)
  })
})

describe('who is in the table and in what order', () => {
  it('gives an unheld idea a NULL weight, never zero', () => {
    // Zero would read as a position sized at nothing.
    const subject = fund({ security_id: 'VBILX' })
    const idea = fund({ security_id: 'NEWBOND' })
    const c = buildFundPeerComparison(subject, [subject, idea],
      held({ VBILX: { books: [{ portfolio: 'Foundation Conservative', pct: 33 }] } }),
      new Set(['NEWBOND']))
    const row = c.rows.find((r) => r.securityId === 'NEWBOND')!
    expect(row.role).toBe('watchlist')
    expect(row.maxWeightPct).toBeNull()
    expect(row.books).toEqual([])
  })

  it('reads from the subject outwards: subject, then holdings by weight, then ideas', () => {
    const subject = fund({ security_id: 'SUBJ' })
    const big = fund({ security_id: 'BIG' })
    const small = fund({ security_id: 'SMALL' })
    const idea = fund({ security_id: 'IDEA' })
    const c = buildFundPeerComparison(subject, [subject, small, big, idea],
      held({ SUBJ: { books: [{ portfolio: 'A', pct: 5 }] },
             BIG: { books: [{ portfolio: 'A', pct: 25 }] },
             SMALL: { books: [{ portfolio: 'A', pct: 3 }] } }), new Set(['IDEA']))
    expect(c.rows.map((r) => r.securityId)).toEqual(['SUBJ', 'BIG', 'SMALL', 'IDEA'])
  })

  it('excludes a fund in the category that is neither held nor watched', () => {
    // The universe is every fund in securities2; the comparison is only the
    // ones the firm actually has a relationship with.
    const subject = fund({ security_id: 'VBILX' })
    const stranger = fund({ security_id: 'STRANGER' })
    const c = buildFundPeerComparison(subject, [subject, stranger], held({}), new Set())
    expect(c.rows.map((r) => r.securityId)).toEqual(['VBILX'])
  })

  it('matches the category trimmed and case-insensitively', () => {
    // The vendor vocabulary is not consistent — gotcha 23 is the standing
    // example, where two spellings of one category were live at once.
    const subject = fund({ security_id: 'A', category_name: 'Intermediate Core Bond' })
    const other = fund({ security_id: 'B', category_name: '  intermediate core bond ' })
    const c = buildFundPeerComparison(subject, [subject, other], held({}), new Set(['B']))
    expect(c.rows.map((r) => r.securityId)).toEqual(['A', 'B'])
  })

  it('includes the subject even when it is absent from the universe', () => {
    // The fund being questioned is always in its own comparison.
    const subject = fund({ security_id: 'ONLY' })
    const c = buildFundPeerComparison(subject, [], held({}), new Set())
    expect(c.rows.map((r) => r.securityId)).toEqual(['ONLY'])
    expect(c.rows[0].role).toBe('subject')
  })
})

describe('a weight is a property of a book, not of the fund', () => {
  it('reports a RANGE across books and never a sum', () => {
    // Summing printed VBILX at "91%" across four Foundation books, which is
    // not a weight of anything — percentages of different portfolios cannot be
    // added, and weighting them properly needs market values the app lacks.
    const subject = fund({ security_id: 'VBILX' })
    const c = buildFundPeerComparison(subject, [subject], held({
      VBILX: { books: [
        { portfolio: 'Foundation Conservative', pct: 33 },
        { portfolio: 'Foundation Conservative Balanced', pct: 25 },
        { portfolio: 'Foundation Balanced', pct: 20 },
        { portfolio: 'Foundation Balanced with Growth', pct: 13 },
      ] },
    }), new Set())
    const row = c.rows[0]
    expect(row.books).toHaveLength(4)
    expect(row.maxWeightPct).toBe(33)
    // Heaviest first, so the range reads off the ends.
    expect(row.books.map((b) => b.pct)).toEqual([33, 25, 20, 13])
    expect(row.books.reduce((a, b) => a + b.pct, 0)).toBe(91) // the number NOT shown
  })

  it('orders holdings by their heaviest book', () => {
    const subject = fund({ security_id: 'SUBJ' })
    const wide = fund({ security_id: 'WIDE' })   // many small positions
    const deep = fund({ security_id: 'DEEP' })   // one large one
    const c = buildFundPeerComparison(subject, [subject, wide, deep], held({
      SUBJ: { books: [{ portfolio: 'A', pct: 1 }] },
      WIDE: { books: [{ portfolio: 'A', pct: 9 }, { portfolio: 'B', pct: 9 },
                      { portfolio: 'C', pct: 9 }] },
      DEEP: { books: [{ portfolio: 'A', pct: 20 }] },
    }), new Set())
    // DEEP outranks WIDE on its single 20% despite WIDE summing to 27.
    expect(c.rows.map((r) => r.securityId)).toEqual(['SUBJ', 'DEEP', 'WIDE'])
  })
})
