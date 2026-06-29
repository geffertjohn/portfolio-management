-- Add new ETF/fund-specific columns sourced from YCharts add-in.
-- These are populated via the ETF & Mutual Fund Upload Template (YCharts formula-driven).

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS investment_strategy        TEXT,
  ADD COLUMN IF NOT EXISTS legal_structure            TEXT,
  ADD COLUMN IF NOT EXISTS distribution_yield         NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS nav_premium_discount       NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS fund_flows_1m              NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS fund_flows_3m              NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS fund_flows_1y              NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS fund_flows_ytd             NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS tax_cost_ratio_1y          NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS tax_cost_ratio_3y          NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS tax_cost_ratio_5y          NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS calmar_3y                  NUMERIC(12, 6);
