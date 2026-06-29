import { supabase } from './supabase'

export type ChangeType = 'add' | 'remove' | 'weight_change'

export interface HoldingsChange {
  id: number
  portfolio_name: string
  security_id: string
  change_type: ChangeType
  old_weight: number | null
  new_weight: number | null
  changed_at: string
  notes: string | null
  // joined
  symbol?: string | null
  name?: string | null
}

export async function fetchHoldingsChangeLog(portfolioName: string): Promise<HoldingsChange[]> {
  const { data, error } = await supabase
    .from('holdings_change_log')
    .select('*, securities2(security_id, security_name)')
    .eq('portfolio_name', portfolioName)
    .order('changed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  // DB stores change_type/portfolio_name as nullable text; domain type narrows them
  return (data ?? []).map((row) => ({
    ...row,
    symbol: row.securities2?.security_id ?? null,
    name: row.securities2?.security_name ?? null,
  })) as HoldingsChange[]
}
