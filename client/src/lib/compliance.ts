import { supabase } from './supabase'
import type { PortfolioPosition } from '@/types/position'

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

export type PositionRuleType =
  | 'min_position_weight'
  | 'max_position_count'
  | 'min_position_count'

export type ComplianceResult = 'pass' | 'warn' | 'breach'

export interface ComplianceRule {
  id: number
  portfolio_name: string
  rule_type: RuleType
  label: string
  threshold_value: number
  is_active: boolean
  created_at: string
}

export interface ComplianceCheck {
  rule: ComplianceRule
  result: ComplianceResult
  actual_value: number | null
  message: string
}

export interface PositionComplianceCheck {
  rule: ComplianceRule
  result: ComplianceResult
  actual_value: number | null
  message: string
  offendingPositions: Array<{ ticker: string; weight: number; result: 'breach' | 'warn' }>
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

/**
 * Fraction of the threshold that triggers a warn before breach.
 * e.g. 0.1 means warn when within 10% of the limit.
 * Max rule with threshold 25%: breach >25%, warn >22.5%.
 * Min rule with threshold 30%: breach <30%, warn <33%.
 */
export const WARN_BUFFER = 0.1

// ── Position classification helpers ───────────────────────────────────────────

export function isEquityPosition(p: PortfolioPosition): boolean {
  return !!p.assetClass?.toLowerCase().includes('equity')
}

export function isFixedIncomePosition(p: PortfolioPosition): boolean {
  const ac = p.assetClass?.toLowerCase() ?? ''
  return ac.includes('fixed') || ac.includes('bond')
}

export function isCashPosition(p: PortfolioPosition): boolean {
  return p.ticker === 'Cash' || p.assetClass?.toLowerCase() === 'cash'
}

export function calcPositionWeights(positions: PortfolioPosition[]): {
  equity: number
  fixedIncome: number
  cash: number
} {
  return {
    equity:      positions.filter(isEquityPosition).reduce((s, p) => s + p.weight, 0),
    fixedIncome: positions.filter(isFixedIncomePosition).reduce((s, p) => s + p.weight, 0),
    cash:        positions.filter(isCashPosition).reduce((s, p) => s + p.weight, 0),
  }
}

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

/** Evaluate a single max rule: breach if over threshold, warn if within WARN_BUFFER of it. */
function evalMax(actual: number, threshold: number): ComplianceResult {
  if (actual > threshold) return 'breach'
  if (actual > threshold * (1 - WARN_BUFFER)) return 'warn'
  return 'pass'
}

/** Evaluate a single min rule: breach if under threshold, warn if within WARN_BUFFER above it. */
function evalMin(actual: number, threshold: number): ComplianceResult {
  if (actual < threshold) return 'breach'
  if (actual < threshold * (1 + WARN_BUFFER)) return 'warn'
  return 'pass'
}

/** Evaluate portfolio-aggregate rules. Position rules are handled by runPositionChecks. */
export function runComplianceChecks(
  rules: ComplianceRule[],
  positions: PortfolioPosition[],
): ComplianceCheck[] {
  const { equity, fixedIncome, cash } = calcPositionWeights(positions)

  return rules.filter((r) => r.is_active && PORTFOLIO_RULE_TYPES.has(r.rule_type)).map((rule): ComplianceCheck => {
    const thr = rule.threshold_value

    switch (rule.rule_type) {
      case 'max_single_position': {
        const actual = Math.max(...positions.map((p) => p.weight), 0)
        return { rule, result: evalMax(actual, thr), actual_value: actual,
          message: `Largest position: ${actual.toFixed(1)}% (limit ${thr}%)` }
      }
      case 'min_equity_pct':
        return { rule, result: evalMin(equity, thr), actual_value: equity,
          message: `Equity: ${equity.toFixed(1)}% (min ${thr}%)` }
      case 'max_equity_pct':
        return { rule, result: evalMax(equity, thr), actual_value: equity,
          message: `Equity: ${equity.toFixed(1)}% (max ${thr}%)` }
      case 'min_fixed_income_pct':
        return { rule, result: evalMin(fixedIncome, thr), actual_value: fixedIncome,
          message: `Fixed Income: ${fixedIncome.toFixed(1)}% (min ${thr}%)` }
      case 'max_fixed_income_pct':
        return { rule, result: evalMax(fixedIncome, thr), actual_value: fixedIncome,
          message: `Fixed Income: ${fixedIncome.toFixed(1)}% (max ${thr}%)` }
      case 'min_cash_pct':
        return { rule, result: evalMin(cash, thr), actual_value: cash,
          message: `Cash: ${cash.toFixed(1)}% (min ${thr}%)` }
      case 'max_cash_pct':
        return { rule, result: evalMax(cash, thr), actual_value: cash,
          message: `Cash: ${cash.toFixed(1)}% (max ${thr}%)` }
      default:
        // unreachable due to PORTFOLIO_RULE_TYPES filter
        return { rule, result: 'pass', actual_value: null, message: '' }
    }
  })
}

function evalPositionRule(
  ruleType: PositionRuleType,
  thr: number,
  nonCash: PortfolioPosition[],
): Omit<PositionComplianceCheck, 'rule'> {
  switch (ruleType) {
    case 'min_position_weight': {
      const offendingPositions = nonCash
        .filter((p) => p.weight < thr * (1 + WARN_BUFFER))
        .map((p) => ({
          ticker: p.ticker,
          weight: p.weight,
          result: (p.weight < thr ? 'breach' : 'warn') as 'breach' | 'warn',
        }))
      const minWeight = nonCash.length > 0 ? Math.min(...nonCash.map((p) => p.weight)) : 0
      const result: ComplianceResult = offendingPositions.some((o) => o.result === 'breach')
        ? 'breach'
        : offendingPositions.some((o) => o.result === 'warn')
        ? 'warn'
        : 'pass'
      return {
        result,
        actual_value: minWeight,
        message: `Minimum position: ${minWeight.toFixed(1)}% (min ${thr}%)`,
        offendingPositions,
      }
    }
    case 'max_position_count': {
      const count = nonCash.length
      return {
        result: evalMax(count, thr),
        actual_value: count,
        message: `${count} position${count !== 1 ? 's' : ''} (max ${thr})`,
        offendingPositions: [],
      }
    }
    case 'min_position_count': {
      const count = nonCash.length
      return {
        result: evalMin(count, thr),
        actual_value: count,
        message: `${count} position${count !== 1 ? 's' : ''} (min ${thr})`,
        offendingPositions: [],
      }
    }
  }
}

/** Evaluate position-level rules, returning per-rule results with offending position detail. */
export function runPositionChecks(
  rules: ComplianceRule[],
  positions: PortfolioPosition[],
): PositionComplianceCheck[] {
  const nonCash = positions.filter((p) => !isCashPosition(p))

  return rules
    .filter((r) => r.is_active && POSITION_RULE_TYPES.has(r.rule_type))
    .map((rule): PositionComplianceCheck => {
      const detail = evalPositionRule(rule.rule_type as PositionRuleType, rule.threshold_value, nonCash)
      return { rule, ...detail }
    })
}

export function overallComplianceResult(checks: ComplianceCheck[]): ComplianceResult {
  if (checks.some((c) => c.result === 'breach')) return 'breach'
  if (checks.some((c) => c.result === 'warn')) return 'warn'
  return 'pass'
}
