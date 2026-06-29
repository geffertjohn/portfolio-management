/**
 * At-Risk data layer.
 *
 * "At-Risk" = held securities flagged for monitoring and possible replacement
 * (deteriorated scorecard metrics + a sell timer + proposed substitutions).
 * Formerly the "watchlist" table — renamed so "watchlist" can mean buy candidates
 * (see lib/prospects.ts). Backed by the Supabase `at_risk` table.
 *
 * Removal date rules (based on number of red metrics):
 *   5 metrics → 30 days  (Replace)
 *   4 metrics → 90 days  (Monitor)
 *   3 metrics → 180 days (Monitor)
 *   2 metrics → 365 days (Monitor)
 */

import { supabase } from './supabase'

// ── Metric options by asset class ─────────────────────────────────────────────

export const AT_RISK_METRICS_BY_ASSET_CLASS: Record<string, string[]> = {
  equity: ['Alpha 3Y', 'Information Ratio 3Y', 'Sortino Ratio 3Y', 'Max Drawdown 3Y'],
  'fixed income': ['Sortino Ratio 3Y', 'Sharpe Ratio 3Y', 'Max Drawdown 3Y', 'Alpha 3Y'],
  // Mirrors the stock Scorecard cards (StockScorecardPanels)
  stock: ['Operating Margin TTM', 'FCF Margin TTM', 'Revenue Growth TTM', 'EPS Growth TTM', 'Revenue Growth 3Y', 'EPS Growth 3Y'],
}

export function metricsForAssetClass(assetClass: string | null | undefined): string[] {
  if (!assetClass) return []
  return AT_RISK_METRICS_BY_ASSET_CLASS[assetClass.trim().toLowerCase()] ?? []
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AtRiskEntry {
  id: number
  security_id: string
  date_added: string
  metrics: string[]
  notes: string | null
  removal_date: string | null
  removed_at: string | null
}

/** Calculate removal date based on number of red metrics. */
function calcRemovalDate(metrics: string[]): string {
  const n = metrics.length
  const days = n >= 5 ? 30 : n === 4 ? 90 : n === 3 ? 180 : 365
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export interface AtRiskEntryWithSecurity extends AtRiskEntry {
  securities2: {
    id: number
    security_id: string
    security_name: string | null
    broad_asset_class: string | null
    detailed_security_type: string | null
    peer_group_name: string | null
  } | null
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All active (not removed) at-risk entries, newest first, with security info. */
export async function fetchActiveAtRisk(): Promise<AtRiskEntryWithSecurity[]> {
  const { data, error } = await supabase
    .from('at_risk')
    .select('*, securities2(id, security_id, security_name, broad_asset_class, detailed_security_type, peer_group_name)')
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as AtRiskEntryWithSecurity[]
}

/** Active at-risk entries for a single security. */
export async function fetchAtRiskBySecurity(securityId: string): Promise<AtRiskEntry[]> {
  const { data, error } = await supabase
    .from('at_risk')
    .select('*')
    .eq('security_id', securityId)
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  return (data ?? []) as AtRiskEntry[]
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function addToAtRisk(
  securityId: string,
  metrics: string[],
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('at_risk')
    .insert({
      security_id: securityId,
      metrics,
      notes: notes?.trim() || null,
      removal_date: calcRemovalDate(metrics),
    })
  if (error) throw error
}

/** Soft-delete: sets removed_at timestamp, preserves the row. */
export async function removeFromAtRisk(entryId: number): Promise<void> {
  const { error } = await supabase
    .from('at_risk')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', entryId)
  if (error) throw error
}
