/**
 * Prospects data layer — the buy-candidate "Watchlist".
 *
 * Securities being CONSIDERED for a portfolio (not yet held). Distinct from
 * at-risk (lib/atRisk.ts), which is held securities flagged for replacement:
 * no deterioration metrics, no sell timer, no substitutions here — just a
 * candidate, an optional target price / portfolio / conviction, and a thesis.
 * Backed by the Supabase `prospects` table.
 */

import { supabase } from './supabase'
import type { Conviction } from './reviewLog'

export interface ProspectEntry {
  id: number
  security_id: string
  target_portfolio: string | null
  target_price: number | null
  conviction: Conviction | null
  thesis: string | null
  date_added: string
  removed_at: string | null
}

export interface ProspectEntryWithSecurity extends ProspectEntry {
  securities2: {
    id: number
    security_id: string
    security_name: string | null
    broad_asset_class: string | null
    detailed_security_type: string | null
    peer_group_name: string | null
  } | null
}

export interface NewProspect {
  securityId: string
  targetPortfolio?: string | null
  targetPrice?: number | null
  conviction?: Conviction | null
  thesis?: string | null
}

/** All active (not removed) prospects, newest first, with security info. */
export async function fetchActiveProspects(): Promise<ProspectEntryWithSecurity[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('*, securities2(id, security_id, security_name, broad_asset_class, detailed_security_type, peer_group_name)')
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ProspectEntryWithSecurity[]
}

/** Active prospect entries for a single security. */
export async function fetchProspectsBySecurity(securityId: string): Promise<ProspectEntry[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('security_id', securityId)
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProspectEntry[]
}

export async function addProspect(p: NewProspect): Promise<void> {
  const { error } = await supabase
    .from('prospects')
    .insert({
      security_id: p.securityId,
      target_portfolio: p.targetPortfolio?.trim() || null,
      target_price: p.targetPrice ?? null,
      conviction: p.conviction ?? null,
      thesis: p.thesis?.trim() || null,
    })
  if (error) throw error
}

/** Soft-delete: sets removed_at timestamp, preserves the row. */
export async function removeProspect(entryId: number): Promise<void> {
  const { error } = await supabase
    .from('prospects')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', entryId)
  if (error) throw error
}
