/**
 * fundBulkUpload.ts
 *
 * Bulk-upserts ETF / mutual fund rows from the New Fund Template Excel file
 * into `securities2`.
 *
 * Template layout:
 *   Row 0  – group-header labels  (disregarded)
 *   Row 1  – DB column names      (schema row)
 *   Row 2+ – one fund per row     (data rows)
 *
 * Col 0 is always empty and is skipped. `security_id` (col 1) is the upsert key.
 *
 * YCharts prefixes (e.g. "M:APDFX") are stripped from security_id before upload
 * so values match the plain-ticker format stored in securities2.
 */

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { coerceDate, coerceNumber, isValidCalendarDateString } from '@/lib/excelImportShared'

/** Comparison-metric columns stored on fund_alternatives (subset of the fund schema). */
const COMPARISON_METRIC_KEYS = [
  'expense_ratio_generic', 'historical_sharpe_3y', 'historical_sortino_3y',
  'quarterly_standard_deviation_annualized_3y', 'max_drawdown_3y',
  'one_month_total_return_nav', 'three_month_total_return_nav', 'ytd_total_return_nav',
  'one_year_total_return_nav', 'annualized_three_year_total_return_nav',
  'annualized_five_year_total_return_nav',
] as const

function pickComparisonMetrics(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of COMPARISON_METRIC_KEYS) if (rec[k] != null) out[k] = rec[k]
  return out
}

// ── Column classification ─────────────────────────────────────────────────────

/** DB column name remap: template header → actual securities2 column name. */
const COLUMN_REMAP: Record<string, string> = {
  inception_date_generic: 'inception_date',
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

/** Columns that must not be sent to Supabase (system / identity / unrelated). */
const SKIP_COLS = new Set([
  '',           // blank col 0
  'id',
  'created_at',
  'updated_at',
])

// ── Row-level parsing ─────────────────────────────────────────────────────────

function isErrString(v: unknown): boolean {
  return typeof v === 'string' && /^ERR\s*:/i.test(v.trim())
}

/**
 * Strip YCharts asset-class prefixes from security_id values.
 * e.g. "M:APDFX" → "APDFX", "E:SPY" → "SPY"
 */
function stripYChartsPrefix(raw: string): string {
  return raw.replace(/^[A-Z]{1,2}:/i, '').trim()
}

function coerceCell(col: string, raw: unknown): unknown {
  if (raw == null || raw === '' || isErrString(raw)) return undefined

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
  /** parent→related links written from the optional "Related" sheet */
  relatedLinked: number
}

const BATCH_SIZE = 50

export async function bulkUploadFundsFromExcel(file: File): Promise<BulkUploadResult> {
  if (!file.name.toLowerCase().match(/\.xlsx?$/)) {
    throw new Error('Please choose an Excel file (.xlsx or .xls).')
  }

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('The workbook has no sheets.')

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

  let succeeded = 0
  let failed = 0
  const errors: string[] = []

  const allSecurityIds = records.map((r) => r.security_id as string)

  // ── Step 1: find which security_ids already exist ────────────────────────────
  const existingIds = new Set<string>()
  for (let i = 0; i < allSecurityIds.length; i += BATCH_SIZE) {
    const { data } = await supabase
      .from('securities2')
      .select('security_id')
      .in('security_id', allSecurityIds.slice(i, i + BATCH_SIZE))
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

  // ── Step 4: optional "Related" sheet → fund_alternatives ─────────────────────
  // Layout: Col A non-empty marks a parent's security_id; the rows below it are
  // that parent's related/alternative funds (Col B = ticker, Col C+ = the same
  // metrics as the Securities sheet, so we reuse `colNames`). Each (parent,
  // related) row — link + comparison metrics inline — is written to the dedicated
  // fund_alternatives table. Comparison funds NEVER enter securities2 (which is
  // reserved for model-portfolio securities).
  let relatedLinked = 0
  const relatedSheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'related')
  if (relatedSheetName) {
    const relatedRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[relatedSheetName], {
      header: 1, raw: true, defval: null,
    })

    // parent → ordered list of fund_alternatives rows
    const altsByParent = new Map<string, Record<string, unknown>[]>()

    let currentParent: string | null = null
    for (const row of relatedRaw) {
      const values = row as unknown[]
      if (!values || values.every((v) => v == null || v === '')) continue
      const colA = values[0]
      if (colA != null && String(colA).trim() !== '') {
        currentParent = stripYChartsPrefix(String(colA).trim())
        if (!altsByParent.has(currentParent)) altsByParent.set(currentParent, [])
        continue // parent-marker row (also carries the header literals on the first block)
      }
      if (!currentParent) continue
      const rec = buildRecord(colNames, values)
      if (!rec) continue
      const list = altsByParent.get(currentParent)!
      list.push({
        parent_security_id: currentParent,
        related_security_id: rec.security_id,
        sort_order: list.length,
        security_name: rec.security_name ?? null,
        ...pickComparisonMetrics(rec),
      })
    }

    // Replace each parent's alternatives (delete + insert) so a re-upload refreshes cleanly.
    for (const [parent, alts] of altsByParent) {
      if (alts.length === 0) continue
      const { error: delErr } = await supabase
        .from('fund_alternatives').delete().eq('parent_security_id', parent)
      if (delErr) { errors.push(`${parent} alts clear: ${delErr.message}`); continue }
      const { error: insErr } = await supabase.from('fund_alternatives').insert(alts)
      if (insErr) errors.push(`${parent} alts: ${insErr.message}`)
      else relatedLinked += alts.length
    }
  }

  return { total: records.length, succeeded, failed, errors, relatedLinked }
}
