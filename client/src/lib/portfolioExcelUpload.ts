import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { coerceDate, coerceNumber, isValidCalendarDateString } from '@/lib/excelImportShared'

const TEXT_COLS = new Set([
  'security_id',
  'security_name',
  'detailed_security_type',
  'description',
  'average_credit_quality_score',
])

const DATE_COLS = new Set([
  'earliest_performance_date',
  'all_time_high_date',
  'all_time_low_date',
  'year_high_date',
  'year_low_date',
])

const SKIP_COLS = new Set([
  'portfolio_strategy',
  'created_at',
  // Identifier columns — used for lookup only, not sent as DB update fields
  'security_name', // legacy Excel template identifier (DB column is now "name")
  'security_id',
])

function looksLikeDbColumn(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const s = v.trim()
  return s.length > 1 && /^[a-z0-9][a-z0-9_+]*$/.test(s) && /[a-z_]/.test(s)
}

// ── Bulk horizontal upload (Portfolio.xlsx: row 0 = headers, rows 1+ = data) ──

function buildPatchFromRow(
  headers: string[],
  row: unknown[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i]
    if (!key || SKIP_COLS.has(key)) continue
    const raw = row[i]
    if (raw == null || raw === '') continue
    if (typeof raw === 'string' && /^ERR\s*:/i.test(raw.trim())) continue
    if (DATE_COLS.has(key)) {
      const d = coerceDate(raw)
      if (d != null) patch[key] = d
    } else if (TEXT_COLS.has(key)) {
      const s = String(raw).trim()
      if (s !== '') patch[key] = s
    } else {
      const n = coerceNumber(raw)
      if (n != null) patch[key] = n
    }
  }
  return patch
}

export async function bulkUploadPortfoliosFromExcel(
  file: File,
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    throw new Error('Please choose an Excel file (.xlsx or .xls).')
  }

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  // Find the header row: first row where most values look like DB column names
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const hits = rawRows[i].filter((v) => looksLikeDbColumn(v)).length
    if (hits >= 5) { headerRowIdx = i; break }
  }
  if (headerRowIdx === -1) throw new Error('Could not find a header row with database column names.')

  const headers = rawRows[headerRowIdx].map((h) =>
    typeof h === 'string' ? h.trim() : '',
  )

  const secIdIdx = headers.indexOf('security_id')
  const secNameIdx = headers.indexOf('security_name')

  let succeeded = 0
  let failed = 0
  const errors: string[] = []

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r]
    if (row.every((v) => v == null || v === '')) continue

    // Resolve portfolio name
    const secId = secIdIdx >= 0 ? String(row[secIdIdx] ?? '').trim() : ''
    const secName = secNameIdx >= 0 ? String(row[secNameIdx] ?? '').trim() : ''
    let portfolioName: string | null = null

    if (secId) {
      const { data, error } = await supabase.from('portfolio').select('name').eq('security_id', secId).maybeSingle()
      if (error) throw error
      if (data?.name) portfolioName = data.name
    }
    if (!portfolioName && secName) {
      const { data, error } = await supabase.from('portfolio').select('name').eq('name', secName).maybeSingle()
      if (error) throw error
      if (data?.name) portfolioName = data.name
    }
    if (!portfolioName) {
      failed++
      errors.push(`Row ${r + 1}: could not match portfolio (security_id="${secId}", security_name="${secName}")`)
      continue
    }

    const patch = buildPatchFromRow(headers, row)
    const safe: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null) continue
      if (DATE_COLS.has(k)) {
        if (typeof v === 'string' && isValidCalendarDateString(v)) safe[k] = v
      } else if (TEXT_COLS.has(k)) {
        if (typeof v === 'string' && v !== '') safe[k] = v
      } else {
        if (typeof v === 'number' && Number.isFinite(v)) safe[k] = v
      }
    }

    if (Object.keys(safe).length === 0) continue

    const { error } = await supabase.from('portfolio').update(safe).eq('name', portfolioName)
    if (error) {
      failed++
      errors.push(`Row ${r + 1} (${portfolioName}): ${error.message}`)
    } else {
      succeeded++
    }
  }

  return { succeeded, failed, errors }
}
