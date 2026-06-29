-- Fixed income fund scorecard metrics (one row per security, typically a bond / fixed-income fund)
-- Link to securities; adjust ON DELETE if you prefer SET NULL or RESTRICT

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE fixedincome_scorecard (
  id bigserial PRIMARY KEY,
  security_id bigint NOT NULL UNIQUE REFERENCES securities(id) ON DELETE CASCADE,

  thirty_day_sec_yield numeric(10, 4),
  yield_to_maturity numeric(10, 4),
  average_credit_quality text,
  effective_duration numeric(10, 4),
  effective_maturity numeric(10, 4),

  sharpe_ratio_5y numeric(10, 4),
  sortino_ratio_5y numeric(10, 4),
  max_drawdown_5y numeric(10, 4),
  standard_deviation_5y numeric(10, 4),
  alpha_5y numeric(10, 4),

  net_expense_ratio numeric(10, 4),
  tax_cost_ratio numeric(10, 4),
  manager_tenure text,
  tracking_error numeric(10, 4),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixedincome_scorecard_security_id ON fixedincome_scorecard(security_id);

CREATE TRIGGER fixedincome_scorecard_updated_at
  BEFORE UPDATE ON fixedincome_scorecard
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Optional RLS
-- ALTER TABLE fixedincome_scorecard ENABLE ROW LEVEL SECURITY;
