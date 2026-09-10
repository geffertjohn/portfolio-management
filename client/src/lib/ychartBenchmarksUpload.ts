/**
 * ychartBenchmarksUpload.ts
 *
 * Parses the four benchmark sheets of the YCharts workbook and upserts them into
 * the four benchmark tables. Sheets are matched by name, so extra tabs in the
 * consolidated workbook (Securities, Model Portfolios) are simply ignored:
 *   - category_benchmarks
 *   - peer_group_benchmarks
 *   - sector_benchmarks
 *   - model_portfolio_benchmarks
 *
 * Template structure (same for every sheet):
 *   Row 1  — empty
 *   Row 2  — section title (e.g. "Category Benchmarks")
 *   Row 3  — column header names (DB column names, with a few renames)
 *   Row 4+ — data rows
 *
 * Column renames applied before inserting to DB:
 *   sector_benchmarks      : Sector_ticker              → ticker
 *   model_portfolio_benchmarks:
 *     annualized_daily_one_year_total_return    → one_year_total_return
 *     annualized_daily_three_year_total_return  → annualized_three_year_total_return
 *     annualized_daily_five_year_total_return   → annualized_five_year_total_return
 */
import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { assertExcelFile } from './excelImportShared'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadResult = {
  inserted: number
  errors: string[]
  /**
   * Rows the workbook no longer accounts for. NOT errors — the import itself
   * succeeded — but they will never refresh again, so they need a human.
   */
  warnings: string[]
}

type TableConfig = {
  /** Supabase table name (also the Excel sheet name) */
  tableName: string
  /** Excel header → DB column rename map (only entries that differ) */
  columnRenames: Record<string, string>
  /** Columns that should stay as text strings (not coerced to number) */
  textCols: Set<string>
  /** Header name of the column used to detect whether a row has data (after rename) */
  keyCol: string
  /**
   * Conflict target for the upsert — a column (or comma-separated composite)
   * with a matching UNIQUE constraint. Upsert rather than delete+insert because
   * every one of these tables has manually-managed columns absent from the Excel
   * export; upsert updates only the columns in the payload and leaves the rest.
   */
  upsertOn: string
}

// ── Per-table configuration ───────────────────────────────────────────────────

const TABLE_CONFIGS: TableConfig[] = [
  {
    tableName: 'category_benchmarks',
    // No rename — the DB column is category_ticker (matches the Excel header directly)
    columnRenames: {},
    textCols: new Set(['category_ticker', 'category_benchmark', 'category', 'etf_proxy']),
    // A single ticker can serve multiple categories — (ticker, category) is the unique key
    keyCol: 'category_ticker',
    upsertOn: 'category_ticker,category',
  },
  {
    tableName: 'peer_group_benchmarks',
    columnRenames: {},
    textCols: new Set(['peer_group_ticker', 'peer_group_benchmark', 'peer_group_category']),
    keyCol: 'peer_group_ticker',
    // The Excel omits peer_group_benchmark for most rows (it's set manually in
    // the DB); upsert preserves that value and only updates metrics.
    upsertOn: 'peer_group_ticker,peer_group_category',
  },
  {
    tableName: 'sector_benchmarks',
    columnRenames: { Sector_ticker: 'ticker' },
    textCols: new Set(['ticker', 'sector_benchmarks', 'sector', 'etf_proxy']),
    keyCol: 'ticker',
    upsertOn: 'ticker',
  },
  {
    tableName: 'model_portfolio_benchmarks',
    columnRenames: {
      annualized_daily_one_year_total_return:   'one_year_total_return',
      annualized_daily_three_year_total_return: 'annualized_three_year_total_return',
      annualized_daily_five_year_total_return:  'annualized_five_year_total_return',
      // Excel says "bond_exposure"; the DB column is "total_exposure"
      north_america_bond_exposure_generic:      'north_america_total_exposure_generic',
    },
    textCols: new Set(['security_id', 'security_name']),
    keyCol: 'security_id',
    // Manually-managed columns (name, investment_objective) are preserved across
    // uploads — only the columns present in the Excel payload are updated.
    upsertOn: 'security_id',
  },
]

// ── Value coercers ────────────────────────────────────────────────────────────

function coerceNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '')
    if (/^ERR\s*:/i.test(s)) return null
    const n = parseFloat(s)
    return isFinite(n) ? n : null
  }
  return null
}

function coerceText(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' || /^ERR\s*:/i.test(s) ? null : s
}

// ── Sheet parser ──────────────────────────────────────────────────────────────

/**
 * Find the header row index by locating the first row with ≥3 non-null values.
 * Title rows have exactly 1 value; header rows have many column names.
 * Handles sheets whose used-range starts at row 2 (min_row=2 in openpyxl),
 * which causes XLSX.js to shift the array up by one compared to sheets
 * whose used-range starts at row 1.
 */
function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const nonNull = row.filter(v => v != null && v !== '').length
    if (nonNull >= 3) return i
  }
  return -1
}

/**
 * Parse a single sheet into DB-ready records.
 * Dynamically detects the header row (first row with ≥3 non-null values).
 */
function parseSheet(
  rows: unknown[][],
  config: TableConfig,
): Record<string, unknown>[] {
  const HEADER_ROW = findHeaderRowIndex(rows)
  if (HEADER_ROW === -1) return []
  const DATA_START  = HEADER_ROW + 1

  const headerRow = rows[HEADER_ROW]
  if (!headerRow) return []

  // Build index→dbColumn map from the header row, applying renames
  const colMap: Map<number, string> = new Map()
  for (let i = 0; i < headerRow.length; i++) {
    const raw = headerRow[i]
    if (raw == null || raw === '') continue
    const excelName = String(raw).trim()
    const dbName = config.columnRenames[excelName] ?? excelName
    colMap.set(i, dbName)
  }

  const records: Record<string, unknown>[] = []

  for (let ri = DATA_START; ri < rows.length; ri++) {
    const row = rows[ri]
    if (!row) continue

    const record: Record<string, unknown> = {}

    for (const [colIdx, dbCol] of colMap) {
      const val = row[colIdx]
      if (config.textCols.has(dbCol)) {
        const t = coerceText(val)
        if (t != null) record[dbCol] = t
      } else {
        const n = coerceNum(val)
        if (n != null) record[dbCol] = n
      }
    }

    // Only keep rows where the key column has a value
    if (record[config.keyCol]) {
      records.push(record)
    }
  }

  return records
}

// ── Table upsert ──────────────────────────────────────────────────────────────

async function upsertTable(
  config: TableConfig,
  records: Record<string, unknown>[],
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = []

  if (records.length === 0) return { inserted: 0, errors }

  const BATCH = 100
  let inserted = 0

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await (supabase as SupabaseClient)
      .from(config.tableName)
      .upsert(batch, { onConflict: config.upsertOn })
    if (error) {
      errors.push(`${config.tableName} batch ${Math.floor(i / BATCH) + 1}: ${error.message}`)
    } else {
      inserted += batch.length
    }
  }

  return { inserted, errors }
}

// ── Orphan detection ──────────────────────────────────────────────────────────

/**
 * Rows in the table that this import did not write.
 *
 * These tables upsert on a NATURAL key — (peer_group_ticker, peer_group_category)
 * and friends — so editing either half of that key in the workbook does not
 * update the row, it INSERTS a second one and abandons the first. Two such
 * duplicates appeared on 2026-09-10 alone: a peer group renamed singular →
 * plural, and a ticker corrected from ^BUHY2ICTR to ^BBUHY2ICTR.
 *
 * The failure is silent and nasty. The abandoned row keeps its old values
 * forever, and `fetchPeerGroupBenchmark` picks with `.limit(1)` and no ordering,
 * so a fund can bind to the stale copy while the page still shows a plausible
 * index name. Nothing anywhere said so.
 *
 * Never throws and never fails the import: this is a diagnostic, and the data is
 * already committed by the time it runs.
 */
async function findOrphans(
  config: TableConfig,
  records: Record<string, unknown>[],
): Promise<string[]> {
  const keys = config.upsertOn.split(',').map((c) => c.trim())
  const SEP = '\u0000'
  const keyOf = (row: Record<string, unknown>) =>
    keys.map((k) => String(row[k] ?? '').trim()).join(SEP)

  const { data, error } = await (supabase as SupabaseClient)
    .from(config.tableName)
    .select(keys.join(', '))
  if (error) {
    console.warn(`orphan check skipped for ${config.tableName} — ${error.message}`)
    return []
  }

  const written = new Set(records.map(keyOf))
  const orphans = (data ?? [])
    .map((row) => keyOf(row as unknown as Record<string, unknown>))
    .filter((k) => !written.has(k))
    .map((k) => k.split(SEP).filter(Boolean).join(' / '))

  if (orphans.length === 0) return []
  return [
    `${config.tableName}: ${orphans.length} row${orphans.length > 1 ? 's' : ''} ` +
    `no longer in the workbook — ${orphans.join('; ')}. ` +
    `These will never refresh again: delete them, or restore the ${keys.join(' + ')} to the sheet.`,
  ]
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse the four benchmark sheets of the YCharts workbook and upsert them into
 * the four benchmark tables.
 *
 * Every table config sets `upsertOn`, so this only ever inserts or updates —
 * a ticker present in the previous data but absent from the new file is left in
 * place, not removed. That is deliberate (these tables carry hand-managed
 * columns), but it means an edit to the natural key abandons a row rather than
 * moving it, so anything left behind is reported in `warnings`.
 */
export async function uploadYchartBenchmarks(file: File): Promise<UploadResult> {
  assertExcelFile(file)

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  let totalInserted = 0
  const allErrors: string[] = []
  const allWarnings: string[] = []

  for (const config of TABLE_CONFIGS) {
    const sheet = wb.Sheets[config.tableName]
    if (!sheet) {
      allErrors.push(`Sheet "${config.tableName}" not found in workbook.`)
      continue
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    })

    const records = parseSheet(rows, config)
    if (records.length === 0) {
      allErrors.push(`Sheet "${config.tableName}": no data rows found.`)
      continue
    }

    const { inserted, errors } = await upsertTable(config, records)
    totalInserted += inserted
    allErrors.push(...errors)

    // Only worth checking when every batch landed — a partial write would
    // report the rows it failed to write as orphans.
    if (errors.length === 0) {
      allWarnings.push(...await findOrphans(config, records))
    }
  }

  return { inserted: totalInserted, errors: allErrors, warnings: allWarnings }
}
