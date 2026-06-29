-- Hybrid Growth model portfolio = portfolio_id 10
-- (Hybrid / Growth / benchmark "Growth" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 10 only.
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
  ('EICOX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 10;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  10,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('VOO',   21.00::numeric, 2),
  ('FLCSX', 21.00::numeric, 3),
  ('PWB',   11.00::numeric, 4),
  ('IDHIX', 11.00::numeric, 5),
  ('AVERX',  6.00::numeric, 6),
  ('FTZIX',  6.00::numeric, 7),
  ('OBSIX',  3.00::numeric, 8),
  ('NSMRX',  3.00::numeric, 9),
  ('BRXIX',  6.00::numeric, 10),
  ('IDEQ',   6.00::numeric, 11),
  ('EICOX',  5.00::numeric, 12)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 12 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
