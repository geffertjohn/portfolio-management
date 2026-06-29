-- Foundation Balanced model portfolio = portfolio_id 13
-- (Foundation / Balanced / benchmark "Balanced" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 13 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('VBILX'),
  ('VWEAX'),
  ('FXAIX'),
  ('VFWAX'),
  ('VIMAX'),
  ('VSMAX'),
  ('VEMAX')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 13;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  13,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('$Cash',  1.00::numeric, 1),
  ('VBILX', 29.00::numeric, 2),
  ('VWEAX',  4.00::numeric, 3),
  ('FXAIX', 41.00::numeric, 4),
  ('VFWAX',  9.00::numeric, 5),
  ('VIMAX',  8.00::numeric, 6),
  ('VSMAX',  4.00::numeric, 7),
  ('VEMAX',  4.00::numeric, 8)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 8 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
