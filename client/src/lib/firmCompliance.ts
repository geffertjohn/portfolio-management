import { supabase } from './supabase'

export interface FirmComplianceRule {
  id: number
  rule_type: 'max_single_position' | 'min_holdings_count' | 'consistency_deviation'
  threshold_value: number
  label: string
  is_active: boolean
  updated_at: string
}

export async function fetchFirmComplianceRules(): Promise<FirmComplianceRule[]> {
  const { data, error } = await supabase
    .from('firm_compliance_rules')
    .select('*')
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function updateFirmComplianceRule(
  id: number,
  patch: Partial<Pick<FirmComplianceRule, 'threshold_value' | 'is_active'>>
): Promise<void> {
  const { error } = await supabase
    .from('firm_compliance_rules')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function fetchClientPortfolioNames(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('client_portfolios')
    .select('portfolio_name')
  if (error) throw error
  return new Set((data ?? []).map((r: { portfolio_name: string }) => r.portfolio_name))
}

export async function fetchAllPortfolioPositions(): Promise<
  Array<{ portfolioName: string; securityId: string; weight: number }>
> {
  const { data, error } = await supabase
    .from('positions')
    .select('portfolio_name, security_id, allocation_pct')
    .is('deleted_at', null)
  if (error) throw error
  type PositionRow = { portfolio_name: string; security_id: string; allocation_pct: number | string }
  return (data ?? []).map((row: PositionRow) => ({
    portfolioName: row.portfolio_name,
    securityId: row.security_id,
    weight: Number(row.allocation_pct),
  }))
}
