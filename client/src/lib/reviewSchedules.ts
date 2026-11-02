/**
 * reviewSchedules.ts
 *
 * Manages per-security review schedules.
 * A schedule stores the cadence, last reviewed date, and next review date.
 * `markReviewed()` updates the schedule and appends a record to `review_log`.
 * `calcNextReview()` computes the next date from a base date + cadence.
 */
import { supabase } from './supabase'
import type { ReviewOutcome, Recommendation, Conviction, ReviewMetricsSnapshot } from './reviewLog'

export type ReviewCadence = 'quarterly' | 'semi_annual' | 'annual'

export interface ReviewSchedule {
  id: number
  security_id: string
  cadence: ReviewCadence
  last_reviewed_at: string | null
  next_review_at: string
  created_at: string
  updated_at: string
}

export interface ReviewScheduleWithSecurity extends ReviewSchedule {
  symbol: string
  name: string | null
  broad_asset_class: string | null
  /** The integer `securities2.id` — used for URL-based navigation (/security/:id). */
  security_numeric_id: number | null
  last_earnings_release: string | null
  next_earnings_release: string | null
  /** Classifier inputs, so callers can use `isFundOrEtfSecurity` rather than guessing. */
  detailed_security_type: string | null
  peer_group_name: string | null
  fund_company_name: string | null
  fund_family: string | null
  expense_ratio_generic: number | null
}

function calcNextReview(cadence: ReviewCadence, from = new Date()): string {
  const d = new Date(from)
  if (cadence === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (cadence === 'semi_annual') d.setMonth(d.getMonth() + 6)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}

export async function fetchReviewSchedules(): Promise<ReviewScheduleWithSecurity[]> {
  const { data, error } = await supabase
    .from('review_schedules')
    .select('*, securities2(id, security_id, security_name, broad_asset_class, last_earnings_release, next_earnings_release, detailed_security_type, peer_group_name, fund_company_name, fund_family, expense_ratio_generic)')
    .order('next_review_at', { ascending: true })
  if (error) throw error
  // DB stores cadence as text; domain type narrows it
  return (data ?? []).map((row) => ({
    ...row,
    symbol: row.securities2?.security_id ?? '',
    name: row.securities2?.security_name ?? null,
    broad_asset_class: row.securities2?.broad_asset_class ?? null,
    security_numeric_id: row.securities2?.id ?? null,
    last_earnings_release: row.securities2?.last_earnings_release ?? null,
    next_earnings_release: row.securities2?.next_earnings_release ?? null,
    detailed_security_type: row.securities2?.detailed_security_type ?? null,
    peer_group_name: row.securities2?.peer_group_name ?? null,
    fund_company_name: row.securities2?.fund_company_name ?? null,
    fund_family: row.securities2?.fund_family ?? null,
    expense_ratio_generic: row.securities2?.expense_ratio_generic ?? null,
  })) as ReviewScheduleWithSecurity[]
}

export async function fetchReviewScheduleBySecurity(securityId: string): Promise<ReviewSchedule | null> {
  const { data, error } = await supabase
    .from('review_schedules')
    .select('*')
    .eq('security_id', securityId)
    .maybeSingle()
  if (error) throw error
  // DB stores cadence as text; domain type narrows it
  return data as ReviewSchedule | null
}

export async function upsertReviewSchedule(
  securityId: string,
  cadence: ReviewCadence,
  nextReviewAt?: Date
): Promise<void> {
  const next_review_at = nextReviewAt ? nextReviewAt.toISOString() : calcNextReview(cadence)
  const { error } = await supabase
    .from('review_schedules')
    .upsert({ security_id: securityId, cadence, next_review_at }, { onConflict: 'security_id' })
  if (error) throw error
}

export interface MarkReviewedOptions {
  securityId: string
  cadence: ReviewCadence
  notes: string
  /** Actual date the review was completed. Defaults to now. */
  reviewedAt?: Date
  /** Scheduled date the review was due (earnings date + 1 day). Logged for the record. */
  reviewDate?: Date | null
  /** Explicit next review date (e.g. next earnings + 1 day). Falls back to cadence-based when omitted. */
  nextReviewAt?: Date | null
  ipsSuitable?: boolean | null
  reviewedBy?: string | null
  /** Process outcome — funds. */
  outcome?: ReviewOutcome | null
  /** Investment recommendation — stocks. */
  recommendation?: Recommendation | null
  conviction?: Conviction | null
  priceAtReview?: number | null
  metricsSnapshot?: ReviewMetricsSnapshot | null
  /** Path of the uploaded review-evidence document (Security Documents bucket) — funds/ETFs. */
  evidenceDocPath?: string | null
}

/**
 * Record a completed review.
 * Updates `review_schedules` (cadence + next_review_at) and inserts a row into `review_log`.
 * `reviewedAt` is the actual completion date (defaults to now); `reviewDate` is the
 * scheduled due date; `nextReviewAt` sets the next due date explicitly (else cadence-based).
 */
export async function markReviewed(opts: MarkReviewedOptions): Promise<void> {
  const { securityId, cadence, notes, ipsSuitable, reviewedBy, outcome } = opts
  const { recommendation, conviction, priceAtReview, metricsSnapshot, evidenceDocPath } = opts
  const now = opts.reviewedAt ?? new Date()
  const next_review_at = opts.nextReviewAt ? opts.nextReviewAt.toISOString() : calcNextReview(cadence, now)

  // Update schedule
  const { error: schedError } = await supabase
    .from('review_schedules')
    .upsert(
      { security_id: securityId, cadence, last_reviewed_at: now.toISOString(), next_review_at },
      { onConflict: 'security_id' }
    )
  if (schedError) throw schedError

  // Write to log
  const { error: logError } = await supabase
    .from('review_log')
    .insert({
      security_id: securityId,
      notes: notes || null,
      review_date: opts.reviewDate ? opts.reviewDate.toISOString() : null,
      reviewed_at: now.toISOString(),
      ips_suitable: ipsSuitable ?? null,
      reviewed_by: reviewedBy || null,
      outcome: outcome ?? null,
      recommendation: recommendation ?? null,
      conviction: conviction ?? null,
      price_at_review: priceAtReview ?? null,
      metrics_snapshot: metricsSnapshot ?? null,
      evidence_doc_path: evidenceDocPath ?? null,
    } as never)
  if (logError) throw logError
}

/** Returns true if the next review date is in the past. */
/**
 * Re-dating a stock review whose earnings date has moved.
 *
 * A stock review is due the day after the company reports, and that date is
 * STORED when the review is recorded — nothing re-reads it. FMP routinely moves
 * an estimated date, and when it does the schedule keeps pointing at the old
 * one: MSI was set on 2026-10-28 to Oct 30 from an estimate of ~Oct 29, the call
 * moved to Nov 4, and the row sat 4 days "overdue" for a company that had not
 * reported. The Review Calendar already tops up the stored EARNINGS dates; this
 * carries that correction through to the SCHEDULE, which it never did.
 *
 * THE DANGEROUS CASE IS AN OUTSTANDING REVIEW. A row sitting at
 * `last_earnings + 1` is overdue because the company HAS reported and nobody has
 * reviewed it yet — ABBV and CVX both read exactly that on 2026-11-02. Re-dating
 * those to `next_earnings + 1` would fling a real, pending review three months
 * into the future and silently erase it from every due list. So a row is only
 * moved when it points PAST the last reported call, i.e. when it was aimed at a
 * future call in the first place; an overdue or missed review is never touched.
 *
 * Safe to apply because stock schedules are always derived: `markReviewed`
 * writes `next_earnings + 1` and the modal's manual-override path (`mode:
 * 'schedule'`) has no caller, so there is no hand-set date to clobber. If an
 * override UI is ever reintroduced, this needs a flag to recognise it.
 */
export interface ScheduleRedateInput {
  security_id: string
  next_review_at: string
  last_earnings_release: string | null
  next_earnings_release: string | null
}

export interface ScheduleRedate {
  securityId: string
  /** Current stored day, for logging what moved. */
  from: string
  nextReviewAt: string
}

/**
 * The calendar DAY a `review_schedules.next_review_at` means.
 *
 * The column is a date — earnings date plus one — stored as `timestamptz` by
 * writers that disagree on the time of day: local midnight from the review
 * modal (`2027-01-28T05:00:00Z` in EST), UTC midnight from everything else
 * (`2027-01-28T00:00:00Z`). Formatted in local time a UTC-midnight value renders
 * as the PREVIOUS day west of Greenwich — which is how MSI read "Oct 29" from a
 * row holding Oct 30 (gotcha 24). The UTC date part resolves both, because local
 * midnight in a negative-offset zone falls later on the same UTC day.
 *
 * Pass the result to `formatDate`, which treats a bare date as local noon.
 */
export function reviewDueDay(nextReviewAt: string): string {
  return nextReviewAt.slice(0, 10)
}

/** A bare `YYYY-MM-DD` shifted by whole days, in UTC so it cannot slip one. */
function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Which STOCK schedules disagree with the earnings date they are derived from.
 *
 * Pure — pass it rows already filtered to stocks (funds are cadence-driven and
 * have no earnings date to derive from). Returns only the rows that must change.
 */
export function redatedStockSchedules(rows: ScheduleRedateInput[]): ScheduleRedate[] {
  const out: ScheduleRedate[] = []
  for (const r of rows) {
    if (!r.next_earnings_release || !r.next_review_at) continue
    // The same UTC-date-part convention the Actions adapter uses: this column is
    // a calendar day stored as `timestamptz`, by writers that disagree on the
    // time of day (local midnight vs UTC midnight).
    const current = reviewDueDay(r.next_review_at)
    const target = addUtcDays(r.next_earnings_release, 1)
    if (current === target) continue
    // Outstanding review for a call that already happened — leave it alone.
    if (r.last_earnings_release && current <= addUtcDays(r.last_earnings_release, 1)) continue
    out.push({ securityId: r.security_id, from: current, nextReviewAt: `${target}T00:00:00Z` })
  }
  return out
}

/**
 * Writes the re-dates. Per-row `update`, not an upsert: a conflict target needs
 * a matching unique constraint (gotcha 8), and these rows all exist already.
 */
export async function applyScheduleRedates(redates: ScheduleRedate[]): Promise<number> {
  for (const r of redates) {
    const { error } = await supabase
      .from('review_schedules')
      .update({ next_review_at: r.nextReviewAt, updated_at: new Date().toISOString() })
      .eq('security_id', r.securityId)
    if (error) throw error
  }
  return redates.length
}

/**
 * A bare `YYYY-MM-DD` is a calendar DAY; anything longer is a real instant.
 *
 * Both forms reach these helpers. A SECURITY review is a day — callers pass it
 * through `reviewDueDay` — while a PORTFOLIO review schedule holds an instant,
 * because its seed trigger writes `now()` with microseconds. Comparing a day as
 * an instant is what made a UTC-midnight date read overdue from 20:00 local the
 * evening before it was due. Same split `formatDate` and `daysUntil` use.
 */
function isCalendarDay(value: string): boolean {
  return value.length <= 10
}

/** Local midnight today — the boundary a calendar day is measured against. */
function startOfToday(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

export function isOverdue(nextReviewAt: string): boolean {
  if (isCalendarDay(nextReviewAt)) {
    // A review due TODAY is not overdue — it is due.
    return new Date(`${nextReviewAt}T00:00:00`) < startOfToday()
  }
  return new Date(nextReviewAt) < new Date()
}

/** Returns true if the next review date falls within `withinDays` days from today (default 14). */
export function isDueSoon(nextReviewAt: string, withinDays = 14): boolean {
  if (isCalendarDay(nextReviewAt)) {
    const today = startOfToday()
    const soon = new Date(today)
    soon.setDate(soon.getDate() + withinDays)
    const d = new Date(`${nextReviewAt}T00:00:00`)
    return d >= today && d <= soon
  }
  const now = new Date()
  const soon = new Date(now)
  soon.setDate(soon.getDate() + withinDays)
  const d = new Date(nextReviewAt)
  return d >= now && d <= soon
}
