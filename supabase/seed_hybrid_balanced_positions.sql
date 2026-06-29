-- Hybrid Balanced model portfolio = portfolio_id 8
-- (Hybrid / Balanced / benchmark "Balanced" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 8 only.
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
  ('EICOX'),
  ('BIMIX'),
  ('PYTRX'),
  ('DHRIX'),
  ('DFCF'),
  ('FAGIX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 8;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  8,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('VOO',   13.50::numeric, 2),
  ('FLCSX', 13.50::numeric, 3),
  ('PWB',    7.00::numeric, 4),
  ('IDHIX',  7.00::numeric, 5),
  ('AVERX',  4.00::numeric, 6),
  ('FTZIX',  4.00::numeric, 7),
  ('OBSIX',  2.00::numeric, 8),
  ('NSMRX',  2.00::numeric, 9),
  ('BRXIX',  4.50::numeric, 10),
  ('IDEQ',   4.50::numeric, 11),
  ('EICOX',  4.00::numeric, 12),
  ('BIMIX', 11.00::numeric, 13),
  ('PYTRX',  7.00::numeric, 14),
  ('DHRIX',  7.00::numeric, 15),
  ('DFCF',   4.00::numeric, 16),
  ('FAGIX',  4.00::numeric, 17)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 17 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
