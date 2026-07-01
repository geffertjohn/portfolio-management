/**
 * holdingReviews.ts
 *
 * Per-holding assessment captured during a quarterly full-monitoring review.
 * One `holding_reviews` row per (review, holding), carrying three facets:
 *   #1 monitoring assignments (thesis status / business trend / valuation / conviction / action)
 *   #2 thesis scorecard (original thesis, what changed, evidence for/against, conclusion)
 *   #3 watchlist status (flag + trigger + reason / required improvement / deadline / exit trigger)
 * Stored separately from the review's checklist jsonb so these are queryable across reviews.
 */
import { supabase } from './supabase'

export type ThesisStatus = 'intact' | 'at_risk' | 'broken'
export type BusinessTrend = 'improving' | 'stable' | 'deteriorating'
export type ValuationCall = 'attractive' | 'fair' | 'expensive'
export type MonitorConviction = 'high' | 'medium' | 'low'
export type HoldingAction = 'add' | 'hold' | 'trim' | 'exit' | 'watchlist'
export type WatchlistTrigger =
  | 'fundamental_deterioration' | 'margin_pressure' | 'estimate_cuts'
  | 'thesis_concern' | 'valuation_issue' | 'portfolio_issue'
/** Annual deep-review output per holding. */
export type AnnualDecision = 'keep' | 'increase' | 'reduce' | 'replace' | 'exit'
/** Annual conviction ranking tier (1 = best ideas … 4 = replace/exit candidates). */
export type ConvictionTier = 1 | 2 | 3 | 4

export const THESIS_STATUS_OPTIONS: ThesisStatus[] = ['intact', 'at_risk', 'broken']
export const BUSINESS_TREND_OPTIONS: BusinessTrend[] = ['improving', 'stable', 'deteriorating']
export const VALUATION_OPTIONS: ValuationCall[] = ['attractive', 'fair', 'expensive']
export const CONVICTION_OPTIONS: MonitorConviction[] = ['high', 'medium', 'low']
export const ACTION_OPTIONS: HoldingAction[] = ['add', 'hold', 'trim', 'exit', 'watchlist']
export const WATCHLIST_TRIGGER_OPTIONS: WatchlistTrigger[] = [
  'fundamental_deterioration', 'margin_pressure', 'estimate_cuts',
  'thesis_concern', 'valuation_issue', 'portfolio_issue',
]
export const ANNUAL_DECISION_OPTIONS: AnnualDecision[] = ['keep', 'increase', 'reduce', 'replace', 'exit']
export const CONVICTION_TIER_OPTIONS: ConvictionTier[] = [1, 2, 3, 4]

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
export const WATCHLIST_TRIGGER_LABELS: Record<WatchlistTrigger, string> = {
  fundamental_deterioration: 'Fundamental deterioration',
  margin_pressure: 'Margin pressure',
  estimate_cuts: 'Estimate cuts',
  thesis_concern: 'Thesis concern',
  valuation_issue: 'Valuation issue',
  portfolio_issue: 'Portfolio issue',
}
export const ANNUAL_DECISION_LABELS: Record<AnnualDecision, string> = {
  keep: 'Keep', increase: 'Increase', reduce: 'Reduce', replace: 'Replace', exit: 'Exit',
}
/** Conviction tier meaning + target weight band (percent points), per the annual framework. */
export const CONVICTION_TIER_INFO: Record<ConvictionTier, { meaning: string; target: string; lower: number; upper: number | null }> = {
  1: { meaning: 'Best ideas; high conviction; core holdings', target: '5–7%', lower: 5, upper: 7 },
  2: { meaning: 'Solid holdings; normal weights',             target: '3–5%', lower: 3, upper: 5 },
  3: { meaning: 'Lower conviction; smaller weights',          target: '1–3%', lower: 1, upper: 3 },
  4: { meaning: 'Replace / exit candidates',                  target: '0–1% or exit', lower: 0, upper: 1 },
}

export interface TierBands {
  tier1_lower: number | null; tier1_upper: number | null
  tier2_lower: number | null; tier2_upper: number | null
  tier3_lower: number | null; tier3_upper: number | null
  tier4_lower: number | null; tier4_upper: number | null
}

/**
 * Tier meaning + target band, using the model portfolio's editable bands when
 * present and falling back to the default framework bands. Tier 4 keeps the
 * "or exit" wording on its target string.
 */
export function resolveTierInfo(model: Partial<TierBands> | null | undefined): Record<ConvictionTier, { meaning: string; lower: number; upper: number; target: string }> {
  const band = (tier: ConvictionTier, lo: number | null | undefined, up: number | null | undefined) => {
    const lower = lo ?? CONVICTION_TIER_INFO[tier].lower
    const upper = up ?? CONVICTION_TIER_INFO[tier].upper ?? 0
    const target = tier === 4 ? `${lower}–${upper}% or exit` : `${lower}–${upper}%`
    return { meaning: CONVICTION_TIER_INFO[tier].meaning, lower, upper, target }
  }
  return {
    1: band(1, model?.tier1_lower, model?.tier1_upper),
    2: band(2, model?.tier2_lower, model?.tier2_upper),
    3: band(3, model?.tier3_lower, model?.tier3_upper),
    4: band(4, model?.tier4_lower, model?.tier4_upper),
  }
}

/** Annual deep-review guidance areas (#1) — "If I were building this from scratch today…". */
export const DEEP_REVIEW_AREAS: { area: string; question: string }[] = [
  { area: 'Business quality',    question: 'Is this still a high-quality company?' },
  { area: 'Competitive position', question: 'Is the moat stronger, weaker, or unchanged?' },
  { area: 'Management',          question: 'Are they executing?' },
  { area: 'Financial strength',  question: 'Balance sheet, FCF, margins, ROIC' },
  { area: 'Growth runway',       question: 'Is the opportunity still attractive?' },
  { area: 'Valuation',           question: 'Is expected return compelling?' },
  { area: 'Alternatives',        question: 'Is there a better stock for the same role?' },
]

/** Annual portfolio-construction check areas (#3) — whole-portfolio, not per-stock. */
export const PORTFOLIO_CONSTRUCTION_AREAS: { area: string; prompt: string }[] = [
  { area: 'Number of holdings', prompt: 'Still appropriate?' },
  { area: 'Sector exposure',    prompt: 'Any unintended concentration?' },
  { area: 'Factor exposure',    prompt: 'Too growth-heavy, value-heavy, cyclical, defensive?' },
  { area: 'Position sizing',    prompt: 'Best ideas actually sized as best ideas?' },
  { area: 'Redundancy',         prompt: 'Do multiple holdings do the same thing?' },
  { area: 'Risk exposure',      prompt: 'Any single theme dominating the portfolio?' },
  { area: 'Cash level',         prompt: 'Too much or too little?' },
  { area: 'Turnover',           prompt: 'Are you trading too much?' },
]

export const ANNUAL_PURPOSE = 'If I were building this portfolio from scratch today, would I still own these names at these weights?'
export const ANNUAL_CONSTRUCTION_QUESTION = 'Does the portfolio reflect my highest-conviction ideas, or is it just an accumulation of past decisions?'

/** The five guidance areas surfaced above the monitoring grid (#1). */
export const MONITORING_AREAS: { area: string; prompt: string }[] = [
  { area: 'Thesis',         prompt: 'Is the original reason for ownership still valid?' },
  { area: 'Fundamentals',   prompt: 'Revenue, earnings, margins, cash flow, balance sheet' },
  { area: 'Expectations',   prompt: 'Are estimates improving or deteriorating?' },
  { area: 'Valuation',      prompt: 'Is expected return still attractive?' },
  { area: 'Portfolio role', prompt: 'Does it still fit the portfolio?' },
]

/** The thesis-scorecard text fields (#2), in display order. */
export const THESIS_SCORECARD_FIELDS: { field: keyof HoldingAssessment; label: string; placeholder: string }[] = [
  { field: 'originalThesis',    label: 'Original thesis',          placeholder: 'e.g. Own due to durable revenue growth, high margins, strong FCF.' },
  { field: 'thesisChange',      label: 'What changed this quarter', placeholder: 'e.g. Revenue growth slowed from 12% to 7%; margin stable.' },
  { field: 'evidenceFor',       label: 'Evidence supporting thesis', placeholder: 'e.g. Market share remains stable; FCF margin remains strong.' },
  { field: 'evidenceAgainst',   label: 'Evidence against thesis',   placeholder: 'e.g. Guidance reduced; valuation still elevated.' },
  { field: 'currentConclusion', label: 'Current conclusion',        placeholder: 'e.g. Thesis intact but business trend weakening.' },
]

/** The watchlist-status fields (#3), shown when a holding is flagged. */
export const WATCHLIST_FIELDS: { field: keyof HoldingAssessment; label: string; placeholder: string }[] = [
  { field: 'watchlistReason',     label: 'Reason',              placeholder: 'e.g. Margin compression and lowered guidance.' },
  { field: 'requiredImprovement', label: 'Required improvement', placeholder: 'e.g. Margins stabilize within two quarters.' },
  { field: 'reviewDeadline',      label: 'Review deadline',     placeholder: 'e.g. Next quarterly earnings report.' },
  { field: 'exitTrigger',         label: 'Exit trigger',        placeholder: 'e.g. Second consecutive guide-down or thesis break.' },
]

/** One holding's full assessment, as edited across the review sections and persisted. */
export interface HoldingAssessment {
  securityId: string
  // #1 monitoring
  thesisStatus: ThesisStatus | null
  businessTrend: BusinessTrend | null
  valuation: ValuationCall | null
  conviction: MonitorConviction | null
  action: HoldingAction | null
  // #2 thesis scorecard
  originalThesis: string | null
  thesisChange: string | null
  evidenceFor: string | null
  evidenceAgainst: string | null
  currentConclusion: string | null
  // #3 watchlist status
  onWatchlist: boolean
  watchlistTrigger: WatchlistTrigger | null
  watchlistReason: string | null
  requiredImprovement: string | null
  reviewDeadline: string | null
  exitTrigger: string | null
  // annual: deep review (#1) + conviction ranking (#2)
  annualDecision: AnnualDecision | null
  annualNotes: string | null
  convictionTier: ConvictionTier | null
}

export function emptyAssessment(securityId: string): HoldingAssessment {
  return {
    securityId,
    thesisStatus: null, businessTrend: null, valuation: null, conviction: null, action: null,
    originalThesis: null, thesisChange: null, evidenceFor: null, evidenceAgainst: null, currentConclusion: null,
    onWatchlist: false, watchlistTrigger: null, watchlistReason: null,
    requiredImprovement: null, reviewDeadline: null, exitTrigger: null,
    annualDecision: null, annualNotes: null, convictionTier: null,
  }
}

export function isAssessmentEmpty(a: HoldingAssessment): boolean {
  return !a.thesisStatus && !a.businessTrend && !a.valuation && !a.conviction && !a.action
    && !a.originalThesis && !a.thesisChange && !a.evidenceFor && !a.evidenceAgainst && !a.currentConclusion
    && !a.onWatchlist && !a.watchlistTrigger && !a.watchlistReason
    && !a.requiredImprovement && !a.reviewDeadline && !a.exitTrigger
    && !a.annualDecision && !a.annualNotes && !a.convictionTier
}

export interface HoldingReviewRow extends HoldingAssessment {
  id: number
  review_log_id: number
  portfolio_name: string
  reviewed_at: string
}

const SELECT_COLS =
  'id, review_log_id, portfolio_name, security_id, reviewed_at, ' +
  'thesis_status, business_trend, valuation, conviction, action, ' +
  'original_thesis, thesis_change, evidence_for, evidence_against, current_conclusion, ' +
  'on_watchlist, watchlist_trigger, watchlist_reason, required_improvement, review_deadline, exit_trigger, ' +
  'annual_decision, annual_notes, conviction_tier'

function rowToAssessment(r: Record<string, unknown>): HoldingReviewRow {
  return {
    id: r.id as number,
    review_log_id: r.review_log_id as number,
    portfolio_name: r.portfolio_name as string,
    reviewed_at: r.reviewed_at as string,
    securityId: r.security_id as string,
    thesisStatus: (r.thesis_status as ThesisStatus | null) ?? null,
    businessTrend: (r.business_trend as BusinessTrend | null) ?? null,
    valuation: (r.valuation as ValuationCall | null) ?? null,
    conviction: (r.conviction as MonitorConviction | null) ?? null,
    action: (r.action as HoldingAction | null) ?? null,
    originalThesis: (r.original_thesis as string | null) ?? null,
    thesisChange: (r.thesis_change as string | null) ?? null,
    evidenceFor: (r.evidence_for as string | null) ?? null,
    evidenceAgainst: (r.evidence_against as string | null) ?? null,
    currentConclusion: (r.current_conclusion as string | null) ?? null,
    onWatchlist: (r.on_watchlist as boolean | null) ?? false,
    watchlistTrigger: (r.watchlist_trigger as WatchlistTrigger | null) ?? null,
    watchlistReason: (r.watchlist_reason as string | null) ?? null,
    requiredImprovement: (r.required_improvement as string | null) ?? null,
    reviewDeadline: (r.review_deadline as string | null) ?? null,
    exitTrigger: (r.exit_trigger as string | null) ?? null,
    annualDecision: (r.annual_decision as AnnualDecision | null) ?? null,
    annualNotes: (r.annual_notes as string | null) ?? null,
    convictionTier: (r.conviction_tier as ConvictionTier | null) ?? null,
  }
}

/**
 * Replace the per-holding assessments for one (draft or completed) review.
 * Delete-then-insert so a re-save reflects cleared fields — idempotent for drafts.
 * Empty assessments are dropped.
 */
export async function saveHoldingReviews(
  reviewLogId: number,
  portfolioName: string,
  assessments: HoldingAssessment[],
  reviewedAt: Date = new Date(),
): Promise<void> {
  const { error: delErr } = await supabase.from('holding_reviews').delete().eq('review_log_id', reviewLogId)
  if (delErr) throw delErr

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
      original_thesis: a.originalThesis,
      thesis_change: a.thesisChange,
      evidence_for: a.evidenceFor,
      evidence_against: a.evidenceAgainst,
      current_conclusion: a.currentConclusion,
      on_watchlist: a.onWatchlist,
      watchlist_trigger: a.watchlistTrigger,
      watchlist_reason: a.watchlistReason,
      required_improvement: a.requiredImprovement,
      review_deadline: a.reviewDeadline,
      exit_trigger: a.exitTrigger,
      annual_decision: a.annualDecision,
      annual_notes: a.annualNotes,
      conviction_tier: a.convictionTier,
    }))
  if (rows.length === 0) return
  const { error } = await supabase.from('holding_reviews').insert(rows)
  if (error) throw error
}

/** The per-holding assessments for one review (for resuming a draft). */
export async function fetchHoldingReviewsForLog(reviewLogId: number): Promise<HoldingReviewRow[]> {
  const { data, error } = await supabase
    .from('holding_reviews')
    .select(SELECT_COLS)
    .eq('review_log_id', reviewLogId)
  if (error) throw error
  return (data ?? []).map((r) => rowToAssessment(r as unknown as Record<string, unknown>))
}

/** All holding-review rows for a portfolio, newest review first (history). */
export async function fetchHoldingReviewsByPortfolio(portfolioName: string): Promise<HoldingReviewRow[]> {
  const { data, error } = await supabase
    .from('holding_reviews')
    .select(SELECT_COLS)
    .eq('portfolio_name', portfolioName)
    .order('reviewed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => rowToAssessment(r as unknown as Record<string, unknown>))
}
