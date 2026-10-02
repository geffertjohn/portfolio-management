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

/**
 * A rule is scoped to EITHER one portfolio or one whole strategy — the DB
 * enforces `num_nonnulls(portfolio_name, portfolio_strategy) = 1`. Firm-wide
 * rules are not represented here at all; they live in `firm_compliance_rules`.
 */
export interface ComplianceRule {
  id: number
  portfolio_name: string | null
  portfolio_strategy: string | null
  rule_type: RuleType
  label: string
  threshold_value: number
  is_active: boolean
  created_at: string
}

/** The five `portfolio.portfolio_strategy` values, mirrored by a DB CHECK. */
export const PORTFOLIO_STRATEGIES = [
  'Equity', 'ETF', 'Foundation', 'Hybrid', 'Fixed Income',
] as const

export type PortfolioStrategy = (typeof PORTFOLIO_STRATEGIES)[number]

/**
 * The form's select carries one string, so a strategy scope is prefixed. This
 * encoding is UI-local — `parseScopeValue` splits it back into the two columns
 * before the insert, and nothing stores the prefixed form.
 */
export const STRATEGY_SCOPE_PREFIX = 'strategy:'

export function strategyScopeValue(strategy: string): string {
  return `${STRATEGY_SCOPE_PREFIX}${strategy}`
}

export function parseScopeValue(
  value: string,
): { portfolio_name: string | null; portfolio_strategy: string | null } {
  return value.startsWith(STRATEGY_SCOPE_PREFIX)
    ? { portfolio_name: null, portfolio_strategy: value.slice(STRATEGY_SCOPE_PREFIX.length) }
    : { portfolio_name: value, portfolio_strategy: null }
}

/** Stable grouping key for the rules list — one card per scope. */
export function ruleScopeKey(rule: ComplianceRule): string {
  return rule.portfolio_strategy
    ? strategyScopeValue(rule.portfolio_strategy)
    : rule.portfolio_name ?? ''
}

/** How a scope reads in the UI. Takes the grouping key, not the rule. */
export function scopeLabel(scopeKey: string): string {
  return scopeKey.startsWith(STRATEGY_SCOPE_PREFIX)
    ? `All ${scopeKey.slice(STRATEGY_SCOPE_PREFIX.length)} portfolios`
    : scopeKey
}

/**
 * Trailing " · covers 5 portfolios" for a strategy scope, or nothing for a
 * single portfolio. Makes the blast radius of a group rule visible in the list,
 * not just in the form where it was chosen.
 */
export function scopeCoverage(
  scopeKey: string,
  portfolios: { portfolio_strategy: string | null }[],
): string {
  if (!scopeKey.startsWith(STRATEGY_SCOPE_PREFIX)) return ''
  const strategy = scopeKey.slice(STRATEGY_SCOPE_PREFIX.length)
  const n = portfolios.filter((p) => p.portfolio_strategy === strategy).length
  return ` · covers ${n} portfolio${n === 1 ? '' : 's'}`
}

/**
 * Every rule that applies to one portfolio: its own, plus every rule scoped to
 * its strategy. Any consumer asking "what governs this portfolio" must go
 * through this — matching on `portfolio_name` alone silently ignores every
 * strategy-scoped rule.
 */
export function rulesForPortfolio(
  rules: ComplianceRule[],
  portfolio: { name: string; portfolio_strategy: string | null },
): ComplianceRule[] {
  return rules.filter((r) =>
    r.portfolio_name === portfolio.name ||
    (r.portfolio_strategy != null && r.portfolio_strategy === portfolio.portfolio_strategy))
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

/** Count rules carry a whole number of holdings, not a percentage. */
export function isCountRule(type: RuleType): boolean {
  return type === 'max_position_count' || type === 'min_position_count'
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
    .order('portfolio_strategy', { ascending: true, nullsFirst: false })
    .order('portfolio_name', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  // DB stores rule_type as text; domain type narrows it
  return (data ?? []) as ComplianceRule[]
}

/**
 * Rules governing one portfolio, including those scoped to its strategy.
 * `strategy` is required precisely so the strategy-scoped rules cannot be
 * forgotten at the call site.
 */
export async function fetchComplianceRules(
  portfolioName: string,
  strategy: string | null,
): Promise<ComplianceRule[]> {
  const scopes = [`portfolio_name.eq.${portfolioName}`]
  if (strategy) scopes.push(`portfolio_strategy.eq.${strategy}`)
  const { data, error } = await supabase
    .from('compliance_rules')
    .select('*')
    .or(scopes.join(','))
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

export async function updateComplianceRule(
  id: number,
  updates: Partial<Pick<ComplianceRule, 'label' | 'threshold_value' | 'is_active'>>,
): Promise<void> {
  const { error } = await supabase
    .from('compliance_rules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
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
