/**
 * The Holdings sheet parser.
 *
 * Every fixture here is shaped like the real sheet: 26-row blocks, the fund
 * and the metric code on the block's first row, the holding and its weight in
 * C and D. The cases are the ones the live data actually produces — a bond
 * with no ticker, a YCharts foreign listing, a short list.
 */
import { describe, it, expect } from 'vitest'
import { parseHoldingsSheet, splitSymbolAndName } from '../fundHoldingsUpload'

const STRIDE = 26

/** Build a sheet the way `sheet_to_json({header:1})` hands it over. */
function sheet(blocks: { ticker: string; code?: string; rows: [unknown, unknown][] }[]): unknown[][] {
  const out: unknown[][] = []
  blocks.forEach((b, i) => {
    const top = i * STRIDE
    for (let r = 0; r < STRIDE; r++) out[top + r] = [null, null, null, null]
    out[top][0] = b.ticker
    out[top][1] = b.code ?? 'holdings_weight'
    b.rows.forEach((row, j) => { out[top + j][2] = row[0]; out[top + j][3] = row[1] })
  })
  return out
}

describe('blocks', () => {
  it('reads several funds stacked down the sheet', () => {
    const { byFund } = parseHoldingsSheet(sheet([
      { ticker: 'M:APDFX', rows: [['039956AA5', 0.031809], ['92840JAB5', 0.022693]] },
      { ticker: 'AVDE', rows: [['ASML', 0.012351], ['SHEL', 0.009091]] },
    ]))
    expect([...byFund.keys()]).toEqual(['APDFX', 'AVDE'])
    expect(byFund.get('AVDE')).toEqual([
      { security_id: 'AVDE', rank: 1, holding_symbol: 'ASML', holding_name: null, weight: 0.012351 },
      { security_id: 'AVDE', rank: 2, holding_symbol: 'SHEL', holding_name: null, weight: 0.009091 },
    ])
  })

  it('strips the YCharts prefix so the ticker matches securities2', () => {
    // The sheet carries `M:APDFX`; securities2 is keyed on `APDFX`. Getting
    // this wrong fails the foreign key for every mutual fund in the book.
    const { byFund } = parseHoldingsSheet(sheet([{ ticker: 'M:APDFX', rows: [['AAPL', 0.07]] }]))
    expect([...byFund.keys()]).toEqual(['APDFX'])
  })

  it('skips a block whose column B is not the metric code', () => {
    // Column B is the marker, so another List metric can be parked on the
    // sheet without a second convention to exclude it.
    const { byFund } = parseHoldingsSheet(sheet([
      { ticker: 'AVDE', rows: [['ASML', 0.012]] },
      { ticker: 'AVDE', code: 'holdings', rows: [['ASML', 0.012]] },
    ]))
    expect([...byFund.keys()]).toEqual(['AVDE'])
  })

  it('does not read past its own 25 rows into the next block', () => {
    // The blocks are adjacent with one blank row between them; a parser that
    // ran to the next non-empty row would attribute fund 2's holdings to
    // fund 1.
    const { byFund } = parseHoldingsSheet(sheet([
      { ticker: 'A', rows: Array.from({ length: 25 }, (_, i) => [`T${i}`, 0.01] as [unknown, unknown]) },
      { ticker: 'B', rows: [['ZZZZ', 0.5]] },
    ]))
    expect(byFund.get('A')).toHaveLength(25)
    expect(byFund.get('A')!.every((h) => h.holding_symbol !== 'ZZZZ')).toBe(true)
  })

  it('ranks by position and does not pad a short list', () => {
    const { byFund } = parseHoldingsSheet(sheet([{ ticker: 'X', rows: [['A', 0.1], ['B', 0.2]] }]))
    expect(byFund.get('X')?.map((h) => h.rank)).toEqual([1, 2])
  })

  it('says NOTHING about a fund YCharts has no holdings for', () => {
    // A wired block with no data is the normal state of a fund the vendor
    // does not publish holdings for. A warning here would fire every morning,
    // which is the signal-that-cries-wolf failure `never_run` already cost.
    const { byFund, warnings } = parseHoldingsSheet(sheet([{ ticker: 'X', rows: [] }]))
    expect(byFund.size).toBe(0)
    expect(warnings).toEqual([])
  })

  it('warns when one fund has two blocks', () => {
    // Keeping only the last silently would hide a duplicated block.
    const { warnings } = parseHoldingsSheet(sheet([
      { ticker: 'X', rows: [['A', 0.1]] },
      { ticker: 'X', rows: [['B', 0.2]] },
    ]))
    expect(warnings).toEqual(['X: appears in more than one block'])
  })
})

describe('one column carries both the symbol and the name', () => {
  it.each([
    ['ASML', 'ASML', null],
    ['BRK.B', 'BRK.B', null],
    ['039956AA5', '039956AA5', null],   // a CUSIP IS the identifier a bond has
    ['RHHVF:DL', 'RHHVF:DL', null],     // a YCharts foreign listing
  ])('keeps %s as a symbol', (raw, symbol, name) => {
    expect(splitSymbolAndName(raw)).toEqual({ symbol, name })
  })

  it.each([
    'RealTruck Group Inc FRN',
    'Intertape Polymer Group Inc 28-JUN-2028 Term Loan B',
    'GSM LLC [Ex- GSM Outdoors LLC] 30-SEP-2031 Term Loan B',
  ])('files %s as a name', (raw) => {
    // All three are live values from the first fund on the sheet. Keeping
    // these as holding_symbol would make the cross-fund overlap join match
    // on prose.
    expect(splitSymbolAndName(raw)).toEqual({ symbol: null, name: raw })
  })
})

describe('weights', () => {
  it('reads a percent that arrived as text', () => {
    const { byFund } = parseHoldingsSheet(sheet([{ ticker: 'X', rows: [['AAPL', '7.86%']] }]))
    expect(byFund.get('X')?.[0].weight).toBeCloseTo(0.0786, 6)
  })

  it('drops a YCharts error string rather than storing it', () => {
    const { byFund } = parseHoldingsSheet(sheet([{
      ticker: 'X', rows: [['AAPL', 0.0786], ['NVDA', 'ERR: NO DATA']],
    }]))
    expect(byFund.get('X')?.[1].weight).toBeNull()
  })
})
