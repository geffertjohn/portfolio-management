/**
 * holdingProfiles.ts
 *
 * What the securities INSIDE a fund actually are — sector, industry, country,
 * market cap — from FMP, keyed on the symbol as `fund_holdings` spells it.
 *
 * WHY THIS EXISTS. `fund_holdings` gives the committee a symbol and a weight,
 * and reasoning about the result then requires knowing that NVDA, AVGO, MU,
 * AMD, TSMWF and SSNLF are one industry. On 11 Nov 2026 a role agent supplied
 * that from memory and reported a "semiconductor cluster of 6.11%" which
 * nothing in the system could check or reproduce. A stored `industry` turns
 * that recognition into a `group by`.
 *
 * It also settles two questions this codebase currently argues from prospectus
 * STRINGS: whether a fund filed Small Blend actually holds small caps
 * (`market_cap`), and whether a fund whose objective reads "Frontier Markets"
 * actually holds frontier names (`country`).
 *
 * **A DELIBERATE EXCEPTION TO "FMP IS READ ON DEMAND, NEVER PERSISTED"**
 * (CLAUDE.md). That rule holds because a stored copy of a live figure goes
 * stale silently. Two things make this different: the committee runs headless
 * with no browser and needs these facts in SQL, and ~2,500 live profile calls
 * per run is worse than a cached table by every measure. Sector, industry and
 * country are near-static; `market_cap` is the one field that moves, and the
 * column comment says not to price off it.
 *
 * Coverage measured 11 Nov 2026 on the 216 equity symbols inside Hybrid
 * Balanced's funds: **212 direct hits, 99% after normalisation.** The
 * remainder is one OTC European bank line.
 */
import { supabase } from '@/lib/supabase'
import { FMP_STABLE, apiKey, fmpFetch, num, str } from '@/lib/fmpClient'

/** Re-ask about a symbol we already know only after this long. */
const STALE_DAYS = 30
const CONCURRENCY = 4

export interface HoldingProfile {
  symbol: string
  company_name: string | null
  sector: string | null
  industry: string | null
  country: string | null
  market_cap: number | null
  unresolved: boolean
  queried_as: string | null
}

// ── Which symbols are even askable ────────────────────────────────────────────

/**
 * A 9-character identifier beginning with a digit is a CUSIP, not a ticker.
 *
 * Every bond line in this book matches it — Treasuries (`912810QD3`,
 * `91282CMM0`), TBA pools (`01F0306A1`) and corporates (`060505FL3`) — and no
 * equity ticker in the book does, because none starts with a digit. They are
 * excluded rather than asked about: FMP's profile endpoint has nothing for a
 * bond issue, and **the bond sleeve is read on `securities2` composition
 * percentages rather than on its holdings list anyway** — a conclusion the
 * 11 Nov committee reached independently, when the only finding its bond
 * holdings produced was a Treasury overlap the risk manager dismissed
 * unprompted.
 */
export function isCusipLike(symbol: string): boolean {
  return /^\d[0-9A-Z]{8}$/.test(symbol)
}

/**
 * Cash sweeps and money-market lines, which are positions but not companies.
 *
 * `USD Cash`, `CNH Cash` and `OMR Cash` carry a space; `M:FGUXX` and
 * `M:GVMXX` are YCharts fund symbols for money-market funds. Asking FMP about
 * any of them wastes a call and, worse, a stray match would file a cash
 * sweep as an equity exposure — the error the committee prompt already warns
 * against after "Fidelity Cash Central Fund" surfaced as 1.18% of a book.
 */
export function isCashLike(symbol: string): boolean {
  return /\s/.test(symbol) || /^M:/i.test(symbol) || /\bcash\b/i.test(symbol)
}

/** Worth asking FMP about at all. */
export function isProfileable(symbol: string): boolean {
  const s = symbol.trim()
  return s !== '' && !isCusipLike(s) && !isCashLike(s)
}

/**
 * The symbol to send FMP, where the vendor spells it differently.
 *
 * Two transforms, and the second is NOT `fmpSymbol()`:
 *
 * - **`:DL` is a YCharts dual-listing marker** and is dropped. `KVUE:DL` is
 *   Kenvue and resolves once it goes. (`ACA:DL` is Crédit Agricole and needs
 *   an exchange suffix FMP spells `ACA.PA`, which cannot be derived from the
 *   vendor string — it stays unresolved rather than being guessed at.)
 * - **A dot before a SINGLE letter is a share class; a dot before two or more
 *   is an exchange.** `BRK.B` must become `BRK-B`, but `ABX.TO` and `L.TO`
 *   are Toronto listings that FMP spells with the dot intact. Blanket
 *   `fmpSymbol()` would convert both and break the second, which is why this
 *   does not call it.
 */
export function fmpQuerySymbol(symbol: string): string {
  const base = symbol.trim().replace(/:DL$/i, '')
  return base.replace(/\.([A-Z])$/i, '-$1')
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/** One symbol. Never throws — an unreachable FMP must not fail an import. */
export async function fetchHoldingProfile(symbol: string): Promise<HoldingProfile> {
  const queried = fmpQuerySymbol(symbol)
  const empty: HoldingProfile = {
    symbol, company_name: null, sector: null, industry: null, country: null,
    market_cap: null, unresolved: true, queried_as: queried,
  }
  try {
    const url = `${FMP_STABLE}/profile?symbol=${encodeURIComponent(queried)}&apikey=${apiKey()}`
    const raw = await fmpFetch(url)
    const row = Array.isArray(raw) ? (raw[0] as Record<string, unknown> | undefined) : undefined
    if (!row || (str(row.sector) == null && str(row.companyName) == null)) return empty
    return {
      symbol,
      company_name: str(row.companyName),
      sector: str(row.sector),
      industry: str(row.industry),
      country: str(row.country),
      market_cap: num(row.marketCap),
      unresolved: false,
      queried_as: queried === symbol ? null : queried,
    }
  } catch {
    // Distinguished from a confirmed miss by NOT being written: a transient
    // failure must not record `unresolved` and stop the next import retrying.
    return { ...empty, unresolved: false, queried_as: null, company_name: '__FETCH_FAILED__' }
  }
}

export interface ProfileRefreshResult {
  asked: number
  resolved: number
  unresolved: number
  failed: number
  skipped: number
}

/**
 * Fill in every holding symbol that has no profile, or whose profile is stale.
 *
 * Runs after the holdings import. It asks only about what it does not already
 * know, so the first run is the expensive one and every run after it costs a
 * handful of calls for newly-appearing names.
 */
export async function refreshHoldingProfiles(): Promise<ProfileRefreshResult> {
  const out: ProfileRefreshResult = { asked: 0, resolved: 0, unresolved: 0, failed: 0, skipped: 0 }

  const { data: syms, error: symErr } = await supabase
    .from('fund_holdings')
    .select('holding_symbol')
    .not('holding_symbol', 'is', null)
  if (symErr) throw symErr

  const all = [...new Set((syms ?? []).map((r) => (r.holding_symbol ?? '').trim()).filter(Boolean))]
  const askable = all.filter(isProfileable)
  out.skipped = all.length - askable.length

  const { data: known, error: knownErr } = await supabase
    .from('holding_profiles')
    .select('symbol, refreshed_at, unresolved')
  if (knownErr) throw knownErr

  const cutoff = Date.now() - STALE_DAYS * 86_400_000
  const fresh = new Set(
    (known ?? [])
      // A confirmed miss is NOT re-asked on the stale clock. FMP not having a
      // symbol is a fact about its catalogue, not a value that ages, and
      // retrying 30 days later just spends calls to learn the same thing.
      .filter((r) => r.unresolved || new Date(r.refreshed_at).getTime() > cutoff)
      .map((r) => r.symbol),
  )
  const todo = askable.filter((s) => !fresh.has(s))

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(fetchHoldingProfile))
    const rows = results.filter((r) => r.company_name !== '__FETCH_FAILED__')
    out.failed += results.length - rows.length
    out.asked += batch.length
    for (const r of rows) {
      if (r.unresolved) out.unresolved++
      else out.resolved++
    }
    if (rows.length > 0) {
      const { error } = await supabase
        .from('holding_profiles')
        .upsert(rows.map((r) => ({ ...r, refreshed_at: new Date().toISOString() })), { onConflict: 'symbol' })
      if (error) throw error
    }
  }

  return out
}
