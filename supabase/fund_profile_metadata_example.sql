-- Example: set fund profile–style fields on securities2 (app uses columns, not JSON metadata).
-- Run for one symbol to test.

UPDATE securities2
SET
  investment_management = 'The Vanguard Group, Inc.',
  inception_date = '2010-09-07'::date
WHERE symbol = 'VOO';
