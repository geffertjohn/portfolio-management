-- Add analyst label, earnings dates, and 52-week high/low date columns to securities2

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS consensus_recommendation_label text,
  ADD COLUMN IF NOT EXISTS last_earnings_release           date,
  ADD COLUMN IF NOT EXISTS next_earnings_release           date,
  ADD COLUMN IF NOT EXISTS year_high_date                  date,
  ADD COLUMN IF NOT EXISTS year_low_date                   date;
