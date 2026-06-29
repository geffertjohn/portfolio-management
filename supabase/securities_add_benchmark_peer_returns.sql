-- Broad asset class benchmark vs peer group total returns (same horizons as Morningstar vertical export).
-- Run once in Supabase SQL Editor on existing `securities` tables.
-- Required for Excel import / UI: fixes PostgREST PGRST204 if these columns are missing.

ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_1m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_3m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_ytd_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_1y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_3y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_5y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_10y_pct numeric;

ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_1m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_3m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_ytd_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_1y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_3y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_5y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_10y_pct numeric;
