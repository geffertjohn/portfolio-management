-- =============================================================================
-- Add metric snapshot columns to the portfolio table.
-- Populated via the Portfolio Upload Template (Col A = db field, Col C = value).
-- Columns whose names begin with a digit must be double-quoted in PostgreSQL.
-- Safe to re-run: every statement uses IF NOT EXISTS.
-- =============================================================================

-- ── Identity & metadata ───────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS security_id                                 text;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS security_name                               text;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS detailed_security_type                      text;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS description                                 text;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS earliest_performance_date                   date;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS assigned_benchmark_symbol                   text;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS all_time_high_date                          date;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS all_time_low_date                           date;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS expense_ratio                               numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS dividend_yield                              numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS number_of_holdings                          integer;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS turnover_ratio                              numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS year_high_date                              date;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS year_low_date                               date;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS average_credit_quality_score                text;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS ytd_tax_cost_ratio                          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS tax_cost_ratio_since_inception               numeric;

-- ── Total returns ─────────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS one_month_total_return                      numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS three_month_total_return                    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS ytd_total_return                            numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS one_year_total_return                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS annualized_three_year_total_return          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS annualized_five_year_total_return           numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS annualized_ten_year_total_return            numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS annualized_daily_all_time_total_return      numeric;

-- ── Sharpe ratio ──────────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sharpe_1y                        numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sharpe_3y                        numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sharpe_5y                        numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sharpe_all                       numeric;

-- ── Sortino ratio ─────────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sortino_1y                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sortino_3y                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sortino_5y                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_sortino_all                      numeric;

-- ── Standard deviation (monthly annualised) ───────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS monthly_standard_deviation_annualized_1y    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS monthly_standard_deviation_annualized_3y    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS monthly_standard_deviation_annualized_5y    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS monthly_standard_deviation_annualized_all   numeric;

-- ── Max drawdown ──────────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS max_drawdown_1y                             numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS max_drawdown_3y                             numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS max_drawdown_5y                             numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS max_drawdown_all                            numeric;

-- ── Alpha (vs market) ─────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS market_alpha_12_month                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS market_alpha_36_month                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS market_alpha_60_month                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS market_alpha_all                            numeric;

-- ── Beta (quarterly, vs market) ───────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS quarterly_market_beta_12_month              numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS quarterly_market_beta_36_month              numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS quarterly_market_beta_60_month              numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS quarterly_market_beta_all                   numeric;

-- ── Treynor measure ───────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_treynor_measure_1y               numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_treynor_measure_3y               numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_treynor_measure_5y               numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS historical_treynor_measure_all              numeric;

-- ── Tracking error ────────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS tracking_error_1y                           numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS tracking_error_3y                           numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS tracking_error_5y                           numeric;

-- ── Upside / downside capture ─────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS upside_downside_1y                          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS upside_downside_3y                          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS upside_downside_5y                          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS upside_downside_all                         numeric;

-- ── Geographic exposure ───────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS north_america_total_exposure_generic        numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS latin_america_total_exposure_generic        numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS united_kingdom_total_exposure_generic       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS europe_developed_total_exposure_generic     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS europe_emerging_total_exposure              numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS africa_middle_east_total_exposure           numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS asia_developed_total_exposure_generic       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS asia_emerging_total_exposure                numeric;

-- ── Style-box exposure ────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_large_cap_value_exposure    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_large_cap_blend_exposure    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_large_cap_growth_exposure   numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_mid_cap_value_exposure      numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_mid_cap_blend_exposure      numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_mid_cap_growth_exposure     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_small_cap_value_exposure    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_small_cap_blend_exposure    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS equity_stylebox_small_cap_growth_exposure   numeric;

-- ── Sector exposure ───────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS basic_materials_exposure_generic            numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS communication_services_exposure_generic     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS consumer_cyclical_exposure_generic          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS consumer_defensive_exposure_generic         numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS energy_exposure_generic                     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS financial_services_exposure_generic         numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS healthcare_exposure_generic                 numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS industrials_exposure_generic                numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS real_estate_exposure_generic                numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS technology_exposure_generic                 numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS utilities_exposure_generic                  numeric;

-- ── Asset allocation (net) ────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS cash_net                                    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS stock_net                                   numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS bond_net                                    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS convertible_net                             numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS preferred_net                               numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS other_net                                   numeric;

-- ── Credit quality ────────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS aaa_bond_exposure_generic                   numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS aa_bond_exposure_generic                    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS a_bond_exposure_generic                     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS bbb_bond_exposure_generic                   numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS bb_bond_exposure_generic                    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS b_bond_exposure_generic                     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS below_b_bond_exposure_generic               numeric;

-- ── Maturity distribution ─────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS maturity_less_than_1_year_generic           numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS "1_to_3_years_maturity_bond_exposure"       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS "3_to_5_years_maturity_bond_exposure"       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS maturity_5_to_10_years_generic              numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS maturity_10_to_20_years_generic             numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS maturity_20_to_30_years_generic             numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS over_30_years_maturity_bond_exposure        numeric;

-- ── Bond analytics ────────────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS effective_duration                          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS effective_maturity                          numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS yield_to_maturity                           numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS current_yield                               numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS average_coupon                              numeric;

-- ── Fixed income type exposure ────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS government_fixed_income_exposure_generic    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS corporate_fixed_income_exposure_generic     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS securitized_fixed_income_exposure_generic   numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS municipal_fixed_income_exposure_generic     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS other_fixed_income_exposure_generic         numeric;

-- ── Worst period returns ──────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS worst_return_three_month                    numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS worst_return_six_month                      numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS worst_return_one_year                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS worst_return_three_year                     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS worst_return_five_year                      numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS worst_return_all_time                       numeric;

-- ── Best period returns ───────────────────────────────────────────────────────
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS best_return_three_month                     numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS best_return_six_month                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS best_return_one_year                        numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS best_return_three_year                      numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS best_return_five_year                       numeric;
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS best_return_all_time                        numeric;
