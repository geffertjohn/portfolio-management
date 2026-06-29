-- Add return_on_capital_generic to the benchmarks table.
-- This column is populated via schema-direct Excel upload (column A = DB column name).

ALTER TABLE benchmarks
  ADD COLUMN IF NOT EXISTS return_on_capital_generic numeric(12, 6);
