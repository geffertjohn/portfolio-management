-- Add a user-editable display name column to the benchmarks table.
-- Separate from `name` (which is populated from Excel uploads).

ALTER TABLE benchmarks
  ADD COLUMN IF NOT EXISTS benchmark_name text;
