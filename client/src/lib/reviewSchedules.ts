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
    .select('*, securities2(id, security_id, security_name, broad_asset_class, last_earnings_release, next_earnings_release)')
    .order('next_review_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    symbol: row.securities2?.security_id ?? '',
    name: row.securities2?.security_name ?? null,
    broad_asset_class: row.securities2?.broad_asset_class ?? null,
    security_numeric_id: row.securities2?.id ?? null,
    last_earnings_release: row.securities2?.last_earnings_release ?? null,
    next_earnings_release: row.securities2?.next_earnings_release ?? null,
  }))
}

export async function fetchReviewScheduleBySecurity(securityId: string): Promise<ReviewSchedule | null> {
  const { data, error } = await supabase
    .from('review_schedules')
    .select('*')
    .eq('security_id', securityId)
    .maybeSingle()
  if (error) throw error
  return data
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
}

/**
 * Record a completed review.
 * Updates `review_schedules` (cadence + next_review_at) and inserts a row into `review_log`.
 * `reviewedAt` is the actual completion date (defaults to now); `reviewDate` is the
 * scheduled due date; `nextReviewAt` sets the next due date explicitly (else cadence-based).
 */
export async function markReviewed(opts: MarkReviewedOptions): Promise<void> {
  const { securityId, cadence, notes, ipsSuitable, reviewedBy, outcome } = opts
  const { recommendation, conviction, priceAtReview, metricsSnapshot } = opts
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
    })
  if (logError) throw logError
}

/** Returns true if the next review date is in the past. */
export function isOverdue(nextReviewAt: string): boolean {
  return new Date(nextReviewAt) < new Date()
}

/** Returns true if the next review date falls within `withinDays` days from today (default 14). */
export function isDueSoon(nextReviewAt: string, withinDays = 14): boolean {
  const d = new Date(nextReviewAt)
  const soon = new Date()
  soon.setDate(soon.getDate() + withinDays)
  return d >= new Date() && d <= soon
}
