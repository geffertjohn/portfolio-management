-- Remove duplicate quarterly_standard_deviation_3y column.
-- sd_3y captures the same metric and should be used instead.

ALTER TABLE securities2
  DROP COLUMN IF EXISTS quarterly_standard_deviation_3y;
