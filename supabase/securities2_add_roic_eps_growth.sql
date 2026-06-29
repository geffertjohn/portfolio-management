-- Adds roic (TTM) and eps_growth_3y to securities2
-- Required by: coregrowth_scorecard
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS

ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS roic          numeric(12, 6);
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS eps_growth_3y numeric(12, 6);
