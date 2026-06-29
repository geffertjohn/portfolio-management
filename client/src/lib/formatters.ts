/**
 * Shared display formatters used across all components.
 *
 * Null / non-finite inputs always return EMPTY ('—') so components
 * never need their own null guards.
 *
 * Storage conventions:
 *   'pct'        – stored as percentage  (22.10 → "22.10%")
 *   'decimalPct' – stored as decimal     (0.1921 → "19.21%")
 *   'num'        – plain number          (1.23 → "1.23")
 *   'integer'    – whole number          (42 → "42")
 */

export const EMPTY = '—'

/** Percentage stored as a number (e.g. 22.10 → "22.10%"). */
export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return EMPTY
  return `${v.toFixed(decimals)}%`
}

/**
 * Decimal-stored percentage (e.g. 0.1921 → "19.21%").
 * Pass an explicit `decimals` argument to override.
 */
export function fmtDecimalPct(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return EMPTY
  return `${(v * 100).toFixed(decimals)}%`
}

/** Number rendered to fixed decimal places (default 2). */
export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return EMPTY
  return v.toFixed(decimals)
}

/** Integer / count — rank, size, number of holdings. */
export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return EMPTY
  return Math.round(v).toLocaleString()
}

/** USD price — "$1,234.56". Returns EMPTY for null. */
export function fmtUsd(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return EMPTY
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

/** Signed decimal-stored percentage (e.g. 0.0123 → "+1.23%", -0.021 → "-2.10%"). */
export function fmtSignedPct(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return EMPTY
  const pct = v * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(decimals)}%`
}

/** Text field — returns EMPTY for null or blank strings. */
export function fmtText(v: string | null | undefined): string {
  const s = v?.trim()
  return s != null && s !== '' ? s : EMPTY
}

/**
 * Strips the "Total Return" qualifier from a benchmark display name.
 * "Russell 1000 Growth Total Return" → "Russell 1000 Growth"
 * "S&P 1500 Health Care (Sector) Total Return" → "S&P 1500 Health Care (Sector)"
 */
export function stripTotalReturn(name: string | null | undefined): string {
  if (!name) return ''
  return name.replace(/\s*\btotal return\b/gi, '').replace(/\s{2,}/g, ' ').trim()
}
