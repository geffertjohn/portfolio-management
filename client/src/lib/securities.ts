import { supabase } from './supabase'
import { fetchEarningsDates, fetchProfile } from './fmpMarket'
import type { ScorecardCohort } from './fundScorecard'

/**
 * List row from `securities2` — fields shown in the securities list view.
 * Column names match the live Supabase schema.
 */
export interface Security {
  id: number
  security_id: string
  security_name: string | null
  detailed_security_type: string | null
  peer_group_name: string | null
  /**
   * Which cohort this fund/ETF is judged against at review — 'category' | 'peer'.
   * NULL until chosen; the review automation must skip and report those rather
   * than default to one. Set in the app only: the YCharts import issues a partial
   * update carrying just the Securities sheet's columns, so it never writes this.
   */
  scorecard_cohort: ScorecardCohort | null
  fund_company_name: string | null
  // Peer-group source for stocks (same chain the detail-page header uses)
  category_name: string | null
  equity_style_internal: string | null
}

/**
 * Full `securities2` row shape. Extends `Security` so list and detail fields stay in sync.
 * All property names match the actual DB column names.
 */
export interface SecurityDetail extends Security {
  created_at: string
  updated_at: string

  fund_family: string | null
  long_description: string | null
  broad_asset_class: string | null
  broad_category_group: string | null
  category_name: string | null
  ycharts_benchmark_category: string | null
  inception_date: string | null
  turnover_ratio: number | null
  expense_ratio_generic: number | null

  // ── Fund total returns ────────────────────────────────────────────────────
  one_month_total_return_nav: number | null
  three_month_total_return_nav: number | null
  ytd_total_return_nav: number | null
  one_year_total_return_nav: number | null
  annualized_three_year_total_return_nav: number | null
  annualized_five_year_total_return_nav: number | null

  // ── Category returns ──────────────────────────────────────────────────────

  // ── Peer group returns ────────────────────────────────────────────────────

  // ── Alpha (category) ──────────────────────────────────────────────────────
  alpha_3y_vs_category: number | null
  alpha_rank: number | null

  // ── Alpha (peer group) ───────────────────────────────────────────────────
  market_alpha_3y_vs_pg: number | null
  alpha_peer_group_rank: number | null

  // ── Expense ratio ranks ───────────────────────────────────────────────────
  expense_ratio_rank: number | null
  expense_ratio_peer_group_rank: number | null

  // ── Information ratio ranks ───────────────────────────────────────────────
  information_ratio_rank: number | null
  information_ratio_peer_group_rank: number | null

  // ── Sharpe ranks ──────────────────────────────────────────────────────────
  sharpe_rank: number | null
  sharpe_peer_group_rank: number | null

  // ── Sharpe ratio ──────────────────────────────────────────────────────────
  historical_sharpe_1y: number | null
  historical_sharpe_3y: number | null

  // ── Sortino ratio ─────────────────────────────────────────────────────────
  historical_sortino_1y: number | null
  historical_sortino_3y: number | null

  // ── R-squared ─────────────────────────────────────────────────────────────
  rsquared_3y_vs_category: number | null
  rsquared_3y_vs_pg: number | null

  // ── Information ratio ─────────────────────────────────────────────────────
  information_ratio_3y_vs_category: number | null
  information_ratio_3y_vs_pg: number | null

  // ── Upside / downside capture ─────────────────────────────────────────────
  upside_downside_5y_vs_category: number | null
  upside_downside_5y_vs_pg: number | null

  // ── Category return ranks ─────────────────────────────────────────────────
  one_month_total_return_rank_nav: number | null
  three_month_total_return_rank_nav: number | null
  ytd_total_return_rank_nav: number | null
  one_year_total_return_rank_nav: number | null
  three_year_total_return_rank_nav: number | null
  five_year_total_return_rank_nav: number | null

  // ── Category return sizes ─────────────────────────────────────────────────
  one_month_total_return_rank_category_size_nav: number | null
  three_month_total_return_rank_category_size_nav: number | null
  ytd_total_return_rank_category_size_nav: number | null
  one_year_total_return_rank_category_size_nav: number | null
  three_year_total_return_rank_category_size_nav: number | null
  five_year_total_return_rank_category_size_nav: number | null

  // ── Peer group return ranks ───────────────────────────────────────────────
  one_month_total_return_peer_group_rank_nav: number | null
  three_month_total_return_peer_group_rank_nav: number | null
  ytd_total_return_peer_group_rank_nav: number | null
  one_year_total_return_peer_group_rank_nav: number | null
  three_year_total_return_peer_group_rank_nav: number | null
  five_year_total_return_peer_group_rank_nav: number | null

  // ── Peer group return sizes ───────────────────────────────────────────────
  one_month_total_return_peer_group_size_nav: number | null
  three_month_total_return_peer_group_size_nav: number | null
  ytd_total_return_peer_group_size_nav: number | null
  one_year_total_return_peer_group_size_nav: number | null
  three_year_total_return_peer_group_size_nav: number | null
  five_year_total_return_peer_group_size_nav: number | null

  // ── Manager tenure ────────────────────────────────────────────────────────
  max_manager_tenure: number | null

  // ── Fund — additional YCharts fields ─────────────────────────────────────
  investment_strategy: string | null
  distribution_yield: number | null
  '1_month_fund_level_flows': number | null
  '3_month_fund_level_flows': number | null
  '1_year_fund_level_flows': number | null
  ytd_fund_level_flows: number | null

  // ── Geographic exposure ───────────────────────────────────────────────────
  north_america_total_exposure_generic: number | null

  // ── Asset allocation (net) ────────────────────────────────────────────────
  cash_net: number | null
  stock_net: number | null
  bond_net: number | null

  // ── Bond analytics ────────────────────────────────────────────────────────
  average_credit_quality_score: string | null
  yield_to_maturity: number | null
  average_coupon: number | null

  as_of_date: string | null

  // ── Stock — classification ────────────────────────────────────────────────
  morningstar_sector: string | null
  morningstar_industry: string | null
  equity_style_internal: string | null

  // ── Stock — saved benchmark preferences ──────────────────────────────────
  preferred_benchmark1_id: number | null  // FK → category_benchmarks.id
  preferred_benchmark2_id: number | null  // FK → sector_benchmarks.id

  // ── Stock — Alternatives tab comparison tickers (user-curated) ────────────
  alt_1: string | null
  alt_2: string | null
  alt_3: string | null

  // ── Stock — generic growth (YCharts) ──────────────────────────────────────
  sales_growth_1_yr_generic: number | null
  eps_growth_1_yr_generic: number | null

  // ── Stock — total returns (non-NAV) ──────────────────────────────────────
  one_month_total_return: number | null
  three_month_total_return: number | null
  ytd_total_return: number | null
  annualized_daily_one_year_total_return: number | null
  annualized_daily_three_year_return: number | null
  annualized_daily_five_year_total_return: number | null

  // ── Stock — earnings dates (drive review schedule) ───────────────────────
  last_earnings_release: string | null
  next_earnings_release: string | null
}

/** UI badge text; derived from `detailed_security_type` / `peer_group_name` when present. */
export type SecurityDisplayType = 'Mutual fund' | 'ETF' | 'Stock'

const STOCK_SECURITY_TYPES = new Set([
  // Generic / internal codes
  'stock',
  'equity',
  // YCharts detailed_security_type return values
  'common stock',
  'common_stock',
  'common shares',
  'ordinary shares',
  // Depositary receipts — traded on exchanges as equities
  'adr',
  'american depositary receipt',
  'gdr',
  'global depositary receipt',
])

function isStockSecurityType(raw: string): boolean {
  return STOCK_SECURITY_TYPES.has(raw)
}

/** Fields any classifier reads. All optional — callers pass whatever they have. */
type SecurityClassInput = {
  detailed_security_type?: string | null
  peer_group_name?: string | null
  fund_company_name?: string | null
  fund_family?: string | null
  expense_ratio_generic?: number | null
}

/**
 * Canonical security classifier — the single source of truth for stock vs ETF
 * vs mutual fund. `getSecurityDisplayType` (badge text) and `isFundOrEtfSecurity`
 * (fund-specific UI) both derive from this, so they can never disagree.
 *
 * `detailed_security_type` wins when present; otherwise fund-only signals
 * (peer group, fund company/family, expense ratio) classify ambiguous rows.
 */
function classifySecurity(security: SecurityClassInput): 'stock' | 'etf' | 'fund' {
  const raw = security.detailed_security_type?.trim().toLowerCase() ?? ''
  if (raw.includes('etf')) return 'etf'
  if (raw.includes('mutual') || raw.includes('open-ended') || raw.includes('open ended') || raw.includes('closed-end')) {
    return 'fund'
  }
  if (raw && isStockSecurityType(raw)) return 'stock'
  // Ambiguous / blank type — fall back to fund-only signals
  if (
    security.peer_group_name?.trim() ||
    security.fund_company_name?.trim() ||
    security.fund_family?.trim() ||
    (security.expense_ratio_generic != null && Number.isFinite(security.expense_ratio_generic))
  ) {
    return 'fund'
  }
  return 'stock'
}

export function getSecurityDisplayType(security: SecurityClassInput): SecurityDisplayType {
  const kind = classifySecurity(security)
  return kind === 'etf' ? 'ETF' : kind === 'fund' ? 'Mutual fund' : 'Stock'
}

/** ETF / mutual fund — fund-specific UI (returns table, scorecards, etc.). */
export function isFundOrEtfSecurity(security: SecurityClassInput): boolean {
  return classifySecurity(security) !== 'stock'
}

/**
 * YCharts' own trailing total returns for a set of tickers, with the classifier
 * columns needed to tell a fund from a stock.
 *
 * These columns are loaded by the workbook's `Securities` sheet and YCharts is
 * the system of record for them, so a fund's return is READ here rather than
 * recomputed from a price feed. The `_nav` figures are the fund ones; note they
 * are also populated for stocks by a long-deleted sync and are stale there, so
 * a caller must gate on `isFund` and never read them for a stock.
 */
export interface StoredSecurityReturns {
  securityId: string
  name: string | null
  numericId: number | null
  isFund: boolean
  /** Decimal (0.0155 = +1.55%), or null when YCharts carries no figure. */
  oneMonth: number | null
  threeMonth: number | null
  /**
   * Calendar year to date, and trailing twelve months.
   *
   * Added for the fund ANNUAL review, which reads over horizons a monthly
   * review has no use for. All 44 held fund and ETF securities carry both, so
   * the longer windows add no unpriced rows.
   */
  ytd: number | null
  oneYear: number | null
  /** Import stamp on the row — the as-of for every figure above. */
  updatedAt: string | null
}

/** Keyed by UPPER ticker. Symbols with no `securities2` row are simply absent. */
/**
 * Set a stock's Morningstar-style category by hand.
 *
 * **The only writer of `category_name` for a stock that exists.** The
 * per-ticker YCharts template that used to fill it was deleted in Sep 2026,
 * the workbook's `Securities` sheet is funds only, and FMP supplies no
 * category — so without this a stock added by ticker never resolves to an
 * asset class and its weight silently leaves every allocation rollup.
 *
 * **Never call this for a fund or ETF.** Theirs comes from the workbook and a
 * hand-edit would be overwritten by the next import without warning, which is
 * worse than not offering the control at all.
 *
 * The caller must surface a failure rather than swallow it: this writes a
 * governed classification that the allocation tables read, and a selection
 * that looks applied but was not is worse than a visible error — the lesson
 * from the benchmark picker.
 */
export async function setSecurityCategory(
  securityId: string,
  category: string | null,
): Promise<void> {
  const sym = securityId.trim().toUpperCase()
  if (!sym) throw new Error('No security id')
  const { error } = await supabase
    .from('securities2')
    .update({ category_name: category?.trim() || null })
    .eq('security_id', sym)
  if (error) throw error
}

export async function fetchStoredSecurityReturns(
  symbols: string[],
): Promise<Map<string, StoredSecurityReturns>> {
  const out = new Map<string, StoredSecurityReturns>()
  if (symbols.length === 0) return out

  const { data, error } = await supabase
    .from('securities2')
    .select(
      'id, security_id, security_name, detailed_security_type, peer_group_name, fund_company_name, fund_family, expense_ratio_generic, one_month_total_return_nav, three_month_total_return_nav, ytd_total_return_nav, one_year_total_return_nav, updated_at',
    )
    .in('security_id', symbols)
  if (error) throw error

  for (const row of data ?? []) {
    out.set(row.security_id.trim().toUpperCase(), {
      securityId: row.security_id,
      name: row.security_name?.trim() || null,
      numericId: row.id ?? null,
      isFund: isFundOrEtfSecurity(row),
      oneMonth: num(row.one_month_total_return_nav),
      threeMonth: num(row.three_month_total_return_nav),
      ytd: num(row.ytd_total_return_nav),
      oneYear: num(row.one_year_total_return_nav),
      updatedAt: row.updated_at ?? null,
    })
  }
  return out
}

function num(value: number | string | null): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export async function fetchSecurities(): Promise<Security[]> {
  const { data, error } = await supabase
    .from('securities2')
    .select('id, security_id, security_name, detailed_security_type, peer_group_name, fund_company_name, category_name, equity_style_internal')
    .neq('security_id', '$Cash')
    .order('security_id', { ascending: true })

  if (error) throw error
  return (data ?? []) as Security[]
}

export async function fetchSecurityById(id: number): Promise<SecurityDetail | null> {
  const { data, error } = await supabase.from('securities2').select('*').eq('id', id).single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as unknown as SecurityDetail
}

/**
 * Full `securities2` rows for a set of tickers, keyed by `security_id`.
 *
 * The fund scorecard reads ~40 rank and value columns, so the portfolio
 * review needs whole rows rather than the slim `Security` the lists use. One
 * request for the whole book: a per-holding fetch would be a dozen round trips
 * on a Foundation review.
 *
 * A ticker with no `securities2` row is simply absent from the map — the
 * caller reports it rather than rendering a scorecard of blanks.
 */
export async function fetchSecurityDetailsByIds(
  securityIds: string[],
): Promise<Record<string, SecurityDetail>> {
  if (securityIds.length === 0) return {}
  const { data, error } = await supabase
    .from('securities2')
    .select('*')
    .in('security_id', securityIds)
  if (error) throw error
  const out: Record<string, SecurityDetail> = {}
  for (const row of (data ?? []) as unknown as SecurityDetail[]) {
    out[row.security_id] = row
  }
  return out
}

export async function saveSecurityBenchmarks(
  id: number,
  bench1Id: number | null,
  bench2Id: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('securities2')
    .update({ preferred_benchmark1_id: bench1Id, preferred_benchmark2_id: bench2Id })
    .eq('id', id)
  if (error) throw error
}

/** Saves the three Alternatives-tab comparison tickers (uppercased; '' → null). */
/** Set (or clear) the cohort a fund/ETF is reviewed against. */
export async function setScorecardCohort(
  id: number,
  cohort: ScorecardCohort | null,
): Promise<void> {
  const { error } = await supabase
    .from('securities2')
    .update({ scorecard_cohort: cohort })
    .eq('id', id)
  if (error) throw error
}

export async function saveAlternatives(
  id: number,
  alts: [string | null, string | null, string | null],
): Promise<void> {
  const clean = (v: string | null) => {
    const s = v?.trim().toUpperCase()
    return s ? s : null
  }
  const { error } = await supabase
    .from('securities2')
    .update({ alt_1: clean(alts[0]), alt_2: clean(alts[1]), alt_3: clean(alts[2]) })
    .eq('id', id)
  if (error) throw error
}

export interface RelatedSecurity {
  id: number
  security_id: string
  related_id: string
  sort_order: number
  related_numeric_id: number | null
}

export async function fetchRelatedSecurities(securityId: string): Promise<RelatedSecurity[]> {
  const { data: links, error } = await supabase
    .from('security_related_securities')
    .select('id, security_id, related_id, sort_order')
    .eq('security_id', securityId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  if (!links || links.length === 0) return []

  const relatedTickers = links.map((l: { related_id: string }) => l.related_id)
  const { data: secRows } = await supabase
    .from('securities2')
    .select('id, security_id')
    .in('security_id', relatedTickers)
  const idMap = new Map((secRows ?? []).map((r: { id: number; security_id: string }) => [r.security_id, r.id]))

  return links.map((l: { id: number; security_id: string; related_id: string; sort_order: number }) => ({
    ...l,
    related_numeric_id: idMap.get(l.related_id) ?? null,
  }))
}

/**
 * Create a security by ticker, seeding its FMP-sourced fields.
 *
 * Identity (`security_name`, sector, industry, description) and the earnings
 * dates come from FMP and ONLY from FMP — Excel is blocked from writing them.
 * They are written here, at creation, because the cross-security list views
 * (Securities, At-Risk, Watchlist, positions, Review Calendar) read the stored
 * columns and cannot fire a per-row FMP request the way the detail page does.
 *
 * The FMP leg is best-effort: a profile/earnings failure must not stop the row
 * from being created, and `refreshSecurityFromFMP` re-fills it later.
 */
export async function createSecurityBySymbol(symbol: string): Promise<void> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) throw new Error('Symbol is required')

  const { error } = await supabase.from('securities2').upsert(
    { security_id: sym },
    { onConflict: 'security_id', ignoreDuplicates: true },
  )
  if (error) throw error

  await refreshSecurityFromFMP(sym).catch(() => {})
}

/**
 * Write the FMP-owned columns for one symbol: identity + last/next earnings.
 *
 * Called at creation and as a write-through from the stock detail page, which
 * already fetches both live — so simply opening a stock keeps the dates the
 * Review Calendar reads from going stale. Only non-empty values are written, so
 * a partial FMP response never blanks a good stored value.
 */
/**
 * What FMP said about a symbol's earnings dates on this pass.
 *
 * Returned so a caller can tell a date that MOVED from one that was merely
 * refreshed. The write itself is unconditional whenever FMP supplies a value,
 * so correcting a wrong future date never needed a code change — nothing was
 * asking FMP about those symbols in the first place (`needsEarningsCheck`).
 */
export interface EarningsRefresh {
  symbol: string
  lastEarnings: string | null
  nextEarnings: string | null
}

export async function refreshSecurityFromFMP(symbol: string): Promise<EarningsRefresh> {
  const sym = symbol.trim().toUpperCase()
  const none: EarningsRefresh = { symbol: sym, lastEarnings: null, nextEarnings: null }
  if (!sym) return none

  const [profileRes, earningsRes] = await Promise.allSettled([
    fetchProfile(sym),
    fetchEarningsDates(sym),
  ])

  const patch: Record<string, string> = {}
  const set = (col: string, v: string | null | undefined) => {
    if (typeof v === 'string' && v.trim() !== '') patch[col] = v
  }
  if (profileRes.status === 'fulfilled') {
    set('security_name', profileRes.value.companyName)
    set('morningstar_sector', profileRes.value.sector)
    set('morningstar_industry', profileRes.value.industry)
    set('long_description', profileRes.value.description)
  }
  if (earningsRes.status === 'fulfilled') {
    set('last_earnings_release', earningsRes.value.lastEarnings)
    set('next_earnings_release', earningsRes.value.nextEarnings)
  }
  const seen: EarningsRefresh = {
    symbol: sym,
    lastEarnings: patch.last_earnings_release ?? null,
    nextEarnings: patch.next_earnings_release ?? null,
  }
  if (Object.keys(patch).length === 0) return seen

  const { error } = await supabase.from('securities2').update(patch).eq('security_id', sym)
  if (error) throw error
  return seen
}

/**
 * Refresh the FMP-owned columns for many symbols, a few at a time.
 *
 * Used by the Review Calendar to top up stock rows whose stored
 * `next_earnings_release` has gone stale — those rows drive review scheduling
 * and the calendar cannot fetch per row while rendering. Concurrency is capped
 * so a full calendar does not burst dozens of FMP requests at once, and a
 * per-symbol failure is swallowed so one bad ticker cannot stall the rest.
 *
 * Returns the number of symbols successfully refreshed.
 */
export async function refreshSecuritiesFromFMP(
  symbols: string[],
  concurrency = 4,
): Promise<EarningsRefresh[]> {
  const queue = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  const refreshed: EarningsRefresh[] = []

  async function worker(): Promise<void> {
    for (;;) {
      const sym = queue.shift()
      if (!sym) return
      try {
        refreshed.push(await refreshSecurityFromFMP(sym))
      } catch {
        // One symbol failing must not stop the batch.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return refreshed
}

/** Minimal row shape for the global ticker-search box. */
export interface SecuritySearchResult {
  id: number
  security_id: string
  security_name: string | null
}

/**
 * Prefix search on `security_id` for the global ticker-search box.
 * `prefix` is uppercased; returns up to 10 matches ordered by ticker.
 * Returns an empty list on error (search box degrades silently).
 */
export async function searchSecurities(prefix: string): Promise<SecuritySearchResult[]> {
  const q = prefix.trim().toUpperCase()
  if (!q) return []
  const { data, error } = await supabase
    .from('securities2')
    .select('id, security_id, security_name')
    .ilike('security_id', `${q}%`)
    .order('security_id')
    .limit(10)
  if (error) return []
  return (data ?? []) as SecuritySearchResult[]
}
