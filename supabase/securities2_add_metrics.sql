-- =============================================================================
-- Add Morningstar-style metrics to securities2 if missing (idempotent).
-- Run in Supabase SQL Editor after securities2 (or securities2.sql) exists.
-- =============================================================================

-- General & key metrics
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS fund_company text;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS assets_under_management numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS net_dividends numeric;

-- R-squared explicitly vs peer group (distinct from generic r_squared_* if you use both)
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS r_squared_1y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS r_squared_3y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS r_squared_5y_peer_group numeric;

-- Treynor / tracking error / information ratio — peer group horizons from factsheet
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS treynor_1y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS treynor_1y_market numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS treynor_10y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS tracking_error_1y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS tracking_error_10y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS information_ratio_10y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS information_ratio_1y_peer_group numeric;

-- Upside / downside capture (peer group); extend 10Y horizon
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS upside_capture_10y numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS upside_capture_10y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_1y numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_3y numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_5y numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_10y numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_1y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_3y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_5y_peer_group numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS downside_capture_10y_peer_group numeric;

-- Peer group NAV rank / size — add 1M size if missing
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS peer_group_size_1m numeric;

-- Regional exposure (Europe EM). Prefer column name region_europe_emerging (Excel alignment).
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS region_europe_emerging numeric;

-- Bond income mix (% of income)
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS income_government_bond_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS income_corporate_bond_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS income_securitized_bond_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS income_municipal_bond_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS income_other_bond_pct numeric;

-- Credit quality exposure (% of bonds)
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS credit_quality_aaa_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS credit_quality_aa_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS credit_quality_a_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS credit_quality_bbb_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS credit_quality_bb_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS credit_quality_b_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS credit_quality_below_b_pct numeric;

-- Maturity profile (%)
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS maturity_0_1y_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS maturity_1_3y_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS maturity_3_5y_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS maturity_5_10y_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS maturity_10_20y_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS maturity_20_30y_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS maturity_gt_30y_pct numeric;

-- Fixed income characteristics
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS effective_duration numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS average_credit_quality text;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS yield_to_maturity numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS sec_30_day_yield_pct numeric;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS average_coupon numeric;

-- Peer group ranks (misc)
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS treynor_ratio_rank_peer_group numeric;
