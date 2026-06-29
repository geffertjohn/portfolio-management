-- ETF Conservative Balanced model portfolio = portfolio_id 2
-- (ETF / Moderate / benchmark "Conservative Balanced" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 2 only.
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('VOO'),
  ('QLC'),
  ('PWB'),
  ('ULVM'),
  ('FPX'),
  ('VFMO'),
  ('VB'),
  ('XSMO'),
  ('AVDE'),
  ('IDEQ'),
  ('UITB'),
  ('AVIG'),
  ('BIV'),
  ('DFCF'),
  ('HYDB'),
  ('IAGG')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 2;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  2,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('VOO',  10.00::numeric, 1),
  ('QLC',  10.00::numeric, 2),
  ('PWB',   5.00::numeric, 3),
  ('ULVM',  5.00::numeric, 4),
  ('FPX',   3.00::numeric, 5),
  ('VFMO',  3.00::numeric, 6),
  ('VB',    1.00::numeric, 7),
  ('XSMO',  1.00::numeric, 8),
  ('AVDE',  5.50::numeric, 9),
  ('IDEQ',  5.50::numeric, 10),
  ('UITB', 14.25::numeric, 11),
  ('AVIG', 10.25::numeric, 12),
  ('BIV',  10.25::numeric, 13),
  ('DFCF',  6.25::numeric, 14),
  ('HYDB',  6.00::numeric, 15),
  ('IAGG',  3.00::numeric, 16)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 16 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
