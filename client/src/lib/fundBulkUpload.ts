/**
 * fundBulkUpload.ts
 *
 * Bulk-upserts ETF / mutual fund rows from the YCharts fund template into
 * `securities2`.
 *
 * Reads the "Securities" sheet, falling back to sheet 0 for the older
 * single-purpose workbook whose only data tab was leftmost. The workbook's other
 * tabs are ignored — the benchmark and model-portfolio sheets have their own
 * importers.
 *
 * Sheet layout:
 *   Row 0  – group-header labels  (disregarded)
 *   Row 1  – DB column names      (schema row)
 *   Row 2+ – one fund per row     (data rows)
 *
 * Col 0 is always empty and is skipped. `security_id` (col 1) is the upsert key.
 *
 * YCharts prefixes (e.g. "M:APDFX") are stripped from security_id before upload
 * so values match the plain-ticker format stored in securities2.
 */

import { unmappedCategories as unmappedCategoriesIn } from './assetClass'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import {
  assertExcelFile, coerceDate, coerceNumber, isValidCalendarDateString, pickSheetName,
  ychartsError,
} from '@/lib/excelImportShared'

// ── Column classification ─────────────────────────────────────────────────────

/** DB column name remap: template header → actual securities2 column name. */
const COLUMN_REMAP: Record<string, string> = {
  inception_date_generic: 'inception_date',
  // A Postgres identifier cannot start with a digit, and the sheet's header IS
  // the YCharts metric code — it is passed as the argument to YCP() as well as
  // read as a column name — so the header has to keep the digit and the DB
  // column takes the spelled-out form.
  '1_year_fund_level_flows_to_aum': 'one_year_fund_level_flows_to_aum',
}

const TEXT_COLS = new Set([
  'security_id',
  'security_name',
  'detailed_security_type',
  'investment_strategy',
  'fund_family',
  'fund_company_name',
  'broad_category_group',
  'broad_asset_class',
  'category_name',
  'category_index',
  'peer_group_name',
  'ycharts_benchmark_category',
])

const DATE_COLS = new Set([
  'inception_date',
])

/**
 * Columns that must not be sent to Supabase.
 *
 * This importer has no whitelist — it maps sheet headers straight to DB columns —
 * so a header with no matching column fails the row's update outright. The
 * ten-year family is still produced by the Securities sheet but was dropped from
 * `securities2` (Sep 2026): nothing displayed it, since the return tables and
 * scorecards stop at 5Y. Skipping it here keeps the scheduled import working
 * until those columns are removed from the workbook; once they are, these
 * entries become harmless no-ops rather than a trap.
 */
const SKIP_COLS = new Set([
  '',           // blank col 0
  'id',
  'created_at',
  'updated_at',
  // Dropped from securities2 — still in the sheet, read by nothing.
  'assets_under_management',
  'discount_or_premium_to_nav',
  'annualized_ten_year_total_return_nav',
  'category_ten_year_total_return',
  'peer_group_ten_year_total_return',
  'ten_year_total_return_rank_nav',
  'ten_year_total_return_rank_category_size_nav',
  'ten_year_total_return_peer_group_rank_nav',
  'ten_year_total_return_peer_group_size_nav',
  // The category and peer-group AVERAGE returns. Dropped Sep 2026 with the
  // fund Total Performance block, which was their last reader — the rank
  // tables show the cohort's BENCHMARK instead, which is a different figure.
  'category_one_month_total_return',
  'category_three_month_total_return',
  'category_ytd_total_return',
  'category_one_year_total_return',
  'category_three_year_total_return',
  'category_five_year_total_return',
  'peer_group_one_month_total_return',
  'peer_group_three_month_total_return',
  'peer_group_ytd_total_return',
  'peer_group_one_year_total_return',
  'peer_group_three_year_total_return',
  'peer_group_five_year_total_return',
])

// ── Row-level parsing ─────────────────────────────────────────────────────────

/**
 * Strip YCharts asset-class prefixes from security_id values.
 * e.g. "M:APDFX" → "APDFX", "E:SPY" → "SPY"
 */
function stripYChartsPrefix(raw: string): string {
  return raw.replace(/^[A-Z]{1,2}:/i, '').trim()
}

/** `undefined` leaves the stored value alone; `null` clears it. */
function coerceCell(col: string, raw: unknown): unknown {
  if (raw == null || raw === '') return undefined
  const err = ychartsError(raw)
  if (err === 'other') return undefined
  if (err === 'no_data') return null

  if (DATE_COLS.has(col)) {
    const d = coerceDate(raw)
    if (d == null || !isValidCalendarDateString(d)) return undefined
    return d
  }

  if (TEXT_COLS.has(col)) {
    let s = String(raw).trim()
    if (col === 'security_id') s = stripYChartsPrefix(s)
    return s !== '' ? s : undefined
  }

  return coerceNumber(raw) ?? undefined
}

function buildRecord(
  colNames: string[],
  rowValues: unknown[],
): Record<string, unknown> | null {
  const record: Record<string, unknown> = {}

  for (let i = 0; i < colNames.length; i++) {
    const rawCol = colNames[i]
    if (!rawCol) continue
    const col = COLUMN_REMAP[rawCol] ?? rawCol
    if (SKIP_COLS.has(col)) continue

    const coerced = coerceCell(col, rowValues[i])
    if (coerced !== undefined) record[col] = coerced
  }

  // Must have a non-empty security_id to be a valid row
  if (!record.security_id || typeof record.security_id !== 'string') return null

  return record
}

// ── Public API ────────────────────────────────────────────────────────────────

export type BulkUploadResult = {
  total: number
  succeeded: number
  failed: number
  errors: string[]
  /**
   * Vendor categories in this workbook that `resolveAssetClass` cannot place.
   *
   * **Deliberately NOT an error.** The row writes fine; what breaks is
   * downstream, where the holding's weight drops out of the allocation rollup
   * and surfaces only as an "unclassified weight" line on one portfolio page
   * (gotcha 23). Putting it in `errors` would mark a clean import partial and
   * push a false failure into `import_runs`.
   *
   * It is reported HERE because the workbook is where a new vocabulary
   * enters. Three of the four emerging-market holdings sat unclassified across
   * six portfolios because Morningstar publishes both "Diversified Emerging
   * Mkts" and "Diversified Emerging Markets" and only one was mapped — and the
   * import that introduced the second spelling said nothing.
   */
  unmappedCategories: string[]
}

const BATCH_SIZE = 50

export async function bulkUploadFundsFromExcel(file: File): Promise<BulkUploadResult> {
  assertExcelFile(file)

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = pickSheetName(wb, ['Securities'])

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  })

  // Row 0 = group headers (skip), Row 1 = schema, Rows 2+ = data
  if (rawRows.length < 2) throw new Error('Template appears empty — no schema row found.')

  const schemaRow = rawRows[1] as unknown[]
  const colNames: string[] = schemaRow.map((v) =>
    v != null && v !== '' ? String(v).trim() : '',
  )

  const dataRows = rawRows.slice(2)
  if (dataRows.length === 0) throw new Error('No data rows found (template has schema but no fund rows).')

  const records: Record<string, unknown>[] = []
  for (const row of dataRows) {
    const values = row as unknown[]
    if (values.every((v) => v == null || v === '')) continue
    const rec = buildRecord(colNames, values)
    if (rec) records.push(rec)
  }

  if (records.length === 0) throw new Error('No valid fund rows found in the file.')

  const unmapped = unmappedCategoriesIn(records.map((r) => r.category_name as string | null))

  let succeeded = 0
  let failed = 0
  const errors: string[] = []

  const allSecurityIds = records.map((r) => r.security_id as string)

  // ── Step 1: find which security_ids already exist ────────────────────────────
  const existingIds = new Set<string>()
  for (let i = 0; i < allSecurityIds.length; i += BATCH_SIZE) {
    const { data, error } = await supabase
      .from('securities2')
      .select('security_id')
      .in('security_id', allSecurityIds.slice(i, i + BATCH_SIZE))
    if (error) throw error
    for (const row of data ?? []) existingIds.add(row.security_id)
  }

  // ── Step 2: insert stubs for new securities only ─────────────────────────────
  // Using plain .insert() (not .upsert()) so PostgreSQL auto-generates `id` from
  // the bigserial sequence. PostgREST's upsert with a non-PK conflict target
  // explicitly sets id=NULL in the INSERT, bypassing the sequence default.
  const newIds = allSecurityIds.filter((id) => !existingIds.has(id))
  for (let i = 0; i < newIds.length; i += BATCH_SIZE) {
    const batch = newIds.slice(i, i + BATCH_SIZE).map((id) => ({ security_id: id }))
    const { error } = await supabase.from('securities2').insert(batch)
    if (error) {
      // Mark the corresponding records as failed so Step 3 skips them
      const failedIds = new Set(batch.map((r) => r.security_id))
      records
        .filter((r) => failedIds.has(r.security_id as string))
        .forEach((r) => errors.push(`${r.security_id}: ${error.message}`))
      failed += batch.length
    }
  }

  // ── Step 3: update full column data for all rows ─────────────────────────────
  // Pure .update() — never inserts, never touches id.
  const failedIds = new Set(errors.map((e) => e.split(':')[0]))
  const updateOps = records
    .filter((r) => !failedIds.has(r.security_id as string))
    .map((record) => {
      const { security_id, ...data } = record
      return supabase
        .from('securities2')
        .update(data)
        .eq('security_id', security_id as string)
    })

  for (let i = 0; i < updateOps.length; i += BATCH_SIZE) {
    const results = await Promise.all(updateOps.slice(i, i + BATCH_SIZE))
    for (let j = 0; j < results.length; j++) {
      if (results[j].error) {
        failed++
        errors.push(`${records[i + j].security_id}: ${results[j].error!.message}`)
      } else {
        succeeded++
      }
    }
  }

  await markBenchmarkProxies()

  return { total: records.length, succeeded, failed, errors, unmappedCategories: unmapped }
}

/**
 * Recompute `securities2.is_benchmark_proxy`.
 *
 * The 33 ETF proxies have to live in `securities2` because that is where the
 * composition columns are — a benchmark is an index, and YCharts computes no
 * composition for one. But they are not securities the firm tracks, and
 * `securities2` membership is read as exactly that by five pickers and by the
 * Watchlist card's routing.
 *
 * RECOMPUTED, never set once, so it cannot drift from the three facts that
 * define it. A ticker that is both a proxy and a holding is FALSE here and
 * behaves as the holding it is — which is why the held and watched sets are
 * subtracted rather than the proxy list simply being flagged.
 *
 * It never throws. The securities are already written by the time this runs,
 * and a failure to re-flag must not report a good import as failed — the same
 * reasoning as `recordImportRuns` and `ensureReviewSchedules`.
 */
async function markBenchmarkProxies(): Promise<void> {
  try {
    const [cat, sec, held, watched] = await Promise.all([
      supabase.from('category_benchmarks').select('etf_proxy'),
      supabase.from('sector_benchmarks').select('etf_proxy'),
      supabase.from('positions').select('security_id').is('deleted_at', null),
      supabase.from('prospects').select('security_id').is('removed_at', null),
    ])
    if (cat.error || sec.error || held.error || watched.error) return

    const exempt = new Set([
      ...(held.data ?? []).map((r) => r.security_id),
      ...(watched.data ?? []).map((r) => r.security_id),
    ])
    const proxies = [...new Set([...(cat.data ?? []), ...(sec.data ?? [])]
      .map((r) => r.etf_proxy)
      .filter((t): t is string => !!t && !exempt.has(t)))]

    // Clear first, so a ticker that has since been bought stops being hidden.
    await supabase.from('securities2').update({ is_benchmark_proxy: false })
      .eq('is_benchmark_proxy', true)
    if (proxies.length > 0) {
      await supabase.from('securities2').update({ is_benchmark_proxy: true })
        .in('security_id', proxies)
    }
  } catch {
    // Deliberately silent: see the docstring.
  }
}
