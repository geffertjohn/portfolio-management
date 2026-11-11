/**
 * fundHoldingsUpload.ts
 *
 * Loads the YCharts workbook's `Holdings` sheet into `fund_holdings`.
 *
 * WHY THIS IS A SEPARATE SHEET AND A SEPARATE IMPORTER. `YCI(ticker,
 * "holdings")` returns a LIST — the fund's top 25 holdings — while the
 * `Securities` sheet is one row PER fund. Those two shapes do not reconcile
 * on one grid: entering the formula there put one fund's 25 holdings into the
 * next 24 funds' rows and blocked those rows from carrying a formula of their
 * own. So holdings get a grid shaped like what the vendor returns, and a
 * loader that reads it.
 *
 * SHEET LAYOUT, written by `EnsureHoldingsSheet` in scripts/refresh/Ycharts.bas:
 *   row 1            the YCharts symbol, every HOLDING_COLS columns
 *   row 2            the metric code — a group counts ONLY if this reads
 *                    `holdings`, which is what keeps any future probe column
 *                    out of the import without needing a second convention
 *   rows 3..27       the 25 x 3 array: the fund's holdings
 */
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { assertExcelFile, pickSheetName, stripYChartsPrefix, ychartsError } from '@/lib/excelImportShared'

const SHEET_NAMES = ['Holdings']
const HEADER_ROW = 0        // zero-based: sheet row 1, the ticker
const CODE_ROW = 1          // sheet row 2, the metric code
const FIRST_DATA_ROW = 2    // sheet row 3
const HOLDING_ROWS = 25
const HOLDING_COLS = 3
const EXPECTED_CODE = 'holdings'

/** A symbol longer than this is a name that arrived in the symbol column. */
const MAX_SYMBOL_LEN = 12

export interface FundHoldingRow {
  security_id: string
  rank: number
  holding_symbol: string | null
  holding_name: string | null
  weight: number | null
  as_of: string | null
}

export interface HoldingsUploadResult {
  funds: number
  rows: number
  errors: string[]
  warnings: string[]
  /** The detected column order, e.g. `symbol, name, weight`. */
  layout: string | null
  /** Sheet tickers with no `securities2` row — they cannot satisfy the FK. */
  unknownTickers: string[]
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function cellNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  if (ychartsError(raw) != null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  // A percent may arrive as text ("7.86%") depending on the cell format.
  const s = String(raw).trim().replace(/%$/, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return String(raw).trim().endsWith('%') ? n / 100 : n
}

function cellText(raw: unknown): string | null {
  if (raw == null) return null
  if (ychartsError(raw) != null) return null
  const s = String(raw).trim()
  return s === '' ? null : s
}

/**
 * Which of the three columns is the weight, the symbol and the name.
 *
 * DETECTED, NOT ASSUMED, and this is the one judgement call in the file. The
 * reference workbook documents `holdings` only as "including weighting and
 * symbol and name of holding" — it states the three fields and not their
 * order, and the order is not derivable from anything else. The alternatives
 * were to hard-code a guess (wrong silently: weights land in a text column
 * and every holding reads as nameless) or to ship, look, and pin it a day
 * later. Detection is deterministic here because the three fields are not
 * alike: exactly one is numeric, and of the two text fields a ticker is
 * short where a security name is not.
 *
 * It reports what it found rather than only using it, so the detection is
 * checkable against the sheet instead of being taken on trust.
 */
function detectLayout(block: unknown[][]): { weight: number; symbol: number; name: number } | null {
  const numeric: number[] = []
  const meanLen: number[] = []

  for (let c = 0; c < HOLDING_COLS; c++) {
    let nums = 0, texts = 0, len = 0
    for (const row of block) {
      const raw = row[c]
      if (raw == null || raw === '') continue
      if (typeof raw === 'number' || cellNumber(raw) != null) nums++
      const t = cellText(raw)
      if (t != null) { texts++; len += t.length }
    }
    if (nums > 0 && nums >= texts) numeric.push(c)
    meanLen[c] = texts > 0 ? len / texts : 0
  }

  if (numeric.length !== 1) return null
  const weight = numeric[0]
  const rest = [0, 1, 2].filter((c) => c !== weight)
  // The shorter of the two text columns is the symbol. A CUSIP is 9
  // characters and a ticker 1-5; a security name is a sentence by comparison.
  const [symbol, name] = meanLen[rest[0]] <= meanLen[rest[1]] ? rest : [rest[1], rest[0]]
  return { weight, symbol, name }
}

export function parseHoldingsSheet(
  rows: unknown[][],
): { byFund: Map<string, Omit<FundHoldingRow, 'as_of'>[]>; layout: string | null; warnings: string[] } {
  const byFund = new Map<string, Omit<FundHoldingRow, 'as_of'>[]>()
  const warnings: string[] = []
  let layoutLabel: string | null = null

  const header = rows[HEADER_ROW] ?? []
  const codes = rows[CODE_ROW] ?? []

  for (let c = 0; c < header.length; c += 1) {
    const sym = cellText(header[c])
    if (!sym) continue
    // The group marker. Anything whose row 2 is not exactly `holdings` is not
    // a holdings group and is skipped without comment.
    if (String(codes[c] ?? '').trim().toLowerCase() !== EXPECTED_CODE) continue

    const ticker = stripYChartsPrefix(sym).toUpperCase()
    const block: unknown[][] = []
    for (let r = FIRST_DATA_ROW; r < FIRST_DATA_ROW + HOLDING_ROWS; r++) {
      const row = rows[r] ?? []
      block.push([row[c], row[c + 1], row[c + 2]])
    }

    const layout = detectLayout(block)
    if (!layout) {
      // A fund YCharts has no holdings for comes back entirely empty, which is
      // not a defect and must not be reported as one.
      const anyValue = block.some((row) => row.some((v) => cellText(v) != null))
      if (anyValue) warnings.push(`${ticker}: could not tell which column is the weight`)
      continue
    }
    if (layoutLabel == null) {
      const names = ['', '', '']
      names[layout.symbol] = 'symbol'; names[layout.name] = 'name'; names[layout.weight] = 'weight'
      layoutLabel = names.join(', ')
    }

    const out: Omit<FundHoldingRow, 'as_of'>[] = []
    for (let i = 0; i < block.length; i++) {
      const symbolRaw = cellText(block[i][layout.symbol])
      const nameRaw = cellText(block[i][layout.name])
      const weight = cellNumber(block[i][layout.weight])
      if (symbolRaw == null && nameRaw == null && weight == null) continue

      // A bond holding has no ticker, so the vendor puts its description in
      // the symbol column. Keeping that as a `holding_symbol` would make the
      // overlap join match on prose.
      const symbol = symbolRaw != null && symbolRaw.length <= MAX_SYMBOL_LEN ? symbolRaw : null
      const name = nameRaw ?? (symbol == null ? symbolRaw : null)

      out.push({
        security_id: ticker,
        rank: i + 1,
        holding_symbol: symbol,
        holding_name: name,
        weight,
      })
    }
    if (out.length > 0) byFund.set(ticker, out)
  }

  return { byFund, layout: layoutLabel, warnings }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function bulkUploadFundHoldings(file: File): Promise<HoldingsUploadResult> {
  assertExcelFile(file)

  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = wb.SheetNames.find((n) => SHEET_NAMES.includes(n.trim()))
  if (!sheetName) {
    // Not an error. A workbook written before the Holdings sheet existed is
    // still a perfectly good workbook, and failing the import over a missing
    // optional sheet would take the fund data down with it.
    return { funds: 0, rows: 0, errors: [], warnings: ['no Holdings sheet in this workbook'], layout: null, unknownTickers: [] }
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[pickSheetName(wb, SHEET_NAMES)], {
    header: 1, raw: true, defval: null, blankrows: true,
  })

  const { byFund, layout, warnings } = parseHoldingsSheet(rows)
  const errors: string[] = []
  const tickers = [...byFund.keys()]
  if (tickers.length === 0) {
    return { funds: 0, rows: 0, errors, warnings, layout, unknownTickers: [] }
  }

  // The FK means an unknown ticker fails its whole batch, so resolve first and
  // report rather than discovering it as a write error. It also supplies
  // `as_of`: the holdings date lives on securities2, and copying it onto each
  // row makes a holdings row self-describing for anyone joining to it.
  const { data: known, error: knownErr } = await supabase
    .from('securities2')
    .select('security_id, latest_holdings_date')
    .in('security_id', tickers)
  if (knownErr) throw knownErr

  const asOf = new Map<string, string | null>()
  for (const r of known ?? []) asOf.set(r.security_id, r.latest_holdings_date)
  const unknownTickers = tickers.filter((t) => !asOf.has(t))

  let funds = 0
  let written = 0
  for (const ticker of tickers) {
    if (!asOf.has(ticker)) continue
    const rowsFor: FundHoldingRow[] = byFund.get(ticker)!.map((h) => ({
      ...h, as_of: asOf.get(ticker) ?? null,
    }))

    // Delete-then-insert per fund, never upsert. A fund whose list shortens —
    // 25 names last month, 20 this month — would otherwise keep ranks 21-25
    // from the previous holdings date, mixing two as-of dates in one list
    // with nothing on the row to show it.
    const { error: delErr } = await supabase.from('fund_holdings').delete().eq('security_id', ticker)
    if (delErr) { errors.push(`${ticker}: ${delErr.message}`); continue }

    const { error: insErr } = await supabase.from('fund_holdings').insert(rowsFor)
    if (insErr) { errors.push(`${ticker}: ${insErr.message}`); continue }

    funds++
    written += rowsFor.length
  }

  if (unknownTickers.length > 0) {
    warnings.push(
      `${unknownTickers.length} fund(s) on the Holdings sheet have no securities2 row and were skipped: ` +
      unknownTickers.slice(0, 8).join(', ') + (unknownTickers.length > 8 ? ', …' : ''),
    )
  }

  return { funds, rows: written, errors, warnings, layout, unknownTickers }
}
