/**
 * portfolioReviews.ts
 *
 * CRUD for portfolio-level periodic reviews (e.g. quarterly review of a whole portfolio).
 * Distinct from per-security review_log entries.
 */
import { supabase } from './supabase'
import type { ReviewOutcome } from './reviewLog'

export interface PortfolioReview {
  id: number
  portfolio_name: string
  reviewed_at: string
  reviewed_by: string
  outcome: ReviewOutcome
  period: string | null
  notes: string | null
  created_at: string
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

export async function logPortfolioReview(review: {
  portfolio_name: string
  reviewed_by: string
  outcome: ReviewOutcome
  period?: string | null
  notes?: string | null
  reviewed_at?: Date
}): Promise<void> {
  const { error } = await supabase.from('portfolio_review_log').insert({
    portfolio_name: review.portfolio_name,
    reviewed_by:   review.reviewed_by,
    outcome:       review.outcome,
    period:        review.period ?? null,
    notes:         review.notes ?? null,
    reviewed_at:   (review.reviewed_at ?? new Date()).toISOString(),
  })
  if (error) throw error
}
