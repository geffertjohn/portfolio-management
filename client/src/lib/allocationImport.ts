/**
 * allocationImport.ts
 *
 * The one path from a YCharts dynamic allocation file to the three things it
 * drives: the History grid (`portfolio_allocations`), the Positions table
 * (`positions`, set from the newest snapshot), and the Change Log (derived from
 * the history, so it follows for free).
 *
 * Extracted from the Settings → Import/Export card when the Allocation tab
 * gained its own import, so the two cannot drift. Everything here is the card's
 * existing behaviour; the only addition is `checkAllocationImport`, which lets a
 * caller show what an import WOULD do before it does it.
 */
import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import {
  importAllocationSnapshots, parseYchartsDynamic, syncPositionsFromLatestSnapshot,
  normalizeSymbol, type ParsedDynamicAllocations, type PositionSyncResult,
} from './portfolioAllocations'
import type { ImportRunInput } from './importRuns'

/** File → the parsed long-format snapshots. Accepts .xlsx/.xlsm/.xls/.csv. */
export async function parseAllocationFile(file: File): Promise<ParsedDynamicAllocations> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })
  return parseYchartsDynamic(rows)
}

export interface AllocationDateSummary {
  effectiveDate: string
  holdings: number
  /** Percent points. A YCharts export should total 100. */
  total: number
}

export interface AllocationImportPreview {
  dates: AllocationDateSummary[]
  /** Distinct symbols across every date in the file. */
  symbols: string[]
  /** The snapshot that will become `positions`. */
  latestDate: string | null
  /**
   * Symbols in the LATEST snapshot that `securities2` does not have.
   *
   * Non-empty means the history will import but positions will NOT be touched
   * (`syncPositionsFromLatestSnapshot` is all-or-nothing). **These are not
   * created automatically.** For a fund or ETF the identity and metrics belong
   * to the YCharts workbook's `Securities` sheet — creating a row from a price
   * feed would both be the wrong source and leave a security the rest of the
   * app cannot render.
   */
  unknownSecurities: string[]
}

/** What an import of `parsed` would do, without doing it. */
export async function checkAllocationImport(
  parsed: ParsedDynamicAllocations,
): Promise<AllocationImportPreview> {
  const dates: AllocationDateSummary[] = parsed.dates.map((effectiveDate, i) => {
    let holdings = 0
    let total = 0
    for (const r of parsed.rows) {
      const w = r.weights[i]
      if (w != null && w !== 0) { holdings += 1; total += w }
    }
    return { effectiveDate, holdings, total }
  }).sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))

  const symbols = [...new Set(parsed.rows.map((r) => normalizeSymbol(r.security_id)))].sort()
  const latestDate = dates.length > 0 ? dates[0].effectiveDate : null

  let unknownSecurities: string[] = []
  if (latestDate) {
    const li = parsed.dates.indexOf(latestDate)
    const inLatest = [...new Set(
      parsed.rows
        .filter((r) => { const w = r.weights[li]; return w != null && w !== 0 })
        .map((r) => normalizeSymbol(r.security_id)),
    )]
    if (inLatest.length > 0) {
      const { data, error } = await supabase
        .from('securities2').select('security_id').in('security_id', inLatest)
      if (error) throw error
      const known = new Set((data ?? []).map((r) => r.security_id))
      unknownSecurities = inLatest.filter((s) => !known.has(s)).sort()
    }
  }

  return { dates, symbols, latestDate, unknownSecurities }
}

export interface AllocationImportResult {
  inserted: number
  dates: number
  sync: PositionSyncResult | null
  message: string
  /** For `recordImportRuns`. The CALLER records, so this is never logged twice. */
  runs: ImportRunInput[]
}

/**
 * Import the history and point positions at the newest snapshot.
 *
 * `replace` clears the portfolio's existing snapshots first, which is the right
 * default for a re-upload of the full history — the file IS the record. An
 * unknown ticker does NOT throw: the history landed and is worth keeping, so it
 * is reported and positions are left consistent-but-stale.
 */
export async function applyAllocationImport(
  portfolioName: string,
  parsed: ParsedDynamicAllocations,
  replace = true,
): Promise<AllocationImportResult> {
  const r = await importAllocationSnapshots(portfolioName, parsed, replace)
  const sync = await syncPositionsFromLatestSnapshot(portfolioName, parsed)

  const parts = [`Imported ${r.inserted} weights across ${r.dates} dates into ${portfolioName}`]
  const errors: string[] = []
  if (sync && sync.unknownSecurities.length > 0) {
    const msg =
      `positions NOT updated — ${sync.unknownSecurities.length} ticker(s) in the ` +
      `${sync.effectiveDate} snapshot are not in securities2: ${sync.unknownSecurities.join(', ')}. ` +
      `Add them to the YCharts workbook's Securities sheet and re-import.`
    parts.push(msg)
    errors.push(msg)
  } else if (sync) {
    parts.push(
      `positions set from ${sync.effectiveDate} (${sync.added} added, ` +
      `${sync.updated} updated, ${sync.removed} removed)`,
    )
  }

  return {
    inserted: r.inserted,
    dates: r.dates,
    sync,
    message: `${parts.join(' · ')}.`,
    runs: [{ source: 'ycharts_allocations', rows: r.inserted, errors }],
  }
}
