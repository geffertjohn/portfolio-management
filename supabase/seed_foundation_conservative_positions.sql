-- Foundation Conservative model portfolio = portfolio_id 11
-- (Foundation / Conservative / benchmark "Conservative" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 11 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('VBILX'),
  ('APDFX'),
  ('FXAIX'),
  ('VFWAX'),
  ('VIMAX'),
  ('VSMAX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 11;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  11,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('VBILX', 59.00::numeric, 1),
  ('APDFX', 10.00::numeric, 2),
  ('FXAIX', 20.00::numeric, 3),
  ('VFWAX',  5.00::numeric, 4),
  ('VIMAX',  4.00::numeric, 5),
  ('VSMAX',  1.00::numeric, 6),
  ('$Cash',  1.00::numeric, 7)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 7 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
