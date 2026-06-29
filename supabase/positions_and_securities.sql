-- =============================================================================
-- Securities: one row per symbol; fund/ETF metrics from Excel live as columns
-- (equity + fixed-income templates merged; no duplicate metrics).
-- Run `securities_restructure.sql` on existing databases that still use the old shape.
-- =============================================================================
CREATE TABLE securities (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  thesis text,

  name text,
  as_of_date date,
  inception_date date,

  legal_structure text,
  morningstar_category text,
  benchmark text,
  fund_company text,

  gross_expense_ratio numeric,
  net_expense_ratio numeric,
  turnover_ratio numeric,
  management_fee_pct numeric,

  twelve_month_yield_pct numeric,
  sec_30_day_yield_pct numeric,
  yield_pct numeric,

  pe_ratio numeric,
  pb_ratio numeric,
  average_market_cap numeric,
  median_market_cap numeric,
  total_net_assets numeric,
  number_of_holdings integer,

  return_1m_pct numeric,
  return_3m_pct numeric,
  return_ytd_pct numeric,
  return_1y_pct numeric,
  return_3y_pct numeric,
  return_5y_pct numeric,
  return_10y_pct numeric,
  return_since_inception_pct numeric,

  benchmark_return_1m_pct numeric,
  benchmark_return_3m_pct numeric,
  benchmark_return_ytd_pct numeric,
  benchmark_return_1y_pct numeric,
  benchmark_return_3y_pct numeric,
  benchmark_return_5y_pct numeric,
  benchmark_return_10y_pct numeric,

  peer_group_return_1m_pct numeric,
  peer_group_return_3m_pct numeric,
  peer_group_return_ytd_pct numeric,
  peer_group_return_1y_pct numeric,
  peer_group_return_3y_pct numeric,
  peer_group_return_5y_pct numeric,
  peer_group_return_10y_pct numeric,

  std_deviation numeric,
  sharpe_ratio numeric,
  beta numeric,
  alpha numeric,
  r_squared numeric,
  up_capture_pct numeric,
  down_capture_pct numeric,

  alloc_cash_pct numeric,
  alloc_us_stocks_pct numeric,
  alloc_non_us_stocks_pct numeric,
  alloc_bonds_pct numeric,
  alloc_other_pct numeric,

  alloc_sector_basic_materials_pct numeric,
  alloc_sector_communication_services_pct numeric,
  alloc_sector_consumer_cyclical_pct numeric,
  alloc_sector_consumer_defensive_pct numeric,
  alloc_sector_energy_pct numeric,
  alloc_sector_financial_services_pct numeric,
  alloc_sector_healthcare_pct numeric,
  alloc_sector_industrials_pct numeric,
  alloc_sector_real_estate_pct numeric,
  alloc_sector_technology_pct numeric,
  alloc_sector_utilities_pct numeric,

  region_united_states_pct numeric,
  region_canada_pct numeric,
  region_latin_america_pct numeric,
  region_united_kingdom_pct numeric,
  region_europe_developed_pct numeric,
  region_europe_emerging_pct numeric,
  region_africa_middle_east_pct numeric,
  region_japan_pct numeric,
  region_australasia_pct numeric,
  region_asia_developed_pct numeric,
  region_asia_emerging_pct numeric
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER securities_updated_at
  BEFORE UPDATE ON securities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Positions: underlying holdings per portfolio (portfolio + security + allocation)
-- =============================================================================
CREATE TABLE positions (
  portfolio_id integer NOT NULL REFERENCES portfolio(portfolio_id) ON DELETE CASCADE,
  security_id bigint NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  allocation_pct numeric(6,2) NOT NULL CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, security_id)
);

CREATE INDEX idx_positions_portfolio_id ON positions(portfolio_id);
CREATE INDEX idx_positions_security_id ON positions(security_id);

-- ALTER TABLE securities ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
