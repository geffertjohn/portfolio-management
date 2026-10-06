/**
 * researchReports.ts
 *
 * Data-access layer for the AI investment team's `research_reports` deliverable
 * (see docs/ai-investment-team-charter.md). One row per analyst / devil's-advocate
 * report on a security — thesis, bull/bear cases, a fair-value estimate with its
 * assumptions, a rating, and cited sources. Recommend-only; recorded, never acted on.
 *
 * `security_id` is the text ticker (no FK — a candidate may not be in securities2 yet).
 * Soft-deleted via `deleted_at`.
 */
import { supabase } from './supabase'
import type { Json } from '@/types/database.types'

/**
 * `pre_earnings` was called `earnings_review` until Oct 2026, when the
 * post-earnings counterpart arrived and the old name stopped distinguishing
 * anything. The 30 existing briefs were all pre-earnings and were renamed.
 */
export type ReportType = 'initial' | 'pre_earnings' | 'post_earnings' | 'update'
export type Rating = 'buy' | 'add' | 'hold' | 'trim' | 'sell'
export type Conviction = 'high' | 'medium' | 'low'
export type ReportStatus = 'draft' | 'final'
/** Which agent authored the report — free-form, but these are the expected roles. */
export type AuthorRole = 'research_analyst' | 'devils_advocate' | 'quant_analyst' | (string & {})

export interface Citation { title?: string; url?: string; note?: string }

/** How a post-earnings brief judged one of the pre-brief's watch-items. */
export type WatchVerdict = 'hit' | 'miss' | 'unclear'

/**
 * One "what actually matters this print" item, carried across both briefs.
 *
 * The PRE brief sets `key`/`title`/`detail` — what to watch and what the bar is.
 * The POST brief copies those forward unchanged and adds `verdict`/`actual`/
 * `note`. Same shape from both ends, so the card renders either without
 * branching on report type, and a resolved item still shows what was asked.
 */
export interface WatchItem {
  key: string
  title: string
  detail?: string | null
  verdict?: WatchVerdict | null
  actual?: string | null
  note?: string | null
}

/** Post-earnings verdict. Same vocabulary as `holding_reviews.thesis_status`. */
export type ThesisStatus = 'intact' | 'at_risk' | 'broken'

export interface ResearchReport {
  id: number
  security_id: string
  portfolio_name: string | null
  addition_id: number | null
  author_role: AuthorRole
  report_type: ReportType
  /** The pre-earnings brief a post-earnings brief answers. Required for `post_earnings`. */
  parent_report_id: number | null
  watch_items: WatchItem[] | null
  thesis_status: ThesisStatus | null
  thesis: string | null
  bull_case: string | null
  bear_case: string | null
  rating: Rating | null
  conviction: Conviction | null
  fair_value: number | null
  current_price: number | null
  dcf_inputs: Record<string, unknown> | null
  valuation_summary: Record<string, unknown> | null
  sources: Citation[] | null
  status: ReportStatus
  created_at: string
  deleted_at: string | null
}

const COLS =
  'id, security_id, portfolio_name, addition_id, author_role, report_type, parent_report_id, watch_items, thesis_status, thesis, bull_case, bear_case, rating, conviction, fair_value, current_price, dcf_inputs, valuation_summary, sources, status, created_at, deleted_at'

function mapRow(r: Record<string, unknown>): ResearchReport {
  return {
    id: r.id as number,
    security_id: r.security_id as string,
    portfolio_name: (r.portfolio_name as string | null) ?? null,
    addition_id: (r.addition_id as number | null) ?? null,
    author_role: r.author_role as AuthorRole,
    report_type: r.report_type as ReportType,
    parent_report_id: (r.parent_report_id as number | null) ?? null,
    watch_items: (r.watch_items as WatchItem[] | null) ?? null,
    thesis_status: (r.thesis_status as ThesisStatus | null) ?? null,
    thesis: (r.thesis as string | null) ?? null,
    bull_case: (r.bull_case as string | null) ?? null,
    bear_case: (r.bear_case as string | null) ?? null,
    rating: (r.rating as Rating | null) ?? null,
    conviction: (r.conviction as Conviction | null) ?? null,
    fair_value: (r.fair_value as number | null) ?? null,
    current_price: (r.current_price as number | null) ?? null,
    dcf_inputs: (r.dcf_inputs as Record<string, unknown> | null) ?? null,
    valuation_summary: (r.valuation_summary as Record<string, unknown> | null) ?? null,
    sources: (r.sources as Citation[] | null) ?? null,
    status: r.status as ReportStatus,
    created_at: r.created_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** All non-deleted reports for a security, newest first. */
export async function fetchResearchReports(securityId: string): Promise<ResearchReport[]> {
  const { data, error } = await supabase
    .from('research_reports')
    .select(COLS)
    .eq('security_id', securityId.toUpperCase())
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

/** All non-deleted reports tied to a specific candidate (new-buy) draft, newest first. */
export async function fetchResearchReportsForAddition(additionId: number): Promise<ResearchReport[]> {
  const { data, error } = await supabase
    .from('research_reports')
    .select(COLS)
    .eq('addition_id', additionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

export interface NewResearchReport {
  security_id: string
  author_role: AuthorRole
  portfolio_name?: string | null
  addition_id?: number | null
  report_type?: ReportType
  parent_report_id?: number | null
  watch_items?: WatchItem[] | null
  thesis_status?: ThesisStatus | null
  thesis?: string | null
  bull_case?: string | null
  bear_case?: string | null
  rating?: Rating | null
  conviction?: Conviction | null
  fair_value?: number | null
  current_price?: number | null
  dcf_inputs?: Record<string, unknown> | null
  valuation_summary?: Record<string, unknown> | null
  sources?: Citation[] | null
  status?: ReportStatus
}

export async function insertResearchReport(input: NewResearchReport): Promise<number> {
  const { data, error } = await supabase
    .from('research_reports')
    .insert({
      security_id: input.security_id.toUpperCase(),
      author_role: input.author_role,
      portfolio_name: input.portfolio_name ?? null,
      addition_id: input.addition_id ?? null,
      report_type: input.report_type ?? 'initial',
      parent_report_id: input.parent_report_id ?? null,
      watch_items: (input.watch_items ?? null) as unknown as Json,
      thesis_status: input.thesis_status ?? null,
      thesis: input.thesis ?? null,
      bull_case: input.bull_case ?? null,
      bear_case: input.bear_case ?? null,
      rating: input.rating ?? null,
      conviction: input.conviction ?? null,
      fair_value: input.fair_value ?? null,
      current_price: input.current_price ?? null,
      dcf_inputs: (input.dcf_inputs ?? null) as unknown as Json,
      valuation_summary: (input.valuation_summary ?? null) as unknown as Json,
      sources: (input.sources ?? null) as unknown as Json,
      status: input.status ?? 'final',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function softDeleteResearchReport(id: number): Promise<void> {
  const { error } = await supabase
    .from('research_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
