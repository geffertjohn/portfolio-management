-- Hybrid Conservative model portfolio = portfolio_id 6
-- (Hybrid / Conservative / benchmark "Conservative" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 6 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('VOO'),
  ('FLCSX'),
  ('AVERX'),
  ('FTZIX'),
  ('BRXIX'),
  ('IDEQ'),
  ('BIMIX'),
  ('PYTRX'),
  ('DHRIX'),
  ('DFCF'),
  ('FAGIX'),
  ('PGNPX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 6;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  6,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('VOO',   11.00::numeric, 2),
  ('FLCSX', 11.00::numeric, 3),
  ('AVERX',  2.00::numeric, 4),
  ('FTZIX',  2.00::numeric, 5),
  ('BRXIX',  2.50::numeric, 6),
  ('IDEQ',   2.50::numeric, 7),
  ('BIMIX', 21.00::numeric, 8),
  ('PYTRX', 14.50::numeric, 9),
  ('DHRIX', 14.50::numeric, 10),
  ('DFCF',   8.00::numeric, 11),
  ('FAGIX',  7.00::numeric, 12),
  ('PGNPX',  3.00::numeric, 13)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 13 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
