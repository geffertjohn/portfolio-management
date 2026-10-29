import { supabase } from './supabase'

export interface AlertEvent {
  id: number
  /** Null for a non-rule alert — the threshold engine was deleted. */
  rule_id: number | null
  security_id: string
  metric_field: string
  actual_value: number | null
  threshold_value: number | null
  /** Which producer raised it. `at_risk` = a sell timer expired with a metric still red. */
  source: 'rule' | 'at_risk'
  /** Prose for a non-rule alert; the numeric fields carry a rule alert instead. */
  message: string | null
  at_risk_id: number | null
  triggered_at: string
  acknowledged_at: string | null
  // joined from securities2
  security_symbol?: string | null
  security_name?: string | null
  security_numeric_id?: number | null
}

interface AlertEventRow {
  securities2: { id: number; security_id: string; security_name: string | null } | null
  [key: string]: unknown
}

export async function fetchUnacknowledgedAlerts(): Promise<AlertEvent[]> {
  const { data, error } = await supabase
    .from('alert_events')
    .select('*, securities2(id, security_id, security_name)')
    .is('acknowledged_at', null)
    .order('triggered_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as AlertEventRow[]).map((row) => {
    const sec = Array.isArray(row.securities2) ? row.securities2[0] : row.securities2
    return {
      ...(row as unknown as AlertEvent),
      security_symbol: sec?.security_id ?? null,
      security_name: sec?.security_name ?? null,
      security_numeric_id: sec?.id ?? null,
    }
  })
}

export async function acknowledgeAlert(eventId: number): Promise<void> {
  const { error } = await supabase
    .from('alert_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', eventId)
  if (error) throw error
}
