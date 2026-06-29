-- Foundation Conservative Balanced model portfolio = portfolio_id 12
-- (Foundation / Moderate / benchmark "Conservative Balanced" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 12 only.
-- Cash is stored as '$Cash' (matches other ETF seeds; UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('VBILX'),
  ('VTABX'),
  ('FXAIX'),
  ('VFWAX'),
  ('VIMAX'),
  ('VSMAX'),
  ('VWEAX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 12;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  12,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('VBILX', 41.00::numeric, 2),
  ('VTABX',  3.00::numeric, 3),
  ('FXAIX', 30.00::numeric, 4),
  ('VFWAX', 11.00::numeric, 5),
  ('VIMAX',  6.00::numeric, 6),
  ('VSMAX',  2.00::numeric, 7),
  ('VWEAX',  6.00::numeric, 8)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 8 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
