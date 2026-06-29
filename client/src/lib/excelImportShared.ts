import * as XLSX from 'xlsx'

export function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

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

export function formatSupabaseUpdateError(err: {
  message: string
  details?: string
  hint?: string
  code?: string
}): string {
  const parts = [err.message, err.details, err.hint].filter(
    (p) => typeof p === 'string' && p.trim() !== '',
  )
  const base = parts.join(' — ')
  if (!base) return err.code ? `Database error (${err.code})` : 'Update failed'
  return err.code && !base.includes(err.code) ? `${base} (${err.code})` : base
}

export function parseVerticalKeyValueSheet(sheet: XLSX.WorkSheet): Record<string, unknown> {
  const ref = sheet['!ref']
  if (!ref) return {}
  const range = XLSX.utils.decode_range(ref)
  if (range.e.c < 1) return {}

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: null,
  })

  // Support both A/B layout (keys in col 0, values in col 1) and
  // B/C layout (col 0 empty, keys in col 1, values in col 2).
  const col0HasContent = rows.some(
    (r) => Array.isArray(r) && r[0] != null && String(r[0]).trim() !== '',
  )
  const keyCol = col0HasContent ? 0 : 1
  const valCol = keyCol + 1

  const out: Record<string, unknown> = {}
  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= keyCol) continue
    const keyCell = row[keyCol]
    if (keyCell == null || String(keyCell).trim() === '') continue
    const key = String(keyCell).trim()
    const val = row.length <= valCol ? null : row[valCol]
    out[key] = val
  }
  return out
}

const TICKER_HEADER_NORMALIZED = new Set([
  'ticker',
  'symbol',
  'ticker symbol',
  'fund ticker',
  'stock ticker',
  'etf ticker',
  'mutual fund ticker',
  'investment ticker',
  'underlying ticker',
])

export function isTickerColumnHeader(header: string): boolean {
  const n = normalizeHeader(header)
  if (TICKER_HEADER_NORMALIZED.has(n)) return true
  if (n.endsWith(' ticker') || n.endsWith(' symbol')) return true
  return false
}

export function getTickerFromRow(row: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(row)) {
    if (!isTickerColumnHeader(k)) continue
    if (v == null || v === '') continue
    let s = String(v).trim()
    // Strip exchange prefix (e.g. "M:APDFX" → "APDFX", "N:VOO" → "VOO")
    const colonIdx = s.indexOf(':')
    if (colonIdx !== -1) s = s.slice(colonIdx + 1).trim()
    if (s !== '') return s
  }
  return null
}

export function verifySymbolInKv(row: Record<string, unknown>, symbol: string): void {
  const sym = symbol.trim().toUpperCase()
  const v = getTickerFromRow(row)
  if (v == null || String(v).trim() === '') return
  if (String(v).trim().toUpperCase() !== sym) {
    throw new Error(
      `Excel Symbol is "${String(v).trim()}" but this page is "${symbol}". Use the correct file or symbol.`,
    )
  }
}

export function objectsFromHeaderRow(
  data: unknown[][],
  headerRowIndex: number,
): Record<string, unknown>[] {
  const headerRow = data[headerRowIndex]
  if (!Array.isArray(headerRow)) return []
  const headers = headerRow.map((c) => String(c ?? '').trim())
  const result: Record<string, unknown>[] = []
  for (let r = headerRowIndex + 1; r < data.length; r++) {
    const row = data[r]
    if (!Array.isArray(row)) continue
    const obj: Record<string, unknown> = {}
    let hasAny = false
    headers.forEach((h, i) => {
      if (h === '') return
      const v = row[i] ?? null
      obj[h] = v
      if (v != null && String(v).trim() !== '') hasAny = true
    })
    if (hasAny) result.push(obj)
  }
  return result
}

export function findRowForSymbol(
  rows: Record<string, unknown>[],
  symbol: string,
): Record<string, unknown> {
  const sym = symbol.trim().toUpperCase()

  // First: recognized ticker/symbol column header
  const match = rows.find((r) => {
    const t = getTickerFromRow(r)
    return t != null && t.toUpperCase() === sym
  })
  if (match) return match

  // Single-row sheet — use it unconditionally
  if (rows.length === 1) return rows[0]

  // Fallback: any cell in the row contains exactly the symbol string
  const cellMatch = rows.find((r) =>
    Object.values(r).some(
      (v) => v != null && typeof v === 'string' && v.trim().toUpperCase() === sym,
    ),
  )
  if (cellMatch) return cellMatch

  throw new Error(
    `No row with Ticker/Symbol matching "${symbol}". Add a Ticker column or use a one-row sheet.`,
  )
}

export function pickWideTableRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const defaultRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  })
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })
  if (!data.length) return defaultRows

  const candidates: Record<string, unknown>[][] = [defaultRows]
  for (let h = 1; h <= 4 && h < data.length; h++) {
    const objs = objectsFromHeaderRow(data, h)
    if (objs.length > 0) candidates.push(objs)
  }

  for (const rows of candidates) {
    if (rows.length === 0) continue
    const first = rows[0]
    if (Object.keys(first).some((k) => isTickerColumnHeader(k))) return rows
  }
  return defaultRows
}
