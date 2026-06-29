-- =============================================================================
-- Link securities2 to securities: copy only symbol + securities.id (as FK)
-- =============================================================================
-- Prerequisites: `securities` and `securities2` exist. For each row in
-- `securities`, creates or updates a `securities2` row with the same `symbol`
-- and `securities_id = securities.id`. No other columns are copied.
-- Safe to re-run (upserts on `symbol`).
-- =============================================================================

ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS securities_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'securities2_securities_id_fkey'
  ) THEN
    ALTER TABLE securities2
      ADD CONSTRAINT securities2_securities_id_fkey
      FOREIGN KEY (securities_id) REFERENCES securities (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS securities2_securities_id_key ON securities2 (securities_id);

COMMENT ON COLUMN securities2.securities_id IS 'FK to public.securities(id).';

INSERT INTO securities2 (symbol, securities_id)
SELECT s.symbol, s.id
FROM securities s
ON CONFLICT (symbol) DO UPDATE SET
  securities_id = EXCLUDED.securities_id;
