/**
 * icMemos.ts
 *
 * Data-access layer for the AI investment team's `ic_memos` deliverable
 * (see docs/ai-investment-team-charter.md). The Investment Committee synthesis:
 * links a research report + a risk report, carries the PM's proposed weight and
 * rationale and the committee's recommendation, then records the CIO's actual
 * decision. This is the audit-defense artifact.
 *
 * Recommend-only: a memo is a proposal. Approving it never mutates positions here —
 * that stays a manual CIO action through the app's normal add-to-portfolio path.
 * Soft-deleted via `deleted_at`.
 */
import { supabase } from './supabase'

export type IcDecision = 'approve' | 'watchlist' | 'reject'
export type IcStatus = 'draft' | 'pending_cio' | 'approved' | 'rejected'

export interface IcMemo {
  id: number
  portfolio_name: string | null
  security_id: string
  addition_id: number | null
  research_report_id: number | null
  risk_report_id: number | null
  proposed_weight: number | null
  pm_rationale: string | null
  recommendation: IcDecision | null
  rationale: string | null
  decision: IcDecision | null
  decided_by: string | null
  decided_at: string | null
  status: IcStatus
  created_at: string
  deleted_at: string | null
}

const COLS =
  'id, portfolio_name, security_id, addition_id, research_report_id, risk_report_id, proposed_weight, pm_rationale, recommendation, rationale, decision, decided_by, decided_at, status, created_at, deleted_at'

function mapRow(r: Record<string, unknown>): IcMemo {
  return {
    id: r.id as number,
    portfolio_name: (r.portfolio_name as string | null) ?? null,
    security_id: r.security_id as string,
    addition_id: (r.addition_id as number | null) ?? null,
    research_report_id: (r.research_report_id as number | null) ?? null,
    risk_report_id: (r.risk_report_id as number | null) ?? null,
    proposed_weight: (r.proposed_weight as number | null) ?? null,
    pm_rationale: (r.pm_rationale as string | null) ?? null,
    recommendation: (r.recommendation as IcDecision | null) ?? null,
    rationale: (r.rationale as string | null) ?? null,
    decision: (r.decision as IcDecision | null) ?? null,
    decided_by: (r.decided_by as string | null) ?? null,
    decided_at: (r.decided_at as string | null) ?? null,
    status: r.status as IcStatus,
    created_at: r.created_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** All non-deleted memos for a portfolio, newest first. */
export async function fetchIcMemos(portfolioName: string): Promise<IcMemo[]> {
  const { data, error } = await supabase
    .from('ic_memos')
    .select(COLS)
    .eq('portfolio_name', portfolioName)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

export async function fetchIcMemo(id: number): Promise<IcMemo | null> {
  const { data, error } = await supabase
    .from('ic_memos')
    .select(COLS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data as unknown as Record<string, unknown>) : null
}

/** All non-deleted memos tied to a specific candidate (new-buy) draft, newest first. */
export async function fetchIcMemosForAddition(additionId: number): Promise<IcMemo[]> {
  const { data, error } = await supabase
    .from('ic_memos')
    .select(COLS)
    .eq('addition_id', additionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

export interface NewIcMemo {
  security_id: string
  portfolio_name?: string | null
  addition_id?: number | null
  research_report_id?: number | null
  risk_report_id?: number | null
  proposed_weight?: number | null
  pm_rationale?: string | null
  recommendation?: IcDecision | null
  rationale?: string | null
  /** Defaults to 'pending_cio' — a synthesized memo is ready for the CIO's call. */
  status?: IcStatus
}

export async function insertIcMemo(input: NewIcMemo): Promise<number> {
  const { data, error } = await supabase
    .from('ic_memos')
    .insert({
      security_id: input.security_id.toUpperCase(),
      portfolio_name: input.portfolio_name ?? null,
      addition_id: input.addition_id ?? null,
      research_report_id: input.research_report_id ?? null,
      risk_report_id: input.risk_report_id ?? null,
      proposed_weight: input.proposed_weight ?? null,
      pm_rationale: input.pm_rationale ?? null,
      recommendation: input.recommendation ?? null,
      rationale: input.rationale ?? null,
      status: input.status ?? 'pending_cio',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/**
 * Record the CIO's decision on a memo. Sets `decision`, `decided_by`, `decided_at`,
 * and moves `status` to 'approved' or 'rejected' (a 'watchlist' decision is a
 * non-approval, so it lands as 'rejected' for the buy — the watchlist add is a
 * separate manual action). Does NOT touch positions.
 */
export async function recordIcDecision(
  id: number,
  decision: IcDecision,
  decidedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('ic_memos')
    .update({
      decision,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      status: decision === 'approve' ? 'approved' : 'rejected',
    })
    .eq('id', id)
  if (error) throw error
}

export async function softDeleteIcMemo(id: number): Promise<void> {
  const { error } = await supabase
    .from('ic_memos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
