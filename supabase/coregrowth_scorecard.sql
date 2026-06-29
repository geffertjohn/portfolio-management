-- Core Growth scorecard
-- Metrics pulled from securities2 for quality / growth-focused stocks.
-- securities2 columns used:
--   roic                 → ROIC (TTM)           ← NEW: securities2_add_roic_eps_growth.sql
--   revenue_growth_annual → Revenue Growth 1Y
--   revenues_growth_3y   → Revenue Growth 3Y
--   eps_growth_3y        → EPS Growth 3Y        ← NEW: securities2_add_roic_eps_growth.sql

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS coregrowth_scorecard (
  id          bigserial   PRIMARY KEY,
  security_id bigint      NOT NULL UNIQUE REFERENCES securities2(id) ON DELETE CASCADE,

  -- ── Core Growth metrics ──────────────────────────────────────────────────
  roic              numeric(12, 6),   -- ROIC (TTM)          → securities2.roic
  revenue_growth_1y numeric(12, 6),   -- Revenue Growth 1Y   → securities2.revenue_growth_annual
  revenue_growth_3y numeric(12, 6),   -- Revenue Growth 3Y   → securities2.revenues_growth_3y
  eps_growth_3y     numeric(12, 6),   -- EPS Growth 3Y       → securities2.eps_growth_3y

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coregrowth_scorecard_security_id
  ON coregrowth_scorecard (security_id);

DROP TRIGGER IF EXISTS coregrowth_scorecard_updated_at ON coregrowth_scorecard;
CREATE TRIGGER coregrowth_scorecard_updated_at
  BEFORE UPDATE ON coregrowth_scorecard
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE coregrowth_scorecard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read coregrowth_scorecard"   ON coregrowth_scorecard;
DROP POLICY IF EXISTS "Allow insert coregrowth_scorecard" ON coregrowth_scorecard;
DROP POLICY IF EXISTS "Allow update coregrowth_scorecard" ON coregrowth_scorecard;
DROP POLICY IF EXISTS "Allow delete coregrowth_scorecard" ON coregrowth_scorecard;

CREATE POLICY "Allow read coregrowth_scorecard"   ON coregrowth_scorecard FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert coregrowth_scorecard" ON coregrowth_scorecard FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update coregrowth_scorecard" ON coregrowth_scorecard FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow delete coregrowth_scorecard" ON coregrowth_scorecard FOR DELETE TO anon, authenticated USING (true);
