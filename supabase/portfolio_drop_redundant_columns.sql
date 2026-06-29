-- Drop portfolio_name (non-unique short label, redundant with the portfolio.name column)
-- and risk_profile (synced copy of model_portfolios.risk_profile, read from source on demand).
ALTER TABLE portfolio DROP COLUMN IF EXISTS portfolio_name;
ALTER TABLE portfolio DROP COLUMN IF EXISTS risk_profile;
