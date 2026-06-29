-- Equity Growth & Income model portfolio = portfolio_id 18
-- (Equity / Growth & Income / benchmark "S&P 500" in portfolio seed).
--
-- Growth + income sleeves share tickers (e.g. AVGO, MSFT). `positions` allows only
-- one row per (portfolio, security), so weights from both sleeves are summed per symbol.
-- Total = 100%. Safe to re-run: replaces positions for portfolio 18 only.
-- Cash stored as '$Cash' (UI may show "Cash").
--
-- Run in Supabase SQL Editor (or psql). Requires `portfolio` and `securities` tables.

INSERT INTO securities (symbol) VALUES
  ('$Cash'),
  ('MSFT'), ('AVGO'), ('GOOGL'), ('META'), ('AAPL'), ('NVDA'), ('GEV'),
  ('AMAT'), ('JPM'), ('FIX'), ('AMZN'), ('AMD'), ('VZ'), ('JNJ'),
  ('LLY'), ('CME'), ('MSI'), ('ALL'), ('PLTR'), ('TSLA'), ('MA'),
  ('BLK'), ('PG'), ('DUK'), ('CVX'), ('WELL'), ('HD'), ('LOW'), ('NXPI'),
  ('WMT'), ('IBM'), ('ISRG'), ('BSX'), ('V'), ('GLW'), ('ABBV'), ('HCA'), ('ETN'),
  ('GE'), ('APH'), ('TSM'), ('HOOD'), ('NFLX'), ('THC'), ('UBER'), ('SNOW'),
  ('TJX'), ('ORLY'), ('RTX'), ('ELF'), ('COIN'), ('RDDT'), ('APP'), ('MU')
ON CONFLICT (symbol) DO NOTHING;

DELETE FROM positions WHERE portfolio_id = 18;

INSERT INTO positions (portfolio_id, security_id, allocation_pct, sort_order)
SELECT
  18,
  s.id,
  v.pct,
  v.ord
FROM (VALUES
  ('MSFT',  6.50::numeric, 1),
  ('AVGO',  6.00::numeric, 2),
  ('GOOGL', 5.50::numeric, 3),
  ('META',  5.00::numeric, 4),
  ('AAPL',  4.50::numeric, 5),
  ('NVDA',  4.00::numeric, 6),
  ('GEV',   2.75::numeric, 7),
  ('AMAT',  2.50::numeric, 8),
  ('JPM',   2.50::numeric, 9),
  ('FIX',   2.00::numeric, 10),
  ('AMZN',  2.00::numeric, 11),
  ('AMD',   2.00::numeric, 12),
  ('VZ',    2.00::numeric, 13),
  ('JNJ',   2.00::numeric, 14),
  ('LLY',   1.75::numeric, 15),
  ('CME',   1.75::numeric, 16),
  ('MSI',   1.75::numeric, 17),
  ('ALL',   1.50::numeric, 18),
  ('PLTR',  1.50::numeric, 19),
  ('TSLA',  1.50::numeric, 20),
  ('MA',    1.50::numeric, 21),
  ('BLK',   1.50::numeric, 22),
  ('PG',    1.50::numeric, 23),
  ('DUK',   1.50::numeric, 24),
  ('CVX',   1.50::numeric, 25),
  ('WELL',  1.50::numeric, 26),
  ('HD',    1.50::numeric, 27),
  ('LOW',   1.50::numeric, 28),
  ('NXPI',  1.50::numeric, 29),
  ('WMT',   1.50::numeric, 30),
  ('IBM',   1.50::numeric, 31),
  ('ISRG',  1.25::numeric, 32),
  ('BSX',   1.25::numeric, 33),
  ('V',     1.25::numeric, 34),
  ('GLW',   1.25::numeric, 35),
  ('ABBV',  1.25::numeric, 36),
  ('HCA',   1.25::numeric, 37),
  ('ETN',   1.25::numeric, 38),
  ('GE',    1.00::numeric, 39),
  ('APH',   1.00::numeric, 40),
  ('TSM',   1.00::numeric, 41),
  ('HOOD',  1.00::numeric, 42),
  ('NFLX',  1.00::numeric, 43),
  ('THC',   1.00::numeric, 44),
  ('UBER',  1.00::numeric, 45),
  ('SNOW',  1.00::numeric, 46),
  ('TJX',   1.00::numeric, 47),
  ('ORLY',  1.00::numeric, 48),
  ('RTX',   1.00::numeric, 49),
  ('$Cash', 1.00::numeric, 50),
  ('ELF',   0.75::numeric, 51),
  ('COIN',  0.75::numeric, 52),
  ('RDDT',  0.75::numeric, 53),
  ('APP',   0.75::numeric, 54),
  ('MU',    0.75::numeric, 55)
) AS v(symbol, pct, ord)
JOIN securities s ON upper(trim(s.symbol)) = upper(trim(v.symbol));

-- Expect 55 rows. If fewer, add missing symbols to securities first, then re-run.
