import * as XLSX from 'xlsx'

export function isValidCalendarDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const y = parseInt(s.slice(0, 4), 10)
  const mo = parseInt(s.slice(5, 7), 10)
  const d = parseInt(s.slice(8, 10), 10)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  )
}

function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const utc = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function coerceDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10)
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 30000 && raw < 120000) return excelSerialToIsoDate(raw)
    if (raw > 1 && raw < 60000) return excelSerialToIsoDate(raw)
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s === '' || s === '—' || s === '-') return null
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
      const mm = parseInt(m[1], 10)
      const dd = parseInt(m[2], 10)
      const yyyy = parseInt(m[3], 10)
      const d = new Date(Date.UTC(yyyy, mm - 1, dd))
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && isValidCalendarDateString(s)) return s
  }
  return null
}

export function coerceNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    let s = raw.trim().replace(/,/g, '')
    if (s === '' || s === '—' || s === '-') return null
    // Strip % and $ after commas; keep digits for K/M/B/T suffixes (e.g. 1.14T, 4.22M).
    s = s.replace(/[%$]/g, '').trim()
    if (s === '') return null

    const scaled = parseScaledNumberSuffix(s)
    if (scaled !== null) return scaled

    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Parses numbers with optional K/M/B/T suffix. */
function parseScaledNumberSuffix(s: string): number | null {
  const t = s.trim()
  if (t === '' || /^n\/?a$/i.test(t)) return null
  const m = t.match(/^([+-]?\d*\.?\d+)\s*([KkMmBbTt])?$/)
  if (!m) return null
  const base = parseFloat(m[1])
  if (!Number.isFinite(base)) return null
  const suf = (m[2] || '').toUpperCase()
  const mult = suf === 'K' ? 1e3 : suf === 'M' ? 1e6 : suf === 'B' ? 1e9 : suf === 'T' ? 1e12 : 1
  return base * mult
}

/**
 * Rejects anything that isn't an Excel workbook. `.xlsm` is accepted because the
 * consolidated YCharts workbook is macro-enabled — its Workbook_Open macro drives
 * the unattended refresh, so the file it produces can only be `.xlsm`.
 */
export function assertExcelFile(file: File): void {
  if (!/\.xls[xm]?$/.test(file.name.toLowerCase())) {
    throw new Error('Please choose an Excel file (.xlsx, .xlsm, or .xls).')
  }
}

/**
 * Resolves a worksheet by name, falling back to the first sheet.
 *
 * Single-purpose workbooks put their data on sheet 0; the consolidated YCharts
 * workbook keeps every dataset in one file, so sheet 0 is whatever tab happens to
 * be leftmost. Matching by name first keeps both layouts working. Comparison is
 * trimmed and case-insensitive — the fund tab is literally named "Securities "
 * with a trailing space.
 */
export function pickSheetName(wb: XLSX.WorkBook, names: string[]): string {
  const wanted = names.map((n) => n.trim().toLowerCase())
  const match = wb.SheetNames.find((n) => wanted.includes(n.trim().toLowerCase()))
  if (match) return match
  const first = wb.SheetNames[0]
  if (!first) throw new Error('The workbook has no sheets.')
  return first
}
