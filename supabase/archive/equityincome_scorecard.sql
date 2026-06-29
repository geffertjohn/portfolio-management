-- Equity Income scorecard
-- Metrics pulled from securities2 for dividend / income-focused stocks.
-- securities2 columns used:
--   free_cash_flow_annual_cs_rev   → FCF % of Revenue
--   free_cash_flow_growth_5y       → FCF Growth 5Y
--   return_on_invested_capital_3y_mdn → ROIC 3Y
--   forward_peg_ratio_1y           → PEG (Forward 1Y)

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS equityincome_scorecard (
  id          bigserial   PRIMARY KEY,
  security_id bigint      NOT NULL UNIQUE REFERENCES securities2(id) ON DELETE CASCADE,

  -- ── Equity Income metrics ────────────────────────────────────────────────
  fcf_pct_revenue   numeric(12, 6),   -- FCF % of Revenue   → securities2.free_cash_flow_annual_cs_rev
  fcf_growth_5y     numeric(12, 6),   -- FCF Growth 5Y       → securities2.free_cash_flow_growth_5y
  roic_3y           numeric(12, 6),   -- ROIC 3Y             → securities2.return_on_invested_capital_3y_mdn
  peg_forward_1y    numeric(12, 6),   -- PEG (Forward 1Y)    → securities2.forward_peg_ratio_1y

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equityincome_scorecard_security_id
  ON equityincome_scorecard (security_id);

DROP TRIGGER IF EXISTS equityincome_scorecard_updated_at ON equityincome_scorecard;
CREATE TRIGGER equityincome_scorecard_updated_at
  BEFORE UPDATE ON equityincome_scorecard
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE equityincome_scorecard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read equityincome_scorecard"   ON equityincome_scorecard;
DROP POLICY IF EXISTS "Allow insert equityincome_scorecard" ON equityincome_scorecard;
DROP POLICY IF EXISTS "Allow update equityincome_scorecard" ON equityincome_scorecard;
DROP POLICY IF EXISTS "Allow delete equityincome_scorecard" ON equityincome_scorecard;

CREATE POLICY "Allow read equityincome_scorecard"   ON equityincome_scorecard FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert equityincome_scorecard" ON equityincome_scorecard FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update equityincome_scorecard" ON equityincome_scorecard FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow delete equityincome_scorecard" ON equityincome_scorecard FOR DELETE TO anon, authenticated USING (true);
