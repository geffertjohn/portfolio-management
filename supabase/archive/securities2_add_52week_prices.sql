-- Add 52-week high and low price columns to securities2

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS year_high numeric(12, 4),
  ADD COLUMN IF NOT EXISTS year_low  numeric(12, 4);
