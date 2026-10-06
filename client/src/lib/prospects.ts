/**
 * Prospects data layer — the watchlist of investment IDEAS.
 *
 * One row per ticker you are considering, with zero or more portfolios attached
 * through `prospect_portfolios`. The portfolio is an attribute of the idea, not
 * part of its identity: before 2026-10-06 `prospects.target_portfolio` made one
 * ticker under three portfolios three rows (and three cards), and left no way to
 * record an idea you had not placed yet.
 *
 * Distinct from at-risk (lib/atRisk.ts), which is HELD securities flagged for
 * replacement: no deterioration metrics, no sell timer, no substitutions here.
 *
 * `prospects.security_id` has NO FK to securities2 — watching a ticker you do
 * not own is the normal case, so securities2 cannot be embedded and is resolved
 * through a separate lookup. A partial unique index keeps one ACTIVE idea per
 * ticker while leaving removed rows free, so a ticker can be watched, dropped
 * and watched again.
 */

import { supabase } from './supabase'
import type { Conviction } from './reviewLog'

export interface ProspectEntry {
  id: number
  security_id: string
  target_price: number | null
  conviction: Conviction | null
  thesis: string | null
  date_added: string
  removed_at: string | null
}

export interface ProspectIdea extends ProspectEntry {
  /** Portfolios this idea is being considered for. Empty is valid and expected. */
  portfolios: string[]
  /** Null when the ticker is not in securities2 — an idea you do not hold. */
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
  /** Optional — an idea with no portfolio yet is a valid idea. */
  portfolios?: string[]
  targetPrice?: number | null
}

/** All active (not removed) ideas, newest first, with portfolios and securities2 info. */
export async function fetchActiveProspects(): Promise<ProspectIdea[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('id, security_id, target_price, conviction, thesis, date_added, removed_at')
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as ProspectEntry[]
  if (rows.length === 0) return []

  const [links, secs] = await Promise.all([
    supabase
      .from('prospect_portfolios')
      .select('prospect_id, portfolio_name')
      .in('prospect_id', rows.map((r) => r.id)),
    supabase
      .from('securities2')
      .select('id, security_id, security_name, broad_asset_class, detailed_security_type, peer_group_name')
      .in('security_id', [...new Set(rows.map((r) => r.security_id))]),
  ])
  if (links.error) throw links.error
  if (secs.error) throw secs.error

  const byProspect = new Map<number, string[]>()
  for (const l of links.data ?? []) {
    const list = byProspect.get(l.prospect_id) ?? []
    list.push(l.portfolio_name)
    byProspect.set(l.prospect_id, list)
  }
  const secById = new Map((secs.data ?? []).map((s) => [s.security_id, s]))

  return rows.map((r) => ({
    ...r,
    portfolios: (byProspect.get(r.id) ?? []).sort(),
    securities2: secById.get(r.security_id) ?? null,
  }))
}

/**
 * Add an idea, or attach portfolios to the one already open for that ticker.
 *
 * Re-adding a watched ticker is how portfolios get added to an existing idea —
 * the unique index would otherwise reject it, and failing there would be a worse
 * answer than merging.
 */
export async function addProspect(p: NewProspect): Promise<void> {
  const sym = p.securityId.trim().toUpperCase()
  if (!sym) throw new Error('Ticker is required')

  const existing = await supabase
    .from('prospects')
    .select('id')
    .eq('security_id', sym)
    .is('removed_at', null)
    .maybeSingle()
  if (existing.error) throw existing.error

  let prospectId = existing.data?.id ?? null
  if (prospectId == null) {
    const { data, error } = await supabase
      .from('prospects')
      .insert({ security_id: sym, target_price: p.targetPrice ?? null })
      .select('id')
      .single()
    if (error) throw error
    prospectId = data.id
  } else if (p.targetPrice != null) {
    const { error } = await supabase
      .from('prospects')
      .update({ target_price: p.targetPrice })
      .eq('id', prospectId)
    if (error) throw error
  }

  const names = [...new Set((p.portfolios ?? []).map((n) => n.trim()).filter(Boolean))]
  if (names.length === 0) return

  const { error } = await supabase
    .from('prospect_portfolios')
    .upsert(
      names.map((portfolio_name) => ({ prospect_id: prospectId!, portfolio_name })),
      { onConflict: 'prospect_id,portfolio_name', ignoreDuplicates: true },
    )
  if (error) throw error
}

/** Detach one portfolio from an idea. The idea itself survives with none. */
export async function removeProspectPortfolio(prospectId: number, portfolioName: string): Promise<void> {
  const { error } = await supabase
    .from('prospect_portfolios')
    .delete()
    .eq('prospect_id', prospectId)
    .eq('portfolio_name', portfolioName)
  if (error) throw error
}

/** Soft-delete: sets removed_at, preserves the row. Links cascade on hard delete only. */
export async function removeProspect(entryId: number): Promise<void> {
  const { error } = await supabase
    .from('prospects')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', entryId)
  if (error) throw error
}
