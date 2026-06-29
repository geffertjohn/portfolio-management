-- Add Calmar ratio columns to category_benchmarks.
-- These columns are exported from YCharts but were missing from the table
-- schema, causing the Benchmarks.xlsx upload to fail.

ALTER TABLE category_benchmarks
  ADD COLUMN IF NOT EXISTS calmar_ratio_1y  numeric(12, 6),
  ADD COLUMN IF NOT EXISTS calmar_ratio_3y  numeric(12, 6),
  ADD COLUMN IF NOT EXISTS calmar_ratio_5y  numeric(12, 6);
