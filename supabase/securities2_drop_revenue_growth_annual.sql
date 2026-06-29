-- Consolidate revenue_growth_annual → revenues_growth_annual.
-- The column without the 's' was a duplicate; revenues_growth_annual covers the same metric.

ALTER TABLE securities2
  DROP COLUMN IF EXISTS revenue_growth_annual;
