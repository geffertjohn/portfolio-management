


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."log_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _id bigint;
BEGIN
  _id := CASE WHEN TG_OP = 'DELETE' THEN (OLD.id)::bigint ELSE (NEW.id)::bigint END;
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data)
  VALUES (
    TG_TABLE_NAME, _id, TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_position_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO holdings_change_log(portfolio_name, security_id, change_type, old_weight, new_weight)
    VALUES (NEW.portfolio_name, NEW.security_id, 'add', NULL, NEW.allocation_pct);
  ELSIF TG_OP = 'UPDATE' AND OLD.allocation_pct IS DISTINCT FROM NEW.allocation_pct THEN
    INSERT INTO holdings_change_log(portfolio_name, security_id, change_type, old_weight, new_weight)
    VALUES (NEW.portfolio_name, NEW.security_id, 'weight_change', OLD.allocation_pct, NEW.allocation_pct);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO holdings_change_log(portfolio_name, security_id, change_type, old_weight, new_weight)
    VALUES (OLD.portfolio_name, OLD.security_id, 'remove', OLD.allocation_pct, NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_position_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_portfolio_review_schedules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Every portfolio gets quarterly + annual review timers.
  insert into public.portfolio_review_schedules (portfolio_name, cadence, next_review_at)
  select new.name, c.cadence, now()
  from (values ('quarterly'),('annual')) as c(cadence)
  on conflict (portfolio_name, cadence) do nothing;

  -- Monthly reviews only for Equity (individual-stock) strategies.
  if new.portfolio_strategy = 'Equity' then
    insert into public.portfolio_review_schedules (portfolio_name, cadence, next_review_at)
    values (new.name, 'monthly', now())
    on conflict (portfolio_name, cadence) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."seed_portfolio_review_schedules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."action_item_events" (
    "id" bigint NOT NULL,
    "action_item_id" bigint,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."action_item_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."action_item_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."action_item_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."action_item_events_id_seq" OWNED BY "public"."action_item_events"."id";



CREATE TABLE IF NOT EXISTS "public"."action_items" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "due_date" "date",
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolution_notes" "text",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portfolio_name" "text",
    "deleted_at" timestamp with time zone,
    "security_id" "text",
    "category" "text" DEFAULT 'operational'::"text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "linked_type" "text",
    "linked_id" "text",
    "recurrence" "text" DEFAULT 'none'::"text" NOT NULL,
    "recurrence_interval" integer DEFAULT 1 NOT NULL,
    "snoozed_until" "date",
    CONSTRAINT "action_items_category_check" CHECK (("category" = ANY (ARRAY['security'::"text", 'portfolio'::"text", 'ic'::"text", 'compliance'::"text", 'client'::"text", 'trade'::"text", 'operational'::"text"]))),
    CONSTRAINT "action_items_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "action_items_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['none'::"text", 'daily'::"text", 'weekly'::"text", 'monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "action_items_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'waiting'::"text", 'blocked'::"text", 'snoozed'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."action_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."action_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."action_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."action_items_id_seq" OWNED BY "public"."action_items"."id";



CREATE TABLE IF NOT EXISTS "public"."alert_events" (
    "id" bigint NOT NULL,
    "rule_id" bigint NOT NULL,
    "metric_field" "text" NOT NULL,
    "actual_value" numeric,
    "threshold_value" numeric NOT NULL,
    "triggered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "security_id" "text" NOT NULL
);


ALTER TABLE "public"."alert_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."alert_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."alert_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."alert_events_id_seq" OWNED BY "public"."alert_events"."id";



CREATE TABLE IF NOT EXISTS "public"."alert_rules" (
    "id" bigint NOT NULL,
    "metric_field" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "threshold_value" numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "security_id" "text",
    CONSTRAINT "alert_rules_operator_check" CHECK (("operator" = ANY (ARRAY['lt'::"text", 'lte'::"text", 'gt'::"text", 'gte'::"text", 'eq'::"text"])))
);


ALTER TABLE "public"."alert_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."alert_rules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."alert_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."alert_rules_id_seq" OWNED BY "public"."alert_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."at_risk" (
    "id" bigint NOT NULL,
    "date_added" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metrics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "removed_at" timestamp with time zone,
    "removal_date" timestamp with time zone,
    "security_id" "text" NOT NULL
);


ALTER TABLE "public"."at_risk" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" bigint NOT NULL,
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "changed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."category_benchmarks" (
    "id" bigint NOT NULL,
    "category_ticker" "text" NOT NULL,
    "category_benchmark" "text",
    "category" "text",
    "etf_proxy" "text",
    "one_month_total_return" numeric,
    "three_month_total_return" numeric,
    "ytd_total_return" numeric,
    "annualized_daily_one_year_total_return" numeric,
    "annualized_daily_three_year_return" numeric,
    "annualized_daily_five_year_total_return" numeric,
    "historical_sharpe_1y" numeric,
    "historical_sharpe_3y" numeric,
    "historical_sharpe_5y" numeric,
    "historical_sortino_1y" numeric,
    "historical_sortino_3y" numeric,
    "historical_sortino_5y" numeric,
    "monthly_standard_deviation_annualized_1y" numeric,
    "quarterly_standard_deviation_annualized_3y" numeric,
    "quarterly_standard_deviation_annualized_5y" numeric,
    "eps_growth_1_yr_generic" numeric,
    "sales_growth_1_yr_generic" numeric,
    "consumer_cyclical_exposure" numeric,
    "financial_services_exposure" numeric,
    "basic_materials_exposure" numeric,
    "real_estate_exposure" numeric,
    "communication_services_exposure" numeric,
    "energy_exposure" numeric,
    "industrials_exposure" numeric,
    "technology_exposure" numeric,
    "consumer_defensive_exposure" numeric,
    "healthcare_exposure" numeric,
    "utilities_exposure" numeric,
    "aaa_bond_exposure_generic" numeric,
    "aa_bond_exposure_generic" numeric,
    "a_bond_exposure_generic" numeric,
    "bbb_bond_exposure_generic" numeric,
    "bb_bond_exposure_generic" numeric,
    "b_bond_exposure_generic" numeric,
    "below_b_bond_exposure_generic" numeric,
    "maturity_less_than_1_year_generic" numeric,
    "1_to_3_years_maturity_bond_exposure" numeric,
    "3_to_5_years_maturity_bond_exposure" numeric,
    "maturity_5_to_10_years_generic" numeric,
    "maturity_10_to_20_years_generic" numeric,
    "maturity_20_to_30_years_generic" numeric,
    "over_30_years_maturity_bond_exposure" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "calmar_ratio_1y" numeric(12,6),
    "calmar_ratio_3y" numeric(12,6),
    "calmar_ratio_5y" numeric(12,6),
    "sales_growth_3_yr_generic" numeric,
    "eps_growth_3_yr_generic" numeric
);


ALTER TABLE "public"."category_benchmarks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."category_benchmarks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."category_benchmarks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."category_benchmarks_id_seq" OWNED BY "public"."category_benchmarks"."id";



CREATE TABLE IF NOT EXISTS "public"."client_portfolios" (
    "id" bigint NOT NULL,
    "client_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portfolio_name" "text"
);


ALTER TABLE "public"."client_portfolios" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."client_portfolios_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."client_portfolios_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."client_portfolios_id_seq" OWNED BY "public"."client_portfolios"."id";



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "household_name" "text",
    "email" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "model_portfolio_name" "text",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."clients_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."clients_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."clients_id_seq" OWNED BY "public"."clients"."id";



CREATE TABLE IF NOT EXISTS "public"."communication_log" (
    "id" bigint NOT NULL,
    "client_id" bigint,
    "type" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "notes" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "follow_up_due" "date",
    "follow_up_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portfolio_name" "text",
    "security_id" "text",
    CONSTRAINT "communication_log_type_check" CHECK (("type" = ANY (ARRAY['meeting'::"text", 'call'::"text", 'email'::"text", 'note'::"text"])))
);


ALTER TABLE "public"."communication_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."communication_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."communication_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."communication_log_id_seq" OWNED BY "public"."communication_log"."id";



CREATE TABLE IF NOT EXISTS "public"."compliance_rules" (
    "id" bigint NOT NULL,
    "rule_type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "threshold_value" numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portfolio_name" "text",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "compliance_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['max_single_position'::"text", 'min_equity_pct'::"text", 'max_equity_pct'::"text", 'min_fixed_income_pct'::"text", 'max_fixed_income_pct'::"text", 'min_cash_pct'::"text", 'max_cash_pct'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."compliance_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."compliance_rules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."compliance_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."compliance_rules_id_seq" OWNED BY "public"."compliance_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."firm_compliance_rules" (
    "id" integer NOT NULL,
    "rule_type" "text" NOT NULL,
    "threshold_value" numeric NOT NULL,
    "label" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."firm_compliance_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."firm_compliance_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."firm_compliance_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."firm_compliance_rules_id_seq" OWNED BY "public"."firm_compliance_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."fund_alternatives" (
    "id" bigint NOT NULL,
    "parent_security_id" "text" NOT NULL,
    "related_security_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "security_name" "text",
    "expense_ratio_generic" numeric,
    "historical_sharpe_3y" numeric,
    "historical_sortino_3y" numeric,
    "quarterly_standard_deviation_annualized_3y" numeric,
    "max_drawdown_3y" numeric,
    "one_month_total_return_nav" numeric,
    "three_month_total_return_nav" numeric,
    "ytd_total_return_nav" numeric,
    "one_year_total_return_nav" numeric,
    "annualized_three_year_total_return_nav" numeric,
    "annualized_five_year_total_return_nav" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fund_alternatives" OWNER TO "postgres";


ALTER TABLE "public"."fund_alternatives" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."fund_alternatives_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."holding_reviews" (
    "id" bigint NOT NULL,
    "review_log_id" bigint NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "security_id" "text" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "thesis_status" "text",
    "business_trend" "text",
    "valuation" "text",
    "conviction" "text",
    "action" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "original_thesis" "text",
    "thesis_change" "text",
    "evidence_for" "text",
    "evidence_against" "text",
    "current_conclusion" "text",
    "on_watchlist" boolean DEFAULT false NOT NULL,
    "watchlist_trigger" "text",
    "watchlist_reason" "text",
    "required_improvement" "text",
    "review_deadline" "text",
    "exit_trigger" "text",
    "annual_decision" "text",
    "annual_notes" "text",
    "conviction_tier" smallint,
    CONSTRAINT "holding_reviews_action_check" CHECK (("action" = ANY (ARRAY['add'::"text", 'hold'::"text", 'trim'::"text", 'exit'::"text", 'watchlist'::"text"]))),
    CONSTRAINT "holding_reviews_annual_decision_check" CHECK (("annual_decision" = ANY (ARRAY['keep'::"text", 'increase'::"text", 'reduce'::"text", 'replace'::"text", 'exit'::"text"]))),
    CONSTRAINT "holding_reviews_business_trend_check" CHECK (("business_trend" = ANY (ARRAY['improving'::"text", 'stable'::"text", 'deteriorating'::"text"]))),
    CONSTRAINT "holding_reviews_conviction_check" CHECK (("conviction" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "holding_reviews_conviction_tier_check" CHECK ((("conviction_tier" >= 1) AND ("conviction_tier" <= 4))),
    CONSTRAINT "holding_reviews_thesis_status_check" CHECK (("thesis_status" = ANY (ARRAY['intact'::"text", 'at_risk'::"text", 'broken'::"text"]))),
    CONSTRAINT "holding_reviews_valuation_check" CHECK (("valuation" = ANY (ARRAY['attractive'::"text", 'fair'::"text", 'expensive'::"text"]))),
    CONSTRAINT "holding_reviews_watchlist_trigger_check" CHECK (("watchlist_trigger" = ANY (ARRAY['fundamental_deterioration'::"text", 'margin_pressure'::"text", 'estimate_cuts'::"text", 'thesis_concern'::"text", 'valuation_issue'::"text", 'portfolio_issue'::"text"])))
);


ALTER TABLE "public"."holding_reviews" OWNER TO "postgres";


ALTER TABLE "public"."holding_reviews" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."holding_reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."holdings_change_log" (
    "id" bigint NOT NULL,
    "security_id" "text" NOT NULL,
    "change_type" "text" NOT NULL,
    "old_weight" numeric,
    "new_weight" numeric,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "portfolio_name" "text",
    CONSTRAINT "holdings_change_log_change_type_check" CHECK (("change_type" = ANY (ARRAY['add'::"text", 'remove'::"text", 'weight_change'::"text"])))
);


ALTER TABLE "public"."holdings_change_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."holdings_change_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."holdings_change_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."holdings_change_log_id_seq" OWNED BY "public"."holdings_change_log"."id";



CREATE TABLE IF NOT EXISTS "public"."ic_memos" (
    "id" bigint NOT NULL,
    "portfolio_name" "text",
    "security_id" "text" NOT NULL,
    "addition_id" bigint,
    "research_report_id" bigint,
    "risk_report_id" bigint,
    "proposed_weight" numeric,
    "pm_rationale" "text",
    "recommendation" "text",
    "rationale" "text",
    "decision" "text",
    "decided_by" "text",
    "decided_at" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "ic_memos_decision_check" CHECK (("decision" = ANY (ARRAY['approve'::"text", 'watchlist'::"text", 'reject'::"text"]))),
    CONSTRAINT "ic_memos_recommendation_check" CHECK (("recommendation" = ANY (ARRAY['approve'::"text", 'watchlist'::"text", 'reject'::"text"]))),
    CONSTRAINT "ic_memos_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_cio'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."ic_memos" OWNER TO "postgres";


ALTER TABLE "public"."ic_memos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ic_memos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."investment_policy_statements" (
    "id" bigint NOT NULL,
    "client_id" bigint NOT NULL,
    "risk_tolerance" "text" NOT NULL,
    "investment_objective" "text" NOT NULL,
    "time_horizon_years" integer,
    "liquidity_needs" "text",
    "return_target_pct" numeric(5,2),
    "equity_min_pct" numeric(5,2),
    "equity_max_pct" numeric(5,2),
    "fixed_income_min_pct" numeric(5,2),
    "fixed_income_max_pct" numeric(5,2),
    "cash_min_pct" numeric(5,2),
    "cash_max_pct" numeric(5,2),
    "notes" "text",
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "investment_policy_statements_investment_objective_check" CHECK (("investment_objective" = ANY (ARRAY['capital_preservation'::"text", 'income'::"text", 'balanced'::"text", 'growth'::"text", 'aggressive_growth'::"text"]))),
    CONSTRAINT "investment_policy_statements_liquidity_needs_check" CHECK (("liquidity_needs" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "investment_policy_statements_risk_tolerance_check" CHECK (("risk_tolerance" = ANY (ARRAY['conservative'::"text", 'moderately_conservative'::"text", 'moderate'::"text", 'moderately_aggressive'::"text", 'aggressive'::"text"])))
);


ALTER TABLE "public"."investment_policy_statements" OWNER TO "postgres";


ALTER TABLE "public"."investment_policy_statements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."investment_policy_statements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."model_portfolio_benchmarks" (
    "id" bigint NOT NULL,
    "security_id" "text" NOT NULL,
    "security_name" "text",
    "detailed_security_type" "text",
    "description" "text",
    "earliest_performance_date" "date",
    "assigned_benchmark_symbol" "text",
    "all_time_high_date" "date",
    "all_time_low_date" "date",
    "expense_ratio" numeric,
    "dividend_yield" numeric,
    "number_of_holdings" numeric,
    "turnover_ratio" numeric,
    "year_high_date" "date",
    "year_low_date" "date",
    "average_credit_quality_score" "text",
    "ytd_tax_cost_ratio" numeric,
    "tax_cost_ratio_since_inception" numeric,
    "one_month_total_return" numeric,
    "three_month_total_return" numeric,
    "ytd_total_return" numeric,
    "one_year_total_return" numeric,
    "annualized_three_year_total_return" numeric,
    "annualized_five_year_total_return" numeric,
    "annualized_ten_year_total_return" numeric,
    "annualized_daily_all_time_total_return" numeric,
    "historical_sharpe_1y" numeric,
    "historical_sharpe_3y" numeric,
    "historical_sharpe_5y" numeric,
    "historical_sharpe_all" numeric,
    "historical_sortino_1y" numeric,
    "historical_sortino_3y" numeric,
    "historical_sortino_5y" numeric,
    "historical_sortino_all" numeric,
    "monthly_standard_deviation_annualized_1y" numeric,
    "monthly_standard_deviation_annualized_3y" numeric,
    "monthly_standard_deviation_annualized_5y" numeric,
    "monthly_standard_deviation_annualized_all" numeric,
    "max_drawdown_1y" numeric,
    "max_drawdown_3y" numeric,
    "max_drawdown_5y" numeric,
    "max_drawdown_all" numeric,
    "historical_treynor_measure_1y" numeric,
    "historical_treynor_measure_3y" numeric,
    "historical_treynor_measure_5y" numeric,
    "historical_treynor_measure_all" numeric,
    "worst_return_three_month" numeric,
    "worst_return_six_month" numeric,
    "worst_return_one_year" numeric,
    "worst_return_three_year" numeric,
    "worst_return_five_year" numeric,
    "worst_return_all_time" numeric,
    "best_return_three_month" numeric,
    "best_return_six_month" numeric,
    "best_return_one_year" numeric,
    "best_return_three_year" numeric,
    "best_return_five_year" numeric,
    "best_return_all_time" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "investment_objective" "text",
    "quarterly_standard_deviation_annualized_3y" double precision,
    "quarterly_standard_deviation_annualized_5y" double precision,
    "north_america_total_exposure_generic" double precision,
    "latin_america_total_exposure_generic" double precision,
    "united_kingdom_total_exposure_generic" double precision,
    "europe_developed_total_exposure_generic" double precision,
    "europe_emerging_total_exposure" double precision,
    "africa_middle_east_total_exposure" double precision,
    "asia_developed_total_exposure_generic" double precision,
    "asia_emerging_total_exposure" double precision,
    "equity_stylebox_large_cap_value_exposure" double precision,
    "equity_stylebox_large_cap_blend_exposure" double precision,
    "equity_stylebox_large_cap_growth_exposure" double precision,
    "equity_stylebox_mid_cap_value_exposure" double precision,
    "equity_stylebox_mid_cap_blend_exposure" double precision,
    "equity_stylebox_mid_cap_growth_exposure" double precision,
    "equity_stylebox_small_cap_value_exposure" double precision,
    "equity_stylebox_small_cap_blend_exposure" double precision,
    "equity_stylebox_small_cap_growth_exposure" double precision,
    "basic_materials_exposure_generic" double precision,
    "communication_services_exposure_generic" double precision,
    "consumer_cyclical_exposure_generic" double precision,
    "consumer_defensive_exposure_generic" double precision,
    "energy_exposure_generic" double precision,
    "financial_services_exposure_generic" double precision,
    "healthcare_exposure_generic" double precision,
    "industrials_exposure_generic" double precision,
    "real_estate_exposure_generic" double precision,
    "technology_exposure_generic" double precision,
    "utilities_exposure_generic" double precision,
    "cash_net" double precision,
    "stock_net" double precision,
    "bond_net" double precision,
    "convertible_net" double precision,
    "preferred_net" double precision,
    "other_net" double precision,
    "aaa_bond_exposure_generic" double precision,
    "aa_bond_exposure_generic" double precision,
    "a_bond_exposure_generic" double precision,
    "bbb_bond_exposure_generic" double precision,
    "bb_bond_exposure_generic" double precision,
    "b_bond_exposure_generic" double precision,
    "below_b_bond_exposure_generic" double precision,
    "maturity_less_than_1_year_generic" double precision,
    "1_to_3_years_maturity_bond_exposure" double precision,
    "3_to_5_years_maturity_bond_exposure" double precision,
    "maturity_5_to_10_years_generic" double precision,
    "maturity_10_to_20_years_generic" double precision,
    "maturity_20_to_30_years_generic" double precision,
    "over_30_years_maturity_bond_exposure" double precision,
    "effective_duration" double precision,
    "effective_maturity" double precision,
    "yield_to_maturity" double precision,
    "current_yield" double precision,
    "average_coupon" double precision,
    "government_fixed_income_exposure_generic" double precision,
    "corporate_fixed_income_exposure_generic" double precision,
    "securitized_fixed_income_exposure_generic" double precision,
    "municipal_fixed_income_exposure_generic" double precision,
    "other_fixed_income_exposure_generic" double precision,
    "stock_long" double precision,
    "bond_long" double precision,
    "emerging_equity_exposure" double precision,
    "large_cap_equity_allocation_generic" double precision,
    "medium_cap_equity_allocation_generic" double precision,
    "small_cap_equity_allocation_generic" double precision,
    "investment_grade_bond_allocation_generic" double precision,
    "high_yield_bond_allocation_generic" double precision,
    "other_bond_exposure_generic" double precision,
    "developed_equity_exposure" double precision
);


ALTER TABLE "public"."model_portfolio_benchmarks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."model_portfolio_benchmarks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."model_portfolio_benchmarks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."model_portfolio_benchmarks_id_seq" OWNED BY "public"."model_portfolio_benchmarks"."id";



CREATE TABLE IF NOT EXISTS "public"."model_portfolio_data" (
    "id" bigint NOT NULL,
    "investment_objective" "text",
    "risk_profile" "text",
    "benchmark" "text",
    "description" "text",
    "large_cap_blend_lower_limit" numeric,
    "large_cap_blend_target" numeric,
    "large_cap_blend_upper_limit" numeric,
    "large_cap_value_lower_limit" numeric,
    "large_cap_value_target" numeric,
    "large_cap_value_upper_limit" numeric,
    "large_cap_growth_lower_limit" numeric,
    "large_cap_growth_target" numeric,
    "large_cap_growth_upper_limit" numeric,
    "us_mid_cap_lower_limit" numeric,
    "us_mid_cap_target" numeric,
    "us_mid_cap_upper_limit" numeric,
    "us_small_cap_lower_limit" numeric,
    "us_small_cap_target" numeric,
    "us_small_cap_upper_limit" numeric,
    "non_us_developed_lower_limit" numeric,
    "non_us_developed_target" numeric,
    "non_us_developed_upper_limit" numeric,
    "emerging_market_lower_limit" numeric,
    "emerging_market_target" numeric,
    "emerging_market_upper_limit" numeric,
    "ig_intermediate_fixed_income_lower_limit" numeric,
    "ig_intermediate_fixed_income_target" numeric,
    "ig_intermediate_fixed_income_upper_limit" numeric,
    "non_ig_fixed_income_lower_limit" numeric,
    "non_ig_fixed_income_target" numeric,
    "non_ig_fixed_income_upper_limit" numeric,
    "ig_short_fixed_income_lower_limit" numeric,
    "ig_short_fixed_income_target" numeric,
    "ig_short_fixed_income_upper_limit" numeric,
    "non_us_fixed_income_lower_limit" numeric,
    "non_us_fixed_income_target" numeric,
    "non_us_fixed_income_upper_limit" numeric,
    "multi_sector_fixed_income_lower_limit" numeric,
    "multi_sector_fixed_income_target" numeric,
    "multi_sector_fixed_income_upper_limit" numeric,
    "alternatives_lower_limit" numeric,
    "alternatives_target" numeric,
    "alternatives_upper_limit" numeric,
    "cash_lower_limit" numeric,
    "cash_target" numeric,
    "cash_upper_limit" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "equity_lower_limit" numeric DEFAULT 0,
    "equity_target" numeric DEFAULT 0,
    "equity_upper_limit" numeric DEFAULT 0,
    "fixed_income_lower_limit" numeric DEFAULT 0,
    "fixed_income_target" numeric DEFAULT 0,
    "fixed_income_upper_limit" numeric DEFAULT 0,
    "drift_percentage" numeric DEFAULT 20,
    "category_drift_percentage" numeric DEFAULT 20,
    "asset_class_drift_percentage" numeric DEFAULT 20,
    "category_allocation_mode" "text" DEFAULT 'absolute'::"text",
    "asset_class_allocation_mode" "text" DEFAULT 'relative'::"text",
    "model_category" "text" DEFAULT 'strategic'::"text",
    "name" "text",
    "rebalance_frequency" "text",
    "review_frequency" "text",
    "tier1_lower" numeric DEFAULT 5,
    "tier1_upper" numeric DEFAULT 7,
    "tier2_lower" numeric DEFAULT 3,
    "tier2_upper" numeric DEFAULT 5,
    "tier3_lower" numeric DEFAULT 1,
    "tier3_upper" numeric DEFAULT 3,
    "tier4_lower" numeric DEFAULT 0,
    "tier4_upper" numeric DEFAULT 1,
    "objective_statement" "text",
    "investment_philosophy" "text",
    "sector_allocations" "jsonb",
    "investment_strategy" "text",
    CONSTRAINT "model_portfolio_data_rebalance_frequency_check" CHECK (("rebalance_frequency" = ANY (ARRAY['Quarterly'::"text", 'Semi-Annual'::"text", 'Annual'::"text"]))),
    CONSTRAINT "model_portfolio_data_review_frequency_check" CHECK (("review_frequency" = ANY (ARRAY['Quarterly'::"text", 'Semi-Annual'::"text", 'Annual'::"text"])))
);


ALTER TABLE "public"."model_portfolio_data" OWNER TO "postgres";


ALTER TABLE "public"."model_portfolio_data" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."model_portfolio_data_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."peer_group_benchmarks" (
    "id" bigint NOT NULL,
    "peer_group_benchmark" "text",
    "peer_group_category" "text",
    "one_month_total_return" numeric,
    "three_month_total_return" numeric,
    "ytd_total_return" numeric,
    "annualized_daily_one_year_total_return" numeric,
    "annualized_daily_three_year_return" numeric,
    "annualized_daily_five_year_total_return" numeric,
    "historical_sharpe_1y" numeric,
    "historical_sharpe_3y" numeric,
    "historical_sharpe_5y" numeric,
    "historical_sortino_1y" numeric,
    "historical_sortino_3y" numeric,
    "historical_sortino_5y" numeric,
    "monthly_standard_deviation_annualized_1y" numeric,
    "quarterly_standard_deviation_annualized_3y" numeric,
    "quarterly_standard_deviation_annualized_5y" numeric,
    "eps_growth_1_yr_generic" numeric,
    "sales_growth_1_yr_generic" numeric,
    "consumer_cyclical_exposure" numeric,
    "financial_services_exposure" numeric,
    "basic_materials_exposure" numeric,
    "real_estate_exposure" numeric,
    "communication_services_exposure" numeric,
    "energy_exposure" numeric,
    "industrials_exposure" numeric,
    "technology_exposure" numeric,
    "consumer_defensive_exposure" numeric,
    "healthcare_exposure" numeric,
    "utilities_exposure" numeric,
    "aaa_bond_exposure_generic" numeric,
    "aa_bond_exposure_generic" numeric,
    "a_bond_exposure_generic" numeric,
    "bbb_bond_exposure_generic" numeric,
    "bb_bond_exposure_generic" numeric,
    "b_bond_exposure_generic" numeric,
    "below_b_bond_exposure_generic" numeric,
    "maturity_less_than_1_year_generic" numeric,
    "1_to_3_years_maturity_bond_exposure" numeric,
    "3_to_5_years_maturity_bond_exposure" numeric,
    "maturity_5_to_10_years_generic" numeric,
    "maturity_10_to_20_years_generic" numeric,
    "maturity_20_to_30_years_generic" numeric,
    "over_30_years_maturity_bond_exposure" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "peer_group_ticker" "text"
);


ALTER TABLE "public"."peer_group_benchmarks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."peer_group_benchmarks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."peer_group_benchmarks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."peer_group_benchmarks_id_seq" OWNED BY "public"."peer_group_benchmarks"."id";



CREATE TABLE IF NOT EXISTS "public"."portfolio" (
    "portfolio_strategy" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "security_id" "text",
    "name" "text" NOT NULL,
    "detailed_security_type" "text",
    "earliest_performance_date" "date",
    "all_time_high_date" "date",
    "all_time_low_date" "date",
    "expense_ratio" numeric,
    "dividend_yield" numeric,
    "number_of_holdings" integer,
    "turnover_ratio" numeric,
    "year_high_date" "date",
    "year_low_date" "date",
    "average_credit_quality_score" "text",
    "ytd_tax_cost_ratio" numeric,
    "tax_cost_ratio_since_inception" numeric,
    "one_month_total_return" numeric,
    "three_month_total_return" numeric,
    "ytd_total_return" numeric,
    "one_year_total_return" numeric,
    "annualized_three_year_total_return" numeric,
    "annualized_five_year_total_return" numeric,
    "annualized_ten_year_total_return" numeric,
    "annualized_daily_all_time_total_return" numeric,
    "historical_sharpe_1y" numeric,
    "historical_sharpe_3y" numeric,
    "historical_sharpe_5y" numeric,
    "historical_sharpe_all" numeric,
    "historical_sortino_1y" numeric,
    "historical_sortino_3y" numeric,
    "historical_sortino_5y" numeric,
    "historical_sortino_all" numeric,
    "monthly_standard_deviation_annualized_1y" numeric,
    "monthly_standard_deviation_annualized_3y" numeric,
    "monthly_standard_deviation_annualized_5y" numeric,
    "monthly_standard_deviation_annualized_all" numeric,
    "max_drawdown_1y" numeric,
    "max_drawdown_3y" numeric,
    "max_drawdown_5y" numeric,
    "max_drawdown_all" numeric,
    "market_alpha_12_month" numeric,
    "market_alpha_36_month" numeric,
    "market_alpha_60_month" numeric,
    "market_alpha_all" numeric,
    "quarterly_market_beta_12_month" numeric,
    "quarterly_market_beta_36_month" numeric,
    "quarterly_market_beta_60_month" numeric,
    "quarterly_market_beta_all" numeric,
    "historical_treynor_measure_1y" numeric,
    "historical_treynor_measure_3y" numeric,
    "historical_treynor_measure_5y" numeric,
    "historical_treynor_measure_all" numeric,
    "tracking_error_1y" numeric,
    "tracking_error_3y" numeric,
    "tracking_error_5y" numeric,
    "upside_downside_1y" numeric,
    "upside_downside_3y" numeric,
    "upside_downside_5y" numeric,
    "upside_downside_all" numeric,
    "north_america_total_exposure_generic" numeric,
    "latin_america_total_exposure_generic" numeric,
    "united_kingdom_total_exposure_generic" numeric,
    "europe_developed_total_exposure_generic" numeric,
    "europe_emerging_total_exposure" numeric,
    "africa_middle_east_total_exposure" numeric,
    "asia_developed_total_exposure_generic" numeric,
    "asia_emerging_total_exposure" numeric,
    "equity_stylebox_large_cap_value_exposure" numeric,
    "equity_stylebox_large_cap_blend_exposure" numeric,
    "equity_stylebox_large_cap_growth_exposure" numeric,
    "equity_stylebox_mid_cap_value_exposure" numeric,
    "equity_stylebox_mid_cap_blend_exposure" numeric,
    "equity_stylebox_mid_cap_growth_exposure" numeric,
    "equity_stylebox_small_cap_value_exposure" numeric,
    "equity_stylebox_small_cap_blend_exposure" numeric,
    "equity_stylebox_small_cap_growth_exposure" numeric,
    "basic_materials_exposure_generic" numeric,
    "communication_services_exposure_generic" numeric,
    "consumer_cyclical_exposure_generic" numeric,
    "consumer_defensive_exposure_generic" numeric,
    "energy_exposure_generic" numeric,
    "financial_services_exposure_generic" numeric,
    "healthcare_exposure_generic" numeric,
    "industrials_exposure_generic" numeric,
    "real_estate_exposure_generic" numeric,
    "technology_exposure_generic" numeric,
    "utilities_exposure_generic" numeric,
    "cash_net" numeric,
    "stock_net" numeric,
    "bond_net" numeric,
    "convertible_net" numeric,
    "preferred_net" numeric,
    "other_net" numeric,
    "aaa_bond_exposure_generic" numeric,
    "aa_bond_exposure_generic" numeric,
    "a_bond_exposure_generic" numeric,
    "bbb_bond_exposure_generic" numeric,
    "bb_bond_exposure_generic" numeric,
    "b_bond_exposure_generic" numeric,
    "below_b_bond_exposure_generic" numeric,
    "maturity_less_than_1_year_generic" numeric,
    "1_to_3_years_maturity_bond_exposure" numeric,
    "3_to_5_years_maturity_bond_exposure" numeric,
    "maturity_5_to_10_years_generic" numeric,
    "maturity_10_to_20_years_generic" numeric,
    "maturity_20_to_30_years_generic" numeric,
    "over_30_years_maturity_bond_exposure" numeric,
    "effective_duration" numeric,
    "effective_maturity" numeric,
    "yield_to_maturity" numeric,
    "current_yield" numeric,
    "average_coupon" numeric,
    "government_fixed_income_exposure_generic" numeric,
    "corporate_fixed_income_exposure_generic" numeric,
    "securitized_fixed_income_exposure_generic" numeric,
    "municipal_fixed_income_exposure_generic" numeric,
    "other_fixed_income_exposure_generic" numeric,
    "worst_return_three_month" numeric,
    "worst_return_six_month" numeric,
    "worst_return_one_year" numeric,
    "worst_return_three_year" numeric,
    "worst_return_five_year" numeric,
    "worst_return_all_time" numeric,
    "best_return_three_month" numeric,
    "best_return_six_month" numeric,
    "best_return_one_year" numeric,
    "best_return_three_year" numeric,
    "best_return_five_year" numeric,
    "best_return_all_time" numeric,
    "investment_objective" "text",
    "stock_long" numeric,
    "bond_long" numeric,
    "emerging_equity_exposure" numeric,
    "large_cap_equity_allocation_generic" numeric,
    "medium_cap_equity_allocation_generic" numeric,
    "small_cap_equity_allocation_generic" numeric,
    "investment_grade_bond_allocation_generic" numeric,
    "high_yield_bond_allocation_generic" numeric,
    "other_bond_exposure_generic" numeric,
    "developed_equity_exposure" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_rebalance_date" "date",
    "next_rebalance_date" "date",
    "objective_statement" "text",
    "investment_philosophy" "text"
);


ALTER TABLE "public"."portfolio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolio_allocations" (
    "id" bigint NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "effective_date" "date" NOT NULL,
    "security_id" "text" NOT NULL,
    "weight" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."portfolio_allocations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."portfolio_allocations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."portfolio_allocations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."portfolio_allocations_id_seq" OWNED BY "public"."portfolio_allocations"."id";



CREATE TABLE IF NOT EXISTS "public"."portfolio_model_map" (
    "security_id" "text" NOT NULL,
    "model_portfolio_id" integer NOT NULL
);


ALTER TABLE "public"."portfolio_model_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolio_review_log" (
    "id" bigint NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "text",
    "outcome" "text",
    "period" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cadence" "text",
    "review_date" timestamp with time zone,
    "next_review_at" timestamp with time zone,
    "checklist" "jsonb",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "portfolio_review_log_cadence_check" CHECK (("cadence" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "portfolio_review_log_outcome_check" CHECK (("outcome" = ANY (ARRAY['no_issues'::"text", 'flagged_for_action'::"text", 'placed_on_watchlist'::"text", 'recommended_sell'::"text"]))),
    CONSTRAINT "portfolio_review_log_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."portfolio_review_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."portfolio_review_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."portfolio_review_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."portfolio_review_log_id_seq" OWNED BY "public"."portfolio_review_log"."id";



CREATE TABLE IF NOT EXISTS "public"."portfolio_review_schedules" (
    "id" bigint NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "cadence" "text" NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "next_review_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "portfolio_review_schedules_cadence_check" CHECK (("cadence" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."portfolio_review_schedules" OWNER TO "postgres";


ALTER TABLE "public"."portfolio_review_schedules" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."portfolio_review_schedules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."positions" (
    "allocation_pct" numeric(6,2) NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_weight" numeric,
    "drift_threshold" numeric DEFAULT 5.0,
    "security_id" "text" NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "lower_limit" numeric,
    "upper_limit" numeric,
    CONSTRAINT "positions_allocation_pct_check" CHECK ((("allocation_pct" >= (0)::numeric) AND ("allocation_pct" <= (100)::numeric)))
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prospects" (
    "id" bigint NOT NULL,
    "security_id" "text" NOT NULL,
    "target_portfolio" "text",
    "target_price" numeric,
    "conviction" "text",
    "thesis" "text",
    "date_added" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prospects_conviction_chk" CHECK ((("conviction" IS NULL) OR ("conviction" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))))
);


ALTER TABLE "public"."prospects" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."prospects_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."prospects_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."prospects_id_seq" OWNED BY "public"."prospects"."id";



CREATE TABLE IF NOT EXISTS "public"."rebalance_log" (
    "id" bigint NOT NULL,
    "rebalanced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "positions_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portfolio_name" "text"
);


ALTER TABLE "public"."rebalance_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rebalance_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rebalance_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rebalance_log_id_seq" OWNED BY "public"."rebalance_log"."id";



CREATE TABLE IF NOT EXISTS "public"."research_reports" (
    "id" bigint NOT NULL,
    "security_id" "text" NOT NULL,
    "portfolio_name" "text",
    "addition_id" bigint,
    "author_role" "text" NOT NULL,
    "report_type" "text" DEFAULT 'initial'::"text" NOT NULL,
    "thesis" "text",
    "bull_case" "text",
    "bear_case" "text",
    "rating" "text",
    "conviction" "text",
    "fair_value" numeric,
    "current_price" numeric,
    "dcf_inputs" "jsonb",
    "valuation_summary" "jsonb",
    "sources" "jsonb",
    "status" "text" DEFAULT 'final'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "research_reports_conviction_check" CHECK (("conviction" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "research_reports_rating_check" CHECK (("rating" = ANY (ARRAY['buy'::"text", 'add'::"text", 'hold'::"text", 'trim'::"text", 'sell'::"text"]))),
    CONSTRAINT "research_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['initial'::"text", 'earnings_review'::"text", 'update'::"text"]))),
    CONSTRAINT "research_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."research_reports" OWNER TO "postgres";


ALTER TABLE "public"."research_reports" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."research_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."review_log" (
    "id" bigint NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "reviewed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ips_suitable" boolean,
    "outcome" "text",
    "security_id" "text" NOT NULL,
    "review_date" timestamp with time zone,
    "recommendation" "text",
    "conviction" "text",
    "price_at_review" numeric,
    "metrics_snapshot" "jsonb",
    "evidence_doc_path" "text",
    CONSTRAINT "review_log_conviction_chk" CHECK ((("conviction" IS NULL) OR ("conviction" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))),
    CONSTRAINT "review_log_outcome_check" CHECK (("outcome" = ANY (ARRAY['no_issues'::"text", 'flagged_for_action'::"text", 'placed_on_watchlist'::"text", 'recommended_sell'::"text"]))),
    CONSTRAINT "review_log_recommendation_chk" CHECK ((("recommendation" IS NULL) OR ("recommendation" = ANY (ARRAY['buy'::"text", 'add'::"text", 'hold'::"text", 'trim'::"text", 'sell'::"text"]))))
);


ALTER TABLE "public"."review_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."review_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."review_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."review_log_id_seq" OWNED BY "public"."review_log"."id";



CREATE TABLE IF NOT EXISTS "public"."review_schedules" (
    "id" bigint NOT NULL,
    "cadence" "text" NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "next_review_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "security_id" "text" NOT NULL,
    CONSTRAINT "review_schedules_cadence_check" CHECK (("cadence" = ANY (ARRAY['quarterly'::"text", 'semi_annual'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."review_schedules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."review_schedules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."review_schedules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."review_schedules_id_seq" OWNED BY "public"."review_schedules"."id";



CREATE TABLE IF NOT EXISTS "public"."risk_reports" (
    "id" bigint NOT NULL,
    "portfolio_name" "text",
    "security_id" "text",
    "addition_id" bigint,
    "scope" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "concentration" "jsonb",
    "factor_exposures" "jsonb",
    "mandate_checks" "jsonb",
    "verdict" "text" DEFAULT 'pass'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "risk_reports_scope_check" CHECK (("scope" = ANY (ARRAY['candidate'::"text", 'portfolio'::"text"]))),
    CONSTRAINT "risk_reports_verdict_check" CHECK (("verdict" = ANY (ARRAY['pass'::"text", 'warn'::"text", 'veto'::"text"])))
);


ALTER TABLE "public"."risk_reports" OWNER TO "postgres";


ALTER TABLE "public"."risk_reports" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."risk_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sector_benchmarks" (
    "id" bigint NOT NULL,
    "ticker" "text" NOT NULL,
    "sector_benchmarks" "text",
    "sector" "text",
    "etf_proxy" "text",
    "one_month_total_return" numeric,
    "three_month_total_return" numeric,
    "ytd_total_return" numeric,
    "annualized_daily_one_year_total_return" numeric,
    "annualized_daily_three_year_return" numeric,
    "annualized_daily_five_year_total_return" numeric,
    "historical_sharpe_1y" numeric,
    "historical_sharpe_3y" numeric,
    "historical_sharpe_5y" numeric,
    "historical_sortino_1y" numeric,
    "historical_sortino_3y" numeric,
    "historical_sortino_5y" numeric,
    "monthly_standard_deviation_annualized_1y" numeric,
    "quarterly_standard_deviation_annualized_3y" numeric,
    "quarterly_standard_deviation_annualized_5y" numeric,
    "eps_growth_1_yr_generic" numeric,
    "sales_growth_1_yr_generic" numeric,
    "consumer_cyclical_exposure" numeric,
    "financial_services_exposure" numeric,
    "basic_materials_exposure" numeric,
    "real_estate_exposure" numeric,
    "communication_services_exposure" numeric,
    "energy_exposure" numeric,
    "industrials_exposure" numeric,
    "technology_exposure" numeric,
    "consumer_defensive_exposure" numeric,
    "healthcare_exposure" numeric,
    "utilities_exposure" numeric,
    "aaa_bond_exposure_generic" numeric,
    "aa_bond_exposure_generic" numeric,
    "a_bond_exposure_generic" numeric,
    "bbb_bond_exposure_generic" numeric,
    "bb_bond_exposure_generic" numeric,
    "b_bond_exposure_generic" numeric,
    "below_b_bond_exposure_generic" numeric,
    "maturity_less_than_1_year_generic" numeric,
    "1_to_3_years_maturity_bond_exposure" numeric,
    "3_to_5_years_maturity_bond_exposure" numeric,
    "maturity_5_to_10_years_generic" numeric,
    "maturity_10_to_20_years_generic" numeric,
    "maturity_20_to_30_years_generic" numeric,
    "over_30_years_maturity_bond_exposure" numeric,
    "sales_growth_3_yr_generic" numeric,
    "eps_growth_3_yr_generic" numeric
);


ALTER TABLE "public"."sector_benchmarks" OWNER TO "postgres";


ALTER TABLE "public"."sector_benchmarks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sector_benchmarks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."securities2" (
    "id" bigint NOT NULL,
    "security_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "detailed_security_type" "text",
    "fund_family" "text",
    "security_name" "text",
    "broad_category_group" "text",
    "broad_asset_class" "text",
    "category_name" "text",
    "inception_date" "date",
    "expense_ratio_generic" numeric,
    "one_month_total_return_nav" numeric,
    "three_month_total_return_nav" numeric,
    "ytd_total_return_nav" numeric,
    "one_year_total_return_nav" numeric,
    "annualized_three_year_total_return_nav" numeric,
    "annualized_five_year_total_return_nav" numeric,
    "annualized_ten_year_total_return_nav" numeric,
    "category_one_month_total_return" numeric,
    "category_three_month_total_return" numeric,
    "category_ytd_total_return" numeric,
    "category_one_year_total_return" numeric,
    "category_three_year_total_return" numeric,
    "category_five_year_total_return" numeric,
    "category_ten_year_total_return" numeric,
    "category_group_style_ytd_total_return" numeric,
    "category_group_style_one_year_total_return" numeric,
    "category_group_style_three_year_total_return" numeric,
    "category_group_style_five_year_total_return" numeric,
    "category_group_style_ten_year_total_return" numeric,
    "alpha_1y_vs_category" numeric,
    "alpha_5y_vs_category" numeric,
    "enhanced_market_alpha_12_month" numeric,
    "enhanced_market_alpha_36_month" numeric,
    "enhanced_market_alpha_60_month" numeric,
    "beta_1y_vs_category" numeric,
    "beta_5y_vs_category" numeric,
    "enhanced_market_beta_12_month" numeric,
    "enhanced_market_beta_36_month" numeric,
    "historical_sharpe_1y" numeric,
    "historical_sharpe_5y" numeric,
    "monthly_standard_deviation_annualized_1y" numeric,
    "quarterly_standard_deviation_annualized_3y" numeric,
    "quarterly_standard_deviation_annualized_5y" numeric,
    "historical_sortino_1y" numeric,
    "historical_sortino_3y" numeric,
    "historical_sortino_5y" numeric,
    "rsquared_1y_vs_pg" numeric,
    "rsquared_3y_vs_pg" numeric,
    "rsquared_5y_vs_pg" numeric,
    "tracking_error_1y_vs_pg" numeric,
    "tracking_error_3y_vs_pg" numeric,
    "tracking_error_5y_vs_pg" numeric,
    "information_ratio_1y_vs_pg" numeric,
    "information_ratio_3y_vs_pg" numeric,
    "information_ratio_5y_vs_pg" numeric,
    "upside_downside_1y_vs_pg" numeric,
    "upside_downside_3y_vs_pg" numeric,
    "upside_downside_5y_vs_pg" numeric,
    "north_america_total_exposure_generic" numeric,
    "latin_america_total_exposure_generic" numeric,
    "united_kingdom_total_exposure_generic" numeric,
    "europe_developed_total_exposure_generic" numeric,
    "africa_middle_east_total_exposure" numeric,
    "asia_developed_total_exposure_generic" numeric,
    "asia_emerging_total_exposure" numeric,
    "equity_stylebox_large_cap_value_exposure" numeric,
    "equity_stylebox_large_cap_blend_exposure" numeric,
    "equity_stylebox_large_cap_growth_exposure" numeric,
    "equity_stylebox_mid_cap_value_exposure" numeric,
    "equity_stylebox_mid_cap_blend_exposure" numeric,
    "equity_stylebox_mid_cap_growth_exposure" numeric,
    "equity_stylebox_small_cap_value_exposure" numeric,
    "equity_stylebox_small_cap_blend_exposure" numeric,
    "equity_stylebox_small_cap_growth_exposure" numeric,
    "basic_materials_exposure_generic" numeric,
    "communication_services_exposure_generic" numeric,
    "consumer_cyclical_exposure_generic" numeric,
    "consumer_defensive_exposure_generic" numeric,
    "energy_exposure_generic" numeric,
    "financial_services_exposure_generic" numeric,
    "healthcare_exposure_generic" numeric,
    "industrials_exposure_generic" numeric,
    "real_estate_exposure_generic" numeric,
    "technology_exposure_generic" numeric,
    "utilities_exposure_generic" numeric,
    "fund_company_name" "text",
    "assets_under_management" numeric,
    "europe_emerging_total_exposure" numeric,
    "government_fixed_income_exposure_generic" numeric,
    "corporate_fixed_income_exposure_generic" numeric,
    "securitized_fixed_income_exposure_generic" numeric,
    "municipal_fixed_income_exposure_generic" numeric,
    "other_fixed_income_exposure_generic" numeric,
    "aaa_bond_exposure_generic" numeric,
    "aa_bond_exposure_generic" numeric,
    "a_bond_exposure_generic" numeric,
    "bbb_bond_exposure_generic" numeric,
    "bb_bond_exposure_generic" numeric,
    "b_bond_exposure_generic" numeric,
    "below_b_bond_exposure_generic" numeric,
    "maturity_less_than_1_year_generic" numeric,
    "1_to_3_years_maturity_bond_exposure" numeric,
    "3_to_5_years_maturity_bond_exposure" numeric,
    "maturity_5_to_10_years_generic" numeric,
    "maturity_10_to_20_years_generic" numeric,
    "maturity_20_to_30_years_generic" numeric,
    "over_30_years_maturity_bond_exposure" numeric,
    "effective_duration" numeric,
    "category_group_style_three_month_total_return" numeric,
    "number_of_holdings" numeric,
    "historical_sharpe_3y" numeric,
    "beta_3y_vs_category" numeric,
    "alpha_3y_vs_category" numeric,
    "max_manager_tenure" numeric,
    "max_drawdown_5y" numeric,
    "cash_net" numeric,
    "stock_net" numeric,
    "bond_net" numeric,
    "convertible_net" numeric,
    "preferred_net" numeric,
    "other_net" numeric,
    "max_drawdown_3y" numeric,
    "rsquared_1y_vs_category" numeric,
    "rsquared_3y_vs_category" numeric,
    "rsquared_5y_vs_category" numeric,
    "historical_treynor_measure_1y_vs_category" numeric,
    "historical_treynor_measure_3y_vs_category" numeric,
    "historical_treynor_measure_5y_vs_category" numeric,
    "historical_treynor_measure_1y_vs_pg" numeric,
    "historical_treynor_measure_3y_vs_pg" numeric,
    "historical_treynor_measure_5y_vs_pg" numeric,
    "tracking_error_1y_vs_category" numeric,
    "tracking_error_3y_vs_category" numeric,
    "tracking_error_5y_vs_category" numeric,
    "information_ratio_1y_vs_category" numeric,
    "information_ratio_3y_vs_category" numeric,
    "information_ratio_5y_vs_category" numeric,
    "upside_downside_1y_vs_category" numeric,
    "upside_downside_3y_vs_category" numeric,
    "upside_downside_5y_vs_category" numeric,
    "category_group_style_one_month_total_return" numeric,
    "morningstar_industry" "text",
    "dividend_growth_ttm" numeric(12,6),
    "forward_peg_ratio_1y" numeric(12,6),
    "morningstar_sector" "text",
    "last_earnings_release" "date",
    "next_earnings_release" "date",
    "investment_strategy" "text",
    "discount_or_premium_to_nav" numeric(12,6),
    "one_year_tax_cost_ratio_generic" numeric(12,6),
    "three_year_tax_cost_ratio_generic" numeric(12,6),
    "five_year_tax_cost_ratio_generic" numeric(12,6),
    "peer_group_name" "text",
    "long_description" "text",
    "equity_style_internal" "text",
    "max_drawdown_1y" numeric,
    "eps_growth_qoq" numeric,
    "annualized_daily_one_year_total_return" numeric,
    "annualized_daily_three_year_return" numeric,
    "annualized_daily_five_year_total_return" numeric,
    "annualized_daily_ten_year_total_return" numeric,
    "one_month_total_return" numeric,
    "three_month_total_return" numeric,
    "ytd_total_return" numeric,
    "eps_growth_1_yr_generic" numeric,
    "sales_growth_1_yr_generic" numeric,
    "deleted_at" timestamp with time zone,
    "category_index" "text",
    "one_month_total_return_rank_nav" integer,
    "three_month_total_return_rank_nav" integer,
    "ytd_total_return_rank_nav" integer,
    "one_year_total_return_rank_nav" integer,
    "three_year_total_return_rank_nav" integer,
    "five_year_total_return_rank_nav" integer,
    "ten_year_total_return_rank_nav" integer,
    "one_month_total_return_rank_category_size_nav" integer,
    "three_month_total_return_rank_category_size_nav" integer,
    "ytd_total_return_rank_category_size_nav" integer,
    "one_year_total_return_rank_category_size_nav" integer,
    "three_year_total_return_rank_category_size_nav" integer,
    "five_year_total_return_rank_category_size_nav" integer,
    "ten_year_total_return_rank_category_size_nav" integer,
    "one_month_total_return_peer_group_rank_nav" integer,
    "three_month_total_return_peer_group_rank_nav" integer,
    "ytd_total_return_peer_group_rank_nav" integer,
    "one_year_total_return_peer_group_rank_nav" integer,
    "three_year_total_return_peer_group_rank_nav" integer,
    "five_year_total_return_peer_group_rank_nav" integer,
    "ten_year_total_return_peer_group_rank_nav" integer,
    "one_month_total_return_peer_group_size_nav" integer,
    "three_month_total_return_peer_group_size_nav" integer,
    "ytd_total_return_peer_group_size_nav" integer,
    "one_year_total_return_peer_group_size_nav" integer,
    "three_year_total_return_peer_group_size_nav" integer,
    "five_year_total_return_peer_group_size_nav" integer,
    "ten_year_total_return_peer_group_size_nav" integer,
    "market_alpha_1y_vs_pg" numeric,
    "market_alpha_3y_vs_pg" numeric,
    "market_alpha_5y_vs_pg" numeric,
    "market_beta_1y_vs_pg" numeric,
    "market_beta_3y_vs_pg" numeric,
    "market_beta_5y_vs_pg" numeric,
    "peer_group_one_month_total_return" numeric,
    "peer_group_three_month_total_return" numeric,
    "peer_group_ytd_total_return" numeric,
    "peer_group_one_year_total_return" numeric,
    "peer_group_three_year_total_return" numeric,
    "peer_group_five_year_total_return" numeric,
    "peer_group_ten_year_total_return" numeric,
    "alpha_rank" integer,
    "alpha_peer_group_rank" integer,
    "expense_ratio_rank" integer,
    "expense_ratio_peer_group_rank" integer,
    "information_ratio_rank" integer,
    "information_ratio_peer_group_rank" integer,
    "sharpe_rank" integer,
    "sharpe_peer_group_rank" integer,
    "calmar_ratio_1y" numeric,
    "calmar_ratio_3y" numeric,
    "calmar_ratio_5y" numeric,
    "ycharts_benchmark_category" "text",
    "preferred_benchmark1_id" integer,
    "preferred_benchmark2_id" integer,
    "alt_1" "text",
    "alt_2" "text",
    "alt_3" "text",
    "thesis" "text"
);


ALTER TABLE "public"."securities2" OWNER TO "postgres";


COMMENT ON TABLE "public"."securities2" IS 'Extended fund metrics snapshot (securities); parallel to securities for migration or richer imports.';



CREATE SEQUENCE IF NOT EXISTS "public"."securities2_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."securities2_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."securities2_id_seq" OWNED BY "public"."securities2"."id";



CREATE TABLE IF NOT EXISTS "public"."security_additions" (
    "id" bigint NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "security_id" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "decision" "text",
    "content" "jsonb",
    "checklist" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "security_additions_decision_check" CHECK (("decision" = ANY (ARRAY['approve'::"text", 'watchlist'::"text", 'reject'::"text"]))),
    CONSTRAINT "security_additions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."security_additions" OWNER TO "postgres";


ALTER TABLE "public"."security_additions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."security_additions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."security_related_securities" (
    "id" bigint NOT NULL,
    "security_id" "text" NOT NULL,
    "related_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."security_related_securities" OWNER TO "postgres";


ALTER TABLE "public"."security_related_securities" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."security_related_securities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."substitutions" (
    "id" bigint NOT NULL,
    "at_risk_id" bigint NOT NULL,
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "rationale" "text",
    "reviewed_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "swapped_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "incumbent_security_id" "text" NOT NULL,
    "proposed_security_id" "text" NOT NULL,
    CONSTRAINT "substitutions_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'under_review'::"text", 'approved'::"text", 'swapped'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."substitutions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."substitutions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."substitutions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."substitutions_id_seq" OWNED BY "public"."substitutions"."id";



CREATE TABLE IF NOT EXISTS "public"."trade_suitability" (
    "id" bigint NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "security_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "rationale" "text",
    "old_weight" numeric(6,2),
    "new_weight" numeric(6,2),
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "thesis_status" "text",
    "business_trend" "text",
    "valuation" "text",
    "conviction" "text",
    "monitor_action" "text",
    CONSTRAINT "trade_suitability_action_check" CHECK (("action" = ANY (ARRAY['add'::"text", 'increase'::"text", 'decrease'::"text", 'replace'::"text", 'remove'::"text"]))),
    CONSTRAINT "trade_suitability_business_trend_check" CHECK ((("business_trend" IS NULL) OR ("business_trend" = ANY (ARRAY['improving'::"text", 'stable'::"text", 'deteriorating'::"text"])))),
    CONSTRAINT "trade_suitability_conviction_check" CHECK ((("conviction" IS NULL) OR ("conviction" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))),
    CONSTRAINT "trade_suitability_monitor_action_check" CHECK ((("monitor_action" IS NULL) OR ("monitor_action" = ANY (ARRAY['add'::"text", 'hold'::"text", 'trim'::"text", 'exit'::"text", 'watchlist'::"text"])))),
    CONSTRAINT "trade_suitability_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['new_position'::"text", 'rebalance_ips'::"text", 'client_request'::"text", 'sector_rotation'::"text", 'risk_reduction'::"text", 'tax_loss_harvest'::"text", 'other'::"text"]))),
    CONSTRAINT "trade_suitability_thesis_status_check" CHECK ((("thesis_status" IS NULL) OR ("thesis_status" = ANY (ARRAY['intact'::"text", 'at_risk'::"text", 'broken'::"text"])))),
    CONSTRAINT "trade_suitability_valuation_check" CHECK ((("valuation" IS NULL) OR ("valuation" = ANY (ARRAY['attractive'::"text", 'fair'::"text", 'expensive'::"text"]))))
);


ALTER TABLE "public"."trade_suitability" OWNER TO "postgres";


ALTER TABLE "public"."trade_suitability" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."trade_suitability_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."watchlist_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."watchlist_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."watchlist_id_seq" OWNED BY "public"."at_risk"."id";



ALTER TABLE ONLY "public"."action_item_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."action_item_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."action_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."action_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."alert_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."alert_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."alert_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."alert_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."at_risk" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."watchlist_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."category_benchmarks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."category_benchmarks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."client_portfolios" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."client_portfolios_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."clients" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."clients_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."communication_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."communication_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."compliance_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."compliance_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."firm_compliance_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."firm_compliance_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."holdings_change_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."holdings_change_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."model_portfolio_benchmarks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."model_portfolio_benchmarks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."peer_group_benchmarks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."peer_group_benchmarks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."portfolio_allocations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."portfolio_allocations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."portfolio_review_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."portfolio_review_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."prospects" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prospects_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rebalance_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rebalance_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."review_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."review_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."review_schedules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."review_schedules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."securities2" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."securities2_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."substitutions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."substitutions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."action_item_events"
    ADD CONSTRAINT "action_item_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_events"
    ADD CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_rules"
    ADD CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_benchmarks"
    ADD CONSTRAINT "category_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_portfolios"
    ADD CONSTRAINT "client_portfolios_client_id_portfolio_name_key" UNIQUE ("client_id", "portfolio_name");



ALTER TABLE ONLY "public"."client_portfolios"
    ADD CONSTRAINT "client_portfolios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."communication_log"
    ADD CONSTRAINT "communication_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_rules"
    ADD CONSTRAINT "compliance_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."firm_compliance_rules"
    ADD CONSTRAINT "firm_compliance_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."firm_compliance_rules"
    ADD CONSTRAINT "firm_compliance_rules_rule_type_key" UNIQUE ("rule_type");



ALTER TABLE ONLY "public"."fund_alternatives"
    ADD CONSTRAINT "fund_alternatives_parent_related_key" UNIQUE ("parent_security_id", "related_security_id");



ALTER TABLE ONLY "public"."fund_alternatives"
    ADD CONSTRAINT "fund_alternatives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."holding_reviews"
    ADD CONSTRAINT "holding_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."holding_reviews"
    ADD CONSTRAINT "holding_reviews_review_log_id_security_id_key" UNIQUE ("review_log_id", "security_id");



ALTER TABLE ONLY "public"."holdings_change_log"
    ADD CONSTRAINT "holdings_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ic_memos"
    ADD CONSTRAINT "ic_memos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."investment_policy_statements"
    ADD CONSTRAINT "investment_policy_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_portfolio_benchmarks"
    ADD CONSTRAINT "model_portfolio_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_portfolio_data"
    ADD CONSTRAINT "model_portfolio_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."peer_group_benchmarks"
    ADD CONSTRAINT "peer_group_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_allocations"
    ADD CONSTRAINT "portfolio_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_allocations"
    ADD CONSTRAINT "portfolio_allocations_portfolio_name_effective_date_securit_key" UNIQUE ("portfolio_name", "effective_date", "security_id");



ALTER TABLE ONLY "public"."portfolio_model_map"
    ADD CONSTRAINT "portfolio_model_map_pkey" PRIMARY KEY ("security_id");



ALTER TABLE ONLY "public"."portfolio"
    ADD CONSTRAINT "portfolio_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."portfolio_review_log"
    ADD CONSTRAINT "portfolio_review_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_review_schedules"
    ADD CONSTRAINT "portfolio_review_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_review_schedules"
    ADD CONSTRAINT "portfolio_review_schedules_portfolio_name_cadence_key" UNIQUE ("portfolio_name", "cadence");



ALTER TABLE ONLY "public"."portfolio"
    ADD CONSTRAINT "portfolio_security_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("portfolio_name", "security_id");



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rebalance_log"
    ADD CONSTRAINT "rebalance_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_reports"
    ADD CONSTRAINT "research_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_log"
    ADD CONSTRAINT "review_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_schedules"
    ADD CONSTRAINT "review_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_schedules"
    ADD CONSTRAINT "review_schedules_security_id_key" UNIQUE ("security_id");



ALTER TABLE ONLY "public"."risk_reports"
    ADD CONSTRAINT "risk_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sector_benchmarks"
    ADD CONSTRAINT "sector_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sector_benchmarks"
    ADD CONSTRAINT "sector_benchmarks_ticker_key" UNIQUE ("ticker");



ALTER TABLE ONLY "public"."securities2"
    ADD CONSTRAINT "securities2_pkey" PRIMARY KEY ("security_id");



ALTER TABLE ONLY "public"."securities2"
    ADD CONSTRAINT "securities2_security_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."security_additions"
    ADD CONSTRAINT "security_additions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_related_securities"
    ADD CONSTRAINT "security_related_securities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_related_securities"
    ADD CONSTRAINT "security_related_securities_security_id_related_id_key" UNIQUE ("security_id", "related_id");



ALTER TABLE ONLY "public"."substitutions"
    ADD CONSTRAINT "substitutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trade_suitability"
    ADD CONSTRAINT "trade_suitability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."at_risk"
    ADD CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id");



CREATE INDEX "action_item_events_item_idx" ON "public"."action_item_events" USING "btree" ("action_item_id", "created_at");



CREATE INDEX "action_items_due_date_idx" ON "public"."action_items" USING "btree" ("due_date");



CREATE INDEX "action_items_security_id_idx" ON "public"."action_items" USING "btree" ("security_id");



CREATE INDEX "action_items_status_idx" ON "public"."action_items" USING "btree" ("status");



CREATE INDEX "alert_events_security_id_idx" ON "public"."alert_events" USING "btree" ("security_id");



CREATE INDEX "alert_events_triggered_at_idx" ON "public"."alert_events" USING "btree" ("triggered_at" DESC);



CREATE INDEX "alert_events_unacked_idx" ON "public"."alert_events" USING "btree" ("acknowledged_at") WHERE ("acknowledged_at" IS NULL);



CREATE INDEX "alert_rules_security_id_idx" ON "public"."alert_rules" USING "btree" ("security_id");



CREATE INDEX "audit_log_table_idx" ON "public"."audit_log" USING "btree" ("table_name", "changed_at" DESC);



CREATE INDEX "audit_log_time_idx" ON "public"."audit_log" USING "btree" ("changed_at" DESC);



CREATE UNIQUE INDEX "category_benchmarks_ticker_category_key" ON "public"."category_benchmarks" USING "btree" ("category_ticker", "category");



CREATE INDEX "communication_log_client_id_idx" ON "public"."communication_log" USING "btree" ("client_id");



CREATE INDEX "communication_log_occurred_at_idx" ON "public"."communication_log" USING "btree" ("occurred_at" DESC);



CREATE INDEX "communication_log_security_id_idx" ON "public"."communication_log" USING "btree" ("security_id");



CREATE INDEX "holding_reviews_log_idx" ON "public"."holding_reviews" USING "btree" ("review_log_id");



CREATE INDEX "holding_reviews_portfolio_idx" ON "public"."holding_reviews" USING "btree" ("portfolio_name");



CREATE INDEX "holding_reviews_security_idx" ON "public"."holding_reviews" USING "btree" ("security_id");



CREATE INDEX "holdings_change_log_changed_at_idx" ON "public"."holdings_change_log" USING "btree" ("changed_at" DESC);



CREATE INDEX "ic_memos_portfolio_idx" ON "public"."ic_memos" USING "btree" ("portfolio_name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "ic_memos_status_idx" ON "public"."ic_memos" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_action_items_active" ON "public"."action_items" USING "btree" ("id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_clients_active" ON "public"."clients" USING "btree" ("id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_compliance_rules_active" ON "public"."compliance_rules" USING "btree" ("portfolio_name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_compliance_rules_portfolio_name" ON "public"."compliance_rules" USING "btree" ("portfolio_name");



CREATE INDEX "idx_holdings_change_log_portfolio_name" ON "public"."holdings_change_log" USING "btree" ("portfolio_name");



CREATE INDEX "idx_holdings_change_log_security_id" ON "public"."holdings_change_log" USING "btree" ("security_id");



CREATE INDEX "idx_positions_active" ON "public"."positions" USING "btree" ("portfolio_name", "security_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_positions_security_id" ON "public"."positions" USING "btree" ("security_id");



CREATE INDEX "idx_rebalance_log_portfolio_name" ON "public"."rebalance_log" USING "btree" ("portfolio_name");



CREATE INDEX "idx_securities2_active" ON "public"."securities2" USING "btree" ("security_id") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "model_portfolio_benchmarks_security_id_key" ON "public"."model_portfolio_benchmarks" USING "btree" ("security_id");



CREATE UNIQUE INDEX "peer_group_benchmarks_ticker_category_key" ON "public"."peer_group_benchmarks" USING "btree" ("peer_group_ticker", "peer_group_category");



CREATE INDEX "portfolio_allocations_lookup_idx" ON "public"."portfolio_allocations" USING "btree" ("portfolio_name", "effective_date");



CREATE UNIQUE INDEX "portfolio_review_log_one_draft" ON "public"."portfolio_review_log" USING "btree" ("portfolio_name", "cadence") WHERE ("status" = 'draft'::"text");



CREATE INDEX "portfolio_review_log_portfolio_name_idx" ON "public"."portfolio_review_log" USING "btree" ("portfolio_name");



CREATE INDEX "prospects_active_idx" ON "public"."prospects" USING "btree" ("date_added" DESC) WHERE ("removed_at" IS NULL);



CREATE INDEX "research_reports_portfolio_idx" ON "public"."research_reports" USING "btree" ("portfolio_name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "research_reports_security_idx" ON "public"."research_reports" USING "btree" ("security_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "review_log_reviewed_at_idx" ON "public"."review_log" USING "btree" ("reviewed_at" DESC);



CREATE INDEX "review_log_security_id_idx" ON "public"."review_log" USING "btree" ("security_id");



CREATE INDEX "review_schedules_next_review_idx" ON "public"."review_schedules" USING "btree" ("next_review_at");



CREATE INDEX "review_schedules_security_id_idx" ON "public"."review_schedules" USING "btree" ("security_id");



CREATE INDEX "risk_reports_portfolio_idx" ON "public"."risk_reports" USING "btree" ("portfolio_name") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "securities2_symbol_key" ON "public"."securities2" USING "btree" ("security_id");



CREATE UNIQUE INDEX "security_additions_one_draft" ON "public"."security_additions" USING "btree" ("portfolio_name", "security_id") WHERE ("status" = 'draft'::"text");



CREATE INDEX "security_additions_portfolio_idx" ON "public"."security_additions" USING "btree" ("portfolio_name");



CREATE INDEX "security_related_securities_security_id_idx" ON "public"."security_related_securities" USING "btree" ("security_id");



CREATE INDEX "substitutions_incumbent_security_id_idx" ON "public"."substitutions" USING "btree" ("incumbent_security_id");



CREATE INDEX "substitutions_proposed_security_id_idx" ON "public"."substitutions" USING "btree" ("proposed_security_id");



CREATE INDEX "trade_suitability_portfolio_name_recorded_at_idx" ON "public"."trade_suitability" USING "btree" ("portfolio_name", "recorded_at" DESC);



CREATE INDEX "watchlist_security_id_idx" ON "public"."at_risk" USING "btree" ("security_id");



CREATE OR REPLACE TRIGGER "action_items_updated_at" BEFORE UPDATE ON "public"."action_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "alert_rules_updated_at" BEFORE UPDATE ON "public"."alert_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "audit_action_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."action_items" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "audit_at_risk" AFTER INSERT OR DELETE OR UPDATE ON "public"."at_risk" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "audit_clients" AFTER INSERT OR DELETE OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "audit_compliance_rules" AFTER INSERT OR DELETE OR UPDATE ON "public"."compliance_rules" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "audit_firm_compliance_rules" AFTER INSERT OR DELETE OR UPDATE ON "public"."firm_compliance_rules" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "audit_portfolio_allocations" AFTER INSERT OR DELETE OR UPDATE ON "public"."portfolio_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "audit_prospects" AFTER INSERT OR DELETE OR UPDATE ON "public"."prospects" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "audit_review_schedules" AFTER INSERT OR DELETE OR UPDATE ON "public"."review_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "category_benchmarks_updated_at" BEFORE UPDATE ON "public"."category_benchmarks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "communication_log_updated_at" BEFORE UPDATE ON "public"."communication_log" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "compliance_rules_updated_at" BEFORE UPDATE ON "public"."compliance_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ips_updated_at" BEFORE UPDATE ON "public"."investment_policy_statements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "model_portfolio_benchmarks_updated_at" BEFORE UPDATE ON "public"."model_portfolio_benchmarks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "model_portfolio_data_updated_at" BEFORE UPDATE ON "public"."model_portfolio_data" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "peer_group_benchmarks_updated_at" BEFORE UPDATE ON "public"."peer_group_benchmarks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "portfolio_allocations_updated_at" BEFORE UPDATE ON "public"."portfolio_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "portfolio_set_updated_at" BEFORE UPDATE ON "public"."portfolio" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "positions_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."positions" FOR EACH ROW EXECUTE FUNCTION "public"."log_position_change"();



CREATE OR REPLACE TRIGGER "positions_set_updated_at" BEFORE UPDATE ON "public"."positions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "prospects_updated_at" BEFORE UPDATE ON "public"."prospects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "review_schedules_set_updated_at" BEFORE UPDATE ON "public"."review_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "securities2_updated_at" BEFORE UPDATE ON "public"."securities2" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "substitutions_updated_at" BEFORE UPDATE ON "public"."substitutions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ips_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."investment_policy_statements" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "trg_seed_portfolio_review_schedules" AFTER INSERT ON "public"."portfolio" FOR EACH ROW EXECUTE FUNCTION "public"."seed_portfolio_review_schedules"();



ALTER TABLE ONLY "public"."action_item_events"
    ADD CONSTRAINT "action_item_events_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "public"."action_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."alert_events"
    ADD CONSTRAINT "alert_events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_events"
    ADD CONSTRAINT "alert_events_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."alert_rules"
    ADD CONSTRAINT "alert_rules_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."client_portfolios"
    ADD CONSTRAINT "client_portfolios_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_portfolios"
    ADD CONSTRAINT "client_portfolios_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_model_portfolio_name_fkey" FOREIGN KEY ("model_portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_log"
    ADD CONSTRAINT "communication_log_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_log"
    ADD CONSTRAINT "communication_log_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_log"
    ADD CONSTRAINT "communication_log_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."compliance_rules"
    ADD CONSTRAINT "compliance_rules_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fund_alternatives"
    ADD CONSTRAINT "fund_alternatives_parent_security_id_fkey" FOREIGN KEY ("parent_security_id") REFERENCES "public"."securities2"("security_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holding_reviews"
    ADD CONSTRAINT "holding_reviews_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holding_reviews"
    ADD CONSTRAINT "holding_reviews_review_log_id_fkey" FOREIGN KEY ("review_log_id") REFERENCES "public"."portfolio_review_log"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holdings_change_log"
    ADD CONSTRAINT "holdings_change_log_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holdings_change_log"
    ADD CONSTRAINT "holdings_change_log_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ic_memos"
    ADD CONSTRAINT "ic_memos_addition_id_fkey" FOREIGN KEY ("addition_id") REFERENCES "public"."security_additions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ic_memos"
    ADD CONSTRAINT "ic_memos_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ic_memos"
    ADD CONSTRAINT "ic_memos_research_report_id_fkey" FOREIGN KEY ("research_report_id") REFERENCES "public"."research_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ic_memos"
    ADD CONSTRAINT "ic_memos_risk_report_id_fkey" FOREIGN KEY ("risk_report_id") REFERENCES "public"."risk_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."investment_policy_statements"
    ADD CONSTRAINT "investment_policy_statements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_review_schedules"
    ADD CONSTRAINT "portfolio_review_schedules_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."rebalance_log"
    ADD CONSTRAINT "rebalance_log_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_reports"
    ADD CONSTRAINT "research_reports_addition_id_fkey" FOREIGN KEY ("addition_id") REFERENCES "public"."security_additions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."research_reports"
    ADD CONSTRAINT "research_reports_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_log"
    ADD CONSTRAINT "review_log_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."review_schedules"
    ADD CONSTRAINT "review_schedules_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."risk_reports"
    ADD CONSTRAINT "risk_reports_addition_id_fkey" FOREIGN KEY ("addition_id") REFERENCES "public"."security_additions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."risk_reports"
    ADD CONSTRAINT "risk_reports_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."securities2"
    ADD CONSTRAINT "securities2_preferred_benchmark1_id_fkey" FOREIGN KEY ("preferred_benchmark1_id") REFERENCES "public"."category_benchmarks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."securities2"
    ADD CONSTRAINT "securities2_preferred_benchmark2_id_fkey" FOREIGN KEY ("preferred_benchmark2_id") REFERENCES "public"."sector_benchmarks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_additions"
    ADD CONSTRAINT "security_additions_portfolio_name_fkey" FOREIGN KEY ("portfolio_name") REFERENCES "public"."portfolio"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_related_securities"
    ADD CONSTRAINT "security_related_securities_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."substitutions"
    ADD CONSTRAINT "substitutions_at_risk_id_fkey" FOREIGN KEY ("at_risk_id") REFERENCES "public"."at_risk"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."substitutions"
    ADD CONSTRAINT "substitutions_incumbent_security_id_fkey" FOREIGN KEY ("incumbent_security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."substitutions"
    ADD CONSTRAINT "substitutions_proposed_security_id_fkey" FOREIGN KEY ("proposed_security_id") REFERENCES "public"."securities2"("security_id");



ALTER TABLE ONLY "public"."at_risk"
    ADD CONSTRAINT "watchlist_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "public"."securities2"("security_id");



CREATE POLICY "Allow delete action_items" ON "public"."action_items" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete alert_events" ON "public"."alert_events" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete alert_rules" ON "public"."alert_rules" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete at_risk" ON "public"."at_risk" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete category_benchmarks" ON "public"."category_benchmarks" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete client_portfolios" ON "public"."client_portfolios" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete clients" ON "public"."clients" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete communication_log" ON "public"."communication_log" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete compliance_rules" ON "public"."compliance_rules" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete firm_compliance_rules" ON "public"."firm_compliance_rules" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete holdings_change_log" ON "public"."holdings_change_log" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete investment_policy_statements" ON "public"."investment_policy_statements" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete model_portfolio_benchmarks" ON "public"."model_portfolio_benchmarks" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete model_portfolio_data" ON "public"."model_portfolio_data" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete peer_group_benchmarks" ON "public"."peer_group_benchmarks" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete portfolio" ON "public"."portfolio" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete portfolio_allocations" ON "public"."portfolio_allocations" FOR DELETE USING (true);



CREATE POLICY "Allow delete portfolio_model_map" ON "public"."portfolio_model_map" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete portfolio_review_log" ON "public"."portfolio_review_log" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete positions" ON "public"."positions" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete prospects" ON "public"."prospects" FOR DELETE USING (true);



CREATE POLICY "Allow delete rebalance_log" ON "public"."rebalance_log" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete review_log" ON "public"."review_log" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete review_schedules" ON "public"."review_schedules" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete sector_benchmarks" ON "public"."sector_benchmarks" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete securities2" ON "public"."securities2" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete security_related_securities" ON "public"."security_related_securities" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete substitutions" ON "public"."substitutions" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow delete trade_suitability" ON "public"."trade_suitability" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow insert action_items" ON "public"."action_items" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert alert_events" ON "public"."alert_events" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert alert_rules" ON "public"."alert_rules" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert at_risk" ON "public"."at_risk" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert category_benchmarks" ON "public"."category_benchmarks" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert client_portfolios" ON "public"."client_portfolios" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert clients" ON "public"."clients" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert communication_log" ON "public"."communication_log" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert compliance_rules" ON "public"."compliance_rules" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert firm_compliance_rules" ON "public"."firm_compliance_rules" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert holdings_change_log" ON "public"."holdings_change_log" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert investment_policy_statements" ON "public"."investment_policy_statements" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert model_portfolio_benchmarks" ON "public"."model_portfolio_benchmarks" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert model_portfolio_data" ON "public"."model_portfolio_data" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert peer_group_benchmarks" ON "public"."peer_group_benchmarks" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert portfolio" ON "public"."portfolio" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert portfolio_allocations" ON "public"."portfolio_allocations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow insert portfolio_model_map" ON "public"."portfolio_model_map" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert portfolio_review_log" ON "public"."portfolio_review_log" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert positions" ON "public"."positions" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert prospects" ON "public"."prospects" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow insert rebalance_log" ON "public"."rebalance_log" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert review_log" ON "public"."review_log" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert review_schedules" ON "public"."review_schedules" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert sector_benchmarks" ON "public"."sector_benchmarks" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert securities2" ON "public"."securities2" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert security_related_securities" ON "public"."security_related_securities" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert substitutions" ON "public"."substitutions" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert trade_suitability" ON "public"."trade_suitability" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow read action_items" ON "public"."action_items" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read alert_events" ON "public"."alert_events" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read alert_rules" ON "public"."alert_rules" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read at_risk" ON "public"."at_risk" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read category_benchmarks" ON "public"."category_benchmarks" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read client_portfolios" ON "public"."client_portfolios" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read clients" ON "public"."clients" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read communication_log" ON "public"."communication_log" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read compliance_rules" ON "public"."compliance_rules" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read firm_compliance_rules" ON "public"."firm_compliance_rules" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read holdings_change_log" ON "public"."holdings_change_log" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read investment_policy_statements" ON "public"."investment_policy_statements" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read model_portfolio_benchmarks" ON "public"."model_portfolio_benchmarks" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read model_portfolio_data" ON "public"."model_portfolio_data" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read peer_group_benchmarks" ON "public"."peer_group_benchmarks" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read portfolio" ON "public"."portfolio" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read portfolio_allocations" ON "public"."portfolio_allocations" FOR SELECT USING (true);



CREATE POLICY "Allow read portfolio_model_map" ON "public"."portfolio_model_map" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read portfolio_review_log" ON "public"."portfolio_review_log" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read positions" ON "public"."positions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read prospects" ON "public"."prospects" FOR SELECT USING (true);



CREATE POLICY "Allow read rebalance_log" ON "public"."rebalance_log" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read review_log" ON "public"."review_log" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read review_schedules" ON "public"."review_schedules" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read sector_benchmarks" ON "public"."sector_benchmarks" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read securities2" ON "public"."securities2" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read security_related_securities" ON "public"."security_related_securities" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read substitutions" ON "public"."substitutions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow read trade_suitability" ON "public"."trade_suitability" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update action_items" ON "public"."action_items" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update alert_events" ON "public"."alert_events" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update alert_rules" ON "public"."alert_rules" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update at_risk" ON "public"."at_risk" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update category_benchmarks" ON "public"."category_benchmarks" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update client_portfolios" ON "public"."client_portfolios" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update clients" ON "public"."clients" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update communication_log" ON "public"."communication_log" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update compliance_rules" ON "public"."compliance_rules" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update firm_compliance_rules" ON "public"."firm_compliance_rules" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update holdings_change_log" ON "public"."holdings_change_log" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update investment_policy_statements" ON "public"."investment_policy_statements" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update model_portfolio_benchmarks" ON "public"."model_portfolio_benchmarks" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update model_portfolio_data" ON "public"."model_portfolio_data" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update peer_group_benchmarks" ON "public"."peer_group_benchmarks" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update portfolio" ON "public"."portfolio" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update portfolio_allocations" ON "public"."portfolio_allocations" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow update portfolio_model_map" ON "public"."portfolio_model_map" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update portfolio_review_log" ON "public"."portfolio_review_log" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update positions" ON "public"."positions" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update prospects" ON "public"."prospects" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow update rebalance_log" ON "public"."rebalance_log" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update review_schedules" ON "public"."review_schedules" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update sector_benchmarks" ON "public"."sector_benchmarks" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update securities2" ON "public"."securities2" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update security_related_securities" ON "public"."security_related_securities" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update substitutions" ON "public"."substitutions" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow update trade_suitability" ON "public"."trade_suitability" FOR UPDATE TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."action_item_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."action_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow all action_item_events" ON "public"."action_item_events" USING (true) WITH CHECK (true);



CREATE POLICY "allow all audit_log" ON "public"."audit_log" USING (true) WITH CHECK (true);



CREATE POLICY "anon rw" ON "public"."ic_memos" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon rw" ON "public"."research_reports" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon rw" ON "public"."risk_reports" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_all_holding_reviews" ON "public"."holding_reviews" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_all_portfolio_review_schedules" ON "public"."portfolio_review_schedules" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_all_security_additions" ON "public"."security_additions" TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."at_risk" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_insert" ON "public"."audit_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "audit_log_select" ON "public"."audit_log" FOR SELECT USING (true);



CREATE POLICY "auth rw" ON "public"."ic_memos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth rw" ON "public"."research_reports" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth rw" ON "public"."risk_reports" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."category_benchmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_portfolios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."communication_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compliance_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."firm_compliance_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fund_alternatives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fund_alternatives anon all" ON "public"."fund_alternatives" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "fund_alternatives auth all" ON "public"."fund_alternatives" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."holding_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."holdings_change_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ic_memos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."investment_policy_statements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_portfolio_benchmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_portfolio_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."peer_group_benchmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio_model_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio_review_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio_review_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prospects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rebalance_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."risk_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sector_benchmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."securities2" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_additions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_related_securities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."substitutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trade_suitability" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."log_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_position_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_position_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_position_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_portfolio_review_schedules"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_portfolio_review_schedules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_portfolio_review_schedules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."action_item_events" TO "anon";
GRANT ALL ON TABLE "public"."action_item_events" TO "authenticated";
GRANT ALL ON TABLE "public"."action_item_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."action_item_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."action_item_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."action_item_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."action_items" TO "anon";
GRANT ALL ON TABLE "public"."action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."action_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."action_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."action_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."action_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."alert_events" TO "anon";
GRANT ALL ON TABLE "public"."alert_events" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."alert_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."alert_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."alert_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."alert_rules" TO "anon";
GRANT ALL ON TABLE "public"."alert_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."alert_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."alert_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."alert_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."at_risk" TO "anon";
GRANT ALL ON TABLE "public"."at_risk" TO "authenticated";
GRANT ALL ON TABLE "public"."at_risk" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."category_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."category_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."category_benchmarks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."category_benchmarks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."category_benchmarks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."category_benchmarks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_portfolios" TO "anon";
GRANT ALL ON TABLE "public"."client_portfolios" TO "authenticated";
GRANT ALL ON TABLE "public"."client_portfolios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."client_portfolios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."client_portfolios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."client_portfolios_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clients_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clients_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clients_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."communication_log" TO "anon";
GRANT ALL ON TABLE "public"."communication_log" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."communication_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."communication_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."communication_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_rules" TO "anon";
GRANT ALL ON TABLE "public"."compliance_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."compliance_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."compliance_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."compliance_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."firm_compliance_rules" TO "anon";
GRANT ALL ON TABLE "public"."firm_compliance_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."firm_compliance_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."firm_compliance_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."firm_compliance_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."firm_compliance_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fund_alternatives" TO "anon";
GRANT ALL ON TABLE "public"."fund_alternatives" TO "authenticated";
GRANT ALL ON TABLE "public"."fund_alternatives" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fund_alternatives_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fund_alternatives_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fund_alternatives_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."holding_reviews" TO "anon";
GRANT ALL ON TABLE "public"."holding_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."holding_reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."holding_reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."holding_reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."holding_reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."holdings_change_log" TO "anon";
GRANT ALL ON TABLE "public"."holdings_change_log" TO "authenticated";
GRANT ALL ON TABLE "public"."holdings_change_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."holdings_change_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."holdings_change_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."holdings_change_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ic_memos" TO "anon";
GRANT ALL ON TABLE "public"."ic_memos" TO "authenticated";
GRANT ALL ON TABLE "public"."ic_memos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ic_memos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ic_memos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ic_memos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."investment_policy_statements" TO "anon";
GRANT ALL ON TABLE "public"."investment_policy_statements" TO "authenticated";
GRANT ALL ON TABLE "public"."investment_policy_statements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."investment_policy_statements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."investment_policy_statements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."investment_policy_statements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."model_portfolio_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."model_portfolio_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."model_portfolio_benchmarks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."model_portfolio_benchmarks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."model_portfolio_benchmarks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."model_portfolio_benchmarks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."model_portfolio_data" TO "anon";
GRANT ALL ON TABLE "public"."model_portfolio_data" TO "authenticated";
GRANT ALL ON TABLE "public"."model_portfolio_data" TO "service_role";



GRANT ALL ON SEQUENCE "public"."model_portfolio_data_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."model_portfolio_data_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."model_portfolio_data_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."peer_group_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."peer_group_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."peer_group_benchmarks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."peer_group_benchmarks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."peer_group_benchmarks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."peer_group_benchmarks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio" TO "anon";
GRANT ALL ON TABLE "public"."portfolio" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_allocations" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_allocations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."portfolio_allocations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."portfolio_allocations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."portfolio_allocations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_model_map" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_model_map" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_model_map" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_review_log" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_review_log" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_review_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."portfolio_review_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."portfolio_review_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."portfolio_review_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_review_schedules" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_review_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_review_schedules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."portfolio_review_schedules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."portfolio_review_schedules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."portfolio_review_schedules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."prospects" TO "anon";
GRANT ALL ON TABLE "public"."prospects" TO "authenticated";
GRANT ALL ON TABLE "public"."prospects" TO "service_role";



GRANT ALL ON SEQUENCE "public"."prospects_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."prospects_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prospects_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rebalance_log" TO "anon";
GRANT ALL ON TABLE "public"."rebalance_log" TO "authenticated";
GRANT ALL ON TABLE "public"."rebalance_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rebalance_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rebalance_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rebalance_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."research_reports" TO "anon";
GRANT ALL ON TABLE "public"."research_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."research_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."research_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."research_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."research_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."review_log" TO "anon";
GRANT ALL ON TABLE "public"."review_log" TO "authenticated";
GRANT ALL ON TABLE "public"."review_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."review_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."review_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."review_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."review_schedules" TO "anon";
GRANT ALL ON TABLE "public"."review_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."review_schedules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."review_schedules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."review_schedules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."review_schedules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."risk_reports" TO "anon";
GRANT ALL ON TABLE "public"."risk_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."risk_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."risk_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."risk_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."risk_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sector_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."sector_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."sector_benchmarks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sector_benchmarks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sector_benchmarks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sector_benchmarks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."securities2" TO "anon";
GRANT ALL ON TABLE "public"."securities2" TO "authenticated";
GRANT ALL ON TABLE "public"."securities2" TO "service_role";



GRANT ALL ON SEQUENCE "public"."securities2_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."securities2_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."securities2_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."security_additions" TO "anon";
GRANT ALL ON TABLE "public"."security_additions" TO "authenticated";
GRANT ALL ON TABLE "public"."security_additions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."security_additions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."security_additions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."security_additions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."security_related_securities" TO "anon";
GRANT ALL ON TABLE "public"."security_related_securities" TO "authenticated";
GRANT ALL ON TABLE "public"."security_related_securities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."security_related_securities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."security_related_securities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."security_related_securities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."substitutions" TO "anon";
GRANT ALL ON TABLE "public"."substitutions" TO "authenticated";
GRANT ALL ON TABLE "public"."substitutions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."substitutions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."substitutions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."substitutions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."trade_suitability" TO "anon";
GRANT ALL ON TABLE "public"."trade_suitability" TO "authenticated";
GRANT ALL ON TABLE "public"."trade_suitability" TO "service_role";



GRANT ALL ON SEQUENCE "public"."trade_suitability_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."trade_suitability_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."trade_suitability_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."watchlist_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."watchlist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."watchlist_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































