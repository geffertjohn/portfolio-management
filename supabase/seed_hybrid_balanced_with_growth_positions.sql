-- Hybrid Balanced with Growth model portfolio = portfolio_id 9
-- (Hybrid / Balanced with Growth / benchmark "Balanced with Growth" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 9 only.
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
  ('DHRIX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 9;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  9,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('VOO',   17.00::numeric, 2),
  ('FLCSX', 17.00::numeric, 3),
  ('PWB',    9.00::numeric, 4),
  ('IDHIX',  9.00::numeric, 5),
  ('AVERX',  5.00::numeric, 6),
  ('FTZIX',  5.00::numeric, 7),
  ('OBSIX',  2.50::numeric, 8),
  ('NSMRX',  2.50::numeric, 9),
  ('BRXIX',  5.00::numeric, 10),
  ('IDEQ',   5.00::numeric, 11),
  ('EICOX',  4.00::numeric, 12),
  ('BIMIX',  8.00::numeric, 13),
  ('PYTRX',  5.00::numeric, 14),
  ('DHRIX',  5.00::numeric, 15)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 15 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
