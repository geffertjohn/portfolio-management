import { supabase } from './supabase'

/**
 * Investment recommendation captured on a stock review.
 * Replaces the process `outcome` enum for stocks; funds still use `outcome`.
 */
export type Recommendation = 'buy' | 'add' | 'hold' | 'trim' | 'sell'

export const RECOMMENDATION_OPTIONS: Recommendation[] = ['buy', 'add', 'hold', 'trim', 'sell']

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  buy:  'Buy',
  add:  'Add',
  hold: 'Hold',
  trim: 'Trim',
  sell: 'Sell',
}

export const RECOMMENDATION_COLORS: Record<Recommendation, string> = {
  buy:  'bg-green-100 text-green-700',
  add:  'bg-emerald-100 text-emerald-700',
  hold: 'bg-gray-100 text-gray-700',
  trim: 'bg-amber-100 text-amber-700',
  sell: 'bg-red-100 text-red-700',
}

export type Conviction = 'high' | 'medium' | 'low'

export const CONVICTION_OPTIONS: Conviction[] = ['high', 'medium', 'low']

export const CONVICTION_LABELS: Record<Conviction, string> = {
  high:   'High conviction',
  medium: 'Medium conviction',
  low:    'Low conviction',
}

/**
 * Evidence frozen into a review at submit time, so the recommendation stays
 * reconstructable later even though stock metrics are otherwise fetched
 * on-demand from FMP and never persisted.
 */
export interface ReviewMetricsSnapshot {
  capturedAt: string
  price: number | null
  scorecard: {
    operatingMargin: number | null
    fcfMargin: number | null
    revGrowthTtm: number | null
    epsGrowthTtm: number | null
    revCagr3y: number | null
    epsCagr3y: number | null
  }
  analyst: {
    consensus: string | null
    targetConsensus: number | null
    numberOfAnalysts: number | null
    strongBuy: number | null
    buy: number | null
    hold: number | null
    sell: number | null
    strongSell: number | null
  }
}

export type ReviewOutcome =
  | 'no_issues'
  | 'flagged_for_action'
  | 'placed_on_watchlist'
  | 'recommended_sell'

export const OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  no_issues:           'No Issues',
  flagged_for_action:  'Flagged for Action',
  placed_on_watchlist: 'Flagged At-Risk',
  recommended_sell:    'Recommended Sell',
}

export const OUTCOME_COLORS: Record<ReviewOutcome, string> = {
  no_issues:           'bg-green-100 text-green-700',
  flagged_for_action:  'bg-amber-100 text-amber-700',
  placed_on_watchlist: 'bg-blue-100 text-blue-700',
  recommended_sell:    'bg-red-100 text-red-700',
}

export const OUTCOME_OPTIONS: ReviewOutcome[] = [
  'no_issues',
  'flagged_for_action',
  'placed_on_watchlist',
  'recommended_sell',
]

export interface ReviewLogEntry {
  id: number
  security_id: string
  /** Scheduled date the review was due (earnings date + 1 day). */
  review_date: string | null
  /** Actual date the review was completed. */
  reviewed_at: string
  notes: string | null
  reviewed_by: string | null
  ips_suitable: boolean | null
  /** Process outcome — funds only. Stocks use `recommendation` instead. */
  outcome: ReviewOutcome | null
  /** Investment recommendation — stocks only. */
  recommendation: Recommendation | null
  conviction: Conviction | null
  price_at_review: number | null
  metrics_snapshot: ReviewMetricsSnapshot | null
  /** Path (folder/filename) of the uploaded evidence PDF in the Security Documents bucket — funds/ETFs. */
  evidence_doc_path: string | null
  created_at: string
}

export async function fetchReviewLog(securityId: string): Promise<ReviewLogEntry[]> {
  const { data, error } = await supabase
    .from('review_log')
    .select('*')
    .eq('security_id', securityId)
    .order('reviewed_at', { ascending: false })
  if (error) throw error
  // DB stores outcome/recommendation/conviction as text; domain type narrows them
  return (data ?? []) as ReviewLogEntry[]
}
