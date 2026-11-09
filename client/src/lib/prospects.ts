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
import { seedScorecardCohorts } from './securities'
import type { Conviction } from './reviewLog'

export interface ProspectEntry {
  id: number
  security_id: string
  /**
   * Retained READ-ONLY. The field was dropped from the Add-to-watchlist form and
   * the card in Oct 2026 — a watchlist idea is a view on the company, and a price
   * you meant to pay is a sizing decision that belongs to the candidate stage.
   * The column and its stored values are kept rather than migrated away, so the
   * handful of rows carrying one are not destroyed; nothing writes it any more.
   */
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
    /**
     * How a FUND idea is identified, in place of a portfolio.
     *
     * Null until the ticker reaches `securities2`, which for a newly watched
     * fund happens on the next YCharts refresh (see
     * `scripts/refresh/README.md`) — so "not categorised yet" is a real and
     * temporary state, not a missing value to paper over.
     */
    category_name: string | null
    /**
     * WHICH cohort this fund is graded against — the governed choice, set by
     * hand on the security page and written by nothing else.
     *
     * Unlike `category_name` it does NOT arrive with the YCharts refresh and
     * never resolves on its own: a fund left null is silently graded against
     * its category by every surface that reads it, including the automatic
     * At-Risk flag in the fund review. Carried here so the Watchlist can say
     * so while the idea is still an idea.
     */
    scorecard_cohort: string | null
  } | null
}

export interface NewProspect {
  securityId: string
  /** Optional — an idea with no portfolio yet is a valid idea. */
  portfolios?: string[]
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
      .select('id, security_id, security_name, broad_asset_class, detailed_security_type, peer_group_name, category_name, scorecard_cohort')
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
 *
 * **It also seeds the scorecard cohort**, which only lands when the ticker is
 * ALREADY in `securities2` — a fund the firm once held, a benchmark proxy, or
 * one whose row the workbook has already fetched. For a genuinely new fund the
 * row does not exist yet (`prospects.security_id` has no FK, which is the
 * point), so this is a no-op and the workbook import seeds it the next
 * morning instead, within about fifteen minutes of the refresh. Both paths go
 * through `seedScorecardCohorts`, so neither can decide the default on its
 * own.
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
      .insert({ security_id: sym })
      .select('id')
      .single()
    if (error) throw error
    prospectId = data.id
  }

  // Before the early return below: zero portfolios is a valid idea, and it
  // should still get its cohort.
  await seedScorecardCohorts([sym])

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

// ── Watchlist funds as alternatives to a holding ─────────────────────────────

/** One watchlist fund offered as an alternative to a holding in its category. */
export interface WatchlistAlternative {
  securityId: string
  name: string | null
  /** `securities2.id`, for the detail-page link. Always set — matching needs the row. */
  numericId: number
}

/**
 * Normalised category key.
 *
 * Both sides of this comparison are the SAME column — `securities2.category_name`
 * on a holding and on a watched fund — so case and whitespace are the only
 * variation to allow for. No hyphen or spelling variants: those exist where two
 * vendor vocabularies meet (a fund's "Large Growth" against a benchmark's "US
 * Large Cap Growth"), and inventing them here would silently match sleeves the
 * vendor considers distinct.
 */
export function categoryKey(category: string | null | undefined): string | null {
  const k = (category ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return k || null
}

/**
 * Watchlist funds grouped by the category they would compete in.
 *
 * The annual review asks whether each holding is still the right fund for its
 * sleeve, and the only honest form of that question is "against what?" — the
 * ideas already recorded in the same category are the answer the firm has
 * actually written down. An idea with no `securities2` row is skipped: it is a
 * stock, or a fund the workbook has not reached yet, and neither can be
 * compared on a category it does not carry.
 */
export function watchlistAlternativesByCategory(
  ideas: ProspectIdea[],
): Map<string, WatchlistAlternative[]> {
  const out = new Map<string, WatchlistAlternative[]>()
  for (const idea of ideas) {
    const sec = idea.securities2
    if (!sec) continue
    const key = categoryKey(sec.category_name)
    if (!key) continue
    const list = out.get(key) ?? []
    list.push({ securityId: sec.security_id, name: sec.security_name, numericId: sec.id })
    out.set(key, list)
  }
  for (const list of out.values()) list.sort((a, b) => a.securityId.localeCompare(b.securityId))
  return out
}

/**
 * The alternatives to one holding: same category, and never the holding itself.
 *
 * A fund can be held in one book and watched for another — VBTLX is both — so
 * without the self-exclusion a holding would be offered as its own replacement.
 */
export function alternativesFor(
  byCategory: Map<string, WatchlistAlternative[]>,
  holdingSecurityId: string,
  category: string | null | undefined,
): WatchlistAlternative[] {
  const key = categoryKey(category)
  if (!key) return []
  return (byCategory.get(key) ?? []).filter((a) => a.securityId !== holdingSecurityId)
}

