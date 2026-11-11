/**
 * The Holdings sheet parser.
 *
 * The case that justifies this file is `detectLayout`. The reference workbook
 * documents `holdings` as "including weighting and symbol and name of
 * holding" — it names the three fields and NOT their order — so the parser
 * works the order out from the data. Every assertion here is about that
 * inference being right, or about failing visibly when it cannot be made.
 */
import { describe, it, expect } from 'vitest'
import { parseHoldingsSheet } from '../fundHoldingsUpload'

/** A sheet as `sheet_to_json({header:1})` hands it over: row 0 = tickers. */
function sheet(groups: { ticker: string; code?: string; rows: unknown[][] }[]): unknown[][] {
  const out: unknown[][] = Array.from({ length: 27 }, () => [])
  groups.forEach((g, i) => {
    const c = i * 3
    out[0][c] = g.ticker
    out[1][c] = g.code ?? 'holdings'
    g.rows.forEach((r, j) => { for (let k = 0; k < 3; k++) out[2 + j][c + k] = r[k] ?? null })
  })
  return out
}

const SPY = [
  ['AAPL', 'Apple Inc', 0.078573],
  ['NVDA', 'NVIDIA Corp', 0.06638],
  ['MSFT', 'Microsoft Corp', 0.062149],
]

describe('the column order is inferred, not assumed', () => {
  it.each([
    ['symbol, name, weight', (r: unknown[]) => [r[0], r[1], r[2]]],
    ['weight, symbol, name', (r: unknown[]) => [r[2], r[0], r[1]]],
    ['name, weight, symbol', (r: unknown[]) => [r[1], r[2], r[0]]],
  ])('finds every field with the columns in %s order', (_label, permute) => {
    const { byFund, layout } = parseHoldingsSheet(
      sheet([{ ticker: 'SPY', rows: SPY.map(permute) }]),
    )
    expect(layout).toBe(_label)
    expect(byFund.get('SPY')).toEqual([
      { security_id: 'SPY', rank: 1, holding_symbol: 'AAPL', holding_name: 'Apple Inc', weight: 0.078573 },
      { security_id: 'SPY', rank: 2, holding_symbol: 'NVDA', holding_name: 'NVIDIA Corp', weight: 0.06638 },
      { security_id: 'SPY', rank: 3, holding_symbol: 'MSFT', holding_name: 'Microsoft Corp', weight: 0.062149 },
    ])
  })

  it('tells symbol from name by LENGTH, not by position', () => {
    // The only thing separating the two text columns. A ticker is 1-5
    // characters and a CUSIP 9; a security name is a sentence by comparison.
    const { byFund } = parseHoldingsSheet(sheet([{
      ticker: 'SPY',
      rows: [['Berkshire Hathaway Inc Class B', 'BRK.B', 0.016446]],
    }]))
    expect(byFund.get('SPY')?.[0]).toMatchObject({
      holding_symbol: 'BRK.B', holding_name: 'Berkshire Hathaway Inc Class B',
    })
  })

  it('warns rather than guessing when no column is numeric', () => {
    const { byFund, warnings } = parseHoldingsSheet(sheet([{
      ticker: 'SPY', rows: [['AAPL', 'Apple Inc', 'n/a']],
    }]))
    expect(byFund.size).toBe(0)
    expect(warnings).toEqual(['SPY: could not tell which column is the weight'])
  })

  it('says NOTHING about a fund YCharts has no holdings for', () => {
    // An empty block is the normal state of a wired-but-unfetched fund. A
    // warning here would fire on every spare row every morning, which is the
    // signal-that-cries-wolf failure `never_run` already paid for.
    const { byFund, warnings } = parseHoldingsSheet(sheet([{ ticker: 'SPY', rows: [] }]))
    expect(byFund.size).toBe(0)
    expect(warnings).toEqual([])
  })
})

describe('what counts as a holdings group', () => {
  it('skips a group whose row 2 is not exactly "holdings"', () => {
    // Row 2 is the marker, so an extra column fetching some other List metric
    // can sit on the sheet without a second convention to exclude it.
    const { byFund } = parseHoldingsSheet(sheet([
      { ticker: 'SPY', rows: SPY },
      { ticker: 'SPY', code: 'holdings_weight', rows: [['AAPL', '', 0.078573]] },
    ]))
    expect([...byFund.keys()]).toEqual(['SPY'])
  })

  it('strips the YCharts prefix so the ticker matches securities2', () => {
    // The sheet carries `M:FTZIX`; securities2 is keyed on `FTZIX`. Getting
    // this wrong fails the foreign key for every mutual fund in the book.
    const { byFund } = parseHoldingsSheet(sheet([{ ticker: 'M:FTZIX', rows: SPY }]))
    expect([...byFund.keys()]).toEqual(['FTZIX'])
  })

  it('ranks by position and does not pad a short list', () => {
    // FTZIX holds 25 names; a fund holding 12 must yield 12 rows, not 12 and
    // 13 nulls — delete-then-insert relies on the row count being real.
    const { byFund } = parseHoldingsSheet(sheet([{ ticker: 'X', rows: SPY.slice(0, 2) }]))
    expect(byFund.get('X')?.map((h) => h.rank)).toEqual([1, 2])
  })
})

describe('a bond holding has no ticker', () => {
  it('files an unreadably long symbol as the NAME', () => {
    // The live case from the first attempt at this: a bank-loan fund returns
    // `Polymer Group Inc 28-JUN-2028 Term Loan B` where an equity fund
    // returns `AAPL`. Keeping that as holding_symbol would make the
    // cross-fund overlap join match on prose.
    const { byFund } = parseHoldingsSheet(sheet([{
      ticker: 'DHRIX', rows: [['Polymer Group Inc 28-JUN-2028 Term Loan B', null, 0.021]],
    }]))
    expect(byFund.get('DHRIX')?.[0]).toMatchObject({
      holding_symbol: null, holding_name: 'Polymer Group Inc 28-JUN-2028 Term Loan B',
    })
  })

  it('keeps a CUSIP as the symbol', () => {
    // 9 characters, under the cutoff, and it IS the identifier — the only one
    // a bond has.
    const { byFund } = parseHoldingsSheet(sheet([{
      ticker: 'DHRIX', rows: [['039956AA5', 'Argo Group 6.5% 2042', 0.013]],
    }]))
    expect(byFund.get('DHRIX')?.[0]).toMatchObject({
      holding_symbol: '039956AA5', holding_name: 'Argo Group 6.5% 2042',
    })
  })
})

describe('weights', () => {
  it('reads a percent that arrived as text', () => {
    // Depends on the cell's number format, which nothing here controls.
    const { byFund } = parseHoldingsSheet(sheet([{
      ticker: 'SPY', rows: [['AAPL', 'Apple Inc', '7.86%']],
    }]))
    expect(byFund.get('SPY')?.[0].weight).toBeCloseTo(0.0786, 6)
  })

  it('drops a YCharts error string rather than storing it', () => {
    const { byFund } = parseHoldingsSheet(sheet([{
      ticker: 'SPY',
      rows: [['AAPL', 'Apple Inc', 0.0786], ['NVDA', 'NVIDIA Corp', 'ERR: NO DATA']],
    }]))
    expect(byFund.get('SPY')?.[1].weight).toBeNull()
  })
})
