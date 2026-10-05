import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import {
  assertExcelFile, coerceDate, coerceNumber, isValidCalendarDateString, pickSheetName,
  ychartsError,
} from '@/lib/excelImportShared'

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

/**
 * `portfolio_strategy` is NOT NULL and the Model Portfolios sheet has no column
 * for it, so a row for a portfolio that doesn't exist yet has to derive one.
 *
 * Longest prefix first, so "Fixed Income Total Return" resolves to `Fixed Income`
 * rather than stopping at a shorter match. The two all-stock strategies don't
 * follow the prefix rule at all and are named outright.
 */
const STRATEGY_BY_NAME_PREFIX: [string, string][] = [
  ['Fixed Income', 'Fixed Income'],
  ['Foundation',   'Foundation'],
  ['Hybrid',       'Hybrid'],
  ['ETF',          'ETF'],
]
const EQUITY_PORTFOLIO_NAMES = new Set(['Core Growth', 'Equity Income', 'Equity Income & Core Growth'])

export function derivePortfolioStrategy(name: string): string | null {
  const n = name.trim()
  if (EQUITY_PORTFOLIO_NAMES.has(n)) return 'Equity'
  for (const [prefix, strategy] of STRATEGY_BY_NAME_PREFIX) {
    if (n.startsWith(prefix)) return strategy
  }
  return null
}

function looksLikeDbColumn(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const s = v.trim()
  return s.length > 1 && /^[a-z0-9][a-z0-9_+]*$/.test(s) && /[a-z_]/.test(s)
}

// ── Bulk horizontal upload ───────────────────────────────────────────────────
//
// Reads the "Model Portfolios" sheet (row 0 = headers, rows 1+ = data), falling
// back to sheet 0 for the older single-purpose workbook. "Model Returns" is the
// tab's previous name and is still accepted.

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
    // NO DATA is an answer, so clear the column; any other error is ambiguous
    // and must not blank a good stored value. See ychartsError.
    const err = ychartsError(raw)
    if (err === 'other') continue
    if (err === 'no_data') { patch[key] = null; continue }
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
): Promise<{ succeeded: number; created: number; failed: number; errors: string[] }> {
  assertExcelFile(file)

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[pickSheetName(wb, ['Model Portfolios', 'Model Returns'])]
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
  let created = 0
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
    const patch = buildPatchFromRow(headers, row)

    // No existing portfolio — create it, the way the fund importer inserts a stub
    // for an unknown security_id. Without this a portfolio added to the workbook
    // is reported as a failed row and never appears in the app.
    if (!portfolioName) {
      if (!secName) {
        failed++
        errors.push(`Row ${r + 1}: no security_name, cannot create portfolio (security_id="${secId}")`)
        continue
      }
      const strategy = derivePortfolioStrategy(secName)
      if (!strategy) {
        failed++
        errors.push(
          `Row ${r + 1}: "${secName}" is new, but its strategy could not be derived from the name — ` +
          `create the portfolio manually, then re-import to populate it.`,
        )
        continue
      }
      // description is NOT NULL; the sheet supplies it, '' is the documented fallback.
      const { error: insErr } = await supabase.from('portfolio').insert({
        name: secName,
        security_id: secId || null,
        portfolio_strategy: strategy,
        description: typeof patch.description === 'string' ? patch.description : '',
      })
      if (insErr) {
        failed++
        errors.push(`Row ${r + 1} (${secName}): could not create portfolio — ${insErr.message}`)
        continue
      }
      portfolioName = secName
      created++
    }
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

  return { succeeded, created, failed, errors }
}
