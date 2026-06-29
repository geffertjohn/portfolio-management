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
  // DB stores rule_type as text; domain type narrows it
  return (data ?? []) as FirmComplianceRule[]
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
  // DB stores portfolio_name as nullable text; domain treats it as non-null
  return new Set((data ?? []).map((r) => r.portfolio_name) as string[])
}

export interface CrossPortfolioDeviation {
  securityId: string
  weights: Record<string, number>
  deviation: number
}

export interface CrossPortfolioCheck {
  objective: string
  names: string[]
  deviations: CrossPortfolioDeviation[]
}

/**
 * Pure computation of cross-portfolio consistency deviations.
 *
 * Groups client portfolios by investment objective, then for each
 * multi-portfolio group finds securities whose weight spread (max − min)
 * across the group exceeds `consistencyThreshold`. React-free.
 */
export function computeCrossPortfolioChecks(
  portfolios: Array<{ name: string; investment_objective: string | null }>,
  clientPortfolioNames: Set<string>,
  allPositions: Array<{ portfolioName: string; securityId: string; weight: number }>,
  consistencyThreshold: number,
): CrossPortfolioCheck[] {
  const objectiveGroups = portfolios
    .filter((p) => clientPortfolioNames.has(p.name))
    .reduce<Record<string, string[]>>((acc, p) => {
      const obj = p.investment_objective ?? 'No Objective'
      ;(acc[obj] ??= []).push(p.name)
      return acc
    }, {})

  return Object.entries(objectiveGroups)
    .filter(([, names]) => names.length > 1)
    .map(([objective, names]) => {
      const groupPositions = allPositions.filter((p) => names.includes(p.portfolioName))
      const securityMap: Record<string, Record<string, number>> = {}
      groupPositions.forEach((p) => {
        ;(securityMap[p.securityId] ??= {})[p.portfolioName] = p.weight
      })

      const deviations = Object.entries(securityMap)
        .filter(([, weights]) => Object.keys(weights).length > 1)
        .map(([securityId, weights]) => {
          const vals = Object.values(weights)
          const deviation = Math.max(...vals) - Math.min(...vals)
          return { securityId, weights, deviation }
        })
        .filter(({ deviation }) => deviation > consistencyThreshold)
        .sort((a, b) => b.deviation - a.deviation)

      return { objective, names, deviations }
    })
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
