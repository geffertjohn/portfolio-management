-- Add quarter-over-quarter revenue growth to securities2
-- revenues_growth_qoq → Revenue Growth 1q

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS revenues_growth_qoq numeric(12, 6);
