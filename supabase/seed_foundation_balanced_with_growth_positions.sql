-- Foundation Balanced with Growth model portfolio = portfolio_id 14
-- (Foundation / Balanced with Growth / benchmark "Balanced with Growth" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 14 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('FXAIX'),
  ('VIMAX'),
  ('VSMAX'),
  ('VFWAX'),
  ('VEMAX'),
  ('VBILX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 14;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  14,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('FXAIX', 51.00::numeric, 2),
  ('VIMAX', 10.00::numeric, 3),
  ('VSMAX',  5.00::numeric, 4),
  ('VFWAX', 10.00::numeric, 5),
  ('VEMAX',  4.00::numeric, 6),
  ('VBILX', 19.00::numeric, 7)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 7 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
