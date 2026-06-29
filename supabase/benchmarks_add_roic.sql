-- Add return on invested capital (TTM) to the benchmarks table.

ALTER TABLE benchmarks
  ADD COLUMN IF NOT EXISTS return_on_invested_capital numeric(12, 6);
