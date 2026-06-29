-- Add peer_group_ticker column to peer_group_benchmarks.
-- The new upload template stores the YCharts ticker (e.g. ^BBUSATR) in this
-- column and uses peer_group_benchmark for the full benchmark name
-- (e.g. "Bloomberg US Aggregate").
--
-- Also replaces any single-column unique index on peer_group_benchmark with a
-- composite unique index on (peer_group_ticker, peer_group_category) so the
-- upload can upsert rows without conflict errors.

ALTER TABLE peer_group_benchmarks
  ADD COLUMN IF NOT EXISTS peer_group_ticker text;

-- Drop old constraints/indexes that may conflict
ALTER TABLE peer_group_benchmarks
  DROP CONSTRAINT IF EXISTS peer_group_benchmarks_benchmark_category_key;

DROP INDEX IF EXISTS peer_group_benchmarks_peer_group_benchmark_idx;
DROP INDEX IF EXISTS peer_group_benchmarks_ticker_category_key;

-- New composite unique index used by the upload
CREATE UNIQUE INDEX peer_group_benchmarks_ticker_category_key
  ON peer_group_benchmarks (peer_group_ticker, peer_group_category);
