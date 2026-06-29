-- Run once on existing DBs: drop legacy TIE on equity income; add FCF/OCF ratio on core growth.
-- New installs: use updated equityincome_scorecard.sql / coregrowth_scorecard.sql instead.

ALTER TABLE equityincome_scorecard
  DROP COLUMN IF EXISTS times_interest_earned;

ALTER TABLE coregrowth_scorecard
  DROP COLUMN IF EXISTS times_interest_earned;

ALTER TABLE coregrowth_scorecard
  ADD COLUMN IF NOT EXISTS fcf_operating_cash_flow_ratio numeric(10, 4);
