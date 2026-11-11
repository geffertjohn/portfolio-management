/**
 * fundHoldingsUpload.ts
 *
 * Loads the YCharts workbook's `Holdings` sheet into `fund_holdings`.
 *
 * WHY A SEPARATE SHEET. `YCI(ticker,"holdings_weight")` returns a LIST — 25
 * rows for ONE fund — while the `Securities` sheet is one row PER fund. Those
 * shapes do not reconcile on one grid: entering the formula there put the
 * row-3 fund's holdings into the next 24 funds' rows and, being a legacy CSE
 * array, locked those rows out of carrying a formula of their own.
 *
 * SHEET LAYOUT — blocks of 26 rows, stacked down the sheet:
 *
 *   row 1    A ='Securities '!B3   B holdings_weight   C1:D25   {=YCI(A1,B1)}
 *   row 27   A ='Securities '!B4   B holdings_weight   C27:D51  {=YCI(A27,B27)}
 *   …
 *
 * Column A carries the fund (a live reference to `Securities!B`, so the sheet
 * tracks that column by itself), B the metric code, C the holding and D its
 * weight as a decimal. The 26th row of each block is a blank separator.
 *
 * **The sheet is STATIC — no macro builds or rebuilds it.** An earlier version
 * had `EnsureHoldingsSheet` derive it from `Securities!B` on every run, which
 * put new, unproven code on the critical path of the daily refresh and cost
 * two runs. A pre-wired sheet is also the convention the `Securities` sheet
 * already follows, and — the part that decided it — a person opening the
 * workbook can SEE it. A sheet built only during an unattended run does not
 * exist until one succeeds, so there is no way to tell broken from not-yet-run.
 *
 * **`holdings_weight`, not `holdings`.** `holdings` also returns a name column,
 * but `holdings_weight` is what the sheet was built with and it carries what
 * the committee needs: the top 25 and their weights. Where a holding has no
 * ticker the vendor puts its description in the symbol column — `RealTruck
 * Group Inc FRN` rather than a CUSIP — so the name is not lost, it just
 * arrives in the same column. See `splitSymbolAndName`.
 */
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { assertExcelFile, stripYChartsPrefix, ychartsError } from '@/lib/excelImportShared'

const SHEET_NAME = 'Holdings'
const TICKER_COL = 0      // A
const CODE_COL = 1        // B
const HOLDING_COL = 2     // C
const WEIGHT_COL = 3      // D
const BLOCK_ROWS = 25     // the vendor returns the top 25
const EXPECTED_CODE = 'holdings_weight'

/**
 * Longer than this and it is a description, not a ticker.
 *
 * The vendor fills the symbol column with whatever identifies the holding, so
 * an equity returns `ASML` and a bank loan returns `Intertape Polymer Group
 * Inc 28-JUN-2028 Term Loan B`. Keeping the second as a `holding_symbol`
 * would make the cross-fund overlap join match on prose. A CUSIP is 9
 * characters and stays a symbol — it IS the only identifier a bond has — and
 * a YCharts foreign listing like `RHHVF:DL` fits too.
 */
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
  /** Sheet tickers with no `securities2` row — they cannot satisfy the FK. */
  unknownTickers: string[]
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function cellNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  if (ychartsError(raw) != null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim()
  const n = Number(s.replace(/%$/, ''))
  if (!Number.isFinite(n)) return null
  return s.endsWith('%') ? n / 100 : n
}

function cellText(raw: unknown): string | null {
  if (raw == null) return null
  if (ychartsError(raw) != null) return null
  const s = String(raw).trim()
  return s === '' ? null : s
}

/** One column carries both; length is what separates them. */
export function splitSymbolAndName(
  raw: unknown,
): { symbol: string | null; name: string | null } {
  const v = cellText(raw)
  if (v == null) return { symbol: null, name: null }
  return v.length <= MAX_SYMBOL_LEN ? { symbol: v, name: null } : { symbol: null, name: v }
}

export function parseHoldingsSheet(
  rows: unknown[][],
): { byFund: Map<string, Omit<FundHoldingRow, 'as_of'>[]>; warnings: string[] } {
  const byFund = new Map<string, Omit<FundHoldingRow, 'as_of'>[]>()
  const warnings: string[] = []

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []
    const sym = cellText(row[TICKER_COL])
    if (!sym) continue
    // The block marker. A block counts only when column B names the metric,
    // so another List metric can be parked on the sheet without needing a
    // second convention to exclude it.
    if (String(row[CODE_COL] ?? '').trim().toLowerCase() !== EXPECTED_CODE) continue

    const ticker = stripYChartsPrefix(sym).toUpperCase()
    const out: Omit<FundHoldingRow, 'as_of'>[] = []

    for (let i = 0; i < BLOCK_ROWS; i++) {
      const line = rows[r + i] ?? []
      const { symbol, name } = splitSymbolAndName(line[HOLDING_COL])
      const weight = cellNumber(line[WEIGHT_COL])
      if (symbol == null && name == null && weight == null) continue
      out.push({ security_id: ticker, rank: i + 1, holding_symbol: symbol, holding_name: name, weight })
    }

    if (out.length > 0) {
      // A fund appearing twice would silently keep only the last block.
      if (byFund.has(ticker)) warnings.push(`${ticker}: appears in more than one block`)
      byFund.set(ticker, out)
    }
  }

  return { byFund, warnings }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function bulkUploadFundHoldings(file: File): Promise<HoldingsUploadResult> {
  assertExcelFile(file)

  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = wb.SheetNames.find((n) => n.trim() === SHEET_NAME)
  if (!sheetName) {
    // Not an error, and NEVER a fallback to sheet 0 — `pickSheetName` would do
    // that and parse the benchmark tab as holdings. A workbook written before
    // this sheet existed is still a perfectly good workbook.
    return { funds: 0, rows: 0, errors: [], warnings: ['no Holdings sheet in this workbook'], unknownTickers: [] }
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1, raw: true, defval: null, blankrows: true,
  })

  const { byFund, warnings } = parseHoldingsSheet(rows)
  const errors: string[] = []
  const tickers = [...byFund.keys()]
  if (tickers.length === 0) {
    return { funds: 0, rows: 0, errors, warnings, unknownTickers: [] }
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

  return { funds, rows: written, errors, warnings, unknownTickers }
}
