import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { compareSizing, parseActualAllocations, readAllocationFile, lineupChange } from '../positionSizingCompare'
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

/**
 * The real header rows, copied from the two file shapes living in the live
 * `Portfolio Documents` bucket on 17 Nov 2026. Both carry `Ticker, Target` as
 * their first two columns and they mean opposite things.
 */
const HOLDINGS_HEADER = ['Security Ticker/CUSIP', 'Target']
const TEMPLATE_HEADER = [
  'Security Ticker/CUSIP', 'Target', 'Lower Tolerance', 'Higher Tolerance',
  'Cash Indicator (Y/N)', 'Alternate Products',
]

describe('lineupChange — drift across a rebalance is not drift', () => {
  // Foundation Conservative, 17 Nov 2026. Its last holdings file (2 Nov) is the
  // older SIX-holding book; the current targets are eight holdings, with part
  // of VBTLX having moved into VBILX, VMSAX and VWEAX. Against those targets
  // the file yields exactly one breach — VBTLX 34.00 against a 20.00-30.00
  // band — and that breach is the pre-rebalance weight, not a book out of
  // tolerance.
  const fcTargets = [
    { symbol: 'FXAIX', target: 21 }, { symbol: 'VBILX', target: 33 },
    { symbol: 'VBTLX', target: 25 }, { symbol: 'VFWAX', target: 5 },
    { symbol: 'VIMAX', target: 4 }, { symbol: 'VMSAX', target: 3 },
    { symbol: 'VWEAX', target: 7 }, { symbol: '$Cash', target: 2 },
  ]
  const fcFile = new Map([
    ['VIMAX', 4], ['VBTLX', 34], ['VBILX', 34], ['FDXCASH', 1], ['FXAIX', 22], ['VFWAX', 5],
  ])

  it('reports the two holdings the basis predates, and their target weight', () => {
    const c = lineupChange(fcTargets, fcFile)
    expect(c).not.toBeNull()
    expect(c!.missingFromBasis.sort()).toEqual(['VMSAX', 'VWEAX'])
    expect(c!.missingWeight).toBe(10)   // 3.00 + 7.00
    expect(c!.notInModel).toEqual([])
    expect(c!.offModelWeight).toBe(0)
  })

  it('returns null when the file matches the book name for name', () => {
    // Core Growth and Equity Income are both in this state: real drifted
    // weights over the same lineup, so their drift readings stay valid.
    const targets = [{ symbol: 'BSX', target: 2.5 }, { symbol: 'MSFT', target: 6 }, { symbol: '$Cash', target: 1 }]
    const file = new Map([['BSX', 1.22], ['MSFT', 6.7], ['FDXCASH', 0.86]])
    expect(lineupChange(targets, file)).toBeNull()
  })

  it('EXCLUDES cash from both sides', () => {
    // The file spells it FDXCASH and the book $Cash, and a file omitting its
    // cash row is common — counting it would make nearly every book read as
    // changed and cost them all their drift readings.
    expect(lineupChange(
      [{ symbol: '$Cash', target: 1 }, { symbol: 'MSFT', target: 6 }],
      new Map([['MSFT', 6.1]]),            // no cash row at all
    )).toBeNull()
    expect(lineupChange(
      [{ symbol: 'MSFT', target: 6 }],
      new Map([['MSFT', 6.1], ['FDXCASH', 0.9]]),  // cash in the file only
    )).toBeNull()
  })

  it('reports a file ticker that is not a holding, with its weight', () => {
    // ETF Conservative Balanced's shape: a basis naming funds the book does
    // not hold. (Its own file is a target template, so it is skipped upstream.)
    const c = lineupChange(
      [{ symbol: 'VOO', target: 10 }],
      new Map([['VOO', 17], ['CPLB', 14], ['SPMO', 7]]),
    )
    expect(c!.notInModel.sort()).toEqual(['CPLB', 'SPMO'])
    expect(c!.offModelWeight).toBe(21)
    expect(c!.missingFromBasis).toEqual([])
  })

  it('triggers on a single name, with no threshold', () => {
    // One holding bought since the upload still overstates every other weight.
    // The weights are returned so a caller can say how much moved; the remedy
    // is the same either way.
    const c = lineupChange(
      [{ symbol: 'MSFT', target: 6 }, { symbol: 'NVDA', target: 1 }],
      new Map([['MSFT', 6.1]]),
    )
    expect(c!.missingFromBasis).toEqual(['NVDA'])
    expect(c!.missingWeight).toBe(1)
  })

  it('matches case-insensitively and ignores surrounding space', () => {
    expect(lineupChange([{ symbol: ' msft ', target: 6 }], new Map([['MSFT', 6.1]]))).toBeNull()
  })
})

describe('readAllocationFile — a target file is not an actual allocation', () => {
  // The defect: both shapes parse, so a target file silently became "the
  // actual allocation" and the book was measured against itself. Hybrid
  // Balanced read zero drift for ever (false negative) while ETF Conservative
  // Balanced reported the difference between two target vintages as drift
  // (false positive).
  it('reads the two-column holdings export as holdings', () => {
    // Core Growth's real file: weights genuinely drifted off the targets.
    const f = readAllocationFile(workbook([HOLDINGS_HEADER, ['BSX', 1.22], ['MSFT', 6.7]]))
    expect(f.kind).toBe('holdings')
    expect(f.weights.get('BSX')).toBeCloseTo(1.22, 6)
  })

  it('reads the six-column rebalance template as targets', () => {
    // Hybrid Balanced's real file, whose 17 weights equal `positions` exactly.
    const f = readAllocationFile(workbook([
      TEMPLATE_HEADER,
      ['IDEQ', 4.5, 3.6, 5.4, 'N', null],
      ['BIMIX', 11.0, 8.8, 13.2, 'N', null],
    ]))
    expect(f.kind).toBe('targets')
    // The weights are still parsed — the caller decides what to do with them.
    expect(f.weights.get('BIMIX')).toBeCloseTo(11, 6)
  })

  it('keys on the HEADER, not on whether the weights match the targets', () => {
    // This is the whole design. Weight equality identifies Hybrid Balanced and
    // MISSES ETF Conservative Balanced, whose template carries a new lineup
    // against stale `positions` — so equality is a coincidence and provenance
    // is the fact. A template with drifted-looking weights is still a template.
    const f = readAllocationFile(workbook([
      TEMPLATE_HEADER, ['CPLB', 14.0, 11.2, 16.8, 'N', null], ['SPMO', 7.0, 5.6, 8.4, 'N', null],
    ]))
    expect(f.kind).toBe('targets')
  })

  it('takes ANY ONE template marker, so a trimmed export is still caught', () => {
    for (const marker of ['Lower Tolerance', 'Higher Tolerance', 'Upper Tolerance',
                          'Cash Indicator (Y/N)', 'Alternate Products']) {
      const f = readAllocationFile(workbook([['Ticker', 'Target', marker], ['AAPL', 5, 4]]))
      expect(f.kind, marker).toBe('targets')
    }
  })

  it('does not reclassify a file because a HOLDING NAME contains a marker', () => {
    // The markers are looked for on the header row only. A fund legitimately
    // called something like this must not turn its own file into a template.
    const f = readAllocationFile(workbook([
      HOLDINGS_HEADER, ['CASH INDICATOR FUND', 3], ['MSFT', 6.7],
    ]))
    expect(f.kind).toBe('holdings')
  })

  it('calls an empty parse unreadable whatever the header said', () => {
    // A dated long-format history file is the standing case: its first column
    // is a date, so every row is skipped. Template headers over no rows are
    // not a target vector either.
    expect(readAllocationFile(workbook([TEMPLATE_HEADER])).kind).toBe('unreadable')
    expect(readAllocationFile(workbook([['2026-11-09', 'IDEQ', 4.5]])).kind).toBe('unreadable')
  })

  it('parseActualAllocations still returns the weights for either kind', () => {
    // The hand-chosen-file paths keep it; only the measuring paths gate on kind.
    expect(parseActualAllocations(workbook([TEMPLATE_HEADER, ['IDEQ', 4.5, 3.6, 5.4, 'N', null]])).get('IDEQ'))
      .toBeCloseTo(4.5, 6)
  })
})

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

