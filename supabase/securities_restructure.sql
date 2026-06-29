-- =============================================================================
-- Restructure `securities`: keep only id, symbol, created_at, updated_at, then
-- add every column from the two Excel templates (equity broad asset class + fixed
-- income), deduplicated (no duplicate metrics across templates).
--
-- Run once in Supabase SQL Editor (or psql) against your live database.
-- BACK UP DATA FIRST — dropping columns removes thesis, metadata, classifications, etc.
--
-- If your live table uses quoted mixed-case names (e.g. "Benchmark"), adjust DROPs.
-- =============================================================================

BEGIN;

-- Optional (run BEFORE dropping `metadata` if you need to keep thesis text):
-- ALTER TABLE securities ADD COLUMN IF NOT EXISTS thesis text;
-- UPDATE securities SET thesis = COALESCE(thesis, metadata->>'thesis')
--   WHERE metadata IS NOT NULL AND jsonb_typeof(metadata::jsonb) = 'object'
--   AND (metadata::jsonb ? 'thesis');

-- ---------------------------------------------------------------------------
-- Drop old columns (everything except id, symbol, created_at, updated_at)
-- ---------------------------------------------------------------------------
ALTER TABLE securities DROP COLUMN IF EXISTS "Benchmark";
ALTER TABLE securities DROP COLUMN IF EXISTS "PeerGroup";
ALTER TABLE securities DROP COLUMN IF EXISTS "Website";
ALTER TABLE securities DROP COLUMN IF EXISTS benchmark;
ALTER TABLE securities DROP COLUMN IF EXISTS peer_group;
ALTER TABLE securities DROP COLUMN IF EXISTS website;

ALTER TABLE securities DROP COLUMN IF EXISTS asset_class;
ALTER TABLE securities DROP COLUMN IF EXISTS category;
ALTER TABLE securities DROP COLUMN IF EXISTS description;
ALTER TABLE securities DROP COLUMN IF EXISTS expense_ratio;
ALTER TABLE securities DROP COLUMN IF EXISTS is_etf;
ALTER TABLE securities DROP COLUMN IF EXISTS is_fund;
ALTER TABLE securities DROP COLUMN IF EXISTS metadata;
ALTER TABLE securities DROP COLUMN IF EXISTS name;
ALTER TABLE securities DROP COLUMN IF EXISTS sector;
ALTER TABLE securities DROP COLUMN IF EXISTS type;

-- Legacy columns from older schema (if present)
ALTER TABLE securities DROP COLUMN IF EXISTS asset_type;
ALTER TABLE securities DROP COLUMN IF EXISTS isin;
ALTER TABLE securities DROP COLUMN IF EXISTS cusip;
ALTER TABLE securities DROP COLUMN IF EXISTS exchange;

-- ---------------------------------------------------------------------------
-- Thesis (moved out of removed `metadata` JSON; not an Excel metric)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS thesis text;

-- ---------------------------------------------------------------------------
-- Identification & timing (from Excel)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS as_of_date date;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS inception_date date;

-- ---------------------------------------------------------------------------
-- Classification (equity template; Legal Structure e.g. ETF / open-ended fund)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS legal_structure text;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS morningstar_category text;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark text;

-- "Company" / fund sponsor — single column for both templates
ALTER TABLE securities ADD COLUMN IF NOT EXISTS fund_company text;

-- ---------------------------------------------------------------------------
-- Costs & operations
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS gross_expense_ratio numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS net_expense_ratio numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS turnover_ratio numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS management_fee_pct numeric;

-- ---------------------------------------------------------------------------
-- Yields (equity: 12-mo + SEC 30-day; FI: single Yield)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS twelve_month_yield_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS sec_30_day_yield_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS yield_pct numeric;

-- ---------------------------------------------------------------------------
-- Valuation & size
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS pe_ratio numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS pb_ratio numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS average_market_cap numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS median_market_cap numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS total_net_assets numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS number_of_holdings integer;

-- ---------------------------------------------------------------------------
-- Total returns (FI template; horizons as percentages)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_1m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_3m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_ytd_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_1y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_3y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_5y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_10y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS return_since_inception_pct numeric;

-- Broad asset class benchmark & peer group total returns (Morningstar-style)
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_1m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_3m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_ytd_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_1y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_3y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_5y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS benchmark_return_10y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_1m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_3m_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_ytd_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_1y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_3y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_5y_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS peer_group_return_10y_pct numeric;

-- ---------------------------------------------------------------------------
-- Risk & MPT (equity template)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS std_deviation numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS sharpe_ratio numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS beta numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alpha numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS r_squared numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS up_capture_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS down_capture_pct numeric;

-- ---------------------------------------------------------------------------
-- Asset allocation % (equity)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_cash_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_us_stocks_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_non_us_stocks_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_bonds_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_other_pct numeric;

-- ---------------------------------------------------------------------------
-- Sector weightings % (equity)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_basic_materials_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_communication_services_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_consumer_cyclical_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_consumer_defensive_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_energy_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_financial_services_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_healthcare_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_industrials_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_real_estate_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_technology_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS alloc_sector_utilities_pct numeric;

-- ---------------------------------------------------------------------------
-- Regional exposure % (equity)
-- ---------------------------------------------------------------------------
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_united_states_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_canada_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_latin_america_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_united_kingdom_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_europe_developed_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_europe_emerging_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_africa_middle_east_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_japan_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_australasia_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_asia_developed_pct numeric;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS region_asia_emerging_pct numeric;

COMMIT;
