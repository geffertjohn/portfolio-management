-- Add unique indexes to the three benchmark tables that were missing them.
-- These are required for the upsert upload path to resolve conflicts correctly
-- (update existing tickers, insert only when the ticker is new).

-- category_benchmarks: unique on (category_ticker, category)
-- A single ticker can map to multiple categories (e.g. ^MSACXUSNTR appears 12 times)
CREATE UNIQUE INDEX IF NOT EXISTS category_benchmarks_ticker_category_key
  ON category_benchmarks (category_ticker, category);

-- sector_benchmarks: unique on ticker
CREATE UNIQUE INDEX IF NOT EXISTS sector_benchmarks_ticker_key
  ON sector_benchmarks (ticker);

-- model_portfolio_benchmarks: unique on security_id
-- (upsertOn: 'security_id' is already set in the upload code; the DB index was missing)
CREATE UNIQUE INDEX IF NOT EXISTS model_portfolio_benchmarks_security_id_key
  ON model_portfolio_benchmarks (security_id);
