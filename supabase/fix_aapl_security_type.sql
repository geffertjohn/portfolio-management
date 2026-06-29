-- Fix AAPL security_type that was corrupted by a bad template upload.
-- The upload bug set security_type to the human-readable label "Security Type"
-- instead of the value "stock".  This also fixes any other rows with the same
-- corruption pattern (where security_type is a human-readable label rather than
-- a machine code).

UPDATE securities2
SET security_type = 'stock'
WHERE symbol = 'AAPL'
  AND (security_type IS NULL
       OR lower(trim(security_type)) NOT IN ('stock','common_stock','common stock','equity','etf','mutual fund','open-ended','closed-end'));
