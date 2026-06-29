-- ETF Balanced with Growth model portfolio = portfolio_id 4
-- (ETF / Balanced with Growth / benchmark "Balanced with Growth" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 4 only.
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
  ('$Cash')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 4;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  4,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('VOO',   17.00::numeric, 1),
  ('QLC',   17.00::numeric, 2),
  ('PWB',    9.00::numeric, 3),
  ('ULVM',   9.00::numeric, 4),
  ('FPX',    5.00::numeric, 5),
  ('VFMO',   5.00::numeric, 6),
  ('VB',     2.50::numeric, 7),
  ('XSMO',   2.50::numeric, 8),
  ('AVDE',   5.00::numeric, 9),
  ('IDEQ',   5.00::numeric, 10),
  ('EMMF',   2.00::numeric, 11),
  ('EYLD',   2.00::numeric, 12),
  ('UITB',   8.00::numeric, 13),
  ('AVIG',   5.00::numeric, 14),
  ('BIV',    5.00::numeric, 15),
  ('$Cash',  1.00::numeric, 16)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 16 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
