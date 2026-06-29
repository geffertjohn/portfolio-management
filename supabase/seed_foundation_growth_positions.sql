-- Foundation Growth model portfolio = portfolio_id 15
-- (Foundation / Growth / benchmark "Growth" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 15 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('FXAIX'),
  ('VIMAX'),
  ('VSMAX'),
  ('VFWAX'),
  ('VEMAX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 15;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  15,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('FXAIX', 64.00::numeric, 2),
  ('VIMAX', 12.00::numeric, 3),
  ('VSMAX',  6.00::numeric, 4),
  ('VFWAX', 12.00::numeric, 5),
  ('VEMAX',  5.00::numeric, 6)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 6 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
