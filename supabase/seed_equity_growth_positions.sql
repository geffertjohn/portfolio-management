-- Equity Growth model portfolio = portfolio_id 17 (Equity / Growth in portfolio seed).
-- Requires securities rows for each symbol (see seed_securities_stocks.sql).
-- Run in Supabase SQL Editor after securities exist. Re-run safe: replaces positions for portfolio 17 only.

DELETE FROM positions WHERE portfolio_id = 17;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  17,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('NVDA',  8.00::numeric, 1),
  ('GOOGL', 7.00::numeric, 2),
  ('META',  7.00::numeric, 3),
  ('MSFT',  6.00::numeric, 4),
  ('AAPL',  5.00::numeric, 5),
  ('AVGO',  5.00::numeric, 6),
  ('FIX',   4.00::numeric, 7),
  ('AMZN',  4.00::numeric, 8),
  ('AMD',   4.00::numeric, 9),
  ('LLY',   3.50::numeric, 10),
  ('ALL',   3.00::numeric, 11),
  ('PLTR',  3.00::numeric, 12),
  ('TSLA',  3.00::numeric, 13),
  ('MA',    3.00::numeric, 14),
  ('GEV',   2.50::numeric, 15),
  ('ISRG',  2.50::numeric, 16),
  ('BSX',   2.50::numeric, 17),
  ('V',     2.50::numeric, 18),
  ('GE',    2.00::numeric, 19),
  ('APH',   2.00::numeric, 20),
  ('TSM',   2.00::numeric, 21),
  ('HOOD',  2.00::numeric, 22),
  ('NFLX',  2.00::numeric, 23),
  ('THC',   2.00::numeric, 24),
  ('UBER',  2.00::numeric, 25),
  ('ELF',   1.50::numeric, 26),
  ('SNOW',  2.00::numeric, 27),
  ('COIN',  1.50::numeric, 28),
  ('RDDT',  1.50::numeric, 29),
  ('APP',   1.50::numeric, 30),
  ('MU',    1.50::numeric, 31)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- If row count < 31, add the missing symbol to securities first, then re-run.
