import { describe, expect, it } from 'vitest'
import { looksLikeList, parseTickerList } from '../tickerList'

/**
 * `parseTickerList` turns what a person typed or pasted into tickers for the
 * Add-to-watchlist modal. The cases below are the rules a reader would want to
 * know, not the regex restated.
 */

describe('the shapes people actually paste', () => {
  it('takes a comma-separated line', () => {
    expect(parseTickerList('VTI, SCHD, JEPI').tickers).toEqual(['VTI', 'SCHD', 'JEPI'])
  })

  // The spreadsheet column — the case this was written for.
  it('takes a pasted column, newlines and all', () => {
    expect(parseTickerList('VTI\nSCHD\r\nJEPI\n').tickers).toEqual(['VTI', 'SCHD', 'JEPI'])
  })

  it('takes spaces, tabs and semicolons, mixed', () => {
    expect(parseTickerList('VTI SCHD\tJEPI; VOO').tickers).toEqual(['VTI', 'SCHD', 'JEPI', 'VOO'])
  })

  it('takes a single ticker, which is still the common case', () => {
    expect(parseTickerList('vti').tickers).toEqual(['VTI'])
  })

  it('returns nothing for empty or blank input', () => {
    expect(parseTickerList('').tickers).toEqual([])
    expect(parseTickerList('   \n\t ').tickers).toEqual([])
  })
})

describe('what counts as a ticker', () => {
  /**
   * BOTH punctuation forms are load-bearing. This book holds `BRK.B`, and FMP
   * serves the same security as `BRK-B` (gotcha 16), so a rule rejecting
   * either would refuse a security the firm actually owns.
   */
  it('accepts a dot and a hyphen', () => {
    expect(parseTickerList('BRK.B BRK-B').tickers).toEqual(['BRK.B', 'BRK-B'])
  })

  it('uppercases', () => {
    expect(parseTickerList('brk.b').tickers).toEqual(['BRK.B'])
  })

  // The gate catches a stray price or a long word, not a symbol that may not
  // exist — that is FMP's and YCharts' question, and watching a ticker that
  // turns out not to exist costs one row.
  it('rejects a pasted price, and a word too long to be a ticker', () => {
    const r = parseTickerList('VTI $123.45 SCHD considering')
    expect(r.tickers).toEqual(['VTI', 'SCHD'])
    expect(r.rejected).toEqual(['$123.45', 'considering'])
  })

  /**
   * THE LIMITATION, stated rather than papered over: a SHORT word is
   * indistinguishable from a ticker, and no regex can fix that — `ALL`,
   * `ON`, `IT` and `BUY` are all real symbols, and `ALL` (Allstate) is held
   * in this book. So pasting prose will produce a chip or two of nonsense.
   *
   * That is the right trade: the chips are shown before anything is written,
   * each is removable, and a wrong one costs a row that `Remove` clears. The
   * opposite error — refusing a real ticker because it reads like a word —
   * is silent and would be blamed on the data.
   */
  it('cannot tell a short word from a ticker, and does not pretend to', () => {
    expect(parseTickerList('buy VTI now').tickers).toEqual(['BUY', 'VTI', 'NOW'])
  })

  it('preserves the original text of a reject, for a legible message', () => {
    expect(parseTickerList('VTI ABCDEFGHIJKL').rejected).toEqual(['ABCDEFGHIJKL'])
  })
})

describe('what it reports back', () => {
  // Silently losing rows out of a paste is the failure mode worth guarding:
  // the loss is invisible until somebody notices the idea was never recorded.
  it('reports rejects rather than dropping them quietly', () => {
    expect(parseTickerList('VTI, 12.5%, SCHD').rejected).toEqual(['12.5%'])
  })

  it('de-duplicates rejects, so a column of prices is one complaint', () => {
    expect(parseTickerList('$1 $1 $1').rejected).toEqual(['$1'])
  })

  it('de-duplicates tickers, case-insensitively', () => {
    expect(parseTickerList('VTI vti VTI SCHD').tickers).toEqual(['VTI', 'SCHD'])
  })

  // The advisor pasted a list in an order that may mean something to them.
  it('keeps first-seen order, never sorts', () => {
    expect(parseTickerList('ZZZ AAA MMM').tickers).toEqual(['ZZZ', 'AAA', 'MMM'])
  })
})

describe('looksLikeList', () => {
  // Once a separator appears the field has stopped being a search box, so the
  // dropdown of partial matches becomes noise.
  it('is false while a single symbol is being typed', () => {
    expect(looksLikeList('VT')).toBe(false)
    expect(looksLikeList('  VTI  ')).toBe(false)
  })

  it('is true once a separator appears', () => {
    expect(looksLikeList('VTI,')).toBe(true)
    expect(looksLikeList('VTI SCHD')).toBe(true)
    expect(looksLikeList('VTI\nSCHD')).toBe(true)
  })
})
