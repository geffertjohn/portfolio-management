/**
 * ips.ts
 *
 * Investment Policy Statement (IPS) data layer.
 * One IPS record per client — upsert replaces in place.
 * Historical versions are captured by the audit_log trigger.
 */
import { supabase } from './supabase'

export type RiskTolerance =
  | 'conservative'
  | 'moderately_conservative'
  | 'moderate'
  | 'moderately_aggressive'
  | 'aggressive'

export type InvestmentObjective =
  | 'capital_preservation'
  | 'income'
  | 'balanced'
  | 'growth'
  | 'aggressive_growth'

export type LiquidityNeeds = 'low' | 'medium' | 'high'

export interface IPS {
  id: number
  client_id: number
  risk_tolerance: RiskTolerance
  investment_objective: InvestmentObjective
  time_horizon_years: number | null
  liquidity_needs: LiquidityNeeds | null
  return_target_pct: number | null
  equity_min_pct: number | null
  equity_max_pct: number | null
  fixed_income_min_pct: number | null
  fixed_income_max_pct: number | null
  cash_min_pct: number | null
  cash_max_pct: number | null
  notes: string | null
  effective_date: string
  created_at: string
  updated_at: string
}

export type IPSInput = Omit<IPS, 'id' | 'client_id' | 'created_at' | 'updated_at'>

export const RISK_TOLERANCE_LABELS: Record<RiskTolerance, string> = {
  conservative: 'Conservative',
  moderately_conservative: 'Moderately Conservative',
  moderate: 'Moderate',
  moderately_aggressive: 'Moderately Aggressive',
  aggressive: 'Aggressive',
}

export const INVESTMENT_OBJECTIVE_LABELS: Record<InvestmentObjective, string> = {
  capital_preservation: 'Capital Preservation',
  income: 'Income',
  balanced: 'Balanced',
  growth: 'Growth',
  aggressive_growth: 'Aggressive Growth',
}

export const LIQUIDITY_NEEDS_LABELS: Record<LiquidityNeeds, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export async function fetchIPSByClient(clientId: number): Promise<IPS | null> {
  const { data, error } = await supabase
    .from('investment_policy_statements')
    .select('*')
    .eq('client_id', clientId)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  // DB stores risk_tolerance/liquidity_needs as text; domain type narrows them
  return data as IPS | null
}

export async function upsertIPS(clientId: number, input: IPSInput): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from('investment_policy_statements')
    .select('id')
    .eq('client_id', clientId)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    const { error } = await supabase
      .from('investment_policy_statements')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('investment_policy_statements')
      .insert({ client_id: clientId, ...input })
    if (error) throw error
  }
}
