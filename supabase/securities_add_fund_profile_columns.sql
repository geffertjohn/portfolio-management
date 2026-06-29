-- =============================================================================
-- securities — add fund profile columns (exact names from your schema list).
-- No vendor-specific prefixes. Idempotent: safe to re-run.
--
-- If you get "relation public.securities does not exist", run FIRST:
--   securities_create_table_fund_profile.sql
-- Otherwise run after `public.securities` exists (e.g. positions_and_securities.sql).
-- =============================================================================

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS symbol text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS detailed_security_type text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_company_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS fund_family text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS investment_strategy text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS broad_category_group text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS broad_asset_class text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS broad_asset_class_benchmark_index_symbol text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS broad_asset_class_benchmark_index text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS peer_group_benchmark_index_symbol text;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS peer_group_benchmark_index text;

ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS aum_usd numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS inception_date_generic date;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS max_manager_tenure numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS turnover_ratio_generic numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS dividend_yield numeric;
ALTER TABLE public.securities ADD COLUMN IF NOT EXISTS expense_ratio_generic numeric;

COMMENT ON COLUMN public.securities.aum_usd IS 'Assets under management (USD).';
COMMENT ON COLUMN public.securities.inception_date_generic IS 'Inception date from source export (parallel to inception_date if both used).';
COMMENT ON COLUMN public.securities.max_manager_tenure IS 'Years (or source units); adjust type if you store text labels.';
