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

/** An in-progress (draft) review loaded into the workspace for editing/resuming. */
export interface ReviewDraft {
  id: number
  cadence: PortfolioCadence
  checklist: ReviewChecklistItem[]
  notes: string | null
  /** Due date the review addresses. */
  reviewDate: string | null
  /** Next due date (set in the Summary section; defaults at completion). */
  nextReviewAt: string | null
  reviewedAt: string
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

/** Completed reviews only (drafts are excluded from history). */
export async function fetchPortfolioReviews(portfolioName: string): Promise<PortfolioReview[]> {
  const { data, error } = await supabase
    .from('portfolio_review_log')
    .select('*')
    .eq('portfolio_name', portfolioName)
    .eq('status', 'completed')
    .order('reviewed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortfolioReview[]
}

const DRAFT_COLS = 'id, cadence, checklist, notes, review_date, next_review_at, reviewed_at'

function mapDraft(row: Record<string, unknown>): ReviewDraft {
  return {
    id: row.id as number,
    cadence: row.cadence as PortfolioCadence,
    checklist: (row.checklist as ReviewChecklistItem[] | null) ?? [],
    notes: (row.notes as string | null) ?? null,
    reviewDate: (row.review_date as string | null) ?? null,
    nextReviewAt: (row.next_review_at as string | null) ?? null,
    reviewedAt: row.reviewed_at as string,
  }
}

/**
 * Start a new draft review for a cadence, or resume the existing open draft.
 * At most one draft per (portfolio, cadence) exists (DB partial unique index).
 * A fresh draft seeds the checklist from the cadence's task list.
 */
export async function startOrResumeDraft(
  portfolioName: string,
  cadence: PortfolioCadence,
  dueDate: string | null,
): Promise<ReviewDraft> {
  const { data: existing, error: findErr } = await supabase
    .from('portfolio_review_log')
    .select(DRAFT_COLS)
    .eq('portfolio_name', portfolioName)
    .eq('cadence', cadence)
    .eq('status', 'draft')
    .maybeSingle()
  if (findErr) throw findErr
  if (existing) return mapDraft(existing as Record<string, unknown>)

  const checklist: ReviewChecklistItem[] = PORTFOLIO_REVIEW_TASKS[cadence].map((t) => ({
    key: t.key, label: t.label, done: false, notes: null,
  }))
  const { data, error } = await supabase
    .from('portfolio_review_log')
    .insert({
      portfolio_name: portfolioName,
      cadence,
      status: 'draft',
      reviewed_at: new Date().toISOString(),
      review_date: dueDate,
      checklist: checklist as unknown as Json,
    })
    .select(DRAFT_COLS)
    .single()
  if (error) throw error
  return mapDraft(data as Record<string, unknown>)
}

export interface SaveDraftFields {
  checklist: ReviewChecklistItem[]
  notes: string | null
  reviewDate?: Date | null
  nextReviewAt?: Date | null
}

/** Persist draft progress (checklist + notes + dates). Per-holding data saves separately. */
export async function saveReviewDraft(reviewLogId: number, fields: SaveDraftFields): Promise<void> {
  const patch: Record<string, unknown> = {
    checklist: fields.checklist as unknown as Json,
    notes: fields.notes?.trim() || null,
  }
  if (fields.reviewDate !== undefined) patch.review_date = fields.reviewDate ? fields.reviewDate.toISOString() : null
  if (fields.nextReviewAt !== undefined) patch.next_review_at = fields.nextReviewAt ? fields.nextReviewAt.toISOString() : null
  const { error } = await supabase.from('portfolio_review_log').update(patch).eq('id', reviewLogId)
  if (error) throw error
}

export interface CompleteReviewOptions {
  reviewLogId: number
  portfolioName: string
  cadence: PortfolioCadence
  checklist: ReviewChecklistItem[]
  notes?: string | null
  /** Completion date the advisor chose. */
  reviewedAt: Date
  reviewDate?: Date | null
  /** Next due date; falls back to the cadence interval from the completion date. */
  nextReviewAt?: Date | null
}

/**
 * Finalize a draft review: stamp it completed and advance ONLY that cadence's
 * schedule timer. Per-holding assessments are saved separately (saveHoldingReviews).
 */
export async function completeReview(opts: CompleteReviewOptions): Promise<void> {
  const { reviewLogId, portfolioName, cadence, checklist, notes, reviewedAt } = opts
  const nextReviewAt = (opts.nextReviewAt ?? calcNextReview(cadence, reviewedAt)).toISOString()

  const { error: logError } = await supabase
    .from('portfolio_review_log')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      reviewed_at: reviewedAt.toISOString(),
      review_date: opts.reviewDate ? opts.reviewDate.toISOString() : null,
      next_review_at: nextReviewAt,
      notes: notes?.trim() || null,
      checklist: checklist as unknown as Json,
    })
    .eq('id', reviewLogId)
  if (logError) throw logError

  const { error: schedError } = await supabase
    .from('portfolio_review_schedules')
    .upsert(
      {
        portfolio_name: portfolioName,
        cadence,
        last_reviewed_at: reviewedAt.toISOString(),
        next_review_at: nextReviewAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'portfolio_name,cadence' },
    )
  if (schedError) throw schedError
}
