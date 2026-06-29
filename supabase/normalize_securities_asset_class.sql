-- Normalize existing securities.asset_class values to the allowed option set:
--   US Equity, International Equity, Taxable Bond, Money Market, Cash
--
-- Optional data cleanup. `enforce_securities_classifications.sql` now only drops CHECKs (if present);
-- re-add constraints in Supabase only if you want enforced option lists again.

UPDATE securities
SET asset_class = CASE
  -- Already-valid values
  WHEN asset_class IN (
    'US Equity',
    'International Equity',
    'Taxable Bond',
    'Money Market',
    'Cash'
  ) THEN asset_class

  -- US equity-like values
  WHEN asset_class IN (
    'Equity',
    'Growth',
    'Large Cap Equity',
    'Mid Cap Equity',
    'Small/Micro Cap Equity'
  ) THEN 'US Equity'

  -- International equity-like values
  WHEN asset_class IN (
    'Emerging Markets Equity'
  ) THEN 'International Equity'

  -- Taxable bond-like values
  WHEN asset_class IN (
    'Fixed Income',
    'Core Investment Grade Bond',
    'Global Bond',
    'High Yield & Loans'
  ) THEN 'Taxable Bond'

  -- Empty strings -> NULL
  WHEN NULLIF(TRIM(asset_class), '') IS NULL THEN NULL

  -- Any unexpected outlier -> NULL (safe for constraints)
  ELSE NULL
END;

-- Optional verification (should return 0 after normalization if using the current allowed set):
-- SELECT count(*) AS remaining_invalid
-- FROM securities
-- WHERE NULLIF(TRIM(asset_class), '') IS NOT NULL
--   AND asset_class NOT IN (
--     'US Equity',
--     'International Equity',
--     'Taxable Bond',
--     'Money Market',
--     'Cash'
--   );

