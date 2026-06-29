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

function detectSchemaDirectLayout(
  rows: unknown[][],
): { schemaCol: number; valCol: number } | null {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0)
  for (let c = 0; c < Math.min(maxCols, 3); c++) {
    const hits = rows.filter((r) => looksLikeDbColumn(r[c])).length
    if (hits >= 5) {
      let valCol = c + 1
      if (valCol < maxCols && valCol <= 2) {
        const colVals = rows.map((r) => r[valCol]).filter((v) => v != null && v !== '')
        const hasNumbers = colVals.some(
          (v) =>
            typeof v === 'number' ||
            (typeof v === 'string' &&
              String(v).trim() !== '' &&
              isFinite(Number(String(v).trim()))),
        )
        if (!hasNumbers) valCol = c + 2
      }
      if (valCol > 2) continue
      return { schemaCol: c, valCol }
    }
  }
  return null
}

function buildPatch(
  rows: unknown[][],
  schemaCol: number,
  valCol: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  for (const row of rows) {
    const colRaw = row[schemaCol]
    if (!looksLikeDbColumn(colRaw)) continue
    const key = String(colRaw).trim()
    if (SKIP_COLS.has(key)) continue

    const raw = row[valCol]
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

async function resolvePortfolioName(patch: Record<string, unknown>): Promise<string> {
  // 1 — match by YCharts portfolio identifier stored in security_id
  const secId = typeof patch.security_id === 'string' ? patch.security_id.trim() : null
  if (secId) {
    const { data } = await supabase
      .from('portfolio')
      .select('name')
      .eq('security_id', secId)
      .maybeSingle()
    if (data?.name) return data.name
  }

  // 2 — match by name directly ("ETF Conservative" etc.)
  // Excel templates may still use the legacy "security_name" key for this field
  const secName = typeof patch.security_name === 'string' ? patch.security_name.trim() : null
  if (secName) {
    const { data } = await supabase
      .from('portfolio')
      .select('name')
      .eq('name', secName)
      .maybeSingle()
    if (data?.name) return data.name
  }

  throw new Error(
    `Could not identify which portfolio to update. ` +
      `Ensure the template's "security_id" cell (C3) contains a previously saved portfolio identifier, ` +
      `or that "security_name" (C4) matches the full portfolio name exactly ` +
      `(e.g. "ETF Conservative", "Foundation Balanced with Growth").`,
  )
}

export async function buildPortfolioPatchFromExcel(
  file: File,
): Promise<{ portfolioName: string; patch: Record<string, unknown> }> {
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    throw new Error('Please choose an Excel file (.xlsx or .xls).')
  }

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const firstName = wb.SheetNames[0]
  if (!firstName) throw new Error('The workbook has no sheets.')
  const sheet = wb.Sheets[firstName]

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  const layout = detectSchemaDirectLayout(rawRows)
  if (!layout) {
    throw new Error(
      'Template format not recognised. ' +
        'Ensure column A contains database field names (e.g. "security_id", "expense_ratio") ' +
        'and column C contains the corresponding values.',
    )
  }

  const patch = buildPatch(rawRows, layout.schemaCol, layout.valCol)
  if (Object.keys(patch).length === 0) {
    throw new Error(
      'No values found in the template. ' +
        'Make sure column C is populated with data before uploading.',
    )
  }

  const portfolioName = await resolvePortfolioName(patch)
  return { portfolioName, patch }
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
