import { supabase } from './supabase'

export type AlertOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq'

export interface AlertRule {
  id: number
  security_id: string
  metric_field: string
  operator: AlertOperator
  threshold_value: number
  is_active: boolean
  created_at: string
}

export interface AlertEvent {
  id: number
  rule_id: number
  security_id: string
  metric_field: string
  actual_value: number | null
  threshold_value: number
  triggered_at: string
  acknowledged_at: string | null
  // joined
  security_symbol?: string | null
  security_name?: string | null
}

export const ALERT_METRIC_OPTIONS = [
  { value: 'alpha_3y_vs_category', label: 'Alpha 3Y' },
  { value: 'historical_sharpe_3y', label: 'Sharpe Ratio 3Y' },
  { value: 'historical_sortino_3y', label: 'Sortino Ratio 3Y' },
  { value: 'max_drawdown_3y', label: 'Max Drawdown 3Y' },
  { value: 'information_ratio_3y_vs_category', label: 'Information Ratio 3Y' },
  { value: 'one_year_total_return_nav', label: '1Y Total Return' },
  { value: 'annualized_three_year_total_return_nav', label: '3Y Total Return' },
  { value: 'one_year_total_return_rank_nav', label: 'Category Rank 1Y' },
  { value: 'three_year_total_return_rank_nav', label: 'Category Rank 3Y' },
]

export async function fetchAlertRules(securityId: string): Promise<AlertRule[]> {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('security_id', securityId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchUnacknowledgedAlerts(): Promise<AlertEvent[]> {
  const { data, error } = await supabase
    .from('alert_events')
    .select('*, securities2(id, security_id, security_name)')
    .is('acknowledged_at', null)
    .order('triggered_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    security_symbol: row.securities2?.security_id ?? null,
    security_name: row.securities2?.security_name ?? null,
    security_numeric_id: row.securities2?.id ?? null,
  }))
}

export async function createAlertRule(rule: Omit<AlertRule, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('alert_rules').insert(rule)
  if (error) throw error
}

export async function deleteAlertRule(id: number): Promise<void> {
  const { error } = await supabase.from('alert_rules').delete().eq('id', id)
  if (error) throw error
}

export async function acknowledgeAlert(eventId: number): Promise<void> {
  const { error } = await supabase
    .from('alert_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', eventId)
  if (error) throw error
}

export async function fireAlertIfBreached(
  rule: AlertRule,
  actualValue: number | null
): Promise<void> {
  if (actualValue == null || !rule.is_active) return
  const { operator: op, threshold_value: thr } = rule
  const breached =
    op === 'lt' ? actualValue < thr :
    op === 'lte' ? actualValue <= thr :
    op === 'gt' ? actualValue > thr :
    op === 'gte' ? actualValue >= thr :
    actualValue === thr

  if (!breached) return

  const { error } = await supabase.from('alert_events').insert({
    rule_id: rule.id,
    security_id: rule.security_id,
    metric_field: rule.metric_field,
    actual_value: actualValue,
    threshold_value: thr,
  })
  if (error) throw error
}
