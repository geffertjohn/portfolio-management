import { supabase } from './supabase'

export type RuleType =
  | 'max_single_position'
  | 'min_equity_pct'
  | 'max_equity_pct'
  | 'min_fixed_income_pct'
  | 'max_fixed_income_pct'
  | 'min_cash_pct'
  | 'max_cash_pct'
  | 'min_position_weight'
  | 'max_position_count'
  | 'min_position_count'

export interface ComplianceRule {
  id: number
  portfolio_name: string
  rule_type: RuleType
  label: string
  threshold_value: number
  is_active: boolean
  created_at: string
}

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  max_single_position:    'Max Single Position',
  min_equity_pct:         'Min Equity %',
  max_equity_pct:         'Max Equity %',
  min_fixed_income_pct:   'Min Fixed Income %',
  max_fixed_income_pct:   'Max Fixed Income %',
  min_cash_pct:           'Min Cash %',
  max_cash_pct:           'Max Cash %',
  min_position_weight:    'Min Position Weight',
  max_position_count:     'Max Position Count',
  min_position_count:     'Min Position Count',
}

/** Rule types that operate on portfolio-level aggregates. */
export const PORTFOLIO_RULE_TYPES = new Set<RuleType>([
  'max_single_position', 'min_equity_pct', 'max_equity_pct',
  'min_fixed_income_pct', 'max_fixed_income_pct', 'min_cash_pct', 'max_cash_pct',
])

/** Rule types that operate on individual positions. */
export const POSITION_RULE_TYPES = new Set<RuleType>([
  'min_position_weight', 'max_position_count', 'min_position_count',
])

export async function fetchAllComplianceRules(): Promise<ComplianceRule[]> {
  const { data, error } = await supabase
    .from('compliance_rules')
    .select('*')
    .is('deleted_at', null)
    .order('portfolio_name', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  // DB stores rule_type as text; domain type narrows it
  return (data ?? []) as ComplianceRule[]
}

export async function fetchComplianceRules(portfolioName: string): Promise<ComplianceRule[]> {
  const { data, error } = await supabase
    .from('compliance_rules')
    .select('*')
    .eq('portfolio_name', portfolioName)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  // DB stores rule_type as text; domain type narrows it
  return (data ?? []) as ComplianceRule[]
}

export async function createComplianceRule(rule: Omit<ComplianceRule, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('compliance_rules').insert(rule)
  if (error) throw error
}

export async function updateComplianceRule(id: number, updates: Partial<ComplianceRule>): Promise<void> {
  const { error } = await supabase.from('compliance_rules').update(updates).eq('id', id)
  if (error) throw error
}

/** Soft-delete: sets deleted_at and preserves the rule version for regulatory retention. */
export async function deleteComplianceRule(id: number): Promise<void> {
  const { error } = await supabase
    .from('compliance_rules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
