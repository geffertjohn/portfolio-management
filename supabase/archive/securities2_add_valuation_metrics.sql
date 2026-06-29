-- Add valuation metrics missing from securities2
-- pe_5                → PE Ratio (5-year average)
-- eps_ttm             → EPS (trailing twelve months)
-- ps_ratio_3y_mean    → PS Ratio (3-year average)
-- revenue_per_share_ttm → Revenue Per Share (TTM)

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS pe_5                  numeric(12, 6),
  ADD COLUMN IF NOT EXISTS eps_ttm               numeric(12, 6),
  ADD COLUMN IF NOT EXISTS ps_ratio_3y_mean      numeric(12, 6),
  ADD COLUMN IF NOT EXISTS revenue_per_share_ttm numeric(12, 6);
