-- Add sales growth, EPS growth, forecasted earnings growth, and monthly
-- standard deviation columns to the benchmarks table.

ALTER TABLE benchmarks
  ADD COLUMN IF NOT EXISTS sales_growth_1_yr_generic                    numeric(12, 6),
  ADD COLUMN IF NOT EXISTS sales_growth_3_yr_generic                    numeric(12, 6),
  ADD COLUMN IF NOT EXISTS sales_growth_5_yr_generic                    numeric(12, 6),
  ADD COLUMN IF NOT EXISTS eps_growth_1_yr_generic                      numeric(12, 6),
  ADD COLUMN IF NOT EXISTS eps_growth_3_yr_generic                      numeric(12, 6),
  ADD COLUMN IF NOT EXISTS forecasted_earnings_growth                   numeric(12, 6),
  ADD COLUMN IF NOT EXISTS monthly_standard_deviation_annualized_1y     numeric(12, 6),
  ADD COLUMN IF NOT EXISTS monthly_standard_deviation_annualized_3y     numeric(12, 6),
  ADD COLUMN IF NOT EXISTS monthly_standard_deviation_annualized_5y     numeric(12, 6);
