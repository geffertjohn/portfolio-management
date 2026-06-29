import { supabase } from './supabase'

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
  assets_under_management: number | null
  number_of_holdings: number | null

  // ── Fund total returns ────────────────────────────────────────────────────
  one_month_total_return_nav: number | null
  three_month_total_return_nav: number | null
  ytd_total_return_nav: number | null
  one_year_total_return_nav: number | null
  annualized_three_year_total_return_nav: number | null
  annualized_five_year_total_return_nav: number | null
  annualized_ten_year_total_return_nav: number | null

  // ── Category returns ──────────────────────────────────────────────────────
  category_one_month_total_return: number | null
  category_three_month_total_return: number | null
  category_ytd_total_return: number | null
  category_one_year_total_return: number | null
  category_three_year_total_return: number | null
  category_five_year_total_return: number | null
  category_ten_year_total_return: number | null

  // ── Peer group returns ────────────────────────────────────────────────────
  peer_group_one_month_total_return: number | null
  peer_group_three_month_total_return: number | null
  peer_group_ytd_total_return: number | null
  peer_group_one_year_total_return: number | null
  peer_group_three_year_total_return: number | null
  peer_group_five_year_total_return: number | null
  peer_group_ten_year_total_return: number | null

  // ── Equity style box ──────────────────────────────────────────────────────
  equity_stylebox_large_cap_value_exposure: number | null
  equity_stylebox_large_cap_blend_exposure: number | null
  equity_stylebox_large_cap_growth_exposure: number | null
  equity_stylebox_mid_cap_value_exposure: number | null
  equity_stylebox_mid_cap_blend_exposure: number | null
  equity_stylebox_mid_cap_growth_exposure: number | null
  equity_stylebox_small_cap_value_exposure: number | null
  equity_stylebox_small_cap_blend_exposure: number | null
  equity_stylebox_small_cap_growth_exposure: number | null

  // ── Credit quality exposure ───────────────────────────────────────────────
  aaa_bond_exposure_generic: number | null
  aa_bond_exposure_generic: number | null
  a_bond_exposure_generic: number | null
  bbb_bond_exposure_generic: number | null
  bb_bond_exposure_generic: number | null
  b_bond_exposure_generic: number | null
  below_b_bond_exposure_generic: number | null
  effective_duration: number | null

  // ── Calmar ratio ─────────────────────────────────────────────────────────
  calmar_ratio_1y: number | null
  calmar_ratio_3y: number | null
  calmar_ratio_5y: number | null

  // ── Max drawdown ──────────────────────────────────────────────────────────
  max_drawdown_1y: number | null
  max_drawdown_3y: number | null
  max_drawdown_5y: number | null

  // ── Alpha (category) ──────────────────────────────────────────────────────
  alpha_1y_vs_category: number | null
  alpha_3y_vs_category: number | null
  alpha_5y_vs_category: number | null
  alpha_rank: number | null

  // ── Alpha (peer group) ───────────────────────────────────────────────────
  market_alpha_1y_vs_pg: number | null
  market_alpha_3y_vs_pg: number | null
  market_alpha_5y_vs_pg: number | null
  alpha_peer_group_rank: number | null

  // ── Alpha (enhanced market) ───────────────────────────────────────────────
  enhanced_market_alpha_12_month: number | null
  enhanced_market_alpha_36_month: number | null
  enhanced_market_alpha_60_month: number | null

  // ── Expense ratio ranks ───────────────────────────────────────────────────
  expense_ratio_rank: number | null
  expense_ratio_peer_group_rank: number | null

  // ── Information ratio ranks ───────────────────────────────────────────────
  information_ratio_rank: number | null
  information_ratio_peer_group_rank: number | null

  // ── Sharpe ranks ──────────────────────────────────────────────────────────
  sharpe_rank: number | null
  sharpe_peer_group_rank: number | null

  // ── Beta (category) ───────────────────────────────────────────────────────
  beta_1y_vs_category: number | null
  beta_3y_vs_category: number | null
  beta_5y_vs_category: number | null

  // ── Beta (peer group) ────────────────────────────────────────────────────
  market_beta_1y_vs_pg: number | null
  market_beta_3y_vs_pg: number | null
  market_beta_5y_vs_pg: number | null

  // ── Beta (enhanced market) ────────────────────────────────────────────────
  enhanced_market_beta_12_month: number | null
  enhanced_market_beta_36_month: number | null

  // ── Sharpe ratio ──────────────────────────────────────────────────────────
  historical_sharpe_1y: number | null
  historical_sharpe_3y: number | null
  historical_sharpe_5y: number | null

  // ── Standard deviation ────────────────────────────────────────────────────
  monthly_standard_deviation_annualized_1y: number | null
  quarterly_standard_deviation_annualized_3y: number | null
  quarterly_standard_deviation_annualized_5y: number | null

  // ── Sortino ratio ─────────────────────────────────────────────────────────
  historical_sortino_1y: number | null
  historical_sortino_3y: number | null
  historical_sortino_5y: number | null

  // ── R-squared ─────────────────────────────────────────────────────────────
  rsquared_1y_vs_category: number | null
  rsquared_3y_vs_category: number | null
  rsquared_5y_vs_category: number | null
  rsquared_1y_vs_pg: number | null
  rsquared_3y_vs_pg: number | null
  rsquared_5y_vs_pg: number | null

  // ── Treynor measure ───────────────────────────────────────────────────────
  historical_treynor_measure_1y_vs_category: number | null
  historical_treynor_measure_3y_vs_category: number | null
  historical_treynor_measure_5y_vs_category: number | null
  historical_treynor_measure_1y_vs_pg: number | null
  historical_treynor_measure_3y_vs_pg: number | null
  historical_treynor_measure_5y_vs_pg: number | null

  // ── Tracking error ────────────────────────────────────────────────────────
  tracking_error_1y_vs_category: number | null
  tracking_error_3y_vs_category: number | null
  tracking_error_5y_vs_category: number | null
  tracking_error_1y_vs_pg: number | null
  tracking_error_3y_vs_pg: number | null
  tracking_error_5y_vs_pg: number | null

  // ── Information ratio ─────────────────────────────────────────────────────
  information_ratio_1y_vs_category: number | null
  information_ratio_3y_vs_category: number | null
  information_ratio_5y_vs_category: number | null
  information_ratio_1y_vs_pg: number | null
  information_ratio_3y_vs_pg: number | null
  information_ratio_5y_vs_pg: number | null

  // ── Upside / downside capture ─────────────────────────────────────────────
  upside_downside_1y_vs_category: number | null
  upside_downside_3y_vs_category: number | null
  upside_downside_5y_vs_category: number | null
  upside_downside_1y_vs_pg: number | null
  upside_downside_3y_vs_pg: number | null
  upside_downside_5y_vs_pg: number | null

  // ── Category return ranks ─────────────────────────────────────────────────
  one_month_total_return_rank_nav: number | null
  three_month_total_return_rank_nav: number | null
  ytd_total_return_rank_nav: number | null
  one_year_total_return_rank_nav: number | null
  three_year_total_return_rank_nav: number | null
  five_year_total_return_rank_nav: number | null
  ten_year_total_return_rank_nav: number | null

  // ── Category return sizes ─────────────────────────────────────────────────
  one_month_total_return_rank_category_size_nav: number | null
  three_month_total_return_rank_category_size_nav: number | null
  ytd_total_return_rank_category_size_nav: number | null
  one_year_total_return_rank_category_size_nav: number | null
  three_year_total_return_rank_category_size_nav: number | null
  five_year_total_return_rank_category_size_nav: number | null
  ten_year_total_return_rank_category_size_nav: number | null

  // ── Peer group return ranks ───────────────────────────────────────────────
  one_month_total_return_peer_group_rank_nav: number | null
  three_month_total_return_peer_group_rank_nav: number | null
  ytd_total_return_peer_group_rank_nav: number | null
  one_year_total_return_peer_group_rank_nav: number | null
  three_year_total_return_peer_group_rank_nav: number | null
  five_year_total_return_peer_group_rank_nav: number | null
  ten_year_total_return_peer_group_rank_nav: number | null

  // ── Peer group return sizes ───────────────────────────────────────────────
  one_month_total_return_peer_group_size_nav: number | null
  three_month_total_return_peer_group_size_nav: number | null
  ytd_total_return_peer_group_size_nav: number | null
  one_year_total_return_peer_group_size_nav: number | null
  three_year_total_return_peer_group_size_nav: number | null
  five_year_total_return_peer_group_size_nav: number | null
  ten_year_total_return_peer_group_size_nav: number | null

  // ── Manager tenure ────────────────────────────────────────────────────────
  max_manager_tenure: number | null

  // ── Fund — additional YCharts fields ─────────────────────────────────────
  investment_strategy: string | null
  distribution_yield: number | null
  discount_or_premium_to_nav: number | null
  '1_month_fund_level_flows': number | null
  '3_month_fund_level_flows': number | null
  '1_year_fund_level_flows': number | null
  ytd_fund_level_flows: number | null
  one_year_tax_cost_ratio_generic: number | null
  three_year_tax_cost_ratio_generic: number | null
  five_year_tax_cost_ratio_generic: number | null

  // ── Geographic exposure ───────────────────────────────────────────────────
  north_america_total_exposure_generic: number | null
  latin_america_total_exposure_generic: number | null
  united_kingdom_total_exposure_generic: number | null
  europe_developed_total_exposure_generic: number | null
  europe_emerging_total_exposure: number | null
  africa_middle_east_total_exposure: number | null
  asia_developed_total_exposure_generic: number | null
  asia_emerging_total_exposure: number | null

  // ── Sector exposure ───────────────────────────────────────────────────────
  basic_materials_exposure_generic: number | null
  communication_services_exposure_generic: number | null
  consumer_cyclical_exposure_generic: number | null
  consumer_defensive_exposure_generic: number | null
  energy_exposure_generic: number | null
  financial_services_exposure_generic: number | null
  healthcare_exposure_generic: number | null
  industrials_exposure_generic: number | null
  real_estate_exposure_generic: number | null
  technology_exposure_generic: number | null
  utilities_exposure_generic: number | null

  // ── Fixed income type exposure ────────────────────────────────────────────
  government_fixed_income_exposure_generic: number | null
  corporate_fixed_income_exposure_generic: number | null
  securitized_fixed_income_exposure_generic: number | null
  municipal_fixed_income_exposure_generic: number | null
  other_fixed_income_exposure_generic: number | null

  // ── Asset allocation (net) ────────────────────────────────────────────────
  cash_net: number | null
  stock_net: number | null
  bond_net: number | null
  convertible_net: number | null
  preferred_net: number | null
  other_net: number | null

  // ── Maturity distribution ─────────────────────────────────────────────────
  maturity_less_than_1_year_generic: number | null
  '1_to_3_years_maturity_bond_exposure': number | null
  '3_to_5_years_maturity_bond_exposure': number | null
  maturity_5_to_10_years_generic: number | null
  maturity_10_to_20_years_generic: number | null
  maturity_20_to_30_years_generic: number | null
  over_30_years_maturity_bond_exposure: number | null

  // ── Bond analytics ────────────────────────────────────────────────────────
  average_credit_quality_score: string | null
  yield_to_maturity: number | null
  average_coupon: number | null

  thesis: string | null
  as_of_date: string | null

  // ── Top holdings (parsed from Excel "Top 25 Holdings" section) ────────────
  top_holdings: Array<{ symbol: string; weight: number }> | null

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
  dividend_growth_ttm: number | null
  eps_growth_qoq: number | null
  eps_growth_1_yr_generic: number | null
  forward_peg_ratio_1y: number | null

  // ── Stock — total returns (non-NAV) ──────────────────────────────────────
  one_month_total_return: number | null
  three_month_total_return: number | null
  ytd_total_return: number | null
  annualized_daily_one_year_total_return: number | null
  annualized_daily_three_year_return: number | null
  annualized_daily_five_year_total_return: number | null
  annualized_daily_ten_year_total_return: number | null

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
  return data as SecurityDetail
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

export async function upsertRelatedSecurities(securityId: string, relatedIds: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from('security_related_securities')
    .delete()
    .eq('security_id', securityId)
  if (delError) throw delError
  if (relatedIds.length === 0) return
  const rows = relatedIds.map((related_id, i) => ({ security_id: securityId, related_id, sort_order: i }))
  const { error } = await supabase.from('security_related_securities').insert(rows)
  if (error) throw error
}

export interface FundComparisonRow {
  security_id: string
  security_name: string | null
  expense_ratio_generic: number | null
  historical_sharpe_3y: number | null
  historical_sortino_3y: number | null
  quarterly_standard_deviation_annualized_3y: number | null
  max_drawdown_3y: number | null
  one_month_total_return_nav: number | null
  three_month_total_return_nav: number | null
  ytd_total_return_nav: number | null
  one_year_total_return_nav: number | null
  annualized_three_year_total_return_nav: number | null
  annualized_five_year_total_return_nav: number | null
}

/** Comparison-metric columns shared by securities2 (the parent fund) and fund_alternatives. */
const FUND_COMPARISON_METRIC_COLS =
  'expense_ratio_generic, historical_sharpe_3y, historical_sortino_3y, ' +
  'quarterly_standard_deviation_annualized_3y, max_drawdown_3y, one_month_total_return_nav, ' +
  'three_month_total_return_nav, ytd_total_return_nav, one_year_total_return_nav, ' +
  'annualized_three_year_total_return_nav, annualized_five_year_total_return_nav'

/**
 * The fund itself plus its related/alternative funds, each with the stored
 * metrics shown in the fund comparison tables. Row [0] is the fund (from
 * securities2); the rest come from `fund_alternatives` (in sort order).
 * Comparison funds live ONLY in fund_alternatives — never in securities2.
 * Returns [] when the fund has no alternatives.
 */
export async function fetchFundComparison(securityId: string): Promise<FundComparisonRow[]> {
  const { data: alts, error: altErr } = await supabase
    .from('fund_alternatives')
    .select(`related_security_id, security_name, ${FUND_COMPARISON_METRIC_COLS}`)
    .eq('parent_security_id', securityId)
    .order('sort_order', { ascending: true })
  if (altErr) throw altErr
  if (!alts || alts.length === 0) return []

  const { data: parent, error: parentErr } = await supabase
    .from('securities2')
    .select(`security_id, security_name, ${FUND_COMPARISON_METRIC_COLS}`)
    .eq('security_id', securityId)
    .maybeSingle()
  if (parentErr) throw parentErr

  const parentRow = parent ? (parent as unknown as FundComparisonRow) : null
  const altRows = (alts as unknown as Array<Record<string, unknown>>).map((a) => ({
    ...(a as unknown as FundComparisonRow),
    security_id: a.related_security_id as string,
  }))
  return parentRow ? [parentRow, ...altRows] : altRows
}

export async function createSecurityBySymbol(symbol: string): Promise<void> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) throw new Error('Symbol is required')

  const { error } = await supabase.from('securities2').upsert(
    { security_id: sym },
    { onConflict: 'security_id', ignoreDuplicates: true },
  )

  if (error) throw error
}
