/**
 * securityAdditions.ts
 *
 * Guided "add a new stock to a portfolio" workflow (stages 3–8 of the buy
 * process; stages 1–2 — idea generation + initial screening — are non-actionable).
 * Mirrors the portfolio-review draft lifecycle: one `security_additions` row per
 * candidate, edited in a dedicated workspace, autosaved, then completed with a
 * decision. Stocks only, portfolio-scoped. Recorded-only (no side effects yet).
 */
import { supabase } from './supabase'
import type { Json } from '@/types/database.types'

export type AdditionStatus = 'draft' | 'completed'
export type AdditionDecision = 'approve' | 'watchlist' | 'reject'
export type ThesisStrength = 'high' | 'medium' | 'low'
export type SizingConviction = 'high' | 'medium' | 'low'

export const DECISION_OPTIONS: AdditionDecision[] = ['approve', 'watchlist', 'reject']
export const DECISION_LABELS: Record<AdditionDecision, string> = {
  approve: 'Approve', watchlist: 'Watchlist', reject: 'Reject',
}
export const DECISION_BADGE: Record<AdditionDecision, string> = {
  approve: 'bg-green-100 text-green-700',
  watchlist: 'bg-amber-100 text-amber-700',
  reject: 'bg-red-100 text-red-700',
}

const STRENGTH_OPTIONS: ThesisStrength[] = ['high', 'medium', 'low']
const STRENGTH_LABELS = ['High', 'Medium', 'Low']

// ── Stage / field definitions ───────────────────────────────────────────────

export type FieldType = 'textarea' | 'text' | 'number' | 'date' | 'select'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  guidance?: string
  placeholder?: string
  options?: { value: string; label: string }[]
  /** Number suffix, e.g. '%'. */
  unit?: string
}

export interface StageDef {
  key: string
  /** Stage number from the documented process (3–8). */
  stage: number
  label: string
  purpose?: string
  /** Output label shown when the stage is marked done. */
  output?: string
  guidance?: string[]
  fields: FieldDef[]
}

const sel = (opts: string[], labels: string[]) =>
  opts.map((value, i) => ({ value, label: labels[i] }))

export const ADDITION_STAGES: StageDef[] = [
  {
    key: 'full_research', stage: 3, label: 'Full Research', output: 'Research Complete',
    purpose: 'Does this company deserve capital? This is where the thesis document gets created.',
    fields: [
      { key: 'business_overview', label: 'Business Overview', type: 'textarea', guidance: 'What does the company do? Revenue sources, major segments.' },
      { key: 'investment_thesis', label: 'Investment Thesis', type: 'textarea', guidance: 'Typically 2–4 reasons (e.g. durable advantage, above-average growth, expanding margins, attractive valuation).' },
      { key: 'risks', label: 'Risks', type: 'textarea', guidance: 'e.g. regulatory risk, customer concentration, cyclicality.' },
      { key: 'financial_review', label: 'Financial Review', type: 'textarea', guidance: 'Revenue growth, EPS growth, margins, ROIC, balance sheet, cash flow.' },
      { key: 'valuation', label: 'Valuation', type: 'textarea', guidance: 'Forward P/E, PEG, EV/EBITDA, DCF (if used).' },
      { key: 'portfolio_fit', label: 'Portfolio Fit', type: 'textarea', guidance: 'Why is this better than existing opportunities?' },
    ],
  },
  {
    key: 'portfolio_fit_review', stage: 4, label: 'Portfolio Fit Review', output: 'Portfolio Candidate',
    purpose: 'Even if it’s a good company, should it be in THIS portfolio?',
    fields: [
      { key: 'strategy_fit', label: 'Strategy Fit', type: 'textarea', guidance: 'Growth portfolio → growth characteristics; income portfolio → income characteristics.' },
      { key: 'sector_exposure', label: 'Sector Exposure', type: 'textarea', guidance: 'Does it create concentration?' },
      { key: 'factor_exposure', label: 'Factor Exposure', type: 'textarea', guidance: 'Adds growth? value? dividend? quality?' },
      { key: 'existing_holdings', label: 'Existing Holdings', type: 'textarea', guidance: 'Which current holding would I rather own? Document comparable holdings, advantages, disadvantages. (Often the most important question.)' },
    ],
  },
  {
    key: 'approval_decision', stage: 5, label: 'Approval Decision', output: 'Decision',
    purpose: 'Formal decision point.',
    fields: [
      { key: 'thesis_strength', label: 'Thesis Strength', type: 'select', options: sel(STRENGTH_OPTIONS, STRENGTH_LABELS) },
      { key: 'expected_return', label: 'Expected Return', type: 'text', guidance: 'Attractive?', placeholder: 'e.g. ~12% IRR; attractive vs. alternatives' },
      { key: 'downside_risk', label: 'Downside Risk', type: 'text', guidance: 'Acceptable?', placeholder: 'e.g. ~20% drawdown in a recession; acceptable' },
      { key: 'portfolio_fit_appropriate', label: 'Portfolio Fit', type: 'text', guidance: 'Appropriate?', placeholder: 'e.g. Fits growth sleeve; no over-concentration' },
      { key: 'decision', label: 'Decision', type: 'select', options: sel(DECISION_OPTIONS, DECISION_OPTIONS.map((d) => DECISION_LABELS[d])) },
      { key: 'rationale', label: 'Rationale', type: 'textarea', guidance: 'Document the decision rationale.' },
    ],
  },
  {
    key: 'position_sizing', stage: 6, label: 'Position Sizing',
    purpose: 'How much conviction do I have?',
    guidance: [
      'Initial weight by conviction — High: 4–5% · Medium: 2–4% · Low: 1–2%.',
      'Also weigh volatility, liquidity, sector concentration, and correlation with existing holdings.',
    ],
    fields: [
      { key: 'conviction', label: 'Conviction', type: 'select', options: sel(STRENGTH_OPTIONS, STRENGTH_LABELS) },
      { key: 'initial_weight', label: 'Initial weight', type: 'number', unit: '%' },
      { key: 'max_weight', label: 'Maximum weight', type: 'number', unit: '%' },
      { key: 'sizing_reason', label: 'Reason', type: 'textarea', placeholder: 'Why this size?' },
    ],
  },
  {
    key: 'purchase', stage: 7, label: 'Purchase',
    purpose: 'Record the trade.',
    fields: [
      { key: 'purchase_date', label: 'Date', type: 'date' },
      { key: 'purchase_price', label: 'Price', type: 'number', unit: '$' },
      { key: 'purchase_allocation', label: 'Allocation', type: 'number', unit: '%' },
      { key: 'funding_source', label: 'Funding source', type: 'text', placeholder: 'e.g. Cash / trimmed XYZ' },
      { key: 'trade_rationale', label: 'Trade rationale', type: 'textarea', placeholder: 'e.g. Initiated 3% position funded from cash. Thesis based on durable competitive position, accelerating earnings growth, and attractive valuation.' },
    ],
  },
  {
    key: 'monitoring_setup', stage: 8, label: 'Monitoring Setup',
    purpose: 'Define this before the stock has a chance to disappoint.',
    fields: [
      { key: 'success_criteria', label: 'Success Criteria', type: 'textarea', guidance: 'What would prove the thesis correct? e.g. revenue growth >10%, operating margin expands, FCF growth exceeds market.' },
      { key: 'watchlist_triggers', label: 'Watchlist Triggers', type: 'textarea', guidance: 'e.g. two consecutive earnings misses, margin deterioration, debt increase.' },
      { key: 'exit_triggers', label: 'Exit Triggers', type: 'textarea', guidance: 'e.g. thesis broken, competitive advantage impaired, capital allocation concerns.' },
    ],
  },
]

export interface AdditionChecklistItem { key: string; label: string; done: boolean; notes: string | null }

export interface SecurityAddition {
  id: number
  portfolio_name: string
  security_id: string
  status: AdditionStatus
  decision: AdditionDecision | null
  content: Record<string, unknown>
  checklist: AdditionChecklistItem[]
  created_at: string
  updated_at: string
  completed_at: string | null
}

const COLS = 'id, portfolio_name, security_id, status, decision, content, checklist, created_at, updated_at, completed_at'

function mapRow(r: Record<string, unknown>): SecurityAddition {
  return {
    id: r.id as number,
    portfolio_name: r.portfolio_name as string,
    security_id: r.security_id as string,
    status: r.status as AdditionStatus,
    decision: (r.decision as AdditionDecision | null) ?? null,
    content: (r.content as Record<string, unknown> | null) ?? {},
    checklist: (r.checklist as AdditionChecklistItem[] | null) ?? [],
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    completed_at: (r.completed_at as string | null) ?? null,
  }
}

function seededChecklist(): AdditionChecklistItem[] {
  return ADDITION_STAGES.map((s) => ({ key: s.key, label: s.label, done: false, notes: null }))
}

/** Create a new candidate draft (or resume an existing open draft for the same ticker). */
export async function createCandidate(portfolioName: string, ticker: string): Promise<number> {
  const sym = ticker.trim().toUpperCase()
  const { data: existing } = await supabase
    .from('security_additions')
    .select('id')
    .eq('portfolio_name', portfolioName)
    .eq('security_id', sym)
    .eq('status', 'draft')
    .maybeSingle()
  if (existing) return (existing as { id: number }).id

  const { data, error } = await supabase
    .from('security_additions')
    .insert({ portfolio_name: portfolioName, security_id: sym, status: 'draft', content: {}, checklist: seededChecklist() as unknown as Json })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function fetchCandidates(portfolioName: string): Promise<SecurityAddition[]> {
  const { data, error } = await supabase
    .from('security_additions')
    .select(COLS)
    .eq('portfolio_name', portfolioName)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

export async function fetchCandidate(id: number): Promise<SecurityAddition | null> {
  const { data, error } = await supabase.from('security_additions').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapRow(data as unknown as Record<string, unknown>) : null
}

export interface SaveCandidateFields {
  content: Record<string, unknown>
  checklist: AdditionChecklistItem[]
}

function decisionFromContent(content: Record<string, unknown>): AdditionDecision | null {
  const d = content.decision
  return d === 'approve' || d === 'watchlist' || d === 'reject' ? d : null
}

export async function saveCandidateDraft(id: number, fields: SaveCandidateFields): Promise<void> {
  const { error } = await supabase
    .from('security_additions')
    .update({
      content: fields.content as unknown as Json,
      checklist: fields.checklist as unknown as Json,
      decision: decisionFromContent(fields.content),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function completeCandidate(id: number, fields: SaveCandidateFields): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('security_additions')
    .update({
      status: 'completed',
      completed_at: now,
      content: fields.content as unknown as Json,
      checklist: fields.checklist as unknown as Json,
      decision: decisionFromContent(fields.content),
      updated_at: now,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCandidate(id: number): Promise<void> {
  const { error } = await supabase.from('security_additions').delete().eq('id', id)
  if (error) throw error
}
