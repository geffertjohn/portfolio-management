/**
 * secOperatingIncome.ts
 *
 * As-filed annual operating income, from SEC XBRL via the Express proxy.
 *
 * WHY THIS EXISTS. FMP's annual `operatingIncome` relocates charges out of the
 * operating line. An audit of the 54 names carrying an investment thesis, against
 * SEC's own `us-gaap:OperatingIncomeLoss`, found **17 of 45 checkable names wrong
 * on at least one fiscal year** — BSX FY2020 reported as +$601M against a filed
 * **-$80M operating loss** (a sign flip), IBM FY2022 off by 607%, LLY FY2023 by
 * 65%, HWM wrong in five of six years. `incomeBeforeTax` ties in every case, so no
 * internal consistency check catches it.
 *
 * It reaches the Scorecard because FMP derives `operatingProfitMargin` from that
 * same number: ELF FY2026 renders 8.02% where the filing says 4.50%; HWM FY2020
 * renders 16.14% against a filed 11.90%, which erases most of a cyclical trough.
 *
 * The "adjacent fiscal years tie" pattern is NOT reliable — on BSX and IBM every
 * year is wrong. Two feed years agreeing with each other proves nothing; only
 * agreement with the filing does.
 */
import { SERVER_BASE } from './documents'

/** One filed annual period. `end` is the fiscal period end date, `YYYY-MM-DD`. */
export interface FiledPeriod {
  end: string
  start: string
  /** Operating income in dollars, as filed. */
  val: number
  /** When the filing carrying this value was submitted. */
  filed: string | null
  form: string | null
}

export interface FiledOperatingIncome {
  cik: string
  /** The XBRL tag used, or null when the filer does not tag operating income. */
  tag: string | null
  periods: FiledPeriod[]
}

/** Material enough to mislead a reader of a margin card. */
export const OPERATING_INCOME_TOLERANCE = 0.01

export async function fetchFiledOperatingIncome(cik: string): Promise<FiledOperatingIncome | null> {
  const digits = cik.replace(/\D/g, '')
  if (!digits || Number(digits) === 0) return null
  const res = await fetch(`${SERVER_BASE}/api/sec/operating-income?cik=${digits}`)
  if (!res.ok) throw new Error(`SEC operating income ${res.status}`)
  return (await res.json()) as FiledOperatingIncome
}

/**
 * Match a vendor annual row to its filed period. Fiscal calendars drift by a few
 * days between filings (52/53-week retailers especially), so an exact date match
 * loses real pairs; anything beyond a fortnight is a different period.
 */
export function filedPeriodFor(periods: FiledPeriod[], periodEnd: string): FiledPeriod | null {
  if (!periodEnd) return null
  const exact = periods.find((p) => p.end === periodEnd)
  if (exact) return exact
  const target = Date.parse(periodEnd)
  if (Number.isNaN(target)) return null
  let best: FiledPeriod | null = null
  let bestGap = Infinity
  for (const p of periods) {
    const gap = Math.abs(Date.parse(p.end) - target) / 86_400_000
    if (gap <= 14 && gap < bestGap) { best = p; bestGap = gap }
  }
  return best
}

export interface MarginCheck {
  /** Operating margin recomputed from the filed operating income. */
  filedMargin: number | null
  /** What the vendor reported, for comparison. */
  feedMargin: number | null
  /** True when the two disagree by more than the tolerance. */
  mismatch: boolean
  /** Null when no filed period matched — unverified, which is not the same as agreeing. */
  verified: boolean
}

/**
 * Recompute the margin from the filing and compare. Revenue comes from the vendor:
 * the defect is in the operating-income line, and revenue ties on every name audited.
 */
export function checkOperatingMargin(
  filed: FiledOperatingIncome | null,
  periodEnd: string,
  revenue: number | null,
  feedMargin: number | null,
): MarginCheck {
  const period = filed ? filedPeriodFor(filed.periods, periodEnd) : null
  if (!period || revenue == null || revenue === 0) {
    return { filedMargin: null, feedMargin, mismatch: false, verified: false }
  }
  const filedMargin = period.val / revenue
  const mismatch = feedMargin != null
    && Math.abs(filedMargin - feedMargin) > OPERATING_INCOME_TOLERANCE
  return { filedMargin, feedMargin, mismatch, verified: true }
}
