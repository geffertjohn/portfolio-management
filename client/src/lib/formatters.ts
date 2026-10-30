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
import type { EstimateUnit } from './researchReports'


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

/**
 * Large dollar amounts, abbreviated (16_780_000_000 → "$16.78B"). For figures
 * like revenue and EBITDA, where the full digit string is noise and the
 * magnitude is the point. Sub-million values fall through to `fmtUsd`.
 */
export function fmtUsdCompact(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return EMPTY
  const abs = Math.abs(v)
  const [div, suffix] =
    abs >= 1e12 ? [1e12, 'T'] :
    abs >= 1e9  ? [1e9,  'B'] :
    abs >= 1e6  ? [1e6,  'M'] :
    [0, '']
  if (!div) return fmtUsd(v, decimals)
  const n = (v / div).toFixed(decimals)
  return `${v < 0 ? '-' : ''}$${n.replace('-', '')}${suffix}`
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

/**
 * Tailwind text-color class for an analyst consensus / rating label.
 * Single source of truth so every analyst surface colors the same string
 * identically (previously two divergent copies disagreed). Handles both
 * consensus words (Buy/Hold/Sell) and grade words (Overweight/Outperform…).
 */
export function consensusColor(label: string | null | undefined): string {
  if (!label) return 'text-gray-500'
  const l = label.toLowerCase()
  if (l.includes('strong buy')) return 'text-green-700'
  if (l.includes('strong sell')) return 'text-red-700'
  if (l === 'buy' || l.includes('overweight') || l.includes('outperform') || l.includes('accumulate')) return 'text-green-600'
  if (l === 'sell' || l.includes('underweight') || l.includes('underperform') || l.includes('reduce')) return 'text-red-600'
  if (l.includes('hold') || l.includes('neutral') || l.includes('market perform') || l.includes('equal')) return 'text-yellow-600'
  if (l.includes('buy')) return 'text-green-600'
  if (l.includes('sell')) return 'text-red-600'
  return 'text-gray-700'
}

/**
 * Local calendar date as `YYYY-MM-DD`, for seeding `<input type="date">` and for
 * any date that means "the day the user did this".
 *
 * NOT `toISOString().slice(0, 10)` — that is the UTC day, so west of UTC every
 * evening rolls forward: a review recorded at 20:00 ET was stamped, filed, and
 * named with tomorrow's date, and on the fund path the Review Date box is
 * read-only so the advisor could not correct it. `en-CA` formats as ISO
 * (`2026-09-14`) in the viewer's own zone.
 */
export function toLocalDateInputValue(date: Date): string {
  return date.toLocaleDateString('en-CA')
}

/**
 * A column that stores a CALENDAR DATE in a `timestamptz`, rendered as that
 * date — `2027-02-11 00:00+00` → "February 11, 2027".
 *
 * The mirror image of `toLocalDateInputValue` above, and needed for the same
 * reason in reverse. `at_risk.removal_date` is a deadline the committee wrote
 * as a bare day and Postgres widened to UTC midnight; passing it through the
 * viewer's zone reads it back as a moment, so west of UTC it renders as the day
 * BEFORE. COIN's sell timer showed "expires February 10, 2027" on a row holding
 * the 11th, contradicting the brief that had just said "runs to 11 February".
 * Use this for a stored day; use local formatting for a real instant like
 * `date_added`.
 */
export function fmtUtcLongDate(value: string | Date | null | undefined): string {
  if (!value) return EMPTY
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

/**
 * One figure from an earnings brief's estimates table, rendered by the unit the
 * brief recorded against it.
 *
 * Lives here because three surfaces show these rows — the research card, the
 * quarterly brief on screen, and the same brief as a PDF — and a second copy is
 * how a percentage starts rendering as dollars in one of them.
 */
export function fmtEstimate(v: number | null | undefined, unit: EstimateUnit): string {
  if (v == null) return EMPTY
  if (unit === 'pct') return fmtDecimalPct(v)
  if (unit === 'usd_large') return fmtUsdCompact(v)
  return fmtUsd(v)
}
