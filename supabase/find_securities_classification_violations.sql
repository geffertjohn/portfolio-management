-- Find securities rows that violate the allowed-value constraints
-- (asset_class / category / sector).
--
-- Run this in the Supabase SQL Editor, then paste the results here.

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
SELECT
  s.id,
  s.symbol,
  s.asset_class,
  s.category,
  s.sector,
  CASE
    WHEN s.asset_class IS NOT NULL
      AND NULLIF(TRIM(s.asset_class), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM allowed_asset_class a
        WHERE a.v = s.asset_class
      )
    THEN true
    ELSE false
  END AS asset_class_invalid,
  CASE
    WHEN s.category IS NOT NULL
      AND NULLIF(TRIM(s.category), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM allowed_category c
        WHERE c.v = s.category
      )
    THEN true
    ELSE false
  END AS category_invalid,
  CASE
    WHEN s.sector IS NOT NULL
      AND NULLIF(TRIM(s.sector), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM allowed_sector o
        WHERE o.v = s.sector
      )
    THEN true
    ELSE false
  END AS sector_invalid
FROM securities s
WHERE
  (s.asset_class IS NOT NULL AND NULLIF(TRIM(s.asset_class), '') IS NOT NULL)
  OR (s.category IS NOT NULL AND NULLIF(TRIM(s.category), '') IS NOT NULL)
  OR (s.sector IS NOT NULL AND NULLIF(TRIM(s.sector), '') IS NOT NULL)
ORDER BY s.symbol;

