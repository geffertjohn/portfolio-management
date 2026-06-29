import { supabase } from './supabase'
import type { PortfolioPosition } from '@/types/position'

export interface RebalanceLogEntry {
  id: number
  portfolio_name: string
  rebalanced_at: string
  notes: string | null
  positions_snapshot: unknown
  created_at: string
}

export interface DriftRow {
  securityId: string
  ticker: string
  name: string | null
  currentWeight: number
  targetWeight: number | null
  drift: number | null
  driftThreshold: number
  outOfTolerance: boolean
}

export function calcDrift(positions: PortfolioPosition[]): DriftRow[] {
  return positions.map((p) => {
    const target = p.targetWeight ?? null
    const threshold = p.driftThreshold ?? 5
    const drift = target != null ? p.weight - target : null
    return {
      securityId: p.securityId,
      ticker: p.ticker,
      name: p.name,
      currentWeight: p.weight,
      targetWeight: target,
      drift,
      driftThreshold: threshold,
      outOfTolerance: drift != null && Math.abs(drift) > threshold,
    }
  })
}

export async function logRebalance(
  portfolioName: string,
  snapshot: unknown,
  notes?: string
): Promise<void> {
  const { error } = await supabase.from('rebalance_log').insert({
    portfolio_name: portfolioName,
    notes: notes || null,
    positions_snapshot: snapshot,
  })
  if (error) throw error
}

export async function updateTargetWeights(
  portfolioName: string,
  rows: { securityId: string; targetWeight: number | null; driftThreshold: number }[]
): Promise<void> {
  for (const row of rows) {
    const { error } = await supabase
      .from('positions')
      .update({ target_weight: row.targetWeight, drift_threshold: row.driftThreshold })
      .eq('portfolio_name', portfolioName)
      .eq('security_id', row.securityId)
    if (error) throw error
  }
}
