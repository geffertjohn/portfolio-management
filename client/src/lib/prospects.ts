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
import { normalizeCategory } from './assetClass'
import { seedScorecardCohorts, type SecurityDetail } from './securities'

export interface ProspectEntry {
  id: number
  security_id: string
  date_added: string
  removed_at: string | null
}

/**
 * The `securities2` fields a lightweight consumer needs — the MINIMUM, so that
 * both the full and the slim fetch satisfy it structurally and a caller taking
 * this can be handed either.
 */
export interface ProspectSecurityRef {
  id: number
  security_id: string
  security_name: string | null
  category_name: string | null
}

/** Everything both fetches return; they differ only in the securities2 shape. */
export interface ProspectIdeaBase extends ProspectEntry {
  /** Portfolios this idea is being considered for. Empty is valid and expected. */
  portfolios: string[]
  /**
   * Books currently HOLDING this ticker. Empty for a genuine idea.
   *
   * **A watchlist is a list of things being considered for purchase, and one
   * of these is already owned** — VBTLX sits here and in three Foundation
   * books. Without this the fund table renders it identically to a fund
   * nobody holds, so the single row that contradicts the page's premise is the
   * one row that looks like all the others. Named books rather than a boolean
   * because "held in the book I am sizing" and "held somewhere else" are
   * different answers, which is the same split `ConsiderationsSection`
   * already draws for alternatives.
   */
  heldIn: string[]
}

/** A lightweight idea — enough to count, name and categorise, nothing more. */
export interface ProspectIdeaLite extends ProspectIdeaBase {
  securities2: ProspectSecurityRef | null
}

export interface ProspectIdea extends ProspectIdeaBase {
  /**
   * The full `securities2` row, or null when the ticker is not in it — an
   * idea you do not hold and the workbook has not reached.
   *
   * **The WHOLE row, not a hand-picked subset** (Nov 2026). It used to carry
   * eight columns, which was enough to name a fund and its category; the
   * Watchlist's fund table now scores each fund with `buildFundScorecard`,
   * and that reads about twenty rank, size and value columns decided in
   * `fundScorecard.ts`. Listing them here would be a second copy of that
   * metric set, silently wrong the day a metric is added — and the symptom is
   * not an error but a column of dashes, which reads as "this fund has no
   * data" rather than "we forgot to ask for it". That is exactly what the
   * first run of the new table showed.
   *
   * Typed as `SecurityDetail` so the classifier, the asset-class resolver and
   * the scorecard all take it without a cast.
   */
  securities2: SecurityDetail | null
}

export interface NewProspect {
  securityId: string
  /** Optional — an idea with no portfolio yet is a valid idea. */
  portfolios?: string[]
}

/** What became of one ticker in a batch add. */
export interface AddProspectResult {
  securityId: string
  ok: boolean
  /** Present only when `ok` is false. */
  error?: string
}

/**
 * Add several ideas at once.
 *
 * **Per-ticker, never all-or-nothing.** Each ticker is an independent idea, so
 * failing eight because the fifth errored would throw away seven good ones and
 * leave the advisor to work out which. `addProspect` is already idempotent —
 * it merges into an open idea rather than colliding with the one-live-idea
 * index — so re-submitting the failures is safe and is the obvious next move.
 * Same reasoning as the workbook importer running its three datasets in their
 * own `try` blocks.
 *
 * **Sequential, not `Promise.all`.** Each add is a read-then-insert, and two
 * running at once for the same symbol would both see no existing row; the
 * partial unique index would then reject one with an error the advisor cannot
 * act on. A batch is a handful of tickers typed by a person, so the wall-clock
 * cost of going in order is irrelevant next to that.
 */
export async function addProspects(
  securityIds: string[],
  portfoliosFor: (securityId: string) => string[],
): Promise<AddProspectResult[]> {
  const out: AddProspectResult[] = []
  const written: string[] = []
  for (const securityId of securityIds) {
    try {
      written.push(await writeProspect({ securityId, portfolios: portfoliosFor(securityId) }))
      out.push({ securityId, ok: true })
    } catch (e) {
      out.push({ securityId, ok: false, error: e instanceof Error ? e.message : 'Failed to add' })
    }
  }
  // ONE seed for the batch, not one per ticker: `seedScorecardCohorts` takes a
  // list, and per-ticker made a ten-ticker paste do ten selects and ten updates.
  // Only what actually landed — seeding a ticker whose write failed would be
  // touching a row this call did not create. It never throws, so it cannot turn
  // a successful batch into a reported failure.
  if (written.length > 0) await seedScorecardCohorts(written)
  return out
}

/**
 * The prospect rows, their portfolio links and which books already hold them —
 * everything both fetches share.
 *
 * **It deliberately does NOT fetch `securities2`.** The schema-typed client only
 * checks `.select()` column names when the argument is a single string literal,
 * so passing the column set in as a parameter would hand back
 * `GenericStringError[]` and quietly give up the check that turns a dropped or
 * mistyped column into a `tsc` failure instead of a runtime 400. Each fetch
 * therefore writes its own literal select, and only the cheap, identical half
 * is shared.
 */
async function loadProspectCore(): Promise<{
  rows: ProspectEntry[]
  symbols: string[]
  portfoliosOf: (prospectId: number) => string[]
  heldInOf: (securityId: string) => string[]
}> {
  const empty = { rows: [] as ProspectEntry[], symbols: [], portfoliosOf: () => [], heldInOf: () => [] }

  const { data, error } = await supabase
    .from('prospects')
    .select('id, security_id, date_added, removed_at')
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as ProspectEntry[]
  if (rows.length === 0) return empty

  const symbols = [...new Set(rows.map((r) => r.security_id))]
  const [links, held] = await Promise.all([
    supabase
      .from('prospect_portfolios')
      .select('prospect_id, portfolio_name')
      .in('prospect_id', rows.map((r) => r.id)),
    // Which of these the firm ALREADY OWNS. One query over the watched symbols
    // rather than `fetchPortfoliosHoldingSecurity` per ticker, which would be
    // one round trip per idea.
    supabase
      .from('positions')
      .select('security_id, portfolio_name')
      .in('security_id', symbols)
      .is('deleted_at', null),
  ])
  if (links.error) throw links.error
  if (held.error) throw held.error

  const byProspect = new Map<number, string[]>()
  for (const l of links.data ?? []) {
    byProspect.set(l.prospect_id, [...(byProspect.get(l.prospect_id) ?? []), l.portfolio_name])
  }
  const byHolder = new Map<string, string[]>()
  for (const h of held.data ?? []) {
    const list = byHolder.get(h.security_id) ?? []
    // A ticker appears once per book; de-duplicating keeps the badge honest
    // even if that ever stops being true.
    if (!list.includes(h.portfolio_name)) list.push(h.portfolio_name)
    byHolder.set(h.security_id, list)
  }

  return {
    rows,
    symbols,
    portfoliosOf: (id) => (byProspect.get(id) ?? []).sort(),
    heldInOf: (sym) => (byHolder.get(sym) ?? []).sort(),
  }
}

/**
 * All active ideas with the FULL `securities2` row — what the Watchlist's fund
 * table needs, because its scorecard reads a metric set defined in
 * `fundScorecard.ts` (see `ProspectIdea.securities2`).
 *
 * **It is 43x the payload of the lite fetch** — measured 10 Nov 2026 at
 * 154,559 bytes against 3,625 for the same 29 rows — so a caller that only
 * needs to count, name or categorise an idea should use
 * `fetchActiveProspectsLite`.
 */
export async function fetchActiveProspects(): Promise<ProspectIdea[]> {
  const { rows, symbols, portfoliosOf, heldInOf } = await loadProspectCore()
  if (rows.length === 0) return []

  const secs = await supabase
    .from('securities2')
    // `*`: see the note on ProspectIdea.securities2 — the scorecard reads a
    // metric set defined in fundScorecard.ts, and a column list here would
    // be a second copy of it that fails as a row of dashes, not an error.
    .select('*')
    .in('security_id', symbols)
  if (secs.error) throw secs.error

  // `as unknown as SecurityDetail`, matching `fetchSecurityById` and
  // `fetchSecuritiesByIds`, which cast the same `select('*')` the same way.
  // The reason is a known drift: `SecurityDetail` declares six columns the
  // table does not have — `turnover_ratio`, `distribution_yield` and the four
  // `*_fund_level_flows` — so the generated row type is not assignable to it.
  // None of the six has a reader (the live one is `turnover_ratio_generic`, in
  // `fundPeers.ts`), so nothing reads undefined today; it is a stale interface
  // rather than a runtime bug, and tidying it belongs in its own change.
  const secById = new Map(
    (secs.data ?? []).map((x) => [x.security_id, x as unknown as SecurityDetail]),
  )

  return rows.map((r) => ({
    ...r,
    portfolios: portfoliosOf(r.id),
    heldIn: heldInOf(r.security_id),
    securities2: secById.get(r.security_id) ?? null,
  }))
}

/**
 * All active ideas with only enough of `securities2` to count, name and
 * categorise them.
 *
 * **For every caller that is not the Watchlist's fund table.** The full fetch
 * ships the whole 93-column row for each watched ticker; the dashboard was
 * paying 151 KB of scorecard metrics to render the NUMBER of ideas, and the
 * annual review's alternatives panel paid it to read four fields.
 *
 * Its query key is a CHILD of `QUERY_KEYS.prospects`, so every existing
 * `invalidateQueries({ queryKey: QUERY_KEYS.prospects })` still clears both by
 * prefix match. Splitting the key any other way would have left one of the two
 * stale after an add or a remove — a bug that shows up as a count which will
 * not move.
 */
export async function fetchActiveProspectsLite(): Promise<ProspectIdeaLite[]> {
  const { rows, symbols, portfoliosOf, heldInOf } = await loadProspectCore()
  if (rows.length === 0) return []

  const secs = await supabase
    .from('securities2')
    .select('id, security_id, security_name, category_name')
    .in('security_id', symbols)
  if (secs.error) throw secs.error
  const secById = new Map((secs.data ?? []).map((x) => [x.security_id, x]))

  return rows.map((r) => ({
    ...r,
    portfolios: portfoliosOf(r.id),
    heldIn: heldInOf(r.security_id),
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
  const sym = await writeProspect(p)
  await seedScorecardCohorts([sym])
}

/**
 * The write half of `addProspect`, WITHOUT the cohort seeding.
 *
 * Split out so a batch can seed once at the end instead of once per ticker:
 * `seedScorecardCohorts` already takes a list, and calling it per ticker made
 * a ten-ticker paste do ten selects and ten updates where one of each would
 * do. Returns the normalised symbol, which is what the caller needs to seed.
 */
async function writeProspect(p: NewProspect): Promise<string> {
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

  const names = [...new Set((p.portfolios ?? []).map((n) => n.trim()).filter(Boolean))]
  // Zero portfolios is a valid idea — and the caller still seeds its cohort.
  if (names.length === 0) return sym

  const { error } = await supabase
    .from('prospect_portfolios')
    .upsert(
      names.map((portfolio_name) => ({ prospect_id: prospectId!, portfolio_name })),
      { onConflict: 'prospect_id,portfolio_name', ignoreDuplicates: true },
    )
  if (error) throw error
  return sym
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

/**
 * Soft-delete an idea: sets `removed_at`, preserves the row, and DETACHES its
 * portfolios.
 *
 * **A link is a live intention, not a historical fact.** `prospect_portfolios`
 * answers "which books is this being considered for", so once the idea is
 * dropped the answer is none — and every reader already filters to active
 * ideas, so a link on a removed row could not be read even deliberately. Left
 * behind they accumulate: two of the nine rows were stranded this way, under
 * ideas dropped in July and October.
 *
 * **Deleting them loses no unique record**, which is the test that mattered
 * before writing this. The "considered for X" fact survives in the committee's
 * own deliverables — `ic_memos`, `research_reports` and `security_additions`
 * all carry `portfolio_name` for both stranded tickers — and the removal
 * itself is in `audit_log` through the `audit_prospects` trigger. What is
 * being cleared is a pointer, not the history it pointed at. (`prospect_portfolios`
 * carries no audit trigger of its own, so it was never serving as the record.)
 *
 * **Order matters: the idea is retired FIRST.** If the link delete then fails,
 * the result is the state this function exists to clean up, which is harmless.
 * Doing it the other way round would, on a failure, strip the portfolios off an
 * idea that is still live — silently losing something the advisor chose.
 */
export async function removeProspect(entryId: number): Promise<void> {
  const { error } = await supabase
    .from('prospects')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', entryId)
  if (error) throw error

  const detach = await supabase
    .from('prospect_portfolios')
    .delete()
    .eq('prospect_id', entryId)
  if (detach.error) throw detach.error
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
  // `normalizeCategory` from `assetClass.ts`, not a second implementation.
  // This file used to carry its own and the two DISAGREED — that one collapsed
  // internal whitespace and the resolver's did not, so one vendor string could
  // match an alternative here and resolve to `null` in every allocation rollup.
  const k = normalizeCategory(category ?? '')
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
  // `ProspectIdeaLite` is the MINIMUM shape, so this takes either fetch's
  // output — and the caller that uses it (the annual review) can take the
  // cheap one.
  ideas: ProspectIdeaLite[],
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

