-- Add growth and ROE metrics to securities2
-- eps_growth_annual      → EPS Growth 1y
-- revenues_growth_annual → Revenue Growth 1y
-- return_on_equity_5y_mean → ROE 5y (avg)

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS eps_growth_annual        numeric(12, 6),
  ADD COLUMN IF NOT EXISTS revenues_growth_annual   numeric(12, 6),
  ADD COLUMN IF NOT EXISTS return_on_equity_5y_mean numeric(12, 6);
