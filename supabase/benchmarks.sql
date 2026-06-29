-- =============================================================================
-- benchmarks — mirrors the securities2 metric columns for index / benchmark
-- tracking.  Benchmarks are identified by symbol (e.g. "SPY", "AGG", "^GSPC").
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS benchmarks (
  id         bigserial   PRIMARY KEY,
  symbol     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- ── Identity / descriptive ────────────────────────────────────────────────
  benchmark_name                text,
  name                          text,
  security_type                 text,
  fund_family                   text,
  fund_company                  text,
  description                   text,
  asset_class                   text,
  category_group                text,
  peer_group_name               text,
  sector                        text,
  industry                      text,
  category_benchmark_symbol     text,
  category_benchmark            text,
  peer_group_benchmark_symbol   text,
  peer_group_benchmark          text,
  inception                     text,
  as_of_date                    text,
  thesis                        text,

  -- ── Fund fundamentals ─────────────────────────────────────────────────────
  aum                           numeric(20, 4),
  expense_ratio                 numeric(12, 6),
  turnover_ratio                numeric(12, 6),
  dividend_yield                numeric(12, 6),
  number_of_holdings            numeric(12, 2),
  max_manager_tenure            numeric(12, 4),

  -- ── Fund total returns ────────────────────────────────────────────────────
  "1m_tr"                       numeric(12, 6),
  "3m_tr"                       numeric(12, 6),
  ydt_tr                        numeric(12, 6),
  "1yr_tr"                      numeric(12, 6),
  a_3y_tr                       numeric(12, 6),
  a_5y_tr                       numeric(12, 6),
  a_10y_tr                      numeric(12, 6),

  -- ── Category (benchmark) returns ─────────────────────────────────────────
  c_1m_tr                       numeric(12, 6),
  c_3m_tr                       numeric(12, 6),
  c_ytd_tr                      numeric(12, 6),
  c_1y_tr                       numeric(12, 6),
  c_a_3y_tr                     numeric(12, 6),
  c_a_5y_tr                     numeric(12, 6),
  c_a_10y_tr                    numeric(12, 6),

  -- ── Peer group returns ────────────────────────────────────────────────────
  p_1m_tr                       numeric(12, 6),
  p_3m_tr                       numeric(12, 6),
  p_ydt_tr                      numeric(12, 6),
  p_1yr_tr                      numeric(12, 6),
  p_a_3y_tr                     numeric(12, 6),
  p_a_5y_tr                     numeric(12, 6),
  p_a_10y_tr                    numeric(12, 6),

  -- ── Equity style box ─────────────────────────────────────────────────────
  large_value                   numeric(12, 6),
  large_blend                   numeric(12, 6),
  large_growth                  numeric(12, 6),
  mid_value                     numeric(12, 6),
  mid_blend                     numeric(12, 6),
  mid_growth                    numeric(12, 6),
  small_value                   numeric(12, 6),
  small_blend                   numeric(12, 6),
  small_growth                  numeric(12, 6),

  -- ── Credit quality ────────────────────────────────────────────────────────
  aaa_bond                      numeric(12, 6),
  aa_bond                       numeric(12, 6),
  a_bond                        numeric(12, 6),
  bbb_bond                      numeric(12, 6),
  bb_bond                       numeric(12, 6),
  b_bond                        numeric(12, 6),
  below_b                       numeric(12, 6),
  effective_duration            numeric(12, 6),

  -- ── Max drawdown ──────────────────────────────────────────────────────────
  max_drawdown_3y               numeric(12, 6),
  max_drawdown_5y               numeric(12, 6),
  c_max_drawdown_3y             numeric(12, 6),
  c_max_drawdown_5y             numeric(12, 6),
  p_max_drawdown_3y             numeric(12, 6),
  p_max_drawdown_5y             numeric(12, 6),

  -- ── Alpha ─────────────────────────────────────────────────────────────────
  c_alpha_1y                    numeric(12, 6),
  c_alpha_3y                    numeric(12, 6),
  c_alpha_5y                    numeric(12, 6),
  p_alpha_1y                    numeric(12, 6),
  p_alpha_3y                    numeric(12, 6),
  p_alpha_5y                    numeric(12, 6),

  -- ── Beta ─────────────────────────────────────────────────────────────────
  c_beta_1y                     numeric(12, 6),
  c_beta_3y                     numeric(12, 6),
  c_beta_5y                     numeric(12, 6),
  p_beta_1y                     numeric(12, 6),
  p_beta_3y                     numeric(12, 6),
  p_beta_5y                     numeric(12, 6),

  -- ── Sharpe ratio ─────────────────────────────────────────────────────────
  sharpe_1y                     numeric(12, 6),
  sharpe_3y                     numeric(12, 6),
  sharpe_5y                     numeric(12, 6),
  c_sharpe_1y                   numeric(12, 6),
  c_sharpe_3y                   numeric(12, 6),
  c_sharpe_5y                   numeric(12, 6),
  p_sharpe_1y                   numeric(12, 6),
  p_sharpe_3y                   numeric(12, 6),
  p_sharpe_5y                   numeric(12, 6),

  -- ── Standard deviation ───────────────────────────────────────────────────
  sd_1y                         numeric(12, 6),
  sd_3y                         numeric(12, 6),
  sd_5y                         numeric(12, 6),
  c_sd_1y                       numeric(12, 6),
  c_sd_3y                       numeric(12, 6),
  c_sd_5y                       numeric(12, 6),
  p_sd_1y                       numeric(12, 6),
  p_sd_3y                       numeric(12, 6),
  p_sd_5y                       numeric(12, 6),

  -- ── Sortino ratio ────────────────────────────────────────────────────────
  sortino_1y                    numeric(12, 6),
  sortino_3y                    numeric(12, 6),
  sortino_5y                    numeric(12, 6),
  c_sortino_1y                  numeric(12, 6),
  c_sortino_3y                  numeric(12, 6),
  c_sortino_5y                  numeric(12, 6),
  p_sortino_1y                  numeric(12, 6),
  p_sortino_3y                  numeric(12, 6),
  p_sortino_5y                  numeric(12, 6),

  -- ── R-squared ────────────────────────────────────────────────────────────
  c_rsquare_1y                  numeric(12, 6),
  c_rsquare_3y                  numeric(12, 6),
  c_rsquare_5y                  numeric(12, 6),
  p_rsquare_1y                  numeric(12, 6),
  p_rsquare_3y                  numeric(12, 6),
  p_rsquare_5y                  numeric(12, 6),

  -- ── Treynor measure ──────────────────────────────────────────────────────
  c_treynor_1y                  numeric(12, 6),
  c_treynor_3y                  numeric(12, 6),
  c_treynor_5y                  numeric(12, 6),
  p_treynor_1y                  numeric(12, 6),
  p_treynor_3y                  numeric(12, 6),
  p_treynor_5y                  numeric(12, 6),

  -- ── Tracking error ───────────────────────────────────────────────────────
  c_tracking_error_1y           numeric(12, 6),
  c_tracking_error_3y           numeric(12, 6),
  c_tracking_error_5y           numeric(12, 6),
  p_tracking_error_1y           numeric(12, 6),
  p_tracking_error_3y           numeric(12, 6),
  p_tracking_error_5y           numeric(12, 6),

  -- ── Information ratio ────────────────────────────────────────────────────
  c_information_ratio_1y        numeric(12, 6),
  c_information_ratio_3y        numeric(12, 6),
  c_information_ratio_5y        numeric(12, 6),
  p_information_ratio_1y        numeric(12, 6),
  p_information_ratio_3y        numeric(12, 6),
  p_information_ratio_5y        numeric(12, 6),

  -- ── Upside / downside capture ─────────────────────────────────────────────
  c_upside_downside_1y          numeric(12, 6),
  c_upside_downside_3y          numeric(12, 6),
  c_upside_downside_5y          numeric(12, 6),
  p_upside_downside_1y          numeric(12, 6),
  p_upside_downside_3y          numeric(12, 6),
  p_upside_downside_5y          numeric(12, 6),

  -- ── Peer group return ranks ───────────────────────────────────────────────
  "1m_tr_pgr"                   numeric(12, 4),
  "3m_tr_pgr"                   numeric(12, 4),
  ytd_tr_pgr                    numeric(12, 4),
  "1y_tr_pgr"                   numeric(12, 4),
  "3y_tr_pgr"                   numeric(12, 4),
  "5y_tr_pgr"                   numeric(12, 4),
  "10y_tr_pgr"                  numeric(12, 4),

  -- ── Peer group return sizes ───────────────────────────────────────────────
  "1m_tr_pgs"                   numeric(12, 4),
  "3m_tr_pgs"                   numeric(12, 4),
  ytd_tr_pgs                    numeric(12, 4),
  "1y_tr_pgs"                   numeric(12, 4),
  "3y_tr_pgs"                   numeric(12, 4),
  "5y_tr_pgs"                   numeric(12, 4),
  "10y_tr_pgs"                  numeric(12, 4),

  -- ── Aggregate peer group ranks ────────────────────────────────────────────
  alpha_3y_pgr                  numeric(12, 4),
  sharpe_3y_pgr                 numeric(12, 4),
  information_ratio_3y_pgr      numeric(12, 4),
  expense_ratio_pgr             numeric(12, 4),

  -- ── Geographic exposure ───────────────────────────────────────────────────
  north_america                 numeric(12, 6),
  latin_america                 numeric(12, 6),
  united_kingdom                numeric(12, 6),
  europe_developed              numeric(12, 6),
  europe_em                     numeric(12, 6),
  africa_and_middle_east        numeric(12, 6),
  asia_developed                numeric(12, 6),
  asia_em                       numeric(12, 6),

  -- ── Sector exposure ───────────────────────────────────────────────────────
  basic_materials               numeric(12, 6),
  communication_services        numeric(12, 6),
  consumer_cyclical             numeric(12, 6),
  consumer_defensive            numeric(12, 6),
  energy                        numeric(12, 6),
  financial_services            numeric(12, 6),
  healthcare                    numeric(12, 6),
  industrials                   numeric(12, 6),
  real_estate                   numeric(12, 6),
  technology                    numeric(12, 6),
  utilities                     numeric(12, 6),

  -- ── Fixed income type exposure ────────────────────────────────────────────
  government                    numeric(12, 6),
  corporate                     numeric(12, 6),
  securitized                   numeric(12, 6),
  municipal                     numeric(12, 6),
  other_bond                    numeric(12, 6),

  -- ── Asset allocation (net) ────────────────────────────────────────────────
  cash_net                      numeric(12, 6),
  stock_net                     numeric(12, 6),
  bond_net                      numeric(12, 6),
  convertible_net               numeric(12, 6),
  preferred_net                 numeric(12, 6),
  other_net                     numeric(12, 6),

  -- ── Maturity distribution ─────────────────────────────────────────────────
  maturity_less_than_1y         numeric(12, 6),
  maturity_1y_to_3y             numeric(12, 6),
  maturity_3y_to_5y             numeric(12, 6),
  maturity_5y_to_10y            numeric(12, 6),
  maturity_10y_to_20y           numeric(12, 6),
  maturity_20y_to_30y           numeric(12, 6),
  "maturity_30+y"               numeric(12, 6),

  -- ── Bond analytics ────────────────────────────────────────────────────────
  average_credit_quality        text,
  yield_to_maturity             numeric(12, 6),
  current_yield                 numeric(12, 6),
  average_coupon                numeric(12, 6),
  effective_maturity            numeric(12, 6),

  -- ── Top holdings ─────────────────────────────────────────────────────────
  top_holdings                  jsonb,

  -- ── Stock — classification ────────────────────────────────────────────────
  -- (included for ETFs / benchmark funds that may track equity indices)
  return_on_invested_capital    numeric(12, 6),
  return_on_capital_generic     numeric(12, 6),
  roic                          numeric(12, 6),
  p_roic                        numeric(12, 6),
  c_roic                        numeric(12, 6),
  return_on_invested_capital_3y_mdn numeric(12, 6),
  free_cash_flow_roic_3y        numeric(12, 6),
  gross_profit_margin_ttm       numeric(12, 6),
  free_cash_flow_margin_ttm     numeric(12, 6),
  free_cash_flow_annual_cs_rev  numeric(12, 6),
  free_cash_flow_yield          numeric(12, 6),
  free_cash_flow_growth_5y      numeric(12, 6),
  times_interest_earned         numeric(12, 6),
  revenue_growth_annual         numeric(12, 6),
  revenues_growth_3y            numeric(12, 6),
  revenues_growth_5y            numeric(12, 6),
  dividend_growth_ttm           numeric(12, 6),
  eps_growth_3y                 numeric(12, 6),
  eps_growth_5y                 numeric(12, 6),
  eps_est_long_term_growth      numeric(12, 6),
  eps_est_long_term_growth_num_est numeric(12, 6),
  eps_est_long_term_growth_std_dev numeric(12, 6),
  forward_pe_ratio              numeric(12, 6),
  forward_peg_ratio_1y          numeric(12, 6),
  pe_5                          numeric(12, 6),
  eps_ttm                       numeric(12, 6),
  ps_ratio_3y_mean              numeric(12, 6),
  revenue_per_share_ttm         numeric(12, 6),
  quarterly_standard_deviation_3y numeric(12, 6),
  quarterly_market_beta_60_month  numeric(12, 6),
  relative_dividend_yield_market  numeric(12, 6),
  consensus_recommendation      numeric(12, 6),
  buy_recommendations           numeric(12, 4),
  outperform_recommendations    numeric(12, 4),
  hold_recommendations          numeric(12, 4),
  underperform_recommendations  numeric(12, 4),
  sell_recommendations          numeric(12, 4),
  no_opinion_recommendations    numeric(12, 4),
  price_target                  numeric(12, 4),
  price_target_high             numeric(12, 4),
  price_target_low              numeric(12, 4),
  price_target_num_est          numeric(12, 4),
  price_target_std_dev          numeric(12, 6),
  price_target_upside           numeric(12, 6),

  -- ── Growth & volatility (benchmark-specific) ──────────────────────────────
  sales_growth_1_yr_generic                    numeric(12, 6),
  sales_growth_3_yr_generic                    numeric(12, 6),
  sales_growth_5_yr_generic                    numeric(12, 6),
  eps_growth_1_yr_generic                      numeric(12, 6),
  eps_growth_3_yr_generic                      numeric(12, 6),
  forecasted_earnings_growth                   numeric(12, 6),
  monthly_standard_deviation_annualized_1y     numeric(12, 6),
  monthly_standard_deviation_annualized_3y     numeric(12, 6),
  monthly_standard_deviation_annualized_5y     numeric(12, 6)
);

CREATE UNIQUE INDEX IF NOT EXISTS benchmarks_symbol_key ON benchmarks (symbol);

DROP TRIGGER IF EXISTS benchmarks_updated_at ON benchmarks;
CREATE TRIGGER benchmarks_updated_at
  BEFORE UPDATE ON benchmarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read benchmarks"   ON benchmarks;
DROP POLICY IF EXISTS "Allow insert benchmarks" ON benchmarks;
DROP POLICY IF EXISTS "Allow update benchmarks" ON benchmarks;
DROP POLICY IF EXISTS "Allow delete benchmarks" ON benchmarks;

CREATE POLICY "Allow read benchmarks"   ON benchmarks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert benchmarks" ON benchmarks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update benchmarks" ON benchmarks FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow delete benchmarks" ON benchmarks FOR DELETE TO anon, authenticated USING (true);
