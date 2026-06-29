-- Remove CHECK constraints on securities.classification columns (asset_class, category, sector).
-- Apply in Supabase SQL editor or via migration when you want to allow any values.

ALTER TABLE securities
  DROP CONSTRAINT IF EXISTS securities_asset_class_check;

ALTER TABLE securities
  DROP CONSTRAINT IF EXISTS securities_category_check;

ALTER TABLE securities
  DROP CONSTRAINT IF EXISTS securities_sector_check;
