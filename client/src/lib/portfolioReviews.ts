/**
 * portfolioReviews.ts
 *
 * Cadence-driven portfolio reviews. Distinct from per-security review_log entries.
 *
 * Each portfolio carries three INDEPENDENT review timers (monthly / quarterly /
 * annual) in `portfolio_review_schedules`. Completing a review of one cadence
 * advances only that cadence's `next_review_at` and appends a structured,
 * checklist-bearing record to `portfolio_review_log` (frozen for audit defense).
 */
import { supabase } from './supabase'
import type { Json } from '@/types/database.types'
// Date helpers shared with the per-security review schedule.
export { isOverdue, isDueSoon } from './reviewSchedules'

export type PortfolioCadence = 'monthly' | 'quarterly' | 'annual'

export const PORTFOLIO_CADENCES: PortfolioCadence[] = ['monthly', 'quarterly', 'annual']

export const CADENCE_LABELS: Record<PortfolioCadence, string> = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annual:    'Annual',
}

/** One checklist item the advisor works through during a review of a given cadence. */
export interface ReviewTaskDef {
  key: string
  label: string
}

/**
 * The fixed task list per cadence — the documented process surfaced in the
 * review modal and frozen into each log row's `checklist`.
 */
export const PORTFOLIO_REVIEW_TASKS: Record<PortfolioCadence, ReviewTaskDef[]> = {
  monthly: [
    { key: 'performance_attribution', label: 'Review performance attribution' },
    { key: 'position_sizing',         label: 'Review position sizing' },
  ],
  quarterly: [
    { key: 'full_monitoring',    label: 'Full monitoring review on every holding' },
    { key: 'thesis_scorecards',  label: 'Update thesis scorecards' },
    { key: 'watchlist_status',   label: 'Update watchlist status' },
    { key: 'valuation_changes',  label: 'Check valuation changes' },
  ],
  annual: [
    { key: 'deep_review',             label: 'Deep review of every holding' },
    { key: 'conviction_rankings',     label: 'Rebuild conviction rankings' },
    { key: 'portfolio_construction',  label: 'Reassess portfolio construction' },
    { key: 'valuation_changes',       label: 'Check valuation changes' },
  ],
}

/** A single checklist item's captured state, frozen into the log row. */
export interface ReviewChecklistItem {
  key: string
  label: string
  done: boolean
  notes: string | null
}

export interface PortfolioReviewSchedule {
  id: number
  portfolio_name: string
  cadence: PortfolioCadence
  last_reviewed_at: string | null
  next_review_at: string
  created_at: string
  updated_at: string
}

export interface PortfolioReview {
  id: number
  portfolio_name: string
  cadence: PortfolioCadence | null
  reviewed_at: string
  /** Scheduled date the review was due. */
  review_date: string | null
  /** Next due date set when this review was completed. */
  next_review_at: string | null
  reviewed_by: string | null
  period: string | null
  notes: string | null
  /** Frozen per-task capture (audit evidence). */
  checklist: ReviewChecklistItem[] | null
  created_at: string
}

function calcNextReview(cadence: PortfolioCadence, from = new Date()): Date {
  const d = new Date(from)
  if (cadence === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (cadence === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d
}

/** Next due date for a cadence, as an ISO string — used to pre-fill the modal. */
export function nextReviewDateFor(cadence: PortfolioCadence, from = new Date()): string {
  return calcNextReview(cadence, from).toISOString()
}

const SCHEDULE_COLS =
  'id, portfolio_name, cadence, last_reviewed_at, next_review_at, created_at, updated_at'

/** All portfolio review schedules across every portfolio, soonest-due first (dashboard/calendar). */
export async function fetchPortfolioReviewSchedules(): Promise<PortfolioReviewSchedule[]> {
  const { data, error } = await supabase
    .from('portfolio_review_schedules')
    .select(SCHEDULE_COLS)
    .order('next_review_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PortfolioReviewSchedule[]
}

/** The three cadence schedules for one portfolio. */
export async function fetchPortfolioReviewSchedulesFor(
  portfolioName: string,
): Promise<PortfolioReviewSchedule[]> {
  const { data, error } = await supabase
    .from('portfolio_review_schedules')
    .select(SCHEDULE_COLS)
    .eq('portfolio_name', portfolioName)
  if (error) throw error
  return (data ?? []) as PortfolioReviewSchedule[]
}

export async function fetchPortfolioReviews(portfolioName: string): Promise<PortfolioReview[]> {
  const { data, error } = await supabase
    .from('portfolio_review_log')
    .select('*')
    .eq('portfolio_name', portfolioName)
    .order('reviewed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortfolioReview[]
}

export interface MarkPortfolioReviewedOptions {
  portfolioName: string
  cadence: PortfolioCadence
  checklist: ReviewChecklistItem[]
  notes?: string | null
  /** Actual completion date. Defaults to now. */
  reviewedAt?: Date
  /** Scheduled due date the review addressed (from the schedule). */
  reviewDate?: Date | null
  /** Explicit next due date; falls back to cadence interval from completion date. */
  nextReviewAt?: Date | null
}

/**
 * Record a completed cadence review.
 * Upserts the matching `portfolio_review_schedules` row (advancing only that
 * cadence's timer) and appends a frozen record to `portfolio_review_log`.
 * Returns the new `portfolio_review_log.id` (so callers can attach per-holding
 * assessments, etc.).
 */
export async function markPortfolioReviewed(opts: MarkPortfolioReviewedOptions): Promise<number> {
  const { portfolioName, cadence, checklist, notes } = opts
  const now = opts.reviewedAt ?? new Date()
  const nextReviewAt = (opts.nextReviewAt ?? calcNextReview(cadence, now)).toISOString()

  const { error: schedError } = await supabase
    .from('portfolio_review_schedules')
    .upsert(
      {
        portfolio_name:   portfolioName,
        cadence,
        last_reviewed_at: now.toISOString(),
        next_review_at:   nextReviewAt,
        updated_at:       now.toISOString(),
      },
      { onConflict: 'portfolio_name,cadence' },
    )
  if (schedError) throw schedError

  const { data: logRow, error: logError } = await supabase
    .from('portfolio_review_log')
    .insert({
      portfolio_name: portfolioName,
      cadence,
      reviewed_at:    now.toISOString(),
      review_date:    opts.reviewDate ? opts.reviewDate.toISOString() : null,
      next_review_at: nextReviewAt,
      notes:          notes?.trim() || null,
      checklist:      checklist as unknown as Json,
    })
    .select('id')
    .single()
  if (logError) throw logError
  return logRow.id
}
