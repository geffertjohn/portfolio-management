-- Stock-specific metric columns for securities2
-- 36 new columns. All use ADD COLUMN IF NOT EXISTS so safe to re-run.
-- Run once in the Supabase SQL Editor.

-- ── Identity / Classification ────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS sector                           text;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS industry                         text;

-- ── ROIC ────────────────────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS p_roic                           numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS c_roic                           numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS return_on_invested_capital_3y_mdn numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS free_cash_flow_roic_3y           numeric(12, 6);

-- ── Margins & Cash Flow ──────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS gross_profit_margin_ttm          numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS free_cash_flow_margin_ttm        numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS free_cash_flow_annual_cs_rev     numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS free_cash_flow_yield             numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS free_cash_flow_growth_5y         numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS times_interest_earned            numeric(12, 4);

-- ── Growth ───────────────────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS revenue_growth_annual            numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS revenues_growth_3y               numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS revenues_growth_5y               numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS dividend_growth_ttm              numeric(12, 6);

-- ── EPS Estimates ────────────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS eps_est_long_term_growth         numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS eps_est_long_term_growth_num_est integer;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS eps_est_long_term_growth_std_dev numeric(12, 6);

-- ── Valuation ────────────────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS forward_pe_ratio                 numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS forward_peg_ratio_1y             numeric(12, 6);

-- ── Risk / Volatility ────────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS quarterly_standard_deviation_3y  numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS quarterly_market_beta_60_month   numeric(12, 6);

-- ── Analyst Consensus ────────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS consensus_recommendation         numeric(8, 5);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS buy_recommendations              integer;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS outperform_recommendations       integer;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS hold_recommendations             integer;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS underperform_recommendations     integer;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS sell_recommendations             integer;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS no_opinion_recommendations       integer;

-- ── Price Targets ────────────────────────────────────────────────────────────
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS price_target                     numeric(12, 4);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS price_target_high                numeric(12, 4);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS price_target_low                 numeric(12, 4);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS price_target_num_est             integer;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS price_target_std_dev             numeric(12, 4);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS price_target_upside              numeric(12, 6);
