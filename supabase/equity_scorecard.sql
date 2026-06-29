-- Equity / equity ETF scorecard metrics (one row per security)
-- Requires securities table. set_updated_at() is created here if missing (same as fixedincome_scorecard.sql).

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE equity_scorecard (
  id bigserial PRIMARY KEY,
  security_id bigint NOT NULL UNIQUE REFERENCES securities(id) ON DELETE CASCADE,

  sharpe_ratio_5y numeric(10, 4),
  sortino_ratio_5y numeric(10, 4),
  alpha_5y numeric(10, 4),
  information_ratio_5y numeric(10, 4),
  max_drawdown_5y numeric(10, 4),
  beta_5y numeric(10, 4),

  net_expense_ratio numeric(10, 4),
  tax_cost_ratio_5y numeric(10, 4),
  turnover_ratio numeric(10, 4),
  discount_premium_to_nav numeric(10, 4),

  manager_tenure text,
  tracking_error numeric(10, 4),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_equity_scorecard_security_id ON equity_scorecard(security_id);

CREATE TRIGGER equity_scorecard_updated_at
  BEFORE UPDATE ON equity_scorecard
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Optional RLS
-- ALTER TABLE equity_scorecard ENABLE ROW LEVEL SECURITY;
