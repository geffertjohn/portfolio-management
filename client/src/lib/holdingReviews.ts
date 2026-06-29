/**
 * holdingReviews.ts
 *
 * Per-holding monitoring assessment captured during a quarterly full-monitoring
 * review. Each completed review writes one `holding_reviews` row per assessed
 * holding (linked to the parent `portfolio_review_log` row). Stored separately so
 * thesis status / conviction / action can be tracked across reviews over time.
 */
import { supabase } from './supabase'

export type ThesisStatus = 'intact' | 'at_risk' | 'broken'
export type BusinessTrend = 'improving' | 'stable' | 'deteriorating'
export type ValuationCall = 'attractive' | 'fair' | 'expensive'
export type MonitorConviction = 'high' | 'medium' | 'low'
export type HoldingAction = 'add' | 'hold' | 'trim' | 'exit' | 'watchlist'

export const THESIS_STATUS_OPTIONS: ThesisStatus[] = ['intact', 'at_risk', 'broken']
export const BUSINESS_TREND_OPTIONS: BusinessTrend[] = ['improving', 'stable', 'deteriorating']
export const VALUATION_OPTIONS: ValuationCall[] = ['attractive', 'fair', 'expensive']
export const CONVICTION_OPTIONS: MonitorConviction[] = ['high', 'medium', 'low']
export const ACTION_OPTIONS: HoldingAction[] = ['add', 'hold', 'trim', 'exit', 'watchlist']

export const THESIS_STATUS_LABELS: Record<ThesisStatus, string> = {
  intact: 'Intact', at_risk: 'At Risk', broken: 'Broken',
}
export const BUSINESS_TREND_LABELS: Record<BusinessTrend, string> = {
  improving: 'Improving', stable: 'Stable', deteriorating: 'Deteriorating',
}
export const VALUATION_LABELS: Record<ValuationCall, string> = {
  attractive: 'Attractive', fair: 'Fair', expensive: 'Expensive',
}
export const CONVICTION_LABELS: Record<MonitorConviction, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
}
export const ACTION_LABELS: Record<HoldingAction, string> = {
  add: 'Add', hold: 'Hold', trim: 'Trim', exit: 'Exit', watchlist: 'Watchlist',
}

/** The five guidance areas surfaced above the grid (what to look at per holding). */
export const MONITORING_AREAS: { area: string; prompt: string }[] = [
  { area: 'Thesis',         prompt: 'Is the original reason for ownership still valid?' },
  { area: 'Fundamentals',   prompt: 'Revenue, earnings, margins, cash flow, balance sheet' },
  { area: 'Expectations',   prompt: 'Are estimates improving or deteriorating?' },
  { area: 'Valuation',      prompt: 'Is expected return still attractive?' },
  { area: 'Portfolio role', prompt: 'Does it still fit the portfolio?' },
]

/** One holding's assessment, as edited in the grid and persisted. All fields optional. */
export interface HoldingAssessment {
  securityId: string
  thesisStatus: ThesisStatus | null
  businessTrend: BusinessTrend | null
  valuation: ValuationCall | null
  conviction: MonitorConviction | null
  action: HoldingAction | null
}

export function isAssessmentEmpty(a: HoldingAssessment): boolean {
  return !a.thesisStatus && !a.businessTrend && !a.valuation && !a.conviction && !a.action
}

export interface HoldingReviewRow extends HoldingAssessment {
  id: number
  review_log_id: number
  portfolio_name: string
  reviewed_at: string
}

/** Persist the per-holding assessments for one completed review. Empty rows are skipped. */
export async function saveHoldingReviews(
  reviewLogId: number,
  portfolioName: string,
  assessments: HoldingAssessment[],
  reviewedAt: Date = new Date(),
): Promise<void> {
  const rows = assessments
    .filter((a) => !isAssessmentEmpty(a))
    .map((a) => ({
      review_log_id: reviewLogId,
      portfolio_name: portfolioName,
      security_id: a.securityId,
      reviewed_at: reviewedAt.toISOString(),
      thesis_status: a.thesisStatus,
      business_trend: a.businessTrend,
      valuation: a.valuation,
      conviction: a.conviction,
      action: a.action,
    }))
  if (rows.length === 0) return
  const { error } = await supabase.from('holding_reviews').insert(rows)
  if (error) throw error
}

/** All holding-review rows for a portfolio, newest review first. */
export async function fetchHoldingReviewsByPortfolio(portfolioName: string): Promise<HoldingReviewRow[]> {
  const { data, error } = await supabase
    .from('holding_reviews')
    .select('id, review_log_id, portfolio_name, security_id, reviewed_at, thesis_status, business_trend, valuation, conviction, action')
    .eq('portfolio_name', portfolioName)
    .order('reviewed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    review_log_id: r.review_log_id,
    portfolio_name: r.portfolio_name,
    securityId: r.security_id,
    reviewed_at: r.reviewed_at,
    thesisStatus: r.thesis_status as ThesisStatus | null,
    businessTrend: r.business_trend as BusinessTrend | null,
    valuation: r.valuation as ValuationCall | null,
    conviction: r.conviction as MonitorConviction | null,
    action: r.action as HoldingAction | null,
  }))
}
