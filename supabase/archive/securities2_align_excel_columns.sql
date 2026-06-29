-- =============================================================================
-- securities2 — align column names with Excel import mapping (idempotent).
-- Run in Supabase SQL Editor after securities2 (and optional add_metrics) exist.
-- Backup recommended. See client Excel mapping in securities2ExcelUpload.ts.
-- =============================================================================

-- --- Renames (only when old name exists and new name does not) -------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_1m_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_1m') THEN
    ALTER TABLE public.securities2 RENAME COLUMN return_1m_pct TO return_1m;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_3m_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_3m') THEN
    ALTER TABLE public.securities2 RENAME COLUMN return_3m_pct TO return_3m;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_ytd_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_ytd') THEN
    ALTER TABLE public.securities2 RENAME COLUMN return_ytd_pct TO return_ytd;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_1y_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_1y') THEN
    ALTER TABLE public.securities2 RENAME COLUMN return_1y_pct TO return_1y;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_3y_ann_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_3y') THEN
    ALTER TABLE public.securities2 RENAME COLUMN return_3y_ann_pct TO return_3y;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_5y_ann_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_5y') THEN
    ALTER TABLE public.securities2 RENAME COLUMN return_5y_ann_pct TO return_5y;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_10y_ann_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'return_10y') THEN
    ALTER TABLE public.securities2 RENAME COLUMN return_10y_ann_pct TO return_10y;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'net_assets_usd')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'aum') THEN
    ALTER TABLE public.securities2 RENAME COLUMN net_assets_usd TO aum;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'category_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'morningstar_category') THEN
    ALTER TABLE public.securities2 RENAME COLUMN category_name TO morningstar_category;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'broad_asset_class')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'asset_class') THEN
    ALTER TABLE public.securities2 RENAME COLUMN broad_asset_class TO asset_class;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'fund_family')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'company') THEN
    ALTER TABLE public.securities2 RENAME COLUMN fund_family TO company;
  END IF;
END $$;

-- Risk (3Y) — shorter names per Excel mapping
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'beta_3y_market')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'beta_3y') THEN
    ALTER TABLE public.securities2 RENAME COLUMN beta_3y_market TO beta_3y;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'alpha_3y_market')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'alpha_3y') THEN
    ALTER TABLE public.securities2 RENAME COLUMN alpha_3y_market TO alpha_3y;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sharpe_3y')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sharpe_ratio_3y') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sharpe_3y TO sharpe_ratio_3y;
  END IF;
END $$;

-- Equity regions (drop _pct suffix on names)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_north_america_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_north_america') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_north_america_pct TO region_north_america;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_latin_america_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_latin_america') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_latin_america_pct TO region_latin_america;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_united_kingdom_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_united_kingdom') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_united_kingdom_pct TO region_united_kingdom;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_europe_developed_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_europe_developed') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_europe_developed_pct TO region_europe_developed;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_africa_middle_east_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_africa_middle_east') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_africa_middle_east_pct TO region_africa_middle_east;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_asia_developed_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_asia_developed') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_asia_developed_pct TO region_asia_developed;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_emerging_asia_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_asia_emerging') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_emerging_asia_pct TO region_asia_emerging;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_europe_emerging_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'region_europe_emerging') THEN
    ALTER TABLE public.securities2 RENAME COLUMN region_europe_emerging_pct TO region_europe_emerging;
  END IF;
END $$;

-- Equity sectors (drop _pct)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_basic_materials_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_basic_materials') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_basic_materials_pct TO sector_basic_materials;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_communication_services_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_communication_services') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_communication_services_pct TO sector_communication_services;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_consumer_cyclical_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_consumer_cyclical') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_consumer_cyclical_pct TO sector_consumer_cyclical;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_consumer_defensive_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_consumer_defensive') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_consumer_defensive_pct TO sector_consumer_defensive;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_energy_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_energy') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_energy_pct TO sector_energy;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_financial_services_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_financial_services') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_financial_services_pct TO sector_financial_services;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_healthcare_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_healthcare') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_healthcare_pct TO sector_healthcare;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_industrials_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_industrials') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_industrials_pct TO sector_industrials;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_real_estate_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_real_estate') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_real_estate_pct TO sector_real_estate;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_technology_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_technology') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_technology_pct TO sector_technology;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_utilities_pct')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'securities2' AND column_name = 'sector_utilities') THEN
    ALTER TABLE public.securities2 RENAME COLUMN sector_utilities_pct TO sector_utilities;
  END IF;
END $$;

-- --- New columns (Excel mapping) --------------------------------------------
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS sector text;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS return_life numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS return_1y_quarterly numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS return_3y_quarterly numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS return_5y_quarterly numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS return_10y_quarterly numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS return_life_quarterly numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pe_ratio numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pb_ratio numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pc_ratio numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS ps_ratio numeric;

-- "Yield (%)" distinct from dividend_yield — portfolio / SEC yield
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS "yield" numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS morningstar_rating numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS morningstar_risk_3y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS morningstar_return_3y numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pct_cash numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pct_us_stocks numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pct_non_us_stocks numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pct_bonds numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS pct_other numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS mkt_cap_giant numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS mkt_cap_large numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS mkt_cap_mid numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS mkt_cap_small numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS mkt_cap_micro numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_aaa numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_aa numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_a numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_bbb numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_bb numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_b numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_below_b numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_not_rated numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_1_3y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_3_5y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_5_7y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_7_10y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_10_15y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_15_20y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_20_30y numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_maturity_over_30y numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_duration numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS bond_avg_coupon numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS strategy_description text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS prospectus_objective text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS top_10_pct numeric;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_1_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_2_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_3_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_4_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_5_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_6_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_7_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_8_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_9_name text;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_10_name text;

ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_1_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_2_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_3_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_4_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_5_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_6_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_7_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_8_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_9_pct numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS holding_10_pct numeric;

-- Optional regions from mapping (if not already renamed from _pct)
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS region_japan numeric;
ALTER TABLE public.securities2 ADD COLUMN IF NOT EXISTS region_australasia numeric;

COMMENT ON COLUMN public.securities2."yield" IS 'Portfolio / fund yield % (Excel "Yield (%)"); distinct from dividend_yield.';
