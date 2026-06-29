-- Add relative-to-market comparison metrics to securities2

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS relative_gross_profit_margin_market          numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_ps_ratio_market                     numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_profit_margin_market                numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_return_on_assets_market             numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_return_on_invested_capital_market   numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_earning_yield_market                numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_ebitda_margin_ttm_market            numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_debt_equity_ratio_market            numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_current_ratio_market                numeric(12, 6),
  ADD COLUMN IF NOT EXISTS relative_return_on_equity_market             numeric(12, 6);
  -- Note: relative_dividend_yield_market already exists
