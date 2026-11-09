/**
 * portfolioReviewMemos.ts
 *
 * The investment committee's read on a fund portfolio's ANNUAL review, and the
 * handoff that asks for it.
 *
 * **The app cannot run the committee, and this module does not pretend it
 * can.** The roles run in the Claude Code harness — there is no Express →
 * Anthropic bridge, which the charter records as a deliberate position rather
 * than an oversight. So the handoff is a QUEUE: finishing Considerations
 * stamps `committee_requested_at`, a committee run reads the queue, writes a
 * memo, and the review's committee step stops saying "awaiting" because the
 * memo now exists.
 *
 * **Status is derived from two facts, never stored.** Requested or not, and a
 * memo or not. A third column saying "delivered" could contradict either, and
 * this session has spent a long time deleting exactly that kind of second copy.
 */
import { supabase } from './supabase'
import type { AnnualDecision } from './holdingReviews'
import type { Json } from '@/types/database.types'

/** One holding, as the committee would have it. Same vocabulary as the advisor's proposal. */
export interface MemoRecommendation {
  securityId: string
  recommendation: AnnualDecision | null
  targetWeight: number | null
  rationale: string | null
}

export interface PortfolioReviewMemo {
  id: number
  reviewLogId: number
  portfolioName: string
  pmAssessment: string | null
  riskAssessment: string | null
  macroContext: string | null
  recommendations: MemoRecommendation[]
  summary: string | null
  riskReportId: number | null
  createdAt: string
}

/** Where a review stands with the committee. Derived, never stored. */
export type CommitteeStage = 'not_requested' | 'awaiting' | 'delivered'

export function committeeStage(
  requestedAt: string | null | undefined,
  memo: PortfolioReviewMemo | null,
): CommitteeStage {
  if (memo) return 'delivered'
  return requestedAt ? 'awaiting' : 'not_requested'
}

const COLS =
  'id, review_log_id, portfolio_name, pm_assessment, risk_assessment, macro_context, ' +
  'recommendations, summary, risk_report_id, created_at'

function parseRecommendations(value: unknown): MemoRecommendation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (raw === null || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    const securityId = typeof r.securityId === 'string' ? r.securityId : null
    if (!securityId) return []
    return [{
      securityId,
      recommendation: (r.recommendation as AnnualDecision | null) ?? null,
      targetWeight: r.targetWeight == null ? null : Number(r.targetWeight),
      rationale: typeof r.rationale === 'string' ? r.rationale : null,
    }]
  })
}

function mapRow(r: Record<string, unknown>): PortfolioReviewMemo {
  return {
    id: r.id as number,
    reviewLogId: r.review_log_id as number,
    portfolioName: r.portfolio_name as string,
    pmAssessment: (r.pm_assessment as string | null) ?? null,
    riskAssessment: (r.risk_assessment as string | null) ?? null,
    macroContext: (r.macro_context as string | null) ?? null,
    recommendations: parseRecommendations(r.recommendations),
    summary: (r.summary as string | null) ?? null,
    riskReportId: (r.risk_report_id as number | null) ?? null,
    createdAt: r.created_at as string,
  }
}

/** The live memo for one review, or null while the committee has not reported. */
export async function fetchReviewMemo(reviewLogId: number): Promise<PortfolioReviewMemo | null> {
  const { data, error } = await supabase
    .from('portfolio_review_memos')
    .select(COLS)
    .eq('review_log_id', reviewLogId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data as unknown as Record<string, unknown>) : null
}

/**
 * Hand the review to the committee.
 *
 * Stamps the queue and stores the advisor's standing note, which is all the
 * handoff carries. The step used to also write per-holding proposals to
 * `holding_reviews`; it does not any more — the committee is briefed on the
 * book, each holding's category and the watchlist ideas competing in it, none
 * of which the advisor types, so none of which the handoff has to move.
 *
 * **The note is optional, and an empty one does not mean an empty handoff.**
 * The committee job's skip gate tested `proposed_decision` rows AND
 * `considerations` — a test that became true of every handoff when the
 * proposal columns went — so it now gates on the portfolio having holdings at
 * all. Keep the two in step if this ever carries more again.
 */
export async function requestCommitteeReview(
  reviewLogId: number,
  considerations: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('portfolio_review_log')
    .update({
      considerations: considerations?.trim() || null,
      committee_requested_at: new Date().toISOString(),
    })
    .eq('id', reviewLogId)
  if (error) throw error
}

/** Withdraw the handoff — the review goes back to being the advisor's to edit. */
export async function cancelCommitteeRequest(reviewLogId: number): Promise<void> {
  const { error } = await supabase
    .from('portfolio_review_log')
    .update({ committee_requested_at: null })
    .eq('id', reviewLogId)
  if (error) throw error
}

/**
 * Write the committee's memo. **Called by a Claude Code run, not by the app.**
 *
 * Exported so the contract has one definition that `tsc` checks, rather than
 * living only as column names inside a prompt — the failure the committee
 * write API was built to stop. A second live memo is refused by a partial
 * unique index: the final step has to know which read it is deciding against.
 */
export async function saveReviewMemo(input: {
  reviewLogId: number
  portfolioName: string
  pmAssessment?: string | null
  riskAssessment?: string | null
  macroContext?: string | null
  recommendations?: MemoRecommendation[]
  summary?: string | null
  riskReportId?: number | null
}): Promise<number> {
  const { data, error } = await supabase
    .from('portfolio_review_memos')
    .insert({
      review_log_id: input.reviewLogId,
      portfolio_name: input.portfolioName,
      pm_assessment: input.pmAssessment ?? null,
      risk_assessment: input.riskAssessment ?? null,
      macro_context: input.macroContext ?? null,
      recommendations: (input.recommendations ?? []) as unknown as Json,
      summary: input.summary ?? null,
      risk_report_id: input.riskReportId ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}
