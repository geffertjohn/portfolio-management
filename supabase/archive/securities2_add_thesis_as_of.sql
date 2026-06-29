-- Thesis + as-of (moved from legacy `securities` row). Run once after securities2 exists.
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS thesis text;
ALTER TABLE securities2 ADD COLUMN IF NOT EXISTS as_of_date date;
