import { supabase } from './supabase'

export interface ModelPortfolio {
  id: number
  name: string | null
  investment_objective: string | null
  equity_objective: string | null
  equity_risk: string | null
  risk_profile: string | null
  benchmark: string | null
  rebalance_frequency: string | null
  review_frequency: string | null
  description: string | null
  objective_statement: string | null
  investment_philosophy: string | null
  category_drift_percentage: number | null
  asset_class_drift_percentage: number | null
  drift_percentage: number | null
  category_allocation_mode: string | null
  asset_class_allocation_mode: string | null
  model_category: string | null

  equity_lower_limit: number | null
  equity_target: number | null
  equity_upper_limit: number | null

  fixed_income_lower_limit: number | null
  fixed_income_target: number | null
  fixed_income_upper_limit: number | null

  large_cap_blend_lower_limit: number | null
  large_cap_blend_target: number | null
  large_cap_blend_upper_limit: number | null

  large_cap_value_lower_limit: number | null
  large_cap_value_target: number | null
  large_cap_value_upper_limit: number | null

  large_cap_growth_lower_limit: number | null
  large_cap_growth_target: number | null
  large_cap_growth_upper_limit: number | null

  us_mid_cap_lower_limit: number | null
  us_mid_cap_target: number | null
  us_mid_cap_upper_limit: number | null

  us_small_cap_lower_limit: number | null
  us_small_cap_target: number | null
  us_small_cap_upper_limit: number | null

  non_us_developed_lower_limit: number | null
  non_us_developed_target: number | null
  non_us_developed_upper_limit: number | null

  emerging_market_lower_limit: number | null
  emerging_market_target: number | null
  emerging_market_upper_limit: number | null

  ig_intermediate_fixed_income_lower_limit: number | null
  ig_intermediate_fixed_income_target: number | null
  ig_intermediate_fixed_income_upper_limit: number | null

  non_ig_fixed_income_lower_limit: number | null
  non_ig_fixed_income_target: number | null
  non_ig_fixed_income_upper_limit: number | null

  ig_short_fixed_income_lower_limit: number | null
  ig_short_fixed_income_target: number | null
  ig_short_fixed_income_upper_limit: number | null

  non_us_fixed_income_lower_limit: number | null
  non_us_fixed_income_target: number | null
  non_us_fixed_income_upper_limit: number | null

  multi_sector_fixed_income_lower_limit: number | null
  multi_sector_fixed_income_target: number | null
  multi_sector_fixed_income_upper_limit: number | null

  alternatives_lower_limit: number | null
  alternatives_target: number | null
  alternatives_upper_limit: number | null

  cash_lower_limit: number | null
  cash_target: number | null
  cash_upper_limit: number | null

  // Conviction-ranking tier target weight bands (percent points), for annual reviews.
  tier1_lower: number | null
  tier1_upper: number | null
  tier2_lower: number | null
  tier2_upper: number | null
  tier3_lower: number | null
  tier3_upper: number | null
  tier4_lower: number | null
  tier4_upper: number | null

  created_at: string
  updated_at: string
}

export type ModelPortfolioInput = Omit<ModelPortfolio, 'id' | 'created_at' | 'updated_at'>

export const ASSET_CLASS_ROWS: { label: string; key: string }[] = [
  { label: 'Large Cap Blend',                                    key: 'large_cap_blend' },
  { label: 'Large Cap Value',                                    key: 'large_cap_value' },
  { label: 'Large Cap Growth',                                   key: 'large_cap_growth' },
  { label: 'US Mid Cap',                                         key: 'us_mid_cap' },
  { label: 'US Small Cap',                                       key: 'us_small_cap' },
  { label: 'Non-US Developed',                                   key: 'non_us_developed' },
  { label: 'Emerging Market',                                    key: 'emerging_market' },
  { label: 'IG Intermediate Maturity Fixed Income',              key: 'ig_intermediate_fixed_income' },
  { label: 'Non-Investment Grade Fixed Income',                  key: 'non_ig_fixed_income' },
  { label: 'IG Short Maturity Fixed Income',                     key: 'ig_short_fixed_income' },
  { label: 'Non-US Fixed Income',                                key: 'non_us_fixed_income' },
  { label: 'Multi-Sector Fixed Income',                          key: 'multi_sector_fixed_income' },
  { label: 'Alternative Investments',                            key: 'alternatives' },
  { label: 'Cash & Cash Alternatives',                           key: 'cash' },
]

export async function fetchModelPortfolioById(id: number): Promise<ModelPortfolio | null> {
  const { data, error } = await supabase
    .from('model_portfolio_data')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as ModelPortfolio | null
}

export async function fetchDirectModelPortfolioId(securityId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('portfolio_model_map')
    .select('model_portfolio_id')
    .eq('security_id', securityId)
    .maybeSingle()
  if (error) throw error
  return (data as { model_portfolio_id: number | null } | null)?.model_portfolio_id ?? null
}

export async function fetchModelPortfolioByObjective(objective: string): Promise<ModelPortfolio | null> {
  const { data: byObjective, error: e1 } = await supabase
    .from('model_portfolio_data')
    .select('*')
    .eq('investment_objective', objective)
    .maybeSingle()
  if (e1) throw e1
  if (byObjective) return byObjective as ModelPortfolio

  const { data: byName, error: e2 } = await supabase
    .from('model_portfolio_data')
    .select('*')
    .eq('name', objective)
    .maybeSingle()
  if (e2) throw e2
  return byName as ModelPortfolio | null
}

export async function fetchModelPortfolios(): Promise<ModelPortfolio[]> {
  const { data, error } = await supabase
    .from('model_portfolio_data')
    .select('*')
    .order('investment_objective', { ascending: true })
  if (error) throw error
  return (data ?? []) as ModelPortfolio[]
}

export async function createModelPortfolio(input: ModelPortfolioInput): Promise<void> {
  const { error } = await supabase.from('model_portfolio_data').insert(input)
  if (error) throw error
}

export async function updateModelPortfolio(id: number, input: Partial<ModelPortfolioInput>): Promise<void> {
  const { error } = await supabase
    .from('model_portfolio_data')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteModelPortfolio(id: number): Promise<void> {
  const { error } = await supabase.from('model_portfolio_data').delete().eq('id', id)
  if (error) throw error
}
