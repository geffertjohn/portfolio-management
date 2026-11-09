import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { compareSizing, parseActualAllocations } from '../positionSizingCompare'
import type { PortfolioPosition } from '@/types/position'

/**
 * Display-only, but it is what tells the advisor a book has drifted out of its
 * model — so a holding it quietly fails to match is a breach nobody is shown.
 * `unmatchedPositions` and `unmatchedFile` exist to make that impossible, and
 * they are asserted here alongside the breaches.
 */

function pos(ticker: string, weight: number): PortfolioPosition {
  return {
    securityId: ticker, ticker, name: ticker, numericId: null,
    weight, lowerLimit: null, upperLimit: null,
  } as PortfolioPosition
}

/** A real one-sheet workbook, so the parser is exercised rather than stubbed. */
function workbook(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

const model = { drift_percentage: 20, cash_lower_limit: 1, cash_upper_limit: 8 }

describe('parseActualAllocations', () => {
  it('reads ticker and weight, upper-casing and trimming the ticker', () => {
    const m = parseActualAllocations(workbook([[' aapl ', 5.2], ['MSFT', 4]]))
    expect(m.get('AAPL')).toBeCloseTo(5.2, 6)
    expect(m.get('MSFT')).toBe(4)
  })

  it('skips the export header rows YCharts emits', () => {
    const m = parseActualAllocations(workbook([
      ['Security Ticker/CUSIP', 'Allocation'], ['Ticker', 'Weight'], ['AAPL', 5],
    ]))
    expect([...m.keys()]).toEqual(['AAPL'])
  })

  it('skips a row with no usable weight rather than reading it as zero', () => {
    const m = parseActualAllocations(workbook([['AAPL', null], ['MSFT', 'n/a'], ['NVDA', 3]]))
    expect([...m.keys()]).toEqual(['NVDA'])
  })

  it('sums a ticker that appears twice', () => {
    // One holding split across two lots is still one position.
    expect(parseActualAllocations(workbook([['AAPL', 3], ['AAPL', 2]])).get('AAPL')).toBe(5)
  })

  it('accepts a weight stored as text', () => {
    expect(parseActualAllocations(workbook([['AAPL', '5.5']])).get('AAPL')).toBeCloseTo(5.5, 6)
  })
})

describe('compareSizing', () => {
  it('surfaces only breaches, and counts the rest as within band', () => {
    const r = compareSizing(
      [pos('AAPL', 5), pos('MSFT', 5), pos('NVDA', 5)],
      model,
      new Map([['AAPL', 7], ['MSFT', 5.1], ['NVDA', 3]]),   // band is 4–6
    )
    expect(r.breaches.map((b) => [b.symbol, b.direction])).toEqual([['AAPL', 'over'], ['NVDA', 'under']])
    expect(r.withinCount).toBe(1)
  })

  it('reports the largest breach first', () => {
    const r = compareSizing(
      [pos('AAPL', 5), pos('NVDA', 5)],
      model,
      new Map([['AAPL', 6.5], ['NVDA', 9]]),
    )
    expect(r.breaches.map((b) => b.symbol)).toEqual(['NVDA', 'AAPL'])
    expect(r.breaches[0].breachBy).toBeCloseTo(3, 6)
  })

  it('does not call rounding noise a breach', () => {
    const r = compareSizing([pos('AAPL', 5)], model, new Map([['AAPL', 6.001]]))
    expect(r.breaches).toEqual([])
    expect(r.withinCount).toBe(1)
  })

  it('names a position the file never mentioned instead of passing it silently', () => {
    const r = compareSizing([pos('AAPL', 5), pos('MSFT', 5)], model, new Map([['AAPL', 5]]))
    expect(r.unmatchedPositions).toEqual(['MSFT'])
    expect(r.withinCount).toBe(1)
  })

  it('names a file holding that is not in the model at all', () => {
    // "Held outside the model" — the Foundation Conservative case.
    const r = compareSizing([pos('AAPL', 5)], model, new Map([['AAPL', 5], ['VWEAX', 7]]))
    expect(r.unmatchedFile).toEqual(['VWEAX'])
  })

  it('folds every cash spelling into the one cash position', () => {
    const r = compareSizing(
      [pos('AAPL', 5), pos('$Cash', 3)],
      model,
      new Map([['AAPL', 5], ['FDXCASH', 2], ['CASH', 1]]),   // 3 total, cash band 1–8
    )
    expect(r.unmatchedFile).toEqual([])          // never reported as off-model
    expect(r.unmatchedPositions).toEqual([])
    expect(r.breaches).toEqual([])
  })

  it('grades cash against the model cash limits, not a drift band', () => {
    const r = compareSizing([pos('$Cash', 3)], model, new Map([['$CASH', 9]]))
    expect(r.breaches).toHaveLength(1)
    expect(r.breaches[0]).toMatchObject({ direction: 'over', upper: 8 })
  })

  it('cannot flag a breach when the model sets no band', () => {
    const r = compareSizing([pos('AAPL', 5)], null, new Map([['AAPL', 99]]))
    expect(r.breaches).toEqual([])
    expect(r.withinCount).toBe(1)
  })
})

/**
 * `rows` is the whole book, added Nov 2026. The breach-only shape meant a
 * portfolio inside its limits — the normal case — rendered a verdict and a
 * count with no numbers behind it, in the evidence step of a documented
 * review. These assert the properties that make the table trustworthy: every
 * holding appears, and neither kind of mismatch is silently dropped.
 */
describe('compareSizing rows', () => {
  it('returns a row for every target position, breaching or not', () => {
    const r = compareSizing(
      [pos('AAPL', 5), pos('MSFT', 4), pos('NVDA', 3)],
      model,
      new Map([['AAPL', 5], ['MSFT', 9], ['NVDA', 3]]),
    )
    expect(r.rows.map((x) => x.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA'])
    expect(r.rows.map((x) => x.status)).toEqual(['within', 'over', 'within'])
  })

  it('sorts by target weight, heaviest first — the book as it is read', () => {
    // Not by breach size: re-ordering a book by what is wrong with it loses
    // the shape of the book, and the summary line already counts the breaches.
    const r = compareSizing(
      [pos('SMALL', 2), pos('BIG', 10), pos('MID', 5)],
      model,
      new Map([['SMALL', 2], ['BIG', 10], ['MID', 5]]),
    )
    expect(r.rows.map((x) => x.symbol)).toEqual(['BIG', 'MID', 'SMALL'])
  })

  it('carries a target absent from the file as a row, not only a footnote', () => {
    // A holding left out of a sizing review reads as one with nothing to
    // answer for — the same reasoning as the coverage report's unreadable rows.
    const r = compareSizing([pos('AAPL', 5), pos('MSFT', 4)], model, new Map([['AAPL', 5]]))
    const msft = r.rows.find((x) => x.symbol === 'MSFT')
    expect(msft?.status).toBe('missing')
    expect(msft?.actual).toBeNull()
    expect(msft?.drift).toBeNull()
    expect(r.unmatchedPositions).toEqual(['MSFT'])
  })

  it('carries an off-model holding as a row with no target, sorted last', () => {
    const r = compareSizing([pos('AAPL', 5)], model, new Map([['AAPL', 5], ['VWEAX', 7]]))
    expect(r.rows.map((x) => x.symbol)).toEqual(['AAPL', 'VWEAX'])
    const off = r.rows[1]
    expect(off.status).toBe('off_model')
    expect(off.target).toBeNull()
    expect(off.actual).toBe(7)
  })

  it('reports drift from target signed, so an overweight reads as positive', () => {
    const r = compareSizing([pos('AAPL', 5)], model, new Map([['AAPL', 5.4]]))
    expect(r.rows[0].drift).toBeCloseTo(0.4, 6)
    const u = compareSizing([pos('AAPL', 5)], model, new Map([['AAPL', 4.6]]))
    expect(u.rows[0].drift).toBeCloseTo(-0.4, 6)
  })

  it('totals EVERY weight in the file, off-model holdings included', () => {
    // A file that does not reconcile to 100% is a broken export, and a total
    // that counted only the matched rows would hide exactly that.
    const r = compareSizing([pos('AAPL', 5)], model, new Map([['AAPL', 5], ['VWEAX', 7]]))
    expect(r.actualTotal).toBeCloseTo(12, 6)
    expect(r.targetTotal).toBeCloseTo(5, 6)
  })

  it('folds cash-like file tickers into the one cash row', () => {
    // $Cash is a position; FDXCASH is how the export names it.
    const r = compareSizing([pos('$Cash', 3), pos('AAPL', 5)], model, new Map([['FDXCASH', 4], ['AAPL', 5]]))
    expect(r.rows.map((x) => x.symbol)).toEqual(['AAPL', '$Cash'])
    expect(r.rows.find((x) => x.symbol === '$Cash')?.actual).toBe(4)
    expect(r.unmatchedFile).toEqual([])
  })
})

