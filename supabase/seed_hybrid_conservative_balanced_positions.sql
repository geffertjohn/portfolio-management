-- Hybrid Conservative Balanced model portfolio = portfolio_id 7
-- (Hybrid / Moderate / benchmark "Conservative Balanced" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 7 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('VOO'),
  ('FLCSX'),
  ('PWB'),
  ('IDHIX'),
  ('AVERX'),
  ('FTZIX'),
  ('OBSIX'),
  ('NSMRX'),
  ('BRXIX'),
  ('IDEQ'),
  ('BIMIX'),
  ('PYTRX'),
  ('DHRIX'),
  ('DFCF'),
  ('FAGIX'),
  ('PGNPX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 7;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  7,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('VOO',   10.00::numeric, 2),
  ('FLCSX', 10.00::numeric, 3),
  ('PWB',    5.00::numeric, 4),
  ('IDHIX',  5.00::numeric, 5),
  ('AVERX',  3.00::numeric, 6),
  ('FTZIX',  3.00::numeric, 7),
  ('OBSIX',  1.00::numeric, 8),
  ('NSMRX',  1.00::numeric, 9),
  ('BRXIX',  5.50::numeric, 10),
  ('IDEQ',   5.50::numeric, 11),
  ('BIMIX', 15.00::numeric, 12),
  ('PYTRX', 10.00::numeric, 13),
  ('DHRIX', 10.00::numeric, 14),
  ('DFCF',   6.00::numeric, 15),
  ('FAGIX',  6.00::numeric, 16),
  ('PGNPX',  3.00::numeric, 17)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 17 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
