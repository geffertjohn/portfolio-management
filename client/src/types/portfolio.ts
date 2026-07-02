export interface Portfolio {
  name: string
  security_id: string | null
  portfolio_strategy: string
  updated_at: string | null
  investment_objective: string | null
  description: string
  objective_statement: string | null
  investment_philosophy: string | null
  created_at: string
  market_alpha_12_month: number | null
  quarterly_market_beta_12_month: number | null
  historical_sharpe_1y: number | null
  historical_sortino_1y: number | null
  historical_treynor_measure_1y: number | null
  one_month_total_return: number | null
  three_month_total_return: number | null
  ytd_total_return: number | null
  one_year_total_return: number | null
  annualized_three_year_total_return: number | null
  annualized_five_year_total_return: number | null
  annualized_ten_year_total_return: number | null
  annualized_daily_all_time_total_return: number | null
  earliest_performance_date: string | null
  last_rebalance_date: string | null
  next_rebalance_date: string | null
  dividend_yield: number | null
  expense_ratio: number | null

  stock_net: number | null
  bond_net: number | null
  cash_net: number | null
  emerging_equity_exposure: number | null
  large_cap_equity_allocation_generic: number | null
  medium_cap_equity_allocation_generic: number | null
  small_cap_equity_allocation_generic: number | null
  investment_grade_bond_allocation_generic: number | null
  high_yield_bond_allocation_generic: number | null
  other_bond_exposure_generic: number | null
  developed_equity_exposure: number | null
}
