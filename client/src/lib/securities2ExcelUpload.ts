import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { upsertRelatedSecurities } from '@/lib/securities'
import {
  coerceDate,
  coerceNumber,
  findRowForSymbol,
  formatSupabaseUpdateError,
  getTickerFromRow,
  isValidCalendarDateString,
  normalizeHeader,
  parseVerticalKeyValueSheet,
  pickWideTableRows,
  verifySymbolInKv,
} from '@/lib/excelImportShared'

/**
 * Stock-analytic columns retired from `securities2` (Jun 2026 slim-down) — they
 * were write-only (the stock detail page reads these live from FMP). Any Excel
 * header still mapping to one is stripped before the DB update.
 */
const RETIRED_SECURITIES2_COLS = new Set([
  'close_price', 'year_high', 'year_low', 'year_high_date', 'year_low_date',
  'enhanced_market_beta_60_month', 'gross_profit_margin_ttm', 'free_cash_flow_margin_ttm',
  'eps_ttm', 'return_on_invested_capital', 'free_cash_flow_yield', 'dividend_yield',
  'revenues_growth_annual', 'revenues_growth_3y', 'revenues_growth_5y', 'revenues_growth_qoq',
  'eps_growth_annual', 'eps_growth_3y', 'eps_growth_5y', 'free_cash_flow_growth_5y',
  'forward_pe_ratio', 'eps_est_long_term_growth', 'eps_est_long_term_growth_num_est',
  'eps_est_long_term_growth_std_dev', 'buy_recommendations', 'outperform_recommendations',
  'hold_recommendations', 'underperform_recommendations',
  'sell_recommendations', 'no_opinion_recommendations', 'consensus_recommendation_label',
  'consensus_recommendation', 'price_target', 'price_target_high', 'price_target_low',
  'price_target_num_est', 'price_target_std_dev', 'price_target_upside',
])

/**
 * Normalized Excel header → `securities2` column name.
 * Keys are lowercase-normalized Excel headers; values are DB short column names.
 * null values = intentionally skipped (identity / derived fields).
 */
const EXCEL_HEADER_TO_SECURITIES2: Record<string, string | null> = {
  // ── Identity (skip on upload) ─────────────────────────────────────────────
  'symbol': null,
  'security_id': null,
  'ticker': null,
  'metric': null,
  'large belnd': null, // Morningstar typo — no standalone column

  // ── Fund metadata ─────────────────────────────────────────────────────────
  'name': null,           // identity now FMP-only — never written from Excel
  'security name': null,
  'security type': 'detailed_security_type',
  'detailed security type': 'detailed_security_type',
  'investment strategy': 'investment_strategy',
  'distribution yield': 'distribution_yield',
  'nav premium discount': 'discount_or_premium_to_nav',
  'nav premium / discount': 'discount_or_premium_to_nav',
  'fund flows 1m ($m)': '1_month_fund_level_flows',
  'fund flows 3m ($m)': '3_month_fund_level_flows',
  'fund flows 1y ($m)': '1_year_fund_level_flows',
  'fund flows ytd ($m)': 'ytd_fund_level_flows',
  'fund flows 1m': '1_month_fund_level_flows',
  'fund flows 3m': '3_month_fund_level_flows',
  'fund flows 1y': '1_year_fund_level_flows',
  'fund flows ytd': 'ytd_fund_level_flows',
  'tax cost ratio 1y': 'one_year_tax_cost_ratio_generic',
  'tax cost ratio 3y': 'three_year_tax_cost_ratio_generic',
  'tax cost ratio 5y': 'five_year_tax_cost_ratio_generic',
  'fund company': 'fund_company_name',
  'fund company name': 'fund_company_name',
  'fund family': 'fund_family',
  'company': 'fund_family',
  'broad asset class': 'broad_asset_class',
  'asset class': 'broad_asset_class',
  'broad category name': 'broad_category_group',
  'category group': 'broad_category_group',
  'broad category group': 'broad_category_group',
  'category name': 'peer_group_name',
  'peer group name': 'peer_group_name',
  // Stocks: 'sector' and 'industry' go to their own dedicated columns
  'sector': null,              // identity now FMP-only — never written from Excel
  'morningstar sector': null,
  'industry': null,
  'morningstar industry': null,
  'assets under management': 'assets_under_management',
  'inception date': 'inception_date',
  'max manager tenure': 'max_manager_tenure',
  'turnover ratio': 'turnover_ratio',
  'dividend yield': 'dividend_yield',
  'expense ratio': 'expense_ratio_generic',
  '# of holdings': 'number_of_holdings',

  // ── Security returns (NAV) ────────────────────────────────────────────────
  '1 month total return': 'one_month_total_return_nav',
  '1 month total returns (daily)': 'one_month_total_return_nav',
  '3 month total return': 'three_month_total_return_nav',
  '3 month total returns (daily)': 'three_month_total_return_nav',
  'year to date total return': 'ytd_total_return_nav',
  'ytd total returns (daily)': 'ytd_total_return_nav',
  'year to date total returns (daily)': 'ytd_total_return_nav',
  '1 year total return': 'one_year_total_return_nav',
  '1 year total returns (daily)': 'one_year_total_return_nav',
  'annualized 3 year total return': 'annualized_three_year_total_return_nav',
  '3 year total returns (daily)': 'annualized_three_year_total_return_nav',
  'annualized 3 year total returns (daily)': 'annualized_three_year_total_return_nav',
  'annualized 5 year total return': 'annualized_five_year_total_return_nav',
  '5 year total returns (daily)': 'annualized_five_year_total_return_nav',
  'annualized 5 year total returns (daily)': 'annualized_five_year_total_return_nav',
  'annualized 10 year total return': 'annualized_ten_year_total_return_nav',
  '10 year total returns (daily)': 'annualized_ten_year_total_return_nav',
  'annualized 10 year total returns (daily)': 'annualized_ten_year_total_return_nav',

  // ── Benchmark (category) returns ──────────────────────────────────────────
  '1 month total returns (category)': 'category_one_month_total_return',
  'broad asset class benchmark index 1 month total returns (daily)': 'category_one_month_total_return',
  '3 month total returns (category)': 'category_three_month_total_return',
  'broad asset class benchmark index 3 month total returns (daily)': 'category_three_month_total_return',
  'year to date total returns (category)': 'category_ytd_total_return',
  'broad asset class benchmark index ytd total returns (daily)': 'category_ytd_total_return',
  'broad asset class benchmark index year to date total returns (daily)': 'category_ytd_total_return',
  '1 year total returns (category)': 'category_one_year_total_return',
  'broad asset class benchmark index 1 year total returns (daily)': 'category_one_year_total_return',
  'annualized 3 year total returns (category)': 'category_three_year_total_return',
  'broad asset class benchmark index 3 year total returns (daily)': 'category_three_year_total_return',
  'broad asset class benchmark index annualized 3 year total returns (daily)': 'category_three_year_total_return',
  'annualized 5 year total returns (category)': 'category_five_year_total_return',
  'broad asset class benchmark index 5 year total returns (daily)': 'category_five_year_total_return',
  'broad asset class benchmark index annualized 5 year total returns (daily)': 'category_five_year_total_return',
  'annualized 10 year total returns (category)': 'category_ten_year_total_return',
  'broad asset class benchmark index 10 year total returns (daily)': 'category_ten_year_total_return',
  'broad asset class benchmark index annualized 10 year total returns (daily)': 'category_ten_year_total_return',

  // ── Peer group returns ────────────────────────────────────────────────────
  '1 month total returns (peer group)': 'peer_group_one_month_total_return',
  'peer group 1 month total returns (daily)': 'peer_group_one_month_total_return',
  '3 month total returns (peer group)': 'peer_group_three_month_total_return',
  '3 month total returns (peer group )': 'peer_group_three_month_total_return',
  'peer group 3 month total returns (daily)': 'peer_group_three_month_total_return',
  'year to date total returns (peer group)': 'peer_group_ytd_total_return',
  'peer group ytd total returns (daily)': 'peer_group_ytd_total_return',
  'peer group year to date total returns (daily)': 'peer_group_ytd_total_return',
  '1 year total returns (peer group)': 'peer_group_one_year_total_return',
  'peer group 1 year total returns (daily)': 'peer_group_one_year_total_return',
  '3 year total returns (peer group)': 'peer_group_three_year_total_return',
  'peer group 3 year total returns (daily)': 'peer_group_three_year_total_return',
  'peer group annualized 3 year total returns (daily)': 'peer_group_three_year_total_return',
  'annualized 5 year total returns (peer group)': 'peer_group_five_year_total_return',
  'peer group 5 year total returns (daily)': 'peer_group_five_year_total_return',
  'peer group annualized 5 year total returns (daily)': 'peer_group_five_year_total_return',
  'annualized 10 year total returns (peer group)': 'peer_group_ten_year_total_return',
  'peer group 10 year total returns (daily)': 'peer_group_ten_year_total_return',
  'peer group annualized 10 year total returns (daily)': 'peer_group_ten_year_total_return',

  // ── Alpha ─────────────────────────────────────────────────────────────────
  'alpha 1y (market)': 'alpha_1y_vs_category',
  'alpha 1y (category)': 'alpha_1y_vs_category',
  'alpha 3y (market)': 'alpha_3y_vs_category',
  'alpha 3y (category)': 'alpha_3y_vs_category',
  'alpha 5y (market)': 'alpha_5y_vs_category',
  'alpha 5y (category)': 'alpha_5y_vs_category',
  'alpha 1y (peer group)': null,
  'alpha 3y (peer group)': null,
  'alpha 5y (peer group)': null,

  // ── Beta ──────────────────────────────────────────────────────────────────
  'beta 1y (market)': 'beta_1y_vs_category',
  'beta 1y (category)': 'beta_1y_vs_category',
  'beta 3y (market)': 'beta_3y_vs_category',
  'beta 3y (category)': 'beta_3y_vs_category',
  'beta 5y (market)': 'beta_5y_vs_category',
  'beta 5y (category)': 'beta_5y_vs_category',
  'beta 1y (peer group)': null,
  'beta 3y (peer group)': null,
  'beta 5y (peer group)': null,

  // ── Sharpe ratio ──────────────────────────────────────────────────────────
  'sharpe 1y': 'historical_sharpe_1y',
  'sharpe 3y': 'historical_sharpe_3y',
  'sharpe 5y': 'historical_sharpe_5y',
  'sharpe 1y (market)': null,
  'sharpe 1y (category)': null,
  'sharpe 3y (market)': null,
  'sharpe 3y (category)': null,
  'sharpe 5y (market)': null,
  'sharpe 5y (category)': null,
  'sharpe 1y (peer group)': null,
  'sharpe 3y (peer group)': null,
  'sharpe 5y (peer group)': null,

  // ── Standard deviation ────────────────────────────────────────────────────
  'standard deviation 1y': 'monthly_standard_deviation_annualized_1y',
  'standard deviation 3y': 'quarterly_standard_deviation_annualized_3y',
  'standard deviation 5y': 'quarterly_standard_deviation_annualized_5y',
  'standard deviation 1y (market)': null,
  'standard deviation 1y (category)': null,
  'standard deviation 3y (market)': null,
  'standard deviation 3y (category)': null,
  'standard deviation 5y (market)': null,
  'standard deviation 5y (category)': null,
  'standard deviation 1y (peer group)': null,
  'standard deviation 3y (peer group)': null,
  'standard deviation 5y (peer group)': null,

  // ── Sortino ratio ─────────────────────────────────────────────────────────
  'sortino 1y': 'historical_sortino_1y',
  'sortino 3y': 'historical_sortino_3y',
  'sortino 5y': 'historical_sortino_5y',
  'sortino 1y (market)': null,
  'sortino 1y (category)': null,
  'sortino 3y (market)': null,
  'sortino 3y (category)': null,
  'sortino 5y (market)': null,
  'sortino 5y (category)': null,
  'sortino 1y (peer group)': null,
  'sortino 3y (peer group)': null,
  'sortino 5y (peer group)': null,

  // ── R-squared ─────────────────────────────────────────────────────────────
  'r square 1y (market)': 'rsquared_1y_vs_category',
  'r square 1y (category)': 'rsquared_1y_vs_category',
  'r square 3y (market)': 'rsquared_3y_vs_category',
  'r square 3y (category)': 'rsquared_3y_vs_category',
  'r square 5y (market)': 'rsquared_5y_vs_category',
  'r square 5y (category)': 'rsquared_5y_vs_category',
  'r square 1y (peer group)': 'rsquared_1y_vs_pg',
  'r square 3y (peer group)': 'rsquared_3y_vs_pg',
  'r square 5y (peer group)': 'rsquared_5y_vs_pg',

  // ── Treynor measure ───────────────────────────────────────────────────────
  'treynor 1y (market)': 'historical_treynor_measure_1y_vs_category',
  'treynor 1y (category)': 'historical_treynor_measure_1y_vs_category',
  'treynor 3y (market)': 'historical_treynor_measure_3y_vs_category',
  'treynor 3y (category)': 'historical_treynor_measure_3y_vs_category',
  'treynor 5y (market)': 'historical_treynor_measure_5y_vs_category',
  'treynor 5y (category)': 'historical_treynor_measure_5y_vs_category',
  'treynor 1y (peer group)': 'historical_treynor_measure_1y_vs_pg',
  'treynor 3y (peer group)': 'historical_treynor_measure_3y_vs_pg',
  'treynor 5y (peer group)': 'historical_treynor_measure_5y_vs_pg',

  // ── Tracking error ────────────────────────────────────────────────────────
  'tracking error 1y (market)': 'tracking_error_1y_vs_category',
  'tracking error 1y (category)': 'tracking_error_1y_vs_category',
  'tracking error 3y (market)': 'tracking_error_3y_vs_category',
  'tracking error 3y (category)': 'tracking_error_3y_vs_category',
  'tracking error 5y (market)': 'tracking_error_5y_vs_category',
  'tracking error 5y (category)': 'tracking_error_5y_vs_category',
  'tracking error 1y (peer group)': 'tracking_error_1y_vs_pg',
  'tracking error 3y (peer group)': 'tracking_error_3y_vs_pg',
  'tracking error 5y (peer group)': 'tracking_error_5y_vs_pg',

  // ── Information ratio ─────────────────────────────────────────────────────
  'information ratio 1y (market)': 'information_ratio_1y_vs_category',
  'information ratio 1y (category)': 'information_ratio_1y_vs_category',
  'information ratio 1yr (category)': 'information_ratio_1y_vs_category',
  'information ratio 3y (market)': 'information_ratio_3y_vs_category',
  'information ratio 3y (category)': 'information_ratio_3y_vs_category',
  'information ratio 5y (market)': 'information_ratio_5y_vs_category',
  'information ratio 5y (category)': 'information_ratio_5y_vs_category',
  'information ratio 1y (peer group)': 'information_ratio_1y_vs_pg',
  'information ratio 1yr (peer group)': 'information_ratio_1y_vs_pg',
  'information ratio 3y (peer group)': 'information_ratio_3y_vs_pg',
  'information ratio 5y (peer group)': 'information_ratio_5y_vs_pg',

  // ── Upside / downside capture ─────────────────────────────────────────────
  'upside/downside 1y (market)': 'upside_downside_1y_vs_category',
  'upside/downside 1y (category)': 'upside_downside_1y_vs_category',
  'upside/downside 3y (market)': 'upside_downside_3y_vs_category',
  'upside/downside 3y (category)': 'upside_downside_3y_vs_category',
  'upside/downside 5y (market)': 'upside_downside_5y_vs_category',
  'upside/downside 5y (category)': 'upside_downside_5y_vs_category',
  'upside/downside (1 year)': 'upside_downside_1y_vs_pg',
  'upside/downside 1y (peer group)': 'upside_downside_1y_vs_pg',
  'upside/downside (3 year)': 'upside_downside_3y_vs_pg',
  'upside/downside 3y (peer group)': 'upside_downside_3y_vs_pg',
  'upside/downside (5 year)': 'upside_downside_5y_vs_pg',
  'upside/downside 5y (peer group)': 'upside_downside_5y_vs_pg',

  // ── Category ranks ────────────────────────────────────────────────────────
  '1 month total nav returns peer group rank': 'one_month_total_return_rank_nav',
  '3 month total nav returns peer group rank': 'three_month_total_return_rank_nav',
  'year to date total nav returns peer group rank': 'ytd_total_return_rank_nav',
  'ytd total nav returns peer group rank': 'ytd_total_return_rank_nav',
  '1 year total nav returns peer group rank': 'one_year_total_return_rank_nav',
  '3 year total nav returns peer group rank': 'three_year_total_return_rank_nav',
  '5 year total nav returns peer group rank': 'five_year_total_return_rank_nav',
  '10 year total nav returns peer group rank': 'ten_year_total_return_rank_nav',

  // ── Category sizes ────────────────────────────────────────────────────────
  '1 month total nav returns peer group size': 'one_month_total_return_rank_category_size_nav',
  '3 month total nav returns peer group size': 'three_month_total_return_rank_category_size_nav',
  'year to date total nav returns peer group size': 'ytd_total_return_rank_category_size_nav',
  'ytd total nav returns peer group size': 'ytd_total_return_rank_category_size_nav',
  '1 year total nav returns peer group size': 'one_year_total_return_rank_category_size_nav',
  '3 year total nav returns peer group size': 'three_year_total_return_rank_category_size_nav',
  '5 year total nav returns peer group size': 'five_year_total_return_rank_category_size_nav',
  '10 year total nav returns peer group size': 'ten_year_total_return_rank_category_size_nav',

  // ── Aggregate ranks (category) ────────────────────────────────────────────
  'alpha 3y rank in category': 'alpha_rank',
  'alpha 3y rank (category)': 'alpha_rank',
  'expense ratio rank in category': 'expense_ratio_rank',
  'expense ratio rank (category)': 'expense_ratio_rank',
  'information ratio 3y rank in category': 'information_ratio_rank',
  'information ratio 3y rank (category)': 'information_ratio_rank',
  'information ratio rank (category)': 'information_ratio_rank',
  'sharpe 3y rank in category': 'sharpe_rank',
  'sharpe 3y rank (category)': 'sharpe_rank',

  // ── Aggregate ranks (peer group) ──────────────────────────────────────────
  'alpha 3y rank in peer group': 'alpha_peer_group_rank',
  'alpha 3y rank (peer group)': 'alpha_peer_group_rank',
  'sharpe 3y rank in peer group': 'sharpe_peer_group_rank',
  'sharpe 3y rank (peer group)': 'sharpe_peer_group_rank',
  'information 3y rank in peer group': 'information_ratio_peer_group_rank',
  'information ratio 3y rank in peer group': 'information_ratio_peer_group_rank',
  'information ratio peer group rank': 'information_ratio_peer_group_rank',
  'information ratio 3y peer group rank': 'information_ratio_peer_group_rank',
  'information ratio 3y rank (peer group)': 'information_ratio_peer_group_rank',
  'expense ratio rank in peer group': 'expense_ratio_peer_group_rank',
  'expense ratio rank (peer group)': 'expense_ratio_peer_group_rank',

  // ── Geographic exposure ───────────────────────────────────────────────────
  'north america': 'north_america_total_exposure_generic',
  'latin america': 'latin_america_total_exposure_generic',
  'united kingdom': 'united_kingdom_total_exposure_generic',
  'europe developed': 'europe_developed_total_exposure_generic',
  'europe em': 'europe_emerging_total_exposure',
  'africa & middle east': 'africa_middle_east_total_exposure',
  'asia developed': 'asia_developed_total_exposure_generic',
  'asia em': 'asia_emerging_total_exposure',

  // ── Style box exposure ────────────────────────────────────────────────────
  'large value': 'equity_stylebox_large_cap_value_exposure',
  'large blend': 'equity_stylebox_large_cap_blend_exposure',
  'large growth': 'equity_stylebox_large_cap_growth_exposure',
  'mid value': 'equity_stylebox_mid_cap_value_exposure',
  'mid blend': 'equity_stylebox_mid_cap_blend_exposure',
  'mid growth': 'equity_stylebox_mid_cap_growth_exposure',
  'small value': 'equity_stylebox_small_cap_value_exposure',
  'small blend': 'equity_stylebox_small_cap_blend_exposure',
  'small growth': 'equity_stylebox_small_cap_growth_exposure',

  // ── Sector exposure ───────────────────────────────────────────────────────
  'basic materials': 'basic_materials_exposure_generic',
  'communication services': 'communication_services_exposure_generic',
  'consumer cyclical': 'consumer_cyclical_exposure_generic',
  'consumer defensive': 'consumer_defensive_exposure_generic',
  'consumer staples': 'consumer_defensive_exposure_generic',
  'energy': 'energy_exposure_generic',
  'financial services': 'financial_services_exposure_generic',
  'healthcare': 'healthcare_exposure_generic',
  'industrials': 'industrials_exposure_generic',
  'real estate': 'real_estate_exposure_generic',
  'technology': 'technology_exposure_generic',
  'information technology': 'technology_exposure_generic',
  'utilities': 'utilities_exposure_generic',

  // ── Fixed income type exposure ────────────────────────────────────────────
  'government fixed income': 'government_fixed_income_exposure_generic',
  'corporate fixed income': 'corporate_fixed_income_exposure_generic',
  'securitized fixed income': 'securitized_fixed_income_exposure_generic',
  'municipal fixed income': 'municipal_fixed_income_exposure_generic',
  'other fixed income': 'other_fixed_income_exposure_generic',

  // ── Asset allocation (net) ────────────────────────────────────────────────
  'cash net': 'cash_net',
  'cash': 'cash_net',
  'stock net': 'stock_net',
  'stock': 'stock_net',
  'bond net': 'bond_net',
  'bond': 'bond_net',
  'convertible net': 'convertible_net',
  'convertible': 'convertible_net',
  'preferred net': 'preferred_net',
  'preferred': 'preferred_net',
  'other net': 'other_net',
  'other': 'other_net',

  // ── Credit quality ────────────────────────────────────────────────────────
  'aaa bond exposure': 'aaa_bond_exposure_generic',
  'aa bond exposure': 'aa_bond_exposure_generic',
  'a bond exposure': 'a_bond_exposure_generic',
  'bbb bond exposure': 'bbb_bond_exposure_generic',
  'bb bond exposure': 'bb_bond_exposure_generic',
  'b bond exposure': 'b_bond_exposure_generic',
  'below b bond exposure': 'below_b_bond_exposure_generic',

  // ── Maturity distribution ─────────────────────────────────────────────────
  'maturity 0-1 year': 'maturity_less_than_1_year_generic',
  'maturity 1-3 year': '1_to_3_years_maturity_bond_exposure',
  'maturity 3-5 year': '3_to_5_years_maturity_bond_exposure',
  'maturity 5-10 year': 'maturity_5_to_10_years_generic',
  'maturity 10-20 year': 'maturity_10_to_20_years_generic',
  'maturity 20-30 year': 'maturity_20_to_30_years_generic',
  'maturity > 30 year': 'over_30_years_maturity_bond_exposure',
  'maturity >30 year': 'over_30_years_maturity_bond_exposure',

  // ── Bond analytics ────────────────────────────────────────────────────────
  'effective duration': 'effective_duration',
  'average credit quality': 'average_credit_quality_score',
  'yield to maturity': 'yield_to_maturity',
  'average coupon': 'average_coupon',
  'max drawdown 1y': 'max_drawdown_1y',
  'max drawdown 3y': 'max_drawdown_3y',
  'max drawdown 3y (market)': null,
  'max drawdown 3y (category)': null,
  'max drawdown 3y (peer group)': null,
  'max drawdown 5y': 'max_drawdown_5y',
  'max drawdown 5y (market)': null,
  'max drawdown 5y (category)': null,
  'max drawdown 5y (peer group)': null,

  // ── Stock — current price ─────────────────────────────────────────────────
  'price': 'close_price',
  'current price': 'close_price',
  'stock price': 'close_price',
  'last price': 'close_price',
  'closing price': 'close_price',

  // ── Stock — ROE ───────────────────────────────────────────────────────────
  // (return_on_equity_5y_mean removed from DB — silently drop)
  'roe 5y avg': null,
  'roe (5y avg)': null,
  'return on equity 5y avg': null,
  'return on equity 5y mean': null,

  // ── Stock — ROIC ──────────────────────────────────────────────────────────
  'return on invested capital': 'return_on_invested_capital',
  'roic ttm': 'return_on_invested_capital',
  'roic (ttm)': 'return_on_invested_capital',

  // ── Stock — margins & cash flow ───────────────────────────────────────────
  'gross profit margin (ttm)': 'gross_profit_margin_ttm',
  'gross profit margin ttm': 'gross_profit_margin_ttm',
  'free cash flow margin (ttm)': 'free_cash_flow_margin_ttm',
  'free cash flow margin ttm': 'free_cash_flow_margin_ttm',
  'free cash flow yield': 'free_cash_flow_yield',
  'free cash flow growth 5y': 'free_cash_flow_growth_5y',

  // ── Stock — growth ────────────────────────────────────────────────────────
  'revenue growth ttm': 'revenues_growth_annual',
  'revenue growth (ttm)': 'revenues_growth_annual',
  'revenue growth 1y': 'revenues_growth_annual',
  'revenue growth (1y)': 'revenues_growth_annual',
  'revenues growth 1y': 'revenues_growth_annual',
  'revenue growth 1q': 'revenues_growth_qoq',
  'revenue growth (1q)': 'revenues_growth_qoq',
  'revenues growth 1q': 'revenues_growth_qoq',
  'revenues growth qoq': 'revenues_growth_qoq',
  'revenue growth qoq': 'revenues_growth_qoq',
  'revenue growth 3y': 'revenues_growth_3y',
  'revenues growth 3y': 'revenues_growth_3y',
  'revenue growth 5y': 'revenues_growth_5y',
  'revenues growth 5y': 'revenues_growth_5y',
  'dividend growth (ttm)': 'dividend_growth_ttm',
  'dividend growth ttm': 'dividend_growth_ttm',
  'eps growth 1y': 'eps_growth_annual',
  'eps growth (1y)': 'eps_growth_annual',
  'eps growth annual': 'eps_growth_annual',

  // ── Stock — EPS estimates ─────────────────────────────────────────────────
  'eps growth 3y': 'eps_growth_3y',
  'eps growth (3y)': 'eps_growth_3y',
  'eps growth 5y': 'eps_growth_5y',
  'eps growth (5y)': 'eps_growth_5y',
  'eps growth estimate 3y': 'eps_est_long_term_growth',
  'eps growth estimates 3y': 'eps_est_long_term_growth_num_est',
  'eps growth estimate 3y std dev': 'eps_est_long_term_growth_std_dev',
  'eps growth estimate 3y standard deviation': 'eps_est_long_term_growth_std_dev',

  // ── Stock — valuation ─────────────────────────────────────────────────────
  'forward pe': 'forward_pe_ratio',
  'forward pe ratio': 'forward_pe_ratio',
  'forward p/e': 'forward_pe_ratio',
  'forward peg': 'forward_peg_ratio_1y',
  'forward peg ratio': 'forward_peg_ratio_1y',
  // pe_5, ps_ratio_3y_mean, revenue_per_share_ttm removed from DB — silently drop
  'pe ratio (5y avg)': null,
  'pe 5y avg': null,
  'pe ratio 5y': null,
  'eps (ttm)': 'eps_ttm',
  'eps ttm': 'eps_ttm',
  'ps ratio (3y avg)': null,
  'ps ratio 3y avg': null,
  'ps ratio 3y mean': null,
  'revenue per share': null,
  'revenue per share (ttm)': null,
  'revenue per share ttm': null,


  // ── Stock — risk / volatility ─────────────────────────────────────────────
  'quarterly standard deviation 3y': 'quarterly_standard_deviation_annualized_3y',
  'standard deviation 3y (quarterly)': 'quarterly_standard_deviation_annualized_3y',
  'beta 5y': 'enhanced_market_beta_60_month',
  'beta (5y)': 'enhanced_market_beta_60_month',
  'market beta 60 month': 'enhanced_market_beta_60_month',

  // ── Benchmark — growth & monthly volatility ──────────────────────────────
  'sales growth 1 yr': 'revenues_growth_annual',
  'sales growth 1yr': 'revenues_growth_annual',
  'sales growth 1y': 'revenues_growth_annual',
  'sales growth 1 yr generic': 'revenues_growth_annual',
  'sales growth 3 yr': 'sales_growth_3_yr_generic',
  'sales growth 3yr': 'sales_growth_3_yr_generic',
  'sales growth 3y': 'sales_growth_3_yr_generic',
  'sales growth 3 yr generic': 'sales_growth_3_yr_generic',
  'sales growth 5 yr': 'sales_growth_5_yr_generic',
  'sales growth 5yr': 'sales_growth_5_yr_generic',
  'sales growth 5y': 'sales_growth_5_yr_generic',
  'sales growth 5 yr generic': 'sales_growth_5_yr_generic',
  'eps growth 1 yr': 'eps_growth_annual',
  'eps growth 1yr': 'eps_growth_annual',
  'eps growth 1 yr generic': 'eps_growth_annual',
  'eps growth 3 yr': 'eps_growth_3_yr_generic',
  'eps growth 3yr': 'eps_growth_3_yr_generic',
  'eps growth 3 yr generic': 'eps_growth_3_yr_generic',
  'forecasted earnings growth': 'forecasted_earnings_growth',
  'forecasted earnings growth rate': 'forecasted_earnings_growth',
  'monthly standard deviation annualized 1y': 'monthly_standard_deviation_annualized_1y',
  'monthly standard deviation annualized 1 yr': 'monthly_standard_deviation_annualized_1y',
  'monthly standard deviation annualized 3y': 'monthly_standard_deviation_annualized_3y',
  'monthly standard deviation annualized 3 yr': 'monthly_standard_deviation_annualized_3y',
  'monthly standard deviation annualized 5y': 'monthly_standard_deviation_annualized_5y',
  'monthly standard deviation annualized 5 yr': 'monthly_standard_deviation_annualized_5y',

  // ── Stock — earnings & 52-week dates ─────────────────────────────────────
  'last earnings release': 'last_earnings_release',
  'last earnings release date': 'last_earnings_release',
  'next earnings release': 'next_earnings_release',
  'next earnings release date': 'next_earnings_release',
  'next earnings date': 'next_earnings_release',
  '52 week high': 'year_high',
  '52-week high': 'year_high',
  'year high': 'year_high',
  '52 week high date': 'year_high_date',
  'year high date': 'year_high_date',
  '52 week low': 'year_low',
  '52-week low': 'year_low',
  'year low': 'year_low',
  '52 week low date': 'year_low_date',
  'year low date': 'year_low_date',

  // ── Stock — analyst consensus ─────────────────────────────────────────────
  'consensus rating': 'consensus_recommendation_label',
  'consensus recommendation label': 'consensus_recommendation_label',
  'consensus recommendation': 'consensus_recommendation',
  'buy': 'buy_recommendations',
  'outperform': 'outperform_recommendations',
  'hold': 'hold_recommendations',
  'underperform': 'underperform_recommendations',
  'sell': 'sell_recommendations',
  'no opinion': 'no_opinion_recommendations',

  // ── Stock — price targets ─────────────────────────────────────────────────
  'price target': 'price_target',
  'price target high': 'price_target_high',
  'price target low': 'price_target_low',
  'proce target low': 'price_target_low',      // typo in common template
  'price target estimates': 'price_target_num_est',
  'price target # of estimates': 'price_target_num_est',
  'price target std dev': 'price_target_std_dev',
  'price target standard deviation': 'price_target_std_dev',
  'price target upside': 'price_target_upside',
}

const DATE_COLS = new Set([
  'inception_date',
  'last_earnings_release',
  'next_earnings_release',
  'year_high_date',
  'year_low_date',
])

/**
 * Matches standard equity tickers: 1–6 uppercase letters, optionally followed
 * by a dot + 1–4 uppercase letters (e.g. BRK.B, ADR notation).
 */
const TICKER_RE = /^[A-Z]{1,6}(\.[A-Z]{1,4})?$/

const TEXT_COLS = new Set([
  'security_name',
  'detailed_security_type',
  'security_id',
  'fund_family',
  'fund_company_name',
  'broad_asset_class',
  'broad_category_group',
  'category_name',
  'category_index',
  'ycharts_benchmark_category',
  'peer_group_name',
  'average_credit_quality_score',
  // Stock classification
  'morningstar_sector',
  'morningstar_industry',
  'equity_style_internal',
  // Stock — analyst label
  'consensus_recommendation_label',
  // Fund — additional descriptive fields
  'investment_strategy',
])

const VERTICAL_KV_MARKERS = new Set([
  'fund company',
  'net expense ratio',
  'morningstar category',
  '1 month total returns (daily)',
  'total net assets',
  'legal structure',
  'broad asset class benchmark index',
  'net assets',
  'primary category',
  'asset class',
  'category name',
])

function verticalSheetLooksLikeKeyValue(kv: Record<string, unknown>): boolean {
  for (const k of Object.keys(kv)) {
    if (VERTICAL_KV_MARKERS.has(normalizeHeader(k))) return true
  }
  return false
}

function resolveSecurities2Column(header: string): string | null {
  const n = normalizeHeader(header)
  const direct = EXCEL_HEADER_TO_SECURITIES2[n]
  if (direct !== undefined) return direct
  const withoutDaily = n.replace(/\s*\(daily\)\s*$/i, '').trim()
  if (withoutDaily !== n) {
    const alt = EXCEL_HEADER_TO_SECURITIES2[withoutDaily]
    if (alt !== undefined) return alt
  }
  return null
}

function mapRowToSecurities2Patch(row: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [header, raw] of Object.entries(row)) {
    const col = resolveSecurities2Column(header)
    if (col == null) continue

    if (DATE_COLS.has(col)) {
      const d = coerceDate(raw)
      if (d != null) patch[col] = d
      continue
    }
    if (TEXT_COLS.has(col)) {
      if (raw == null || raw === '') continue
      patch[col] = String(raw).trim()
      continue
    }
    const n = coerceNumber(raw)
    if (n != null) patch[col] = n
  }
  return patch
}

/**
 * Scans the raw sheet for a "Top 25 Holdings" (or "Top Holdings") section header
 * and collects the ticker / weight pairs that follow it.
 *
 * The header and data may be in any column pair — the function auto-detects which
 * column contains the header text, then reads tickers from that column and weights
 * from the next non-empty column to the right.
 *
 * Weights are stored by Excel as decimals (e.g. 0.0459 for 4.59%) and are
 * automatically converted to display percentages (multiplied × 100).
 *
 * Non-ticker rows (e.g. "Other Assets less Liabilities") are silently skipped.
 * Collection stops after 5 consecutive rows with no valid ticker/weight pair.
 */
function extractTopHoldings(
  sheet: XLSX.WorkSheet,
): Array<{ symbol: string; weight: number }> | null {
  // Use raw:true so percentage cells come back as their underlying decimal values
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  // Locate the section header row — scan EVERY cell in every row
  let startIdx = -1
  let tickerCol = 0 // column index where tickers live
  let weightCol = 1 // column index where weights live

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (typeof cell === 'string') {
        const norm = normalizeHeader(cell)
        if (norm.includes('top') && norm.includes('holding')) {
          startIdx = i + 1
          tickerCol = c          // tickers are in the same column as the header
          weightCol = c + 1      // weights are in the very next column
          break
        }
      }
    }
    if (startIdx !== -1) break
  }
  if (startIdx === -1) return null

  const holdings: Array<{ symbol: string; weight: number }> = []
  let emptyStreak = 0

  for (let i = startIdx; i < rows.length && emptyStreak < 5; i++) {
    const row = rows[i]
    const labelRaw = row[tickerCol]
    const weightRaw = row[weightCol]

    // Blank ticker cell — count toward stop sentinel
    if (labelRaw == null || labelRaw === '') {
      emptyStreak++
      continue
    }

    const label = String(labelRaw).trim().toUpperCase()

    // Skip rows whose label doesn't look like a ticker symbol
    if (!TICKER_RE.test(label)) {
      // Multi-word labels almost certainly signal a new section — accelerate stop
      if (typeof labelRaw === 'string' && labelRaw.trim().includes(' ')) {
        emptyStreak += 2
      }
      continue
    }

    let weight = coerceNumber(weightRaw)
    if (weight == null) continue

    // Excel stores percent-formatted cells as decimals (e.g. 0.0459 for 4.59%).
    // Convert to display percentage when the parsed value is between 0 and 1.
    if (weight > 0 && weight <= 1) {
      weight = weight * 100
    }

    emptyStreak = 0
    holdings.push({ symbol: label, weight })
  }

  return holdings.length > 0 ? holdings : null
}

function sanitizeSecurities2Patch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (DATE_COLS.has(k)) {
      if (typeof v === 'string' && isValidCalendarDateString(v)) out[k] = v
      continue
    }
    if (TEXT_COLS.has(k)) {
      if (typeof v === 'string' && v !== '') out[k] = v
      continue
    }
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

// ── Schema-direct layout helpers ─────────────────────────────────────────────
//
// The ETF/MF and Stock upload templates use the following column layout:
//   Col A: DB column name (securities2 field)
//   Col B: human-readable label (displayed in the UI; ignored on upload)
//   Col C: value — populated by YCharts formula =IFERROR(_xll.YCI($F$1,"code"),"")
//   Col E: (ignored) YCharts helper column
//   Col F: (ignored) ticker / F1 reference cell
//
// We detect this layout by finding a column (A–C only) with 5+ snake_case DB
// column names, skip any adjacent label-only column, then read col C as the
// value.  Columns D onward are never scanned or read.

function looksLikeDbColumn(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const s = v.trim()
  // Must be at least 2 chars, only lowercase letters/digits/underscores/plus,
  // and contain at least one letter or underscore (to exclude bare numbers like "13").
  return s.length > 1 && /^[a-z0-9][a-z0-9_+]*$/.test(s) && /[a-z_]/.test(s)
}

/** Returns {schemaCol, valCol} if a schema-direct layout is detected, else null. */
function detectSchemaDirectLayout(
  rows: unknown[][],
): { schemaCol: number; valCol: number } | null {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0)
  // Only scan columns A–C (indices 0–2). Columns D onward (including E/F which
  // hold YCharts ticker helper data) must never be read or influence detection.
  for (let c = 0; c < Math.min(maxCols, 3); c++) {
    const hits = rows.filter((r) => looksLikeDbColumn(r[c])).length
    if (hits >= 5) {
      // Default value column is the one immediately to the right.
      // Some templates insert a human-readable label column between the schema
      // column and the value column (Col A = db_col, Col B = "Fund Company",
      // Col C = value).  Detect that by checking whether the next column has
      // any numeric values — if not, step one column further right.
      let valCol = c + 1
      if (valCol < maxCols && valCol <= 2) {
        const colVals = rows.map((r) => r[valCol]).filter((v) => v != null && v !== '')
        const hasNumbers = colVals.some(
          (v) =>
            typeof v === 'number' ||
            // Use strict numeric parse — labels like "52 Week High" or "1 Month
            // Total Return" start with digits but are NOT pure numbers.  Only
            // count a string value as numeric when Number() succeeds (finite,
            // non-empty string that parses completely as a number).
            (typeof v === 'string' &&
              String(v).trim() !== '' &&
              isFinite(Number(String(v).trim()))),
        )
        if (!hasNumbers) {
          valCol = c + 2
        }
      }
      // Value column must stay within A–C (indices 0–2). If the schema column
      // is at C there is no room for a value column in the allowed range; skip.
      if (valCol > 2) continue
      return { schemaCol: c, valCol }
    }
  }
  return null
}

/**
 * Build a securities2 patch directly from DB column name → value pairs.
 * Skips identity fields (symbol) and applies TEXT_COLS / DATE_COLS coercion.
 */
function buildPatchFromSchemaDirect(
  rows: unknown[][],
  schemaCol: number,
  valCol: number,
): Record<string, unknown> {
  // Columns that exist in the template under a legacy name but map to a different DB column
  const COLUMN_REMAP: Record<string, string> = {
    'inception_date_generic': 'inception_date',
  }

  const SKIP = new Set([
    // System / identity columns
    'symbol', 'security_id', 'id', 'created_at', 'updated_at',
    // Columns removed from securities2 in the April 2026 schema migration.
    // Templates may still contain these in col A — silently drop them so
    // Supabase does not return 400 "column not found in schema cache".
    'description',
    'long_description',  // read-only / user-managed
    // Identity now sourced from FMP only — never written from Excel
    'security_name',
    'morningstar_sector',
    'morningstar_industry',
    'roic',
    'p_roic',
    'c_roic',
    'revenue_growth_annual',
    // Old short names (benchmarks schema migration) — silently drop if templates still have them
    'name',
    'symbol',
    'security_type',
    'asset_class',
    'category_group',
    'inception',
    'expense_ratio',
    'aum',
    'fund_company',
    'nav_premium_discount',
    'fund_flows_1m',
    'fund_flows_3m',
    'fund_flows_1y',
    'fund_flows_ytd',
    'tax_cost_ratio_1y',
    'tax_cost_ratio_3y',
    'tax_cost_ratio_5y',
    'calmar_3y',
    'legal_structure',
    'return_on_equity_5y_mean',
    'pe_5',
    'ps_ratio_3y_mean',
    'revenue_per_share_ttm',
    'category_benchmark_symbol',
    'category_benchmark',
    'peer_group_benchmark_symbol',
    'peer_group_benchmark',
    // Handled separately — upserted to security_related_securities table
    'related_securities',
  ])
  const patch: Record<string, unknown> = {}
  const relatedIds: string[] = []

  function collectRelatedTicker(raw: unknown) {
    if (raw == null || raw === '') return
    const ticker = String(raw).trim().toUpperCase()
    if (ticker && /^[A-Z]{1,6}(\.[A-Z]{1,4})?$/.test(ticker)) {
      relatedIds.push(ticker)
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const colRaw = row[schemaCol]
    if (!looksLikeDbColumn(colRaw)) continue
    const key = COLUMN_REMAP[String(colRaw).trim()] ?? String(colRaw).trim()

    // related_securities spans multiple rows: Col A has the key only on the
    // first row; subsequent rows have blank Col A with tickers in the value col.
    if (key === 'related_securities') {
      collectRelatedTicker(row[valCol])
      // Consume continuation rows (blank schema col, value in val col)
      while (i + 1 < rows.length && !looksLikeDbColumn(rows[i + 1][schemaCol])) {
        i++
        collectRelatedTicker(rows[i][valCol])
      }
      continue
    }

    if (SKIP.has(key)) continue

    const raw = row[valCol]
    if (raw == null || raw === '') continue
    // Skip YCharts/formula error strings (e.g. "ERR: NO DATA", "ERR: INVALID CALC")
    if (typeof raw === 'string' && /^ERR\s*:/i.test(raw.trim())) continue

    if (DATE_COLS.has(key)) {
      const d = coerceDate(raw)
      if (d != null) patch[key] = d
    } else if (TEXT_COLS.has(key)) {
      const s = String(raw).trim()
      if (s !== '') patch[key] = s
    } else {
      const n = coerceNumber(raw)
      if (n != null) patch[key] = n
    }
  }
  if (relatedIds.length > 0) {
    patch.related_securities = relatedIds
  }
  return patch
}

/**
 * Parse an Excel file for a given symbol and return the column→value patch
 * without writing to any table.  Useful for writing to alternative tables
 * (e.g. `benchmarks`) that share the same column schema as `securities2`.
 */
export async function buildPatchFromExcelFile(
  symbol: string,
  file: File,
): Promise<Record<string, unknown>> {
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    throw new Error('Please choose an Excel file (.xlsx or .xls).')
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const firstName = wb.SheetNames[0]
  if (!firstName) throw new Error('The workbook has no sheets.')
  const sheet = wb.Sheets[firstName]

  // Try schema-direct layout first (stock template: col B=label, col C=db_col, col D=value)
  // raw: true — read the actual stored values (numbers, strings, Dates) rather
  // than Excel-formatted strings.  This avoids percentage cells coming back as
  // "4.10%" instead of 0.041, and works whether Col C contains manually entered
  // values or YCharts-populated cached values from Windows Excel.
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })
  const schemaLayout = detectSchemaDirectLayout(rawRows)

  let patch: Record<string, unknown>

  if (schemaLayout) {
    patch = buildPatchFromSchemaDirect(rawRows, schemaLayout.schemaCol, schemaLayout.valCol)
    // Schema-direct layout detected but all values are empty — template has not been
    // populated with YCharts data yet (formula cached values are missing).
    if (Object.keys(patch).length === 0) {
      throw new Error(
        'Template columns detected but no values found. ' +
          'Open the template in Excel on Windows with the YCharts add-in active, ' +
          'enter your ticker in cell F1, press F9 to recalculate, save the file, then upload.',
      )
    }
  } else {
    const ref = sheet['!ref']
    const range = ref ? XLSX.utils.decode_range(ref) : null
    const isTwoColumnSheet = range != null && range.e.c <= 1

    const verticalKv = parseVerticalKeyValueSheet(sheet)
    const hasVerticalLabels =
      Object.keys(verticalKv).length > 0 &&
      (isTwoColumnSheet ||
        verticalKv['Symbol'] != null ||
        verticalKv['Market Cap'] != null ||
        verticalKv['Dividend Yield'] != null ||
        verticalKv['Dividend %'] != null ||
        verticalKv['Beta'] != null ||
        verticalSheetLooksLikeKeyValue(verticalKv))

    let sourceRow: Record<string, unknown>
    if (hasVerticalLabels) {
      verifySymbolInKv(verticalKv, symbol)
      sourceRow = verticalKv
    } else {
      const rows = pickWideTableRows(sheet)
      if (rows.length === 0) throw new Error('The first sheet has no data rows.')
      sourceRow = findRowForSymbol(rows, symbol)
    }

    const rawPatch = mapRowToSecurities2Patch(sourceRow)
    patch = sanitizeSecurities2Patch(rawPatch)
  }

  // Extract Top 25 Holdings section
  const topHoldings = extractTopHoldings(sheet)
  if (topHoldings && topHoldings.length > 0) {
    patch.top_holdings = topHoldings
  }

  // Strip retired stock-analytic columns (dropped from securities2 — see the
  // Jun 2026 slim-down). Their header mappings are left in place for reference,
  // but the columns no longer exist, so silently drop them here rather than
  // exhausting the PGRST204 retry loop on every stock upload.
  for (const col of RETIRED_SECURITIES2_COLS) delete patch[col]

  if (Object.keys(patch).length === 0) {
    throw new Error(
      'No recognized columns found. ' +
        'For the ETF/stock templates ensure the file was saved after populating with YCharts data. ' +
        'For other file formats, use metric label headers (e.g. "Fund Company", "Expense Ratio").',
    )
  }

  return patch
}

/**
 * Parse Excel (wide table with Symbol column, vertical A/B labels, or
 * schema-direct layout with DB column names in a dedicated column).
 * Upserts into `securities2` on `symbol`.
 */
export async function uploadSecurities2FromExcel(symbol: string, file: File): Promise<void> {
  const sym = symbol.trim().toUpperCase()
  const patch = await buildPatchFromExcelFile(sym, file)

  // Extract related securities before sending to securities2
  const relatedIds = Array.isArray(patch.related_securities)
    ? (patch.related_securities as string[])
    : []
  delete patch.related_securities

  // Attempt the update, auto-stripping any columns that don't exist in the
  // schema cache (PGRST204).  Retries up to 10 times so a template with
  // several stale columns still succeeds without the user seeing an error.
  const activePatch = { ...patch }
  const droppedCols: string[] = []
  const MAX_RETRIES = 10

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('securities2')
      .update(activePatch)
      .eq('security_id', sym)

    if (!error) {
      if (relatedIds.length > 0) {
        await upsertRelatedSecurities(sym, relatedIds)
      }
      return
    }

    // PGRST204 = column not found in schema cache.
    // Extract the offending column name and retry without it.
    const colMatch = error.message.match(/column ['"]?([a-z0-9_]+)['"]? of ['"]?securities2['"]?/i)
      ?? error.message.match(/Could not find the ['"]?([a-z0-9_]+)['"]? column/i)

    if ((error.code === 'PGRST204' || error.message.includes('schema cache')) && colMatch) {
      const badCol = colMatch[1]
      delete activePatch[badCol]
      droppedCols.push(badCol)
      continue
    }

    throw new Error(formatSupabaseUpdateError(error))
  }

  throw new Error(
    `Upload failed after stripping ${droppedCols.length} unrecognized column(s): ${droppedCols.join(', ')}. ` +
    'Update the Stock Upload Template to remove these fields.',
  )
}

/**
 * Reads an Excel file and returns the ticker symbol found inside it.
 * Throws if no symbol can be determined.
 */
export async function extractSymbolFromExcel(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const firstName = wb.SheetNames[0]
  if (!firstName) throw new Error('The workbook has no sheets.')
  const sheet = wb.Sheets[firstName]

  // Try vertical key-value sheet first
  const verticalKv = parseVerticalKeyValueSheet(sheet)
  const ticker = getTickerFromRow(verticalKv)
  if (ticker) return ticker.trim().toUpperCase()

  // Try wide table — look for a Symbol/security_id column
  const rows = pickWideTableRows(sheet)
  for (const row of rows) {
    const t = getTickerFromRow(row)
    if (t) return t.trim().toUpperCase()
  }

  // Try schema-direct layout — look for security_id key in the patch
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })
  const schemaLayout = detectSchemaDirectLayout(rawRows)
  if (schemaLayout) {
    for (const row of rawRows) {
      const colRaw = row[schemaLayout.schemaCol]
      if (typeof colRaw === 'string' && colRaw.trim() === 'security_id') {
        const val = row[schemaLayout.valCol]
        if (val != null && val !== '') {
          const sym = String(val).trim().toUpperCase()
          if (sym) return sym
        }
      }
    }
  }

  throw new Error(
    'Could not find a Symbol/Ticker in the Excel file. Make sure the file has a "Symbol", "Ticker", or "security_id" column or cell.',
  )
}

/**
 * Creates a new securities2 row from an Excel file.
 * Extracts the symbol from the file, inserts the row, then applies the full
 * column mapping so all available data is saved in one step.
 */
export async function addNewSecurityFromExcel(file: File): Promise<string> {
  const symbol = await extractSymbolFromExcel(file)

  // Create the row (upsert so re-runs are safe)
  const { error: insertError } = await supabase
    .from('securities2')
    .upsert({ security_id: symbol }, { onConflict: 'security_id', ignoreDuplicates: true })
  if (insertError) throw new Error(`Could not create security: ${insertError.message}`)

  // Now populate all columns from the file
  await uploadSecurities2FromExcel(symbol, file)

  return symbol
}
