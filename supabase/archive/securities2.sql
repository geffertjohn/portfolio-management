-- =============================================================================
-- securities2 — extended fund/ETF analytics schema (Morningstar-style export fields).
-- Run in Supabase SQL Editor (or psql). Adjust types if you prefer jsonb for holdings.
-- Safe to run standalone: defines set_updated_at if missing.
--
-- Existing databases: run securities2_align_excel_columns.sql so column names match
-- the Excel import mapping (return_1m, aum, morningstar_category, etc.).
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS securities2 (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Basic information & descriptive metadata
  security_type text,
  parent_company text,
  company text,
  name text,
  description text,
  asset_class text,
  broad_category_name text,
  morningstar_category text,
  sector text,
  broad_asset_class_benchmark_index_symbol text,
  broad_asset_class_benchmark_index text,
  peer_group_index_symbol text,
  peer_group_index text,
  investment_management text,
  inception_date date,
  max_management_fee numeric,
  turnover_ratio numeric,
  dividend_yield numeric,
  expense_ratio numeric,
  aum numeric,

  -- Security (fund) total returns
  return_1m numeric,
  return_3m numeric,
  return_ytd numeric,
  return_1y numeric,
  return_3y numeric,
  return_5y numeric,
  return_10y numeric,
  return_life numeric,
  return_1y_quarterly numeric,
  return_3y_quarterly numeric,
  return_5y_quarterly numeric,
  return_10y_quarterly numeric,
  return_life_quarterly numeric,

  -- Broad asset class benchmark total returns
  benchmark_return_1m_pct numeric,
  benchmark_return_3m_pct numeric,
  benchmark_return_ytd_pct numeric,
  benchmark_return_1y_pct numeric,
  benchmark_return_3y_pct numeric,
  benchmark_return_5y_pct numeric,
  benchmark_return_10y_pct numeric,

  -- Peer group total returns
  peer_group_return_1m_pct numeric,
  peer_group_return_3m_pct numeric,
  peer_group_return_ytd_pct numeric,
  peer_group_return_1y_pct numeric,
  peer_group_return_3y_pct numeric,
  peer_group_return_5y_pct numeric,
  peer_group_return_10y_pct numeric,

  -- Alpha (market vs peer group), 1Y / 3Y / 5Y
  alpha_1y_market numeric,
  alpha_3y numeric,
  alpha_5y_market numeric,
  alpha_1y_peer_group numeric,
  alpha_3y_peer_group numeric,
  alpha_5y_peer_group numeric,

  -- Beta (market vs peer group), 1Y / 3Y / 5Y
  beta_1y_market numeric,
  beta_3y numeric,
  beta_5y_market numeric,
  beta_1y_peer_group numeric,
  beta_3y_peer_group numeric,
  beta_5y_peer_group numeric,

  -- Sharpe ratio — general, market, peer group
  sharpe_1y numeric,
  sharpe_ratio_3y numeric,
  sharpe_5y numeric,
  sharpe_1y_market numeric,
  sharpe_3y_market numeric,
  sharpe_5y_market numeric,
  sharpe_1y_peer_group numeric,
  sharpe_3y_peer_group numeric,
  sharpe_5y_peer_group numeric,

  -- Standard deviation — general, market, peer group
  std_dev_1y numeric,
  std_dev_3y numeric,
  std_dev_5y numeric,
  std_dev_1y_market numeric,
  std_dev_3y_market numeric,
  std_dev_5y_market numeric,
  std_dev_1y_peer_group numeric,
  std_dev_3y_peer_group numeric,
  std_dev_5y_peer_group numeric,

  -- Sortino ratio — general, market, peer group
  sortino_1y numeric,
  sortino_3y numeric,
  sortino_5y numeric,
  sortino_1y_market numeric,
  sortino_3y_market numeric,
  sortino_5y_market numeric,
  sortino_1y_peer_group numeric,
  sortino_3y_peer_group numeric,
  sortino_5y_peer_group numeric,

  -- Relative performance & statistics (peer group / risk)
  r_squared_1y numeric,
  r_squared_3y numeric,
  r_squared_5y numeric,
  treynor_1y numeric,
  treynor_3y numeric,
  treynor_5y numeric,
  tracking_error_1y numeric,
  tracking_error_3y numeric,
  tracking_error_5y numeric,
  information_ratio_1y numeric,
  information_ratio_3y numeric,
  information_ratio_5y numeric,
  upside_capture_1y numeric,
  upside_capture_3y numeric,
  upside_capture_5y numeric,

  -- Peer group ranks (percentile or rank — store as numeric)
  peer_group_rank_1m numeric,
  peer_group_rank_3m numeric,
  peer_group_rank_ytd numeric,
  peer_group_rank_1y numeric,
  peer_group_rank_3y numeric,
  peer_group_rank_5y numeric,
  peer_group_rank_10y numeric,

  -- Peer group “sizes” (counts or AUM — source-dependent)
  peer_group_size_3m numeric,
  peer_group_size_1y numeric,
  peer_group_size_ytd numeric,
  peer_group_size_3y numeric,
  peer_group_size_5y numeric,
  peer_group_size_10y numeric,

  -- Geographic exposure (percent)
  region_north_america numeric,
  region_latin_america numeric,
  region_united_kingdom numeric,
  region_europe_developed numeric,
  region_europe_emerging numeric,
  region_africa_middle_east numeric,
  region_asia_developed numeric,
  region_asia_emerging numeric,
  region_japan numeric,
  region_australasia numeric,

  -- Style box (weights / percentages)
  style_asset_net_pct numeric,
  style_large_value_pct numeric,
  style_large_blend_pct numeric,
  style_large_growth_pct numeric,
  style_mid_value_pct numeric,
  style_mid_blend_pct numeric,
  style_mid_growth_pct numeric,
  style_small_value_pct numeric,
  style_small_blend_pct numeric,
  style_small_growth_pct numeric,

  -- Sector weightings (percent)
  sector_basic_materials numeric,
  sector_communication_services numeric,
  sector_consumer_cyclical numeric,
  sector_consumer_defensive numeric,
  sector_energy numeric,
  sector_financial_services numeric,
  sector_healthcare numeric,
  sector_industrials numeric,
  sector_real_estate numeric,
  sector_technology numeric,
  sector_utilities numeric,

  -- Valuation & yield (Excel)
  pe_ratio numeric,
  pb_ratio numeric,
  pc_ratio numeric,
  ps_ratio numeric,
  "yield" numeric,

  -- Morningstar ratings
  morningstar_rating numeric,
  morningstar_risk_3y numeric,
  morningstar_return_3y numeric,

  -- Portfolio allocation (%)
  pct_cash numeric,
  pct_us_stocks numeric,
  pct_non_us_stocks numeric,
  pct_bonds numeric,
  pct_other numeric,

  -- Market cap exposure (%)
  mkt_cap_giant numeric,
  mkt_cap_large numeric,
  mkt_cap_mid numeric,
  mkt_cap_small numeric,
  mkt_cap_micro numeric,

  -- Bond quality & maturity (Excel names)
  bond_aaa numeric,
  bond_aa numeric,
  bond_a numeric,
  bond_bbb numeric,
  bond_bb numeric,
  bond_b numeric,
  bond_below_b numeric,
  bond_not_rated numeric,
  bond_maturity_1_3y numeric,
  bond_maturity_3_5y numeric,
  bond_maturity_5_7y numeric,
  bond_maturity_7_10y numeric,
  bond_maturity_10_15y numeric,
  bond_maturity_15_20y numeric,
  bond_maturity_20_30y numeric,
  bond_maturity_over_30y numeric,
  bond_duration numeric,
  bond_avg_coupon numeric,

  strategy_description text,
  prospectus_objective text,
  top_10_pct numeric,

  holding_1_name text,
  holding_2_name text,
  holding_3_name text,
  holding_4_name text,
  holding_5_name text,
  holding_6_name text,
  holding_7_name text,
  holding_8_name text,
  holding_9_name text,
  holding_10_name text,
  holding_1_pct numeric,
  holding_2_pct numeric,
  holding_3_pct numeric,
  holding_4_pct numeric,
  holding_5_pct numeric,
  holding_6_pct numeric,
  holding_7_pct numeric,
  holding_8_pct numeric,
  holding_9_pct numeric,
  holding_10_pct numeric,

  -- Miscellaneous
  top_10_holdings text,
  alpha_3y_peer_group_rank numeric,
  sharpe_3y_peer_group_rank numeric,
  information_ratio_3y_peer_group_rank numeric,
  expense_ratio_rank_peer_group numeric,
  related_securities text
);

CREATE UNIQUE INDEX IF NOT EXISTS securities2_symbol_key ON securities2 (symbol);

DROP TRIGGER IF EXISTS securities2_updated_at ON securities2;
CREATE TRIGGER securities2_updated_at
  BEFORE UPDATE ON securities2
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE securities2 IS 'Extended fund metrics snapshot (securities2); parallel to securities for migration or richer imports.';
