-- =============================================================================
-- securities — add columns from fund/ETF data export field list (idempotent).
-- Run in Supabase SQL Editor after `public.securities` exists.
-- Types: text (names/labels/strategy), numeric (%, ratios, $ amounts), date, bigint (counts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Basic information & descriptors
-- ---------------------------------------------------------------------------
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS ticker_exchange_code text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_company_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_family text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS inception_date_label text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS asset_class_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS morningstar_category_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS asset_classification_morningstar_category_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_profile_investment_strategy text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_profile_portfolio_manager text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_profile_inception_date date;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_profile_index_tracked text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_profile_description text;

-- ---------------------------------------------------------------------------
-- 2. Ratings & key metrics
-- ---------------------------------------------------------------------------
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS morningstar_rating_overall numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS morningstar_return_rating_overall numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS morningstar_risk_rating_overall numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS yield_ttm numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS expense_ratio_gross numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS expense_ratio_net numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS net_asset_value numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS assets_net numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS shares_outstanding bigint;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS turnover_ratio_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS turnover_ratio_date date;

-- ---------------------------------------------------------------------------
-- 3. Benchmarks & fund returns (standard periods)
--    Periods: 1_month, 3_month, ytd, 1_year, 3_year, 5_year, 10_year, since_inception
-- ---------------------------------------------------------------------------
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS benchmark_primary_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS benchmark_secondary_name text;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_1_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_3_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_ytd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_10_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS primary_benchmark_return_since_inception numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_1_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_3_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_ytd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_10_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS secondary_benchmark_return_since_inception numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_1_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_3_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_ytd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_10_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS returns_return_since_inception numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_1_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_3_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_ytd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_10_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS total_performance_return_since_inception numeric;

-- Annual returns (calendar years + YTD)
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS annual_returns_ytd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS annual_returns_2023 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS annual_returns_2022 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS annual_returns_2021 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS annual_returns_2020 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS annual_returns_2019 numeric;

-- Category benchmark (annual + YTD)
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_benchmark_return_ytd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_benchmark_return_2023 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_benchmark_return_2022 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_benchmark_return_2021 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_benchmark_return_2020 numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_benchmark_return_2019 numeric;

-- Trailing returns
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_1_day numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_1_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_3_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_6_month numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_ytd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_10_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS trailing_returns_15_year numeric;

-- Monthly return grid (by month — %)
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS january_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS february_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS march_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS april_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS may_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS june_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS july_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS august_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS september_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS october_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS november_return_by_year_group_monthly_details_return_percentage numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS december_return_by_year_group_monthly_details_return_percentage numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS inception_return_value numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS inception_return_date date;

-- ---------------------------------------------------------------------------
-- 4. Risk statistics (1y / 3y / 5y / 10y)
-- ---------------------------------------------------------------------------
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_volatility_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_volatility_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_volatility_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_volatility_return_10_year numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_alpha_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_alpha_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_alpha_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_alpha_return_10_year numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_beta_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_beta_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_beta_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_beta_return_10_year numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_r_squared_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_r_squared_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_r_squared_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_r_squared_return_10_year numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_sharpe_ratio_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_sharpe_ratio_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_sharpe_ratio_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_sharpe_ratio_return_10_year numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_standard_deviation_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_standard_deviation_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_standard_deviation_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_standard_deviation_return_10_year numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_mean_return_return_1_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_mean_return_return_3_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_mean_return_return_5_year numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS risk_mean_return_return_10_year numeric;

-- ---------------------------------------------------------------------------
-- 5. Portfolio composition — allocation
-- ---------------------------------------------------------------------------
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS allocation_cash_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS allocation_us_stock_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS allocation_non_us_stock_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS allocation_bond_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS allocation_other_percent numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS portfolio_summary_asset_allocation_cash_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS portfolio_summary_asset_allocation_us_stock_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS portfolio_summary_asset_allocation_non_us_stock_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS portfolio_summary_asset_allocation_bond_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS portfolio_summary_asset_allocation_other_percent numeric;

-- Equity regions (%)
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_united_states numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_canada numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_latin_america numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_united_kingdom numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_europe_developed numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_europe_emerging numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_africa_middle_east numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_japan numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_australasia numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_asia_developed numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_region_asia_emerging numeric;

-- Market cap — equity + alternate “percent” naming
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_market_cap_giant numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_market_cap_large numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_market_cap_medium numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_market_cap_small numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_market_cap_micro numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS market_cap_giant_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS market_cap_large_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS market_cap_medium_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS market_cap_small_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS market_cap_micro_percent numeric;

-- Equity sectors
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_basic_materials numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_consumer_cyclical numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_financial_services numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_real_estate numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_consumer_defensive numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_healthcare numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_utilities numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_communication_services numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_energy numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_industrials numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_sector_technology numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_basic_materials numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_consumer_cyclical numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_financial_services numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_real_estate numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_consumer_defensive numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_healthcare numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_utilities numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_communication_services numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_energy numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_industrials numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS top_sectors_technology numeric;

-- Equity valuation & growth
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_valuation_price_prospective_earnings numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_valuation_price_earnings numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_valuation_price_book numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_valuation_price_sales numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_valuation_price_cash_flow numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_valuation_dividend_yield_factor numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_valuation_dividend_yield numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_long_term_earnings_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_historical_earnings_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_sales_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_cash_flow_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_book_value_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_long_term_earnings numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_historical_earnings numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_sales numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_cash_flow numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS equity_growth_book_value numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS stock_style_value_score numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS stock_style_growth_score numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS stock_style_market_cap_score numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS holdings_top_10_holdings_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS holdings_total_number_of_holdings integer;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS portfolio_summary_total_assets numeric;

-- ---------------------------------------------------------------------------
-- 6. Fixed income
-- ---------------------------------------------------------------------------
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_united_states numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_canada numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_latin_america numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_united_kingdom numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_europe_developed numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_europe_emerging numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_africa_middle_east numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_japan numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_australasia numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_asia_developed numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_country_exposure_asia_emerging numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_sector_government numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_sector_municipal numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_sector_corporate numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_sector_securitized numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_sector_cash_equivalents numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_sector_derivative numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_aaa numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_aa numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_a numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_bbb numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_bb numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_b numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_below_b numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_credit_quality_not_rated numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_aaa_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_aa_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_a_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_bbb_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_bb_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_b_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_below_b_percent numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS credit_quality_not_rated_percent numeric;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_maturity_effective_maturity numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_characteristics_effective_maturity numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_maturity_effective_duration numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_characteristics_effective_duration numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_maturity_average_coupon numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_characteristics_average_coupon numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_maturity_average_price numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fixed_income_characteristics_average_credit_quality text;

COMMENT ON TABLE public.securities IS 'Core securities table; extended columns from fund data export spec (securities_add_fund_data_columns.sql).';
