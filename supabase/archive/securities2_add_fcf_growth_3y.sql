-- Add 3-year free cash flow growth to securities2

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS free_cash_flow_growth_3y numeric(12, 6);
