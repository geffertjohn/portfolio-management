-- =============================================================================
-- Point positions.security_id at securities2(id) instead of securities(id)
-- =============================================================================
-- Prerequisites: securities2 rows have securities_id set (backfill script),
-- and each position’s current security_id still matches securities.id.
-- Run in Supabase SQL Editor once. Verify with the SELECT at the bottom.
-- =============================================================================

ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_security_id_fkey;

UPDATE positions p
SET security_id = s2.id
FROM securities2 s2
WHERE s2.securities_id = p.security_id;

ALTER TABLE positions
  ADD CONSTRAINT positions_security_id_fkey
  FOREIGN KEY (security_id) REFERENCES securities2 (id) ON DELETE CASCADE;

-- Optional: drop legacy table when nothing else references it (uncomment after verifying app).
-- DROP TABLE IF EXISTS securities CASCADE;
