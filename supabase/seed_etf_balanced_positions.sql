-- ETF Balanced model portfolio = portfolio_id 3
-- (ETF / Balanced / benchmark "Balanced" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 3 only.
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
  ('EMMF'),
  ('EYLD'),
  ('UITB'),
  ('AVIG'),
  ('BIV'),
  ('DFCF'),
  ('HYDB'),
  ('$Cash')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 3;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  3,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('VOO',   13.50::numeric, 1),
  ('QLC',   13.50::numeric, 2),
  ('PWB',    7.00::numeric, 3),
  ('ULVM',   7.00::numeric, 4),
  ('FPX',    4.00::numeric, 5),
  ('VFMO',   4.00::numeric, 6),
  ('VB',     2.00::numeric, 7),
  ('XSMO',   2.00::numeric, 8),
  ('AVDE',   4.50::numeric, 9),
  ('IDEQ',   4.50::numeric, 10),
  ('EMMF',   2.00::numeric, 11),
  ('EYLD',   2.00::numeric, 12),
  ('UITB',  11.00::numeric, 13),
  ('AVIG',   7.00::numeric, 14),
  ('BIV',    7.00::numeric, 15),
  ('DFCF',   4.00::numeric, 16),
  ('HYDB',   4.00::numeric, 17),
  ('$Cash',  1.00::numeric, 18)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 18 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
