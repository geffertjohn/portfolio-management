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

import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import {
  assertExcelFile, coerceDate, coerceNumber, isValidCalendarDateString, pickSheetName,
} from '@/lib/excelImportShared'

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

  return { total: records.length, succeeded, failed, errors }
}
