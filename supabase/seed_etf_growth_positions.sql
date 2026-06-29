-- ETF Growth model portfolio = portfolio_id 5
-- (ETF / Growth / benchmark "Growth" in portfolio seed).
-- Total weights = 100%. Safe to re-run: replaces positions for portfolio 5 only.
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
  ('$Cash')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 5;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  5,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('VOO',   21.00::numeric, 1),
  ('QLC',   21.00::numeric, 2),
  ('PWB',   11.00::numeric, 3),
  ('ULVM',  11.00::numeric, 4),
  ('FPX',    6.00::numeric, 5),
  ('VFMO',   6.00::numeric, 6),
  ('VB',     3.00::numeric, 7),
  ('XSMO',   3.00::numeric, 8),
  ('AVDE',   6.00::numeric, 9),
  ('IDEQ',   6.00::numeric, 10),
  ('EMMF',   2.50::numeric, 11),
  ('EYLD',   2.50::numeric, 12),
  ('$Cash',  1.00::numeric, 13)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 13 rows. If fewer, a symbol is missing from securities — fix INSERT above and re-run.
