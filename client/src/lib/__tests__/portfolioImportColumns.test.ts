import { describe, it, expect } from 'vitest'
import { SKIP_COLS, TEXT_COLS } from '../portfolioExcelUpload'

/**
 * The YCharts "Model Portfolios" sheet loads the `portfolio` table, and it
 * still carries a `description` column holding the original scraped text.
 *
 * That column must never be imported again. The strategy narrative moved to
 * `model_portfolio_data.objective_statement` in Nov 2026 and
 * `portfolio.description` was blanked for every book, because
 * PortfolioDetailPage prefers ANY description over the objective. Re-importing
 * it would refill the column that wins, hiding the narrative and restoring the
 * un-cleaned `&nbsp;` copy — and the refresh is a daily LaunchAgent, so the
 * revert would happen overnight with nothing on screen to explain it.
 *
 * A comment alone has not been enough in this repo before; this fails loudly.
 */
describe('Model Portfolios sheet → portfolio columns', () => {
  it('never imports the sheet\'s description', () => {
    expect(SKIP_COLS.has('description')).toBe(true)
  })

  // Belt and braces: a header in SKIP_COLS is dropped before TEXT_COLS is
  // consulted, so listing it in both would be contradictory and misleading.
  it('does not also list description as a writable text column', () => {
    expect(TEXT_COLS.has('description')).toBe(false)
  })

  // The identifier columns are lookup-only; losing a skip here would send them
  // as update fields and 400 on `security_name`, whose DB column is now `name`.
  it('keeps the identifier columns lookup-only', () => {
    for (const c of ['security_id', 'security_name', 'portfolio_strategy']) {
      expect(SKIP_COLS.has(c)).toBe(true)
    }
  })

  // No column may be in both sets — SKIP wins silently, so an overlap means
  // someone believes a column is imported when it is not.
  it('has no column in both sets', () => {
    expect([...TEXT_COLS].filter((c) => SKIP_COLS.has(c))).toEqual([])
  })
})
