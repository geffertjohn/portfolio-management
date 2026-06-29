-- Add top_holdings JSONB column to securities2
-- Stores the parsed "Top 25 Holdings" section from an uploaded Excel fact sheet.
--
-- Shape: [{"symbol": "GLW", "weight": 4.59}, {"symbol": "AVGO", "weight": 4.52}, ...]
--
-- Run once in the Supabase SQL Editor.

ALTER TABLE securities2
  ADD COLUMN IF NOT EXISTS top_holdings jsonb;

COMMENT ON COLUMN securities2.top_holdings IS
  'Top holdings parsed from Excel upload. Array of {symbol, weight} objects where weight is a percentage (e.g. 4.59 = 4.59%).';
