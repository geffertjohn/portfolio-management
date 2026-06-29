-- Fixed Income Total Return model portfolio = portfolio_id 19
-- (Fixed Income / Total Return / benchmark "Bloomberg U.S. Aggregate Bond" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 19 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('BIMIX'),
  ('GIBIX'),
  ('FTHRX'),
  ('FAGIX'),
  ('PGNPX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 19;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  19,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('BIMIX', 35.00::numeric, 2),
  ('GIBIX', 29.00::numeric, 3),
  ('FTHRX', 25.00::numeric, 4),
  ('FAGIX',  7.00::numeric, 5),
  ('PGNPX',  3.00::numeric, 6)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 6 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
