-- =============================================================================
-- securities — create table (fund profile columns only).
-- Use this when `public.securities` does not exist yet (e.g. new Supabase project).
-- For existing databases that already have `securities`, use
-- securities_add_fund_profile_columns.sql instead.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.securities (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  detailed_security_type text,
  fund_company_name text,
  fund_family text,
  name text,
  investment_strategy text,
  broad_category_group text,
  broad_asset_class text,
  category_name text,
  broad_asset_class_benchmark_index_symbol text,
  broad_asset_class_benchmark_index text,
  peer_group_benchmark_index_symbol text,
  peer_group_benchmark_index text,

  aum_usd numeric,
  inception_date_generic date,
  max_manager_tenure numeric,
  turnover_ratio_generic numeric,
  dividend_yield numeric,
  expense_ratio_generic numeric
);

CREATE UNIQUE INDEX securities_symbol_key ON public.securities (symbol);

DROP TRIGGER IF EXISTS securities_updated_at ON public.securities;
CREATE TRIGGER securities_updated_at
  BEFORE UPDATE ON public.securities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE public.securities IS 'One row per tradable symbol; fund profile fields from export.';
COMMENT ON COLUMN public.securities.aum_usd IS 'Assets under management (USD).';
COMMENT ON COLUMN public.securities.inception_date_generic IS 'Inception date from source export.';
COMMENT ON COLUMN public.securities.max_manager_tenure IS 'Years or source units; change to text if needed.';
