import { supabase } from './supabase'
import { fetchEarningsDates, fetchProfile } from './fmpMarket'

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
  category_one_month_total_return: number | null
  category_three_month_total_return: number | null
  category_ytd_total_return: number | null
  category_one_year_total_return: number | null
  category_three_year_total_return: number | null
  category_five_year_total_return: number | null

  // ── Peer group returns ────────────────────────────────────────────────────
  peer_group_one_month_total_return: number | null
  peer_group_three_month_total_return: number | null
  peer_group_ytd_total_return: number | null
  peer_group_one_year_total_return: number | null
  peer_group_three_year_total_return: number | null
  peer_group_five_year_total_return: number | null

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

  thesis: string | null
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

/** ETF / mutual fund — fund-specific UI (returns table, thesis blocks, etc.). */
export function isFundOrEtfSecurity(security: SecurityClassInput): boolean {
  return classifySecurity(security) !== 'stock'
}

export function getThesisText(security: { thesis?: string | null } | null): string {
  const t = security?.thesis
  return typeof t === 'string' ? t : ''
}

export async function updateSecurityThesis(securityId: number, thesis: string): Promise<void> {
  const { error } = await supabase
    .from('securities2')
    .update({ thesis })
    .eq('id', securityId)

  if (error) throw error
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
export async function refreshSecurityFromFMP(symbol: string): Promise<void> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return

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
  if (Object.keys(patch).length === 0) return

  const { error } = await supabase.from('securities2').update(patch).eq('security_id', sym)
  if (error) throw error
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
export async function refreshSecuritiesFromFMP(symbols: string[], concurrency = 4): Promise<number> {
  const queue = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  let refreshed = 0

  async function worker(): Promise<void> {
    for (;;) {
      const sym = queue.shift()
      if (!sym) return
      try {
        await refreshSecurityFromFMP(sym)
        refreshed++
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
