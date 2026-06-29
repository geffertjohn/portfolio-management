-- Clean up securities classification values so check constraints can be applied.
--
-- Strategy:
-- - If asset_class/category/sector are non-null, non-empty, and not in the allowed lists,
--   set them to NULL.

WITH allowed_asset_class AS (
  SELECT unnest(ARRAY[
    'US Equity',
    'International Equity',
    'Taxable Bond',
    'Money Market',
    'Cash'
  ]) AS v
),
allowed_category AS (
  SELECT unnest(ARRAY[
    'Large Value',
    'Large Blend',
    'Large Growth',
    'Mid Value',
    'Mid Blend',
    'Mid Growth',
    'Small Value',
    'Small Blend',
    'Small Growth',
    'Foreign Large Blend',
    'Foreign Large Value',
    'Foreign Large Growth',
    'Foreign Mid Blend',
    'Foreign Mid Value',
    'Foreign Mid Growth',
    'Foreign Small Blend',
    'Foreign Small Value',
    'Foreign Small Growth',
    'Diversified Emerging Markets',
    'Long-Term Bond',
    'Intermediate-Term Bond',
    'Short-Term Bond',
    'UltraShort Bond',
    'High-Yield Bond',
    'Multisector Bond',
    'World Bond',
    'Emerging Markets Bond'
  ]) AS v
),
allowed_sector AS (
  SELECT unnest(ARRAY[
    'Basic Materials',
    'Communication Services',
    'Consumer Cyclical',
    'Consumer Defensive',
    'Energy',
    'Financial Services',
    'Healthcare',
    'Industrials',
    'Real Estate',
    'Technology',
    'Utilities'
  ]) AS v
)
UPDATE securities s
SET
  asset_class = CASE
    WHEN s.asset_class IS NULL OR NULLIF(TRIM(s.asset_class), '') IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM allowed_asset_class a WHERE a.v = s.asset_class) THEN s.asset_class
    ELSE NULL
  END,
  category = CASE
    WHEN s.category IS NULL OR NULLIF(TRIM(s.category), '') IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM allowed_category c WHERE c.v = s.category) THEN s.category
    ELSE NULL
  END,
  sector = CASE
    WHEN s.sector IS NULL OR NULLIF(TRIM(s.sector), '') IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM allowed_sector o WHERE o.v = s.sector) THEN s.sector
    ELSE NULL
  END;

