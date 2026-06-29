-- Add current stock price column to securities2
-- Used to calculate % above/below historical valuation multiples.

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS price numeric(12, 4);
