import { describe, it, expect } from 'vitest'
import { SKIP_COLS, BOOL_COLS } from '../fundBulkUpload'

/**
 * The YCharts "Securities" sheet loads `securities2`, and this importer has no
 * whitelist — it maps sheet headers straight to DB columns. SKIP_COLS is the
 * only thing standing between a column the DB no longer wants and a write.
 */
describe('Securities sheet → securities2 columns', () => {
  /**
   * `open_to_new_investors_generic` stopped being imported on 16 Nov 2026.
   *
   * The vendor read it false on three of 108 funds and TWO of the three —
   * VSMIX and MNHAX — were simply open. A flag whose purpose is to STRIKE a
   * fund from the alternatives list cannot be wrong more often than right: the
   * Hybrid
   * Balanced annual review excluded VSMIX — 100.0 on the scorecard and 18bp
   * cheaper than the holding it was compared against — on this column alone.
   *
   * It is also redundant: the watchlist is the advisor's own list of funds
   * they would buy, so one they cannot own never reaches it.
   *
   * The stored values stay and are maintained by hand. A comment alone has not
   * been enough in this repo before; re-adding the header to the import would
   * silently overwrite a correction on the next morning's refresh.
   */
  it('never imports open_to_new_investors_generic', () => {
    expect(SKIP_COLS.has('open_to_new_investors_generic')).toBe(true)
  })

  it('does not also coerce it as a boolean column', () => {
    // A header in SKIP_COLS is dropped before BOOL_COLS is consulted, so
    // listing it in both would be contradictory and misleading.
    expect(BOOL_COLS.has('open_to_new_investors_generic')).toBe(false)
  })

  it('keeps the two fund flags that are still read', () => {
    // `index_fund_generic` decides whether tracking error is graded at all
    // (lib/fundScorecard.ts), and `fund_of_funds_generic` changes how a
    // look-through figure is read. Both remain imported.
    for (const c of ['index_fund_generic', 'fund_of_funds_generic']) {
      expect(BOOL_COLS.has(c), c).toBe(true)
      expect(SKIP_COLS.has(c), c).toBe(false)
    }
  })

  /**
   * THE TEST THAT WOULD HAVE CAUGHT A REAL BUG, 16 Nov 2026.
   *
   * Both waiver columns were added to `BOOL_COLS` instead of `SKIP_COLS` and
   * merged to main that way. Nothing failed: the sheet headers had been
   * removed in the same change, so no row carried either column and the
   * verifying import passed. The defect only bites on an OLDER workbook —
   * exactly the case the skip exists to handle — where the columns would have
   * been coerced to booleans and SENT to a table that no longer has them,
   * failing the whole upsert batch.
   *
   * The no-overlap case below could not catch it, because an entry in the
   * wrong set alone is not an overlap. Assert the set each column belongs to.
   */
  it('skips both waiver columns, and does not coerce them as booleans', () => {
    for (const c of ['waiver_expense_ratio_generic', 'waiver_expiration_date']) {
      expect(SKIP_COLS.has(c), `${c} must be skipped`).toBe(true)
      expect(BOOL_COLS.has(c), `${c} must not be a bool col`).toBe(false)
    }
  })

  it('has no column in both sets', () => {
    // SKIP wins silently, so an overlap means someone believes a column is
    // imported when it is not.
    expect([...BOOL_COLS].filter((c) => SKIP_COLS.has(c))).toEqual([])
  })
})
