/**
 * riskReports.ts
 *
 * Data-access layer for the AI investment team's `risk_reports` deliverable
 * (see docs/ai-investment-team-charter.md). The Risk Manager's assessment of what
 * could hurt the portfolio: concentration, factor exposures, mandate/limit checks,
 * and a verdict (pass / warn / veto). A `veto` blocks an IC memo from reaching the
 * CIO as approval-ready. Recommend-only; recorded, never acted on.
 *
 * Soft-deleted via `deleted_at`.
 */
import { supabase } from './supabase'
import type { Json } from '@/types/database.types'

export type RiskVerdict = 'pass' | 'warn' | 'veto'
export type RiskScope = 'candidate' | 'portfolio'

/** One mandate/limit check, e.g. { limit: 'Single position ≤ 6%', actual: 7.2, pass: false }. */
export interface MandateCheck { limit: string; actual?: string | number | null; pass: boolean }

export interface RiskReport {
  id: number
  portfolio_name: string | null
  security_id: string | null
  addition_id: number | null
  scope: RiskScope
  concentration: Record<string, unknown> | null
  factor_exposures: Record<string, unknown> | null
  mandate_checks: MandateCheck[] | null
  verdict: RiskVerdict
  notes: string | null
  created_at: string
  deleted_at: string | null
}

const COLS =
  'id, portfolio_name, security_id, addition_id, scope, concentration, factor_exposures, mandate_checks, verdict, notes, created_at, deleted_at'

function mapRow(r: Record<string, unknown>): RiskReport {
  return {
    id: r.id as number,
    portfolio_name: (r.portfolio_name as string | null) ?? null,
    security_id: (r.security_id as string | null) ?? null,
    addition_id: (r.addition_id as number | null) ?? null,
    scope: r.scope as RiskScope,
    concentration: (r.concentration as Record<string, unknown> | null) ?? null,
    factor_exposures: (r.factor_exposures as Record<string, unknown> | null) ?? null,
    mandate_checks: (r.mandate_checks as MandateCheck[] | null) ?? null,
    verdict: r.verdict as RiskVerdict,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** All non-deleted risk reports for a portfolio, newest first. */
export async function fetchRiskReports(portfolioName: string): Promise<RiskReport[]> {
  const { data, error } = await supabase
    .from('risk_reports')
    .select(COLS)
    .eq('portfolio_name', portfolioName)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

/** All non-deleted risk reports tied to a specific candidate (new-buy) draft, newest first. */
export async function fetchRiskReportsForAddition(additionId: number): Promise<RiskReport[]> {
  const { data, error } = await supabase
    .from('risk_reports')
    .select(COLS)
    .eq('addition_id', additionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

export interface NewRiskReport {
  scope: RiskScope
  portfolio_name?: string | null
  security_id?: string | null
  addition_id?: number | null
  concentration?: Record<string, unknown> | null
  factor_exposures?: Record<string, unknown> | null
  mandate_checks?: MandateCheck[] | null
  verdict?: RiskVerdict
  notes?: string | null
}

export async function insertRiskReport(input: NewRiskReport): Promise<number> {
  const { data, error } = await supabase
    .from('risk_reports')
    .insert({
      scope: input.scope,
      portfolio_name: input.portfolio_name ?? null,
      security_id: input.security_id ? input.security_id.toUpperCase() : null,
      addition_id: input.addition_id ?? null,
      concentration: (input.concentration ?? null) as unknown as Json,
      factor_exposures: (input.factor_exposures ?? null) as unknown as Json,
      mandate_checks: (input.mandate_checks ?? null) as unknown as Json,
      verdict: input.verdict ?? 'pass',
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function softDeleteRiskReport(id: number): Promise<void> {
  const { error } = await supabase
    .from('risk_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
