-- Equity Income model portfolio = portfolio_id 16 (Equity / Income in portfolio seed).
-- Requires securities rows for each symbol (see seed_securities_stocks.sql).
-- Run in Supabase SQL Editor after securities exist. Safe to re-run: replaces positions for portfolio 16 only.

DELETE FROM positions WHERE portfolio_id = 16;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  16,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('AVGO',  7.00::numeric, 1),
  ('MSFT',  7.00::numeric, 2),
  ('AMAT',  5.00::numeric, 3),
  ('JPM',   5.00::numeric, 4),
  ('AAPL',  4.00::numeric, 5),
  ('VZ',    4.00::numeric, 6),
  ('JNJ',   4.00::numeric, 7),
  ('GOOGL', 4.00::numeric, 8),
  ('CME',   3.50::numeric, 9),
  ('MSI',   3.50::numeric, 10),
  ('GEV',   3.00::numeric, 11),
  ('BLK',   3.00::numeric, 12),
  ('PG',    3.00::numeric, 13),
  ('DUK',   3.00::numeric, 14),
  ('CVX',   3.00::numeric, 15),
  ('WELL',  3.00::numeric, 16),
  ('HD',    3.00::numeric, 17),
  ('META',  3.00::numeric, 18),
  ('LOW',   3.00::numeric, 19),
  ('NXPI',  3.00::numeric, 20),
  ('GLW',   2.50::numeric, 21),
  ('WMT',   3.00::numeric, 22),
  ('IBM',   3.00::numeric, 23),
  ('ABBV',  2.50::numeric, 24),
  ('HCA',   2.50::numeric, 25),
  ('ETN',   2.50::numeric, 26),
  ('TJX',   2.00::numeric, 27),
  ('ORLY',  2.00::numeric, 28),
  ('RTX',   2.00::numeric, 29)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- If any row count < 29, a symbol is missing from securities — insert it first, then re-run.
