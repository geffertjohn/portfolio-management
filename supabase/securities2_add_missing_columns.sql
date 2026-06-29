-- Add columns missing from the verified column list
-- eps_growth_5y               → Stock EPS growth (5-year)
-- relative_dividend_yield_market → Stock dividend yield relative to market

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS eps_growth_5y                   numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_dividend_yield_market  numeric(12, 6);
