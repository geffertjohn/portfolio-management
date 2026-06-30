export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      action_item_events: {
        Row: {
          action_item_id: number | null
          created_at: string | null
          from_status: string | null
          id: number
          notes: string | null
          to_status: string
        }
        Insert: {
          action_item_id?: number | null
          created_at?: string | null
          from_status?: string | null
          id?: number
          notes?: string | null
          to_status: string
        }
        Update: {
          action_item_id?: number | null
          created_at?: string | null
          from_status?: string | null
          id?: number
          notes?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_item_events_action_item_id_fkey"
            columns: ["action_item_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
        ]
      }
      action_items: {
        Row: {
          closed_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: number
          portfolio_name: string | null
          priority: string
          resolution_notes: string | null
          security_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: number
          portfolio_name?: string | null
          priority?: string
          resolution_notes?: string | null
          security_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: number
          portfolio_name?: string | null
          priority?: string
          resolution_notes?: string | null
          security_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "action_items_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      alert_events: {
        Row: {
          acknowledged_at: string | null
          actual_value: number | null
          id: number
          metric_field: string
          rule_id: number
          security_id: string
          threshold_value: number
          triggered_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          actual_value?: number | null
          id?: number
          metric_field: string
          rule_id: number
          security_id: string
          threshold_value: number
          triggered_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          actual_value?: number | null
          id?: number
          metric_field?: string
          rule_id?: number
          security_id?: string
          threshold_value?: number
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          metric_field: string
          operator: string
          security_id: string | null
          threshold_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          metric_field: string
          operator: string
          security_id?: string | null
          threshold_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          metric_field?: string
          operator?: string
          security_id?: string | null
          threshold_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      at_risk: {
        Row: {
          date_added: string
          id: number
          metrics: string[]
          notes: string | null
          removal_date: string | null
          removed_at: string | null
          security_id: string
        }
        Insert: {
          date_added?: string
          id?: number
          metrics?: string[]
          notes?: string | null
          removal_date?: string | null
          removed_at?: string | null
          security_id: string
        }
        Update: {
          date_added?: string
          id?: number
          metrics?: string[]
          notes?: string | null
          removal_date?: string | null
          removed_at?: string | null
          security_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: number
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id: number
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: number
          table_name?: string
        }
        Relationships: []
      }
      category_benchmarks: {
        Row: {
          "1_to_3_years_maturity_bond_exposure": number | null
          "3_to_5_years_maturity_bond_exposure": number | null
          a_bond_exposure_generic: number | null
          aa_bond_exposure_generic: number | null
          aaa_bond_exposure_generic: number | null
          annualized_daily_five_year_total_return: number | null
          annualized_daily_one_year_total_return: number | null
          annualized_daily_three_year_return: number | null
          b_bond_exposure_generic: number | null
          basic_materials_exposure: number | null
          bb_bond_exposure_generic: number | null
          bbb_bond_exposure_generic: number | null
          below_b_bond_exposure_generic: number | null
          calmar_ratio_1y: number | null
          calmar_ratio_3y: number | null
          calmar_ratio_5y: number | null
          category: string | null
          category_benchmark: string | null
          category_ticker: string
          communication_services_exposure: number | null
          consumer_cyclical_exposure: number | null
          consumer_defensive_exposure: number | null
          energy_exposure: number | null
          eps_growth_1_yr_generic: number | null
          eps_growth_3_yr_generic: number | null
          etf_proxy: string | null
          financial_services_exposure: number | null
          healthcare_exposure: number | null
          historical_sharpe_1y: number | null
          historical_sharpe_3y: number | null
          historical_sharpe_5y: number | null
          historical_sortino_1y: number | null
          historical_sortino_3y: number | null
          historical_sortino_5y: number | null
          id: number
          industrials_exposure: number | null
          maturity_10_to_20_years_generic: number | null
          maturity_20_to_30_years_generic: number | null
          maturity_5_to_10_years_generic: number | null
          maturity_less_than_1_year_generic: number | null
          monthly_standard_deviation_annualized_1y: number | null
          one_month_total_return: number | null
          over_30_years_maturity_bond_exposure: number | null
          quarterly_standard_deviation_annualized_3y: number | null
          quarterly_standard_deviation_annualized_5y: number | null
          real_estate_exposure: number | null
          sales_growth_1_yr_generic: number | null
          sales_growth_3_yr_generic: number | null
          technology_exposure: number | null
          three_month_total_return: number | null
          updated_at: string | null
          utilities_exposure: number | null
          ytd_total_return: number | null
        }
        Insert: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          calmar_ratio_1y?: number | null
          calmar_ratio_3y?: number | null
          calmar_ratio_5y?: number | null
          category?: string | null
          category_benchmark?: string | null
          category_ticker: string
          communication_services_exposure?: number | null
          consumer_cyclical_exposure?: number | null
          consumer_defensive_exposure?: number | null
          energy_exposure?: number | null
          eps_growth_1_yr_generic?: number | null
          eps_growth_3_yr_generic?: number | null
          etf_proxy?: string | null
          financial_services_exposure?: number | null
          healthcare_exposure?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          id?: number
          industrials_exposure?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          one_month_total_return?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure?: number | null
          sales_growth_1_yr_generic?: number | null
          sales_growth_3_yr_generic?: number | null
          technology_exposure?: number | null
          three_month_total_return?: number | null
          updated_at?: string | null
          utilities_exposure?: number | null
          ytd_total_return?: number | null
        }
        Update: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          calmar_ratio_1y?: number | null
          calmar_ratio_3y?: number | null
          calmar_ratio_5y?: number | null
          category?: string | null
          category_benchmark?: string | null
          category_ticker?: string
          communication_services_exposure?: number | null
          consumer_cyclical_exposure?: number | null
          consumer_defensive_exposure?: number | null
          energy_exposure?: number | null
          eps_growth_1_yr_generic?: number | null
          eps_growth_3_yr_generic?: number | null
          etf_proxy?: string | null
          financial_services_exposure?: number | null
          healthcare_exposure?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          id?: number
          industrials_exposure?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          one_month_total_return?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure?: number | null
          sales_growth_1_yr_generic?: number | null
          sales_growth_3_yr_generic?: number | null
          technology_exposure?: number | null
          three_month_total_return?: number | null
          updated_at?: string | null
          utilities_exposure?: number | null
          ytd_total_return?: number | null
        }
        Relationships: []
      }
      client_portfolios: {
        Row: {
          client_id: number
          created_at: string
          id: number
          portfolio_name: string | null
        }
        Insert: {
          client_id: number
          created_at?: string
          id?: number
          portfolio_name?: string | null
        }
        Update: {
          client_id?: number
          created_at?: string
          id?: number
          portfolio_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portfolios_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portfolios_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          household_name: string | null
          id: number
          model_portfolio_name: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          household_name?: string | null
          id?: number
          model_portfolio_name?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          household_name?: string | null
          id?: number
          model_portfolio_name?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_model_portfolio_name_fkey"
            columns: ["model_portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
        ]
      }
      communication_log: {
        Row: {
          client_id: number | null
          created_at: string
          follow_up_due: string | null
          follow_up_notes: string | null
          id: number
          notes: string | null
          occurred_at: string
          portfolio_name: string | null
          security_id: string | null
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          client_id?: number | null
          created_at?: string
          follow_up_due?: string | null
          follow_up_notes?: string | null
          id?: number
          notes?: string | null
          occurred_at?: string
          portfolio_name?: string | null
          security_id?: string | null
          subject: string
          type: string
          updated_at?: string
        }
        Update: {
          client_id?: number | null
          created_at?: string
          follow_up_due?: string | null
          follow_up_notes?: string | null
          id?: number
          notes?: string | null
          occurred_at?: string
          portfolio_name?: string | null
          security_id?: string | null
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "communication_log_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      compliance_rules: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: number
          is_active: boolean
          label: string
          portfolio_name: string | null
          rule_type: string
          threshold_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          is_active?: boolean
          label: string
          portfolio_name?: string | null
          rule_type: string
          threshold_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          is_active?: boolean
          label?: string
          portfolio_name?: string | null
          rule_type?: string
          threshold_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_rules_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
        ]
      }
      firm_compliance_rules: {
        Row: {
          id: number
          is_active: boolean
          label: string
          rule_type: string
          threshold_value: number
          updated_at: string
        }
        Insert: {
          id?: number
          is_active?: boolean
          label: string
          rule_type: string
          threshold_value: number
          updated_at?: string
        }
        Update: {
          id?: number
          is_active?: boolean
          label?: string
          rule_type?: string
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      fund_alternatives: {
        Row: {
          annualized_five_year_total_return_nav: number | null
          annualized_three_year_total_return_nav: number | null
          created_at: string
          expense_ratio_generic: number | null
          historical_sharpe_3y: number | null
          historical_sortino_3y: number | null
          id: number
          max_drawdown_3y: number | null
          one_month_total_return_nav: number | null
          one_year_total_return_nav: number | null
          parent_security_id: string
          quarterly_standard_deviation_annualized_3y: number | null
          related_security_id: string
          security_name: string | null
          sort_order: number
          three_month_total_return_nav: number | null
          ytd_total_return_nav: number | null
        }
        Insert: {
          annualized_five_year_total_return_nav?: number | null
          annualized_three_year_total_return_nav?: number | null
          created_at?: string
          expense_ratio_generic?: number | null
          historical_sharpe_3y?: number | null
          historical_sortino_3y?: number | null
          id?: number
          max_drawdown_3y?: number | null
          one_month_total_return_nav?: number | null
          one_year_total_return_nav?: number | null
          parent_security_id: string
          quarterly_standard_deviation_annualized_3y?: number | null
          related_security_id: string
          security_name?: string | null
          sort_order?: number
          three_month_total_return_nav?: number | null
          ytd_total_return_nav?: number | null
        }
        Update: {
          annualized_five_year_total_return_nav?: number | null
          annualized_three_year_total_return_nav?: number | null
          created_at?: string
          expense_ratio_generic?: number | null
          historical_sharpe_3y?: number | null
          historical_sortino_3y?: number | null
          id?: number
          max_drawdown_3y?: number | null
          one_month_total_return_nav?: number | null
          one_year_total_return_nav?: number | null
          parent_security_id?: string
          quarterly_standard_deviation_annualized_3y?: number | null
          related_security_id?: string
          security_name?: string | null
          sort_order?: number
          three_month_total_return_nav?: number | null
          ytd_total_return_nav?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_alternatives_parent_security_id_fkey"
            columns: ["parent_security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      holding_reviews: {
        Row: {
          action: string | null
          annual_decision: string | null
          annual_notes: string | null
          business_trend: string | null
          conviction: string | null
          conviction_tier: number | null
          created_at: string
          current_conclusion: string | null
          evidence_against: string | null
          evidence_for: string | null
          exit_trigger: string | null
          id: number
          notes: string | null
          on_watchlist: boolean
          original_thesis: string | null
          portfolio_name: string
          required_improvement: string | null
          review_deadline: string | null
          review_log_id: number
          reviewed_at: string
          security_id: string
          thesis_change: string | null
          thesis_status: string | null
          valuation: string | null
          watchlist_reason: string | null
          watchlist_trigger: string | null
        }
        Insert: {
          action?: string | null
          annual_decision?: string | null
          annual_notes?: string | null
          business_trend?: string | null
          conviction?: string | null
          conviction_tier?: number | null
          created_at?: string
          current_conclusion?: string | null
          evidence_against?: string | null
          evidence_for?: string | null
          exit_trigger?: string | null
          id?: number
          notes?: string | null
          on_watchlist?: boolean
          original_thesis?: string | null
          portfolio_name: string
          required_improvement?: string | null
          review_deadline?: string | null
          review_log_id: number
          reviewed_at?: string
          security_id: string
          thesis_change?: string | null
          thesis_status?: string | null
          valuation?: string | null
          watchlist_reason?: string | null
          watchlist_trigger?: string | null
        }
        Update: {
          action?: string | null
          annual_decision?: string | null
          annual_notes?: string | null
          business_trend?: string | null
          conviction?: string | null
          conviction_tier?: number | null
          created_at?: string
          current_conclusion?: string | null
          evidence_against?: string | null
          evidence_for?: string | null
          exit_trigger?: string | null
          id?: number
          notes?: string | null
          on_watchlist?: boolean
          original_thesis?: string | null
          portfolio_name?: string
          required_improvement?: string | null
          review_deadline?: string | null
          review_log_id?: number
          reviewed_at?: string
          security_id?: string
          thesis_change?: string | null
          thesis_status?: string | null
          valuation?: string | null
          watchlist_reason?: string | null
          watchlist_trigger?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holding_reviews_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "holding_reviews_review_log_id_fkey"
            columns: ["review_log_id"]
            isOneToOne: false
            referencedRelation: "portfolio_review_log"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings_change_log: {
        Row: {
          change_type: string
          changed_at: string
          id: number
          new_weight: number | null
          notes: string | null
          old_weight: number | null
          portfolio_name: string | null
          security_id: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          id?: number
          new_weight?: number | null
          notes?: string | null
          old_weight?: number | null
          portfolio_name?: string | null
          security_id: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          id?: number
          new_weight?: number | null
          notes?: string | null
          old_weight?: number | null
          portfolio_name?: string | null
          security_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_change_log_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "holdings_change_log_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      investment_policy_statements: {
        Row: {
          cash_max_pct: number | null
          cash_min_pct: number | null
          client_id: number
          created_at: string
          effective_date: string
          equity_max_pct: number | null
          equity_min_pct: number | null
          fixed_income_max_pct: number | null
          fixed_income_min_pct: number | null
          id: number
          investment_objective: string
          liquidity_needs: string | null
          notes: string | null
          return_target_pct: number | null
          risk_tolerance: string
          time_horizon_years: number | null
          updated_at: string
        }
        Insert: {
          cash_max_pct?: number | null
          cash_min_pct?: number | null
          client_id: number
          created_at?: string
          effective_date?: string
          equity_max_pct?: number | null
          equity_min_pct?: number | null
          fixed_income_max_pct?: number | null
          fixed_income_min_pct?: number | null
          id?: never
          investment_objective: string
          liquidity_needs?: string | null
          notes?: string | null
          return_target_pct?: number | null
          risk_tolerance: string
          time_horizon_years?: number | null
          updated_at?: string
        }
        Update: {
          cash_max_pct?: number | null
          cash_min_pct?: number | null
          client_id?: number
          created_at?: string
          effective_date?: string
          equity_max_pct?: number | null
          equity_min_pct?: number | null
          fixed_income_max_pct?: number | null
          fixed_income_min_pct?: number | null
          id?: never
          investment_objective?: string
          liquidity_needs?: string | null
          notes?: string | null
          return_target_pct?: number | null
          risk_tolerance?: string
          time_horizon_years?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_policy_statements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      model_portfolio_benchmarks: {
        Row: {
          "1_to_3_years_maturity_bond_exposure": number | null
          "3_to_5_years_maturity_bond_exposure": number | null
          a_bond_exposure_generic: number | null
          aa_bond_exposure_generic: number | null
          aaa_bond_exposure_generic: number | null
          africa_middle_east_total_exposure: number | null
          all_time_high_date: string | null
          all_time_low_date: string | null
          annualized_daily_all_time_total_return: number | null
          annualized_five_year_total_return: number | null
          annualized_ten_year_total_return: number | null
          annualized_three_year_total_return: number | null
          asia_developed_total_exposure_generic: number | null
          asia_emerging_total_exposure: number | null
          assigned_benchmark_symbol: string | null
          average_coupon: number | null
          average_credit_quality_score: string | null
          b_bond_exposure_generic: number | null
          basic_materials_exposure_generic: number | null
          bb_bond_exposure_generic: number | null
          bbb_bond_exposure_generic: number | null
          below_b_bond_exposure_generic: number | null
          best_return_all_time: number | null
          best_return_five_year: number | null
          best_return_one_year: number | null
          best_return_six_month: number | null
          best_return_three_month: number | null
          best_return_three_year: number | null
          bond_long: number | null
          bond_net: number | null
          cash_net: number | null
          communication_services_exposure_generic: number | null
          consumer_cyclical_exposure_generic: number | null
          consumer_defensive_exposure_generic: number | null
          convertible_net: number | null
          corporate_fixed_income_exposure_generic: number | null
          current_yield: number | null
          description: string | null
          detailed_security_type: string | null
          developed_equity_exposure: number | null
          dividend_yield: number | null
          earliest_performance_date: string | null
          effective_duration: number | null
          effective_maturity: number | null
          emerging_equity_exposure: number | null
          energy_exposure_generic: number | null
          equity_stylebox_large_cap_blend_exposure: number | null
          equity_stylebox_large_cap_growth_exposure: number | null
          equity_stylebox_large_cap_value_exposure: number | null
          equity_stylebox_mid_cap_blend_exposure: number | null
          equity_stylebox_mid_cap_growth_exposure: number | null
          equity_stylebox_mid_cap_value_exposure: number | null
          equity_stylebox_small_cap_blend_exposure: number | null
          equity_stylebox_small_cap_growth_exposure: number | null
          equity_stylebox_small_cap_value_exposure: number | null
          europe_developed_total_exposure_generic: number | null
          europe_emerging_total_exposure: number | null
          expense_ratio: number | null
          financial_services_exposure_generic: number | null
          government_fixed_income_exposure_generic: number | null
          healthcare_exposure_generic: number | null
          high_yield_bond_allocation_generic: number | null
          historical_sharpe_1y: number | null
          historical_sharpe_3y: number | null
          historical_sharpe_5y: number | null
          historical_sharpe_all: number | null
          historical_sortino_1y: number | null
          historical_sortino_3y: number | null
          historical_sortino_5y: number | null
          historical_sortino_all: number | null
          historical_treynor_measure_1y: number | null
          historical_treynor_measure_3y: number | null
          historical_treynor_measure_5y: number | null
          historical_treynor_measure_all: number | null
          id: number
          industrials_exposure_generic: number | null
          investment_grade_bond_allocation_generic: number | null
          investment_objective: string | null
          large_cap_equity_allocation_generic: number | null
          latin_america_total_exposure_generic: number | null
          maturity_10_to_20_years_generic: number | null
          maturity_20_to_30_years_generic: number | null
          maturity_5_to_10_years_generic: number | null
          maturity_less_than_1_year_generic: number | null
          max_drawdown_1y: number | null
          max_drawdown_3y: number | null
          max_drawdown_5y: number | null
          max_drawdown_all: number | null
          medium_cap_equity_allocation_generic: number | null
          monthly_standard_deviation_annualized_1y: number | null
          monthly_standard_deviation_annualized_3y: number | null
          monthly_standard_deviation_annualized_5y: number | null
          monthly_standard_deviation_annualized_all: number | null
          municipal_fixed_income_exposure_generic: number | null
          name: string | null
          north_america_total_exposure_generic: number | null
          number_of_holdings: number | null
          one_month_total_return: number | null
          one_year_total_return: number | null
          other_bond_exposure_generic: number | null
          other_fixed_income_exposure_generic: number | null
          other_net: number | null
          over_30_years_maturity_bond_exposure: number | null
          preferred_net: number | null
          quarterly_standard_deviation_annualized_3y: number | null
          quarterly_standard_deviation_annualized_5y: number | null
          real_estate_exposure_generic: number | null
          securitized_fixed_income_exposure_generic: number | null
          security_id: string
          security_name: string | null
          small_cap_equity_allocation_generic: number | null
          stock_long: number | null
          stock_net: number | null
          tax_cost_ratio_since_inception: number | null
          technology_exposure_generic: number | null
          three_month_total_return: number | null
          turnover_ratio: number | null
          united_kingdom_total_exposure_generic: number | null
          updated_at: string | null
          utilities_exposure_generic: number | null
          worst_return_all_time: number | null
          worst_return_five_year: number | null
          worst_return_one_year: number | null
          worst_return_six_month: number | null
          worst_return_three_month: number | null
          worst_return_three_year: number | null
          year_high_date: string | null
          year_low_date: string | null
          yield_to_maturity: number | null
          ytd_tax_cost_ratio: number | null
          ytd_total_return: number | null
        }
        Insert: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          africa_middle_east_total_exposure?: number | null
          all_time_high_date?: string | null
          all_time_low_date?: string | null
          annualized_daily_all_time_total_return?: number | null
          annualized_five_year_total_return?: number | null
          annualized_ten_year_total_return?: number | null
          annualized_three_year_total_return?: number | null
          asia_developed_total_exposure_generic?: number | null
          asia_emerging_total_exposure?: number | null
          assigned_benchmark_symbol?: string | null
          average_coupon?: number | null
          average_credit_quality_score?: string | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure_generic?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          best_return_all_time?: number | null
          best_return_five_year?: number | null
          best_return_one_year?: number | null
          best_return_six_month?: number | null
          best_return_three_month?: number | null
          best_return_three_year?: number | null
          bond_long?: number | null
          bond_net?: number | null
          cash_net?: number | null
          communication_services_exposure_generic?: number | null
          consumer_cyclical_exposure_generic?: number | null
          consumer_defensive_exposure_generic?: number | null
          convertible_net?: number | null
          corporate_fixed_income_exposure_generic?: number | null
          current_yield?: number | null
          description?: string | null
          detailed_security_type?: string | null
          developed_equity_exposure?: number | null
          dividend_yield?: number | null
          earliest_performance_date?: string | null
          effective_duration?: number | null
          effective_maturity?: number | null
          emerging_equity_exposure?: number | null
          energy_exposure_generic?: number | null
          equity_stylebox_large_cap_blend_exposure?: number | null
          equity_stylebox_large_cap_growth_exposure?: number | null
          equity_stylebox_large_cap_value_exposure?: number | null
          equity_stylebox_mid_cap_blend_exposure?: number | null
          equity_stylebox_mid_cap_growth_exposure?: number | null
          equity_stylebox_mid_cap_value_exposure?: number | null
          equity_stylebox_small_cap_blend_exposure?: number | null
          equity_stylebox_small_cap_growth_exposure?: number | null
          equity_stylebox_small_cap_value_exposure?: number | null
          europe_developed_total_exposure_generic?: number | null
          europe_emerging_total_exposure?: number | null
          expense_ratio?: number | null
          financial_services_exposure_generic?: number | null
          government_fixed_income_exposure_generic?: number | null
          healthcare_exposure_generic?: number | null
          high_yield_bond_allocation_generic?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sharpe_all?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          historical_sortino_all?: number | null
          historical_treynor_measure_1y?: number | null
          historical_treynor_measure_3y?: number | null
          historical_treynor_measure_5y?: number | null
          historical_treynor_measure_all?: number | null
          id?: number
          industrials_exposure_generic?: number | null
          investment_grade_bond_allocation_generic?: number | null
          investment_objective?: string | null
          large_cap_equity_allocation_generic?: number | null
          latin_america_total_exposure_generic?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          max_drawdown_1y?: number | null
          max_drawdown_3y?: number | null
          max_drawdown_5y?: number | null
          max_drawdown_all?: number | null
          medium_cap_equity_allocation_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          monthly_standard_deviation_annualized_3y?: number | null
          monthly_standard_deviation_annualized_5y?: number | null
          monthly_standard_deviation_annualized_all?: number | null
          municipal_fixed_income_exposure_generic?: number | null
          name?: string | null
          north_america_total_exposure_generic?: number | null
          number_of_holdings?: number | null
          one_month_total_return?: number | null
          one_year_total_return?: number | null
          other_bond_exposure_generic?: number | null
          other_fixed_income_exposure_generic?: number | null
          other_net?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          preferred_net?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure_generic?: number | null
          securitized_fixed_income_exposure_generic?: number | null
          security_id: string
          security_name?: string | null
          small_cap_equity_allocation_generic?: number | null
          stock_long?: number | null
          stock_net?: number | null
          tax_cost_ratio_since_inception?: number | null
          technology_exposure_generic?: number | null
          three_month_total_return?: number | null
          turnover_ratio?: number | null
          united_kingdom_total_exposure_generic?: number | null
          updated_at?: string | null
          utilities_exposure_generic?: number | null
          worst_return_all_time?: number | null
          worst_return_five_year?: number | null
          worst_return_one_year?: number | null
          worst_return_six_month?: number | null
          worst_return_three_month?: number | null
          worst_return_three_year?: number | null
          year_high_date?: string | null
          year_low_date?: string | null
          yield_to_maturity?: number | null
          ytd_tax_cost_ratio?: number | null
          ytd_total_return?: number | null
        }
        Update: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          africa_middle_east_total_exposure?: number | null
          all_time_high_date?: string | null
          all_time_low_date?: string | null
          annualized_daily_all_time_total_return?: number | null
          annualized_five_year_total_return?: number | null
          annualized_ten_year_total_return?: number | null
          annualized_three_year_total_return?: number | null
          asia_developed_total_exposure_generic?: number | null
          asia_emerging_total_exposure?: number | null
          assigned_benchmark_symbol?: string | null
          average_coupon?: number | null
          average_credit_quality_score?: string | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure_generic?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          best_return_all_time?: number | null
          best_return_five_year?: number | null
          best_return_one_year?: number | null
          best_return_six_month?: number | null
          best_return_three_month?: number | null
          best_return_three_year?: number | null
          bond_long?: number | null
          bond_net?: number | null
          cash_net?: number | null
          communication_services_exposure_generic?: number | null
          consumer_cyclical_exposure_generic?: number | null
          consumer_defensive_exposure_generic?: number | null
          convertible_net?: number | null
          corporate_fixed_income_exposure_generic?: number | null
          current_yield?: number | null
          description?: string | null
          detailed_security_type?: string | null
          developed_equity_exposure?: number | null
          dividend_yield?: number | null
          earliest_performance_date?: string | null
          effective_duration?: number | null
          effective_maturity?: number | null
          emerging_equity_exposure?: number | null
          energy_exposure_generic?: number | null
          equity_stylebox_large_cap_blend_exposure?: number | null
          equity_stylebox_large_cap_growth_exposure?: number | null
          equity_stylebox_large_cap_value_exposure?: number | null
          equity_stylebox_mid_cap_blend_exposure?: number | null
          equity_stylebox_mid_cap_growth_exposure?: number | null
          equity_stylebox_mid_cap_value_exposure?: number | null
          equity_stylebox_small_cap_blend_exposure?: number | null
          equity_stylebox_small_cap_growth_exposure?: number | null
          equity_stylebox_small_cap_value_exposure?: number | null
          europe_developed_total_exposure_generic?: number | null
          europe_emerging_total_exposure?: number | null
          expense_ratio?: number | null
          financial_services_exposure_generic?: number | null
          government_fixed_income_exposure_generic?: number | null
          healthcare_exposure_generic?: number | null
          high_yield_bond_allocation_generic?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sharpe_all?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          historical_sortino_all?: number | null
          historical_treynor_measure_1y?: number | null
          historical_treynor_measure_3y?: number | null
          historical_treynor_measure_5y?: number | null
          historical_treynor_measure_all?: number | null
          id?: number
          industrials_exposure_generic?: number | null
          investment_grade_bond_allocation_generic?: number | null
          investment_objective?: string | null
          large_cap_equity_allocation_generic?: number | null
          latin_america_total_exposure_generic?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          max_drawdown_1y?: number | null
          max_drawdown_3y?: number | null
          max_drawdown_5y?: number | null
          max_drawdown_all?: number | null
          medium_cap_equity_allocation_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          monthly_standard_deviation_annualized_3y?: number | null
          monthly_standard_deviation_annualized_5y?: number | null
          monthly_standard_deviation_annualized_all?: number | null
          municipal_fixed_income_exposure_generic?: number | null
          name?: string | null
          north_america_total_exposure_generic?: number | null
          number_of_holdings?: number | null
          one_month_total_return?: number | null
          one_year_total_return?: number | null
          other_bond_exposure_generic?: number | null
          other_fixed_income_exposure_generic?: number | null
          other_net?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          preferred_net?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure_generic?: number | null
          securitized_fixed_income_exposure_generic?: number | null
          security_id?: string
          security_name?: string | null
          small_cap_equity_allocation_generic?: number | null
          stock_long?: number | null
          stock_net?: number | null
          tax_cost_ratio_since_inception?: number | null
          technology_exposure_generic?: number | null
          three_month_total_return?: number | null
          turnover_ratio?: number | null
          united_kingdom_total_exposure_generic?: number | null
          updated_at?: string | null
          utilities_exposure_generic?: number | null
          worst_return_all_time?: number | null
          worst_return_five_year?: number | null
          worst_return_one_year?: number | null
          worst_return_six_month?: number | null
          worst_return_three_month?: number | null
          worst_return_three_year?: number | null
          year_high_date?: string | null
          year_low_date?: string | null
          yield_to_maturity?: number | null
          ytd_tax_cost_ratio?: number | null
          ytd_total_return?: number | null
        }
        Relationships: []
      }
      model_portfolio_data: {
        Row: {
          alternatives_lower_limit: number | null
          alternatives_target: number | null
          alternatives_upper_limit: number | null
          asset_class_allocation_mode: string | null
          asset_class_drift_percentage: number | null
          benchmark: string | null
          cash_lower_limit: number | null
          cash_target: number | null
          cash_upper_limit: number | null
          category_allocation_mode: string | null
          category_drift_percentage: number | null
          created_at: string | null
          description: string | null
          drift_percentage: number | null
          emerging_market_lower_limit: number | null
          emerging_market_target: number | null
          emerging_market_upper_limit: number | null
          equity_lower_limit: number | null
          equity_target: number | null
          equity_upper_limit: number | null
          fixed_income_lower_limit: number | null
          fixed_income_target: number | null
          fixed_income_upper_limit: number | null
          id: number
          ig_intermediate_fixed_income_lower_limit: number | null
          ig_intermediate_fixed_income_target: number | null
          ig_intermediate_fixed_income_upper_limit: number | null
          ig_short_fixed_income_lower_limit: number | null
          ig_short_fixed_income_target: number | null
          ig_short_fixed_income_upper_limit: number | null
          investment_objective: string | null
          large_cap_blend_lower_limit: number | null
          large_cap_blend_target: number | null
          large_cap_blend_upper_limit: number | null
          large_cap_growth_lower_limit: number | null
          large_cap_growth_target: number | null
          large_cap_growth_upper_limit: number | null
          large_cap_value_lower_limit: number | null
          large_cap_value_target: number | null
          large_cap_value_upper_limit: number | null
          model_category: string | null
          multi_sector_fixed_income_lower_limit: number | null
          multi_sector_fixed_income_target: number | null
          multi_sector_fixed_income_upper_limit: number | null
          name: string | null
          non_ig_fixed_income_lower_limit: number | null
          non_ig_fixed_income_target: number | null
          non_ig_fixed_income_upper_limit: number | null
          non_us_developed_lower_limit: number | null
          non_us_developed_target: number | null
          non_us_developed_upper_limit: number | null
          non_us_fixed_income_lower_limit: number | null
          non_us_fixed_income_target: number | null
          non_us_fixed_income_upper_limit: number | null
          rebalance_frequency: string | null
          review_frequency: string | null
          risk_profile: string | null
          updated_at: string | null
          us_mid_cap_lower_limit: number | null
          us_mid_cap_target: number | null
          us_mid_cap_upper_limit: number | null
          us_small_cap_lower_limit: number | null
          us_small_cap_target: number | null
          us_small_cap_upper_limit: number | null
        }
        Insert: {
          alternatives_lower_limit?: number | null
          alternatives_target?: number | null
          alternatives_upper_limit?: number | null
          asset_class_allocation_mode?: string | null
          asset_class_drift_percentage?: number | null
          benchmark?: string | null
          cash_lower_limit?: number | null
          cash_target?: number | null
          cash_upper_limit?: number | null
          category_allocation_mode?: string | null
          category_drift_percentage?: number | null
          created_at?: string | null
          description?: string | null
          drift_percentage?: number | null
          emerging_market_lower_limit?: number | null
          emerging_market_target?: number | null
          emerging_market_upper_limit?: number | null
          equity_lower_limit?: number | null
          equity_target?: number | null
          equity_upper_limit?: number | null
          fixed_income_lower_limit?: number | null
          fixed_income_target?: number | null
          fixed_income_upper_limit?: number | null
          id?: never
          ig_intermediate_fixed_income_lower_limit?: number | null
          ig_intermediate_fixed_income_target?: number | null
          ig_intermediate_fixed_income_upper_limit?: number | null
          ig_short_fixed_income_lower_limit?: number | null
          ig_short_fixed_income_target?: number | null
          ig_short_fixed_income_upper_limit?: number | null
          investment_objective?: string | null
          large_cap_blend_lower_limit?: number | null
          large_cap_blend_target?: number | null
          large_cap_blend_upper_limit?: number | null
          large_cap_growth_lower_limit?: number | null
          large_cap_growth_target?: number | null
          large_cap_growth_upper_limit?: number | null
          large_cap_value_lower_limit?: number | null
          large_cap_value_target?: number | null
          large_cap_value_upper_limit?: number | null
          model_category?: string | null
          multi_sector_fixed_income_lower_limit?: number | null
          multi_sector_fixed_income_target?: number | null
          multi_sector_fixed_income_upper_limit?: number | null
          name?: string | null
          non_ig_fixed_income_lower_limit?: number | null
          non_ig_fixed_income_target?: number | null
          non_ig_fixed_income_upper_limit?: number | null
          non_us_developed_lower_limit?: number | null
          non_us_developed_target?: number | null
          non_us_developed_upper_limit?: number | null
          non_us_fixed_income_lower_limit?: number | null
          non_us_fixed_income_target?: number | null
          non_us_fixed_income_upper_limit?: number | null
          rebalance_frequency?: string | null
          review_frequency?: string | null
          risk_profile?: string | null
          updated_at?: string | null
          us_mid_cap_lower_limit?: number | null
          us_mid_cap_target?: number | null
          us_mid_cap_upper_limit?: number | null
          us_small_cap_lower_limit?: number | null
          us_small_cap_target?: number | null
          us_small_cap_upper_limit?: number | null
        }
        Update: {
          alternatives_lower_limit?: number | null
          alternatives_target?: number | null
          alternatives_upper_limit?: number | null
          asset_class_allocation_mode?: string | null
          asset_class_drift_percentage?: number | null
          benchmark?: string | null
          cash_lower_limit?: number | null
          cash_target?: number | null
          cash_upper_limit?: number | null
          category_allocation_mode?: string | null
          category_drift_percentage?: number | null
          created_at?: string | null
          description?: string | null
          drift_percentage?: number | null
          emerging_market_lower_limit?: number | null
          emerging_market_target?: number | null
          emerging_market_upper_limit?: number | null
          equity_lower_limit?: number | null
          equity_target?: number | null
          equity_upper_limit?: number | null
          fixed_income_lower_limit?: number | null
          fixed_income_target?: number | null
          fixed_income_upper_limit?: number | null
          id?: never
          ig_intermediate_fixed_income_lower_limit?: number | null
          ig_intermediate_fixed_income_target?: number | null
          ig_intermediate_fixed_income_upper_limit?: number | null
          ig_short_fixed_income_lower_limit?: number | null
          ig_short_fixed_income_target?: number | null
          ig_short_fixed_income_upper_limit?: number | null
          investment_objective?: string | null
          large_cap_blend_lower_limit?: number | null
          large_cap_blend_target?: number | null
          large_cap_blend_upper_limit?: number | null
          large_cap_growth_lower_limit?: number | null
          large_cap_growth_target?: number | null
          large_cap_growth_upper_limit?: number | null
          large_cap_value_lower_limit?: number | null
          large_cap_value_target?: number | null
          large_cap_value_upper_limit?: number | null
          model_category?: string | null
          multi_sector_fixed_income_lower_limit?: number | null
          multi_sector_fixed_income_target?: number | null
          multi_sector_fixed_income_upper_limit?: number | null
          name?: string | null
          non_ig_fixed_income_lower_limit?: number | null
          non_ig_fixed_income_target?: number | null
          non_ig_fixed_income_upper_limit?: number | null
          non_us_developed_lower_limit?: number | null
          non_us_developed_target?: number | null
          non_us_developed_upper_limit?: number | null
          non_us_fixed_income_lower_limit?: number | null
          non_us_fixed_income_target?: number | null
          non_us_fixed_income_upper_limit?: number | null
          rebalance_frequency?: string | null
          review_frequency?: string | null
          risk_profile?: string | null
          updated_at?: string | null
          us_mid_cap_lower_limit?: number | null
          us_mid_cap_target?: number | null
          us_mid_cap_upper_limit?: number | null
          us_small_cap_lower_limit?: number | null
          us_small_cap_target?: number | null
          us_small_cap_upper_limit?: number | null
        }
        Relationships: []
      }
      peer_group_benchmarks: {
        Row: {
          "1_to_3_years_maturity_bond_exposure": number | null
          "3_to_5_years_maturity_bond_exposure": number | null
          a_bond_exposure_generic: number | null
          aa_bond_exposure_generic: number | null
          aaa_bond_exposure_generic: number | null
          annualized_daily_five_year_total_return: number | null
          annualized_daily_one_year_total_return: number | null
          annualized_daily_three_year_return: number | null
          b_bond_exposure_generic: number | null
          basic_materials_exposure: number | null
          bb_bond_exposure_generic: number | null
          bbb_bond_exposure_generic: number | null
          below_b_bond_exposure_generic: number | null
          communication_services_exposure: number | null
          consumer_cyclical_exposure: number | null
          consumer_defensive_exposure: number | null
          energy_exposure: number | null
          eps_growth_1_yr_generic: number | null
          financial_services_exposure: number | null
          healthcare_exposure: number | null
          historical_sharpe_1y: number | null
          historical_sharpe_3y: number | null
          historical_sharpe_5y: number | null
          historical_sortino_1y: number | null
          historical_sortino_3y: number | null
          historical_sortino_5y: number | null
          id: number
          industrials_exposure: number | null
          maturity_10_to_20_years_generic: number | null
          maturity_20_to_30_years_generic: number | null
          maturity_5_to_10_years_generic: number | null
          maturity_less_than_1_year_generic: number | null
          monthly_standard_deviation_annualized_1y: number | null
          one_month_total_return: number | null
          over_30_years_maturity_bond_exposure: number | null
          peer_group_benchmark: string | null
          peer_group_category: string | null
          peer_group_ticker: string | null
          quarterly_standard_deviation_annualized_3y: number | null
          quarterly_standard_deviation_annualized_5y: number | null
          real_estate_exposure: number | null
          sales_growth_1_yr_generic: number | null
          technology_exposure: number | null
          three_month_total_return: number | null
          updated_at: string | null
          utilities_exposure: number | null
          ytd_total_return: number | null
        }
        Insert: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          communication_services_exposure?: number | null
          consumer_cyclical_exposure?: number | null
          consumer_defensive_exposure?: number | null
          energy_exposure?: number | null
          eps_growth_1_yr_generic?: number | null
          financial_services_exposure?: number | null
          healthcare_exposure?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          id?: number
          industrials_exposure?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          one_month_total_return?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          peer_group_benchmark?: string | null
          peer_group_category?: string | null
          peer_group_ticker?: string | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure?: number | null
          sales_growth_1_yr_generic?: number | null
          technology_exposure?: number | null
          three_month_total_return?: number | null
          updated_at?: string | null
          utilities_exposure?: number | null
          ytd_total_return?: number | null
        }
        Update: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          communication_services_exposure?: number | null
          consumer_cyclical_exposure?: number | null
          consumer_defensive_exposure?: number | null
          energy_exposure?: number | null
          eps_growth_1_yr_generic?: number | null
          financial_services_exposure?: number | null
          healthcare_exposure?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          id?: number
          industrials_exposure?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          one_month_total_return?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          peer_group_benchmark?: string | null
          peer_group_category?: string | null
          peer_group_ticker?: string | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure?: number | null
          sales_growth_1_yr_generic?: number | null
          technology_exposure?: number | null
          three_month_total_return?: number | null
          updated_at?: string | null
          utilities_exposure?: number | null
          ytd_total_return?: number | null
        }
        Relationships: []
      }
      portfolio: {
        Row: {
          "1_to_3_years_maturity_bond_exposure": number | null
          "3_to_5_years_maturity_bond_exposure": number | null
          a_bond_exposure_generic: number | null
          aa_bond_exposure_generic: number | null
          aaa_bond_exposure_generic: number | null
          africa_middle_east_total_exposure: number | null
          all_time_high_date: string | null
          all_time_low_date: string | null
          annualized_daily_all_time_total_return: number | null
          annualized_five_year_total_return: number | null
          annualized_ten_year_total_return: number | null
          annualized_three_year_total_return: number | null
          asia_developed_total_exposure_generic: number | null
          asia_emerging_total_exposure: number | null
          average_coupon: number | null
          average_credit_quality_score: string | null
          b_bond_exposure_generic: number | null
          basic_materials_exposure_generic: number | null
          bb_bond_exposure_generic: number | null
          bbb_bond_exposure_generic: number | null
          below_b_bond_exposure_generic: number | null
          best_return_all_time: number | null
          best_return_five_year: number | null
          best_return_one_year: number | null
          best_return_six_month: number | null
          best_return_three_month: number | null
          best_return_three_year: number | null
          bond_long: number | null
          bond_net: number | null
          cash_net: number | null
          communication_services_exposure_generic: number | null
          consumer_cyclical_exposure_generic: number | null
          consumer_defensive_exposure_generic: number | null
          convertible_net: number | null
          corporate_fixed_income_exposure_generic: number | null
          created_at: string
          current_yield: number | null
          description: string
          detailed_security_type: string | null
          developed_equity_exposure: number | null
          dividend_yield: number | null
          earliest_performance_date: string | null
          effective_duration: number | null
          effective_maturity: number | null
          emerging_equity_exposure: number | null
          energy_exposure_generic: number | null
          equity_stylebox_large_cap_blend_exposure: number | null
          equity_stylebox_large_cap_growth_exposure: number | null
          equity_stylebox_large_cap_value_exposure: number | null
          equity_stylebox_mid_cap_blend_exposure: number | null
          equity_stylebox_mid_cap_growth_exposure: number | null
          equity_stylebox_mid_cap_value_exposure: number | null
          equity_stylebox_small_cap_blend_exposure: number | null
          equity_stylebox_small_cap_growth_exposure: number | null
          equity_stylebox_small_cap_value_exposure: number | null
          europe_developed_total_exposure_generic: number | null
          europe_emerging_total_exposure: number | null
          expense_ratio: number | null
          financial_services_exposure_generic: number | null
          government_fixed_income_exposure_generic: number | null
          healthcare_exposure_generic: number | null
          high_yield_bond_allocation_generic: number | null
          historical_sharpe_1y: number | null
          historical_sharpe_3y: number | null
          historical_sharpe_5y: number | null
          historical_sharpe_all: number | null
          historical_sortino_1y: number | null
          historical_sortino_3y: number | null
          historical_sortino_5y: number | null
          historical_sortino_all: number | null
          historical_treynor_measure_1y: number | null
          historical_treynor_measure_3y: number | null
          historical_treynor_measure_5y: number | null
          historical_treynor_measure_all: number | null
          industrials_exposure_generic: number | null
          investment_grade_bond_allocation_generic: number | null
          investment_objective: string | null
          large_cap_equity_allocation_generic: number | null
          last_rebalance_date: string | null
          latin_america_total_exposure_generic: number | null
          market_alpha_12_month: number | null
          market_alpha_36_month: number | null
          market_alpha_60_month: number | null
          market_alpha_all: number | null
          maturity_10_to_20_years_generic: number | null
          maturity_20_to_30_years_generic: number | null
          maturity_5_to_10_years_generic: number | null
          maturity_less_than_1_year_generic: number | null
          max_drawdown_1y: number | null
          max_drawdown_3y: number | null
          max_drawdown_5y: number | null
          max_drawdown_all: number | null
          medium_cap_equity_allocation_generic: number | null
          monthly_standard_deviation_annualized_1y: number | null
          monthly_standard_deviation_annualized_3y: number | null
          monthly_standard_deviation_annualized_5y: number | null
          monthly_standard_deviation_annualized_all: number | null
          municipal_fixed_income_exposure_generic: number | null
          name: string
          next_rebalance_date: string | null
          north_america_total_exposure_generic: number | null
          number_of_holdings: number | null
          one_month_total_return: number | null
          one_year_total_return: number | null
          other_bond_exposure_generic: number | null
          other_fixed_income_exposure_generic: number | null
          other_net: number | null
          over_30_years_maturity_bond_exposure: number | null
          portfolio_strategy: string
          preferred_net: number | null
          quarterly_market_beta_12_month: number | null
          quarterly_market_beta_36_month: number | null
          quarterly_market_beta_60_month: number | null
          quarterly_market_beta_all: number | null
          real_estate_exposure_generic: number | null
          securitized_fixed_income_exposure_generic: number | null
          security_id: string | null
          small_cap_equity_allocation_generic: number | null
          stock_long: number | null
          stock_net: number | null
          tax_cost_ratio_since_inception: number | null
          technology_exposure_generic: number | null
          three_month_total_return: number | null
          tracking_error_1y: number | null
          tracking_error_3y: number | null
          tracking_error_5y: number | null
          turnover_ratio: number | null
          united_kingdom_total_exposure_generic: number | null
          updated_at: string | null
          upside_downside_1y: number | null
          upside_downside_3y: number | null
          upside_downside_5y: number | null
          upside_downside_all: number | null
          utilities_exposure_generic: number | null
          worst_return_all_time: number | null
          worst_return_five_year: number | null
          worst_return_one_year: number | null
          worst_return_six_month: number | null
          worst_return_three_month: number | null
          worst_return_three_year: number | null
          year_high_date: string | null
          year_low_date: string | null
          yield_to_maturity: number | null
          ytd_tax_cost_ratio: number | null
          ytd_total_return: number | null
        }
        Insert: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          africa_middle_east_total_exposure?: number | null
          all_time_high_date?: string | null
          all_time_low_date?: string | null
          annualized_daily_all_time_total_return?: number | null
          annualized_five_year_total_return?: number | null
          annualized_ten_year_total_return?: number | null
          annualized_three_year_total_return?: number | null
          asia_developed_total_exposure_generic?: number | null
          asia_emerging_total_exposure?: number | null
          average_coupon?: number | null
          average_credit_quality_score?: string | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure_generic?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          best_return_all_time?: number | null
          best_return_five_year?: number | null
          best_return_one_year?: number | null
          best_return_six_month?: number | null
          best_return_three_month?: number | null
          best_return_three_year?: number | null
          bond_long?: number | null
          bond_net?: number | null
          cash_net?: number | null
          communication_services_exposure_generic?: number | null
          consumer_cyclical_exposure_generic?: number | null
          consumer_defensive_exposure_generic?: number | null
          convertible_net?: number | null
          corporate_fixed_income_exposure_generic?: number | null
          created_at?: string
          current_yield?: number | null
          description: string
          detailed_security_type?: string | null
          developed_equity_exposure?: number | null
          dividend_yield?: number | null
          earliest_performance_date?: string | null
          effective_duration?: number | null
          effective_maturity?: number | null
          emerging_equity_exposure?: number | null
          energy_exposure_generic?: number | null
          equity_stylebox_large_cap_blend_exposure?: number | null
          equity_stylebox_large_cap_growth_exposure?: number | null
          equity_stylebox_large_cap_value_exposure?: number | null
          equity_stylebox_mid_cap_blend_exposure?: number | null
          equity_stylebox_mid_cap_growth_exposure?: number | null
          equity_stylebox_mid_cap_value_exposure?: number | null
          equity_stylebox_small_cap_blend_exposure?: number | null
          equity_stylebox_small_cap_growth_exposure?: number | null
          equity_stylebox_small_cap_value_exposure?: number | null
          europe_developed_total_exposure_generic?: number | null
          europe_emerging_total_exposure?: number | null
          expense_ratio?: number | null
          financial_services_exposure_generic?: number | null
          government_fixed_income_exposure_generic?: number | null
          healthcare_exposure_generic?: number | null
          high_yield_bond_allocation_generic?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sharpe_all?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          historical_sortino_all?: number | null
          historical_treynor_measure_1y?: number | null
          historical_treynor_measure_3y?: number | null
          historical_treynor_measure_5y?: number | null
          historical_treynor_measure_all?: number | null
          industrials_exposure_generic?: number | null
          investment_grade_bond_allocation_generic?: number | null
          investment_objective?: string | null
          large_cap_equity_allocation_generic?: number | null
          last_rebalance_date?: string | null
          latin_america_total_exposure_generic?: number | null
          market_alpha_12_month?: number | null
          market_alpha_36_month?: number | null
          market_alpha_60_month?: number | null
          market_alpha_all?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          max_drawdown_1y?: number | null
          max_drawdown_3y?: number | null
          max_drawdown_5y?: number | null
          max_drawdown_all?: number | null
          medium_cap_equity_allocation_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          monthly_standard_deviation_annualized_3y?: number | null
          monthly_standard_deviation_annualized_5y?: number | null
          monthly_standard_deviation_annualized_all?: number | null
          municipal_fixed_income_exposure_generic?: number | null
          name: string
          next_rebalance_date?: string | null
          north_america_total_exposure_generic?: number | null
          number_of_holdings?: number | null
          one_month_total_return?: number | null
          one_year_total_return?: number | null
          other_bond_exposure_generic?: number | null
          other_fixed_income_exposure_generic?: number | null
          other_net?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          portfolio_strategy: string
          preferred_net?: number | null
          quarterly_market_beta_12_month?: number | null
          quarterly_market_beta_36_month?: number | null
          quarterly_market_beta_60_month?: number | null
          quarterly_market_beta_all?: number | null
          real_estate_exposure_generic?: number | null
          securitized_fixed_income_exposure_generic?: number | null
          security_id?: string | null
          small_cap_equity_allocation_generic?: number | null
          stock_long?: number | null
          stock_net?: number | null
          tax_cost_ratio_since_inception?: number | null
          technology_exposure_generic?: number | null
          three_month_total_return?: number | null
          tracking_error_1y?: number | null
          tracking_error_3y?: number | null
          tracking_error_5y?: number | null
          turnover_ratio?: number | null
          united_kingdom_total_exposure_generic?: number | null
          updated_at?: string | null
          upside_downside_1y?: number | null
          upside_downside_3y?: number | null
          upside_downside_5y?: number | null
          upside_downside_all?: number | null
          utilities_exposure_generic?: number | null
          worst_return_all_time?: number | null
          worst_return_five_year?: number | null
          worst_return_one_year?: number | null
          worst_return_six_month?: number | null
          worst_return_three_month?: number | null
          worst_return_three_year?: number | null
          year_high_date?: string | null
          year_low_date?: string | null
          yield_to_maturity?: number | null
          ytd_tax_cost_ratio?: number | null
          ytd_total_return?: number | null
        }
        Update: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          africa_middle_east_total_exposure?: number | null
          all_time_high_date?: string | null
          all_time_low_date?: string | null
          annualized_daily_all_time_total_return?: number | null
          annualized_five_year_total_return?: number | null
          annualized_ten_year_total_return?: number | null
          annualized_three_year_total_return?: number | null
          asia_developed_total_exposure_generic?: number | null
          asia_emerging_total_exposure?: number | null
          average_coupon?: number | null
          average_credit_quality_score?: string | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure_generic?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          best_return_all_time?: number | null
          best_return_five_year?: number | null
          best_return_one_year?: number | null
          best_return_six_month?: number | null
          best_return_three_month?: number | null
          best_return_three_year?: number | null
          bond_long?: number | null
          bond_net?: number | null
          cash_net?: number | null
          communication_services_exposure_generic?: number | null
          consumer_cyclical_exposure_generic?: number | null
          consumer_defensive_exposure_generic?: number | null
          convertible_net?: number | null
          corporate_fixed_income_exposure_generic?: number | null
          created_at?: string
          current_yield?: number | null
          description?: string
          detailed_security_type?: string | null
          developed_equity_exposure?: number | null
          dividend_yield?: number | null
          earliest_performance_date?: string | null
          effective_duration?: number | null
          effective_maturity?: number | null
          emerging_equity_exposure?: number | null
          energy_exposure_generic?: number | null
          equity_stylebox_large_cap_blend_exposure?: number | null
          equity_stylebox_large_cap_growth_exposure?: number | null
          equity_stylebox_large_cap_value_exposure?: number | null
          equity_stylebox_mid_cap_blend_exposure?: number | null
          equity_stylebox_mid_cap_growth_exposure?: number | null
          equity_stylebox_mid_cap_value_exposure?: number | null
          equity_stylebox_small_cap_blend_exposure?: number | null
          equity_stylebox_small_cap_growth_exposure?: number | null
          equity_stylebox_small_cap_value_exposure?: number | null
          europe_developed_total_exposure_generic?: number | null
          europe_emerging_total_exposure?: number | null
          expense_ratio?: number | null
          financial_services_exposure_generic?: number | null
          government_fixed_income_exposure_generic?: number | null
          healthcare_exposure_generic?: number | null
          high_yield_bond_allocation_generic?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sharpe_all?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          historical_sortino_all?: number | null
          historical_treynor_measure_1y?: number | null
          historical_treynor_measure_3y?: number | null
          historical_treynor_measure_5y?: number | null
          historical_treynor_measure_all?: number | null
          industrials_exposure_generic?: number | null
          investment_grade_bond_allocation_generic?: number | null
          investment_objective?: string | null
          large_cap_equity_allocation_generic?: number | null
          last_rebalance_date?: string | null
          latin_america_total_exposure_generic?: number | null
          market_alpha_12_month?: number | null
          market_alpha_36_month?: number | null
          market_alpha_60_month?: number | null
          market_alpha_all?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          max_drawdown_1y?: number | null
          max_drawdown_3y?: number | null
          max_drawdown_5y?: number | null
          max_drawdown_all?: number | null
          medium_cap_equity_allocation_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          monthly_standard_deviation_annualized_3y?: number | null
          monthly_standard_deviation_annualized_5y?: number | null
          monthly_standard_deviation_annualized_all?: number | null
          municipal_fixed_income_exposure_generic?: number | null
          name?: string
          next_rebalance_date?: string | null
          north_america_total_exposure_generic?: number | null
          number_of_holdings?: number | null
          one_month_total_return?: number | null
          one_year_total_return?: number | null
          other_bond_exposure_generic?: number | null
          other_fixed_income_exposure_generic?: number | null
          other_net?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          portfolio_strategy?: string
          preferred_net?: number | null
          quarterly_market_beta_12_month?: number | null
          quarterly_market_beta_36_month?: number | null
          quarterly_market_beta_60_month?: number | null
          quarterly_market_beta_all?: number | null
          real_estate_exposure_generic?: number | null
          securitized_fixed_income_exposure_generic?: number | null
          security_id?: string | null
          small_cap_equity_allocation_generic?: number | null
          stock_long?: number | null
          stock_net?: number | null
          tax_cost_ratio_since_inception?: number | null
          technology_exposure_generic?: number | null
          three_month_total_return?: number | null
          tracking_error_1y?: number | null
          tracking_error_3y?: number | null
          tracking_error_5y?: number | null
          turnover_ratio?: number | null
          united_kingdom_total_exposure_generic?: number | null
          updated_at?: string | null
          upside_downside_1y?: number | null
          upside_downside_3y?: number | null
          upside_downside_5y?: number | null
          upside_downside_all?: number | null
          utilities_exposure_generic?: number | null
          worst_return_all_time?: number | null
          worst_return_five_year?: number | null
          worst_return_one_year?: number | null
          worst_return_six_month?: number | null
          worst_return_three_month?: number | null
          worst_return_three_year?: number | null
          year_high_date?: string | null
          year_low_date?: string | null
          yield_to_maturity?: number | null
          ytd_tax_cost_ratio?: number | null
          ytd_total_return?: number | null
        }
        Relationships: []
      }
      portfolio_allocations: {
        Row: {
          created_at: string
          effective_date: string
          id: number
          portfolio_name: string
          security_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          effective_date: string
          id?: number
          portfolio_name: string
          security_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: number
          portfolio_name?: string
          security_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      portfolio_asset_class_targets: {
        Row: {
          asset_class: string
          created_at: string
          id: number
          lower_limit: number
          portfolio_name: string
          sort_order: number | null
          target: number
          updated_at: string
          upper_limit: number
        }
        Insert: {
          asset_class: string
          created_at?: string
          id?: number
          lower_limit?: number
          portfolio_name: string
          sort_order?: number | null
          target?: number
          updated_at?: string
          upper_limit?: number
        }
        Update: {
          asset_class?: string
          created_at?: string
          id?: number
          lower_limit?: number
          portfolio_name?: string
          sort_order?: number | null
          target?: number
          updated_at?: string
          upper_limit?: number
        }
        Relationships: []
      }
      portfolio_model_map: {
        Row: {
          model_portfolio_id: number
          security_id: string
        }
        Insert: {
          model_portfolio_id: number
          security_id: string
        }
        Update: {
          model_portfolio_id?: number
          security_id?: string
        }
        Relationships: []
      }
      portfolio_review_log: {
        Row: {
          cadence: string | null
          checklist: Json | null
          completed_at: string | null
          created_at: string
          id: number
          next_review_at: string | null
          notes: string | null
          outcome: string | null
          period: string | null
          portfolio_name: string
          review_date: string | null
          reviewed_at: string
          reviewed_by: string | null
          status: string
        }
        Insert: {
          cadence?: string | null
          checklist?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: number
          next_review_at?: string | null
          notes?: string | null
          outcome?: string | null
          period?: string | null
          portfolio_name: string
          review_date?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          cadence?: string | null
          checklist?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: number
          next_review_at?: string | null
          notes?: string | null
          outcome?: string | null
          period?: string | null
          portfolio_name?: string
          review_date?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      portfolio_review_schedules: {
        Row: {
          cadence: string
          created_at: string
          id: number
          last_reviewed_at: string | null
          next_review_at: string
          portfolio_name: string
          updated_at: string
        }
        Insert: {
          cadence: string
          created_at?: string
          id?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          portfolio_name: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          created_at?: string
          id?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          portfolio_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_review_schedules_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
        ]
      }
      positions: {
        Row: {
          allocation_pct: number
          created_at: string
          deleted_at: string | null
          drift_threshold: number | null
          lower_limit: number | null
          portfolio_name: string
          security_id: string
          sort_order: number | null
          target_weight: number | null
          updated_at: string
          upper_limit: number | null
        }
        Insert: {
          allocation_pct: number
          created_at?: string
          deleted_at?: string | null
          drift_threshold?: number | null
          lower_limit?: number | null
          portfolio_name: string
          security_id: string
          sort_order?: number | null
          target_weight?: number | null
          updated_at?: string
          upper_limit?: number | null
        }
        Update: {
          allocation_pct?: number
          created_at?: string
          deleted_at?: string | null
          drift_threshold?: number | null
          lower_limit?: number | null
          portfolio_name?: string
          security_id?: string
          sort_order?: number | null
          target_weight?: number | null
          updated_at?: string
          upper_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "positions_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      prospects: {
        Row: {
          conviction: string | null
          created_at: string
          date_added: string
          id: number
          removed_at: string | null
          security_id: string
          target_portfolio: string | null
          target_price: number | null
          thesis: string | null
          updated_at: string
        }
        Insert: {
          conviction?: string | null
          created_at?: string
          date_added?: string
          id?: number
          removed_at?: string | null
          security_id: string
          target_portfolio?: string | null
          target_price?: number | null
          thesis?: string | null
          updated_at?: string
        }
        Update: {
          conviction?: string | null
          created_at?: string
          date_added?: string
          id?: number
          removed_at?: string | null
          security_id?: string
          target_portfolio?: string | null
          target_price?: number | null
          thesis?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospects_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      rebalance_log: {
        Row: {
          created_at: string
          id: number
          notes: string | null
          portfolio_name: string | null
          positions_snapshot: Json | null
          rebalanced_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          notes?: string | null
          portfolio_name?: string | null
          positions_snapshot?: Json | null
          rebalanced_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          notes?: string | null
          portfolio_name?: string | null
          positions_snapshot?: Json | null
          rebalanced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rebalance_log_portfolio_name_fkey"
            columns: ["portfolio_name"]
            isOneToOne: false
            referencedRelation: "portfolio"
            referencedColumns: ["name"]
          },
        ]
      }
      review_log: {
        Row: {
          conviction: string | null
          created_at: string
          id: number
          ips_suitable: boolean | null
          metrics_snapshot: Json | null
          notes: string | null
          outcome: string | null
          price_at_review: number | null
          recommendation: string | null
          review_date: string | null
          reviewed_at: string
          reviewed_by: string | null
          security_id: string
        }
        Insert: {
          conviction?: string | null
          created_at?: string
          id?: number
          ips_suitable?: boolean | null
          metrics_snapshot?: Json | null
          notes?: string | null
          outcome?: string | null
          price_at_review?: number | null
          recommendation?: string | null
          review_date?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          security_id: string
        }
        Update: {
          conviction?: string | null
          created_at?: string
          id?: number
          ips_suitable?: boolean | null
          metrics_snapshot?: Json | null
          notes?: string | null
          outcome?: string | null
          price_at_review?: number | null
          recommendation?: string | null
          review_date?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          security_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_log_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      review_schedules: {
        Row: {
          cadence: string
          created_at: string
          id: number
          last_reviewed_at: string | null
          next_review_at: string
          security_id: string
          updated_at: string
        }
        Insert: {
          cadence: string
          created_at?: string
          id?: number
          last_reviewed_at?: string | null
          next_review_at: string
          security_id: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          created_at?: string
          id?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          security_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_schedules_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: true
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      sector_benchmarks: {
        Row: {
          "1_to_3_years_maturity_bond_exposure": number | null
          "3_to_5_years_maturity_bond_exposure": number | null
          a_bond_exposure_generic: number | null
          aa_bond_exposure_generic: number | null
          aaa_bond_exposure_generic: number | null
          annualized_daily_five_year_total_return: number | null
          annualized_daily_one_year_total_return: number | null
          annualized_daily_three_year_return: number | null
          b_bond_exposure_generic: number | null
          basic_materials_exposure: number | null
          bb_bond_exposure_generic: number | null
          bbb_bond_exposure_generic: number | null
          below_b_bond_exposure_generic: number | null
          communication_services_exposure: number | null
          consumer_cyclical_exposure: number | null
          consumer_defensive_exposure: number | null
          energy_exposure: number | null
          eps_growth_1_yr_generic: number | null
          eps_growth_3_yr_generic: number | null
          etf_proxy: string | null
          financial_services_exposure: number | null
          healthcare_exposure: number | null
          historical_sharpe_1y: number | null
          historical_sharpe_3y: number | null
          historical_sharpe_5y: number | null
          historical_sortino_1y: number | null
          historical_sortino_3y: number | null
          historical_sortino_5y: number | null
          id: number
          industrials_exposure: number | null
          maturity_10_to_20_years_generic: number | null
          maturity_20_to_30_years_generic: number | null
          maturity_5_to_10_years_generic: number | null
          maturity_less_than_1_year_generic: number | null
          monthly_standard_deviation_annualized_1y: number | null
          one_month_total_return: number | null
          over_30_years_maturity_bond_exposure: number | null
          quarterly_standard_deviation_annualized_3y: number | null
          quarterly_standard_deviation_annualized_5y: number | null
          real_estate_exposure: number | null
          sales_growth_1_yr_generic: number | null
          sales_growth_3_yr_generic: number | null
          sector: string | null
          sector_benchmarks: string | null
          technology_exposure: number | null
          three_month_total_return: number | null
          ticker: string
          utilities_exposure: number | null
          ytd_total_return: number | null
        }
        Insert: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          communication_services_exposure?: number | null
          consumer_cyclical_exposure?: number | null
          consumer_defensive_exposure?: number | null
          energy_exposure?: number | null
          eps_growth_1_yr_generic?: number | null
          eps_growth_3_yr_generic?: number | null
          etf_proxy?: string | null
          financial_services_exposure?: number | null
          healthcare_exposure?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          id?: never
          industrials_exposure?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          one_month_total_return?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure?: number | null
          sales_growth_1_yr_generic?: number | null
          sales_growth_3_yr_generic?: number | null
          sector?: string | null
          sector_benchmarks?: string | null
          technology_exposure?: number | null
          three_month_total_return?: number | null
          ticker: string
          utilities_exposure?: number | null
          ytd_total_return?: number | null
        }
        Update: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          communication_services_exposure?: number | null
          consumer_cyclical_exposure?: number | null
          consumer_defensive_exposure?: number | null
          energy_exposure?: number | null
          eps_growth_1_yr_generic?: number | null
          eps_growth_3_yr_generic?: number | null
          etf_proxy?: string | null
          financial_services_exposure?: number | null
          healthcare_exposure?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          id?: never
          industrials_exposure?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          one_month_total_return?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure?: number | null
          sales_growth_1_yr_generic?: number | null
          sales_growth_3_yr_generic?: number | null
          sector?: string | null
          sector_benchmarks?: string | null
          technology_exposure?: number | null
          three_month_total_return?: number | null
          ticker?: string
          utilities_exposure?: number | null
          ytd_total_return?: number | null
        }
        Relationships: []
      }
      securities2: {
        Row: {
          "1_to_3_years_maturity_bond_exposure": number | null
          "3_to_5_years_maturity_bond_exposure": number | null
          a_bond_exposure_generic: number | null
          aa_bond_exposure_generic: number | null
          aaa_bond_exposure_generic: number | null
          africa_middle_east_total_exposure: number | null
          alpha_1y_vs_category: number | null
          alpha_3y_vs_category: number | null
          alpha_5y_vs_category: number | null
          alpha_peer_group_rank: number | null
          alpha_rank: number | null
          alt_1: string | null
          alt_2: string | null
          alt_3: string | null
          annualized_daily_five_year_total_return: number | null
          annualized_daily_one_year_total_return: number | null
          annualized_daily_ten_year_total_return: number | null
          annualized_daily_three_year_return: number | null
          annualized_five_year_total_return_nav: number | null
          annualized_ten_year_total_return_nav: number | null
          annualized_three_year_total_return_nav: number | null
          asia_developed_total_exposure_generic: number | null
          asia_emerging_total_exposure: number | null
          assets_under_management: number | null
          b_bond_exposure_generic: number | null
          basic_materials_exposure_generic: number | null
          bb_bond_exposure_generic: number | null
          bbb_bond_exposure_generic: number | null
          below_b_bond_exposure_generic: number | null
          beta_1y_vs_category: number | null
          beta_3y_vs_category: number | null
          beta_5y_vs_category: number | null
          bond_net: number | null
          broad_asset_class: string | null
          broad_category_group: string | null
          calmar_ratio_1y: number | null
          calmar_ratio_3y: number | null
          calmar_ratio_5y: number | null
          cash_net: number | null
          category_five_year_total_return: number | null
          category_group_style_five_year_total_return: number | null
          category_group_style_one_month_total_return: number | null
          category_group_style_one_year_total_return: number | null
          category_group_style_ten_year_total_return: number | null
          category_group_style_three_month_total_return: number | null
          category_group_style_three_year_total_return: number | null
          category_group_style_ytd_total_return: number | null
          category_index: string | null
          category_name: string | null
          category_one_month_total_return: number | null
          category_one_year_total_return: number | null
          category_ten_year_total_return: number | null
          category_three_month_total_return: number | null
          category_three_year_total_return: number | null
          category_ytd_total_return: number | null
          communication_services_exposure_generic: number | null
          consumer_cyclical_exposure_generic: number | null
          consumer_defensive_exposure_generic: number | null
          convertible_net: number | null
          corporate_fixed_income_exposure_generic: number | null
          created_at: string
          deleted_at: string | null
          detailed_security_type: string | null
          discount_or_premium_to_nav: number | null
          dividend_growth_ttm: number | null
          effective_duration: number | null
          energy_exposure_generic: number | null
          enhanced_market_alpha_12_month: number | null
          enhanced_market_alpha_36_month: number | null
          enhanced_market_alpha_60_month: number | null
          enhanced_market_beta_12_month: number | null
          enhanced_market_beta_36_month: number | null
          eps_growth_1_yr_generic: number | null
          eps_growth_qoq: number | null
          equity_style_internal: string | null
          equity_stylebox_large_cap_blend_exposure: number | null
          equity_stylebox_large_cap_growth_exposure: number | null
          equity_stylebox_large_cap_value_exposure: number | null
          equity_stylebox_mid_cap_blend_exposure: number | null
          equity_stylebox_mid_cap_growth_exposure: number | null
          equity_stylebox_mid_cap_value_exposure: number | null
          equity_stylebox_small_cap_blend_exposure: number | null
          equity_stylebox_small_cap_growth_exposure: number | null
          equity_stylebox_small_cap_value_exposure: number | null
          europe_developed_total_exposure_generic: number | null
          europe_emerging_total_exposure: number | null
          expense_ratio_generic: number | null
          expense_ratio_peer_group_rank: number | null
          expense_ratio_rank: number | null
          financial_services_exposure_generic: number | null
          five_year_tax_cost_ratio_generic: number | null
          five_year_total_return_peer_group_rank_nav: number | null
          five_year_total_return_peer_group_size_nav: number | null
          five_year_total_return_rank_category_size_nav: number | null
          five_year_total_return_rank_nav: number | null
          forward_peg_ratio_1y: number | null
          fund_company_name: string | null
          fund_family: string | null
          government_fixed_income_exposure_generic: number | null
          healthcare_exposure_generic: number | null
          historical_sharpe_1y: number | null
          historical_sharpe_3y: number | null
          historical_sharpe_5y: number | null
          historical_sortino_1y: number | null
          historical_sortino_3y: number | null
          historical_sortino_5y: number | null
          historical_treynor_measure_1y_vs_category: number | null
          historical_treynor_measure_1y_vs_pg: number | null
          historical_treynor_measure_3y_vs_category: number | null
          historical_treynor_measure_3y_vs_pg: number | null
          historical_treynor_measure_5y_vs_category: number | null
          historical_treynor_measure_5y_vs_pg: number | null
          id: number
          inception_date: string | null
          industrials_exposure_generic: number | null
          information_ratio_1y_vs_category: number | null
          information_ratio_1y_vs_pg: number | null
          information_ratio_3y_vs_category: number | null
          information_ratio_3y_vs_pg: number | null
          information_ratio_5y_vs_category: number | null
          information_ratio_5y_vs_pg: number | null
          information_ratio_peer_group_rank: number | null
          information_ratio_rank: number | null
          investment_strategy: string | null
          last_earnings_release: string | null
          latin_america_total_exposure_generic: number | null
          long_description: string | null
          market_alpha_1y_vs_pg: number | null
          market_alpha_3y_vs_pg: number | null
          market_alpha_5y_vs_pg: number | null
          market_beta_1y_vs_pg: number | null
          market_beta_3y_vs_pg: number | null
          market_beta_5y_vs_pg: number | null
          maturity_10_to_20_years_generic: number | null
          maturity_20_to_30_years_generic: number | null
          maturity_5_to_10_years_generic: number | null
          maturity_less_than_1_year_generic: number | null
          max_drawdown_1y: number | null
          max_drawdown_3y: number | null
          max_drawdown_5y: number | null
          max_manager_tenure: number | null
          monthly_standard_deviation_annualized_1y: number | null
          morningstar_industry: string | null
          morningstar_sector: string | null
          municipal_fixed_income_exposure_generic: number | null
          next_earnings_release: string | null
          north_america_total_exposure_generic: number | null
          number_of_holdings: number | null
          one_month_total_return: number | null
          one_month_total_return_nav: number | null
          one_month_total_return_peer_group_rank_nav: number | null
          one_month_total_return_peer_group_size_nav: number | null
          one_month_total_return_rank_category_size_nav: number | null
          one_month_total_return_rank_nav: number | null
          one_year_tax_cost_ratio_generic: number | null
          one_year_total_return_nav: number | null
          one_year_total_return_peer_group_rank_nav: number | null
          one_year_total_return_peer_group_size_nav: number | null
          one_year_total_return_rank_category_size_nav: number | null
          one_year_total_return_rank_nav: number | null
          other_fixed_income_exposure_generic: number | null
          other_net: number | null
          over_30_years_maturity_bond_exposure: number | null
          peer_group_five_year_total_return: number | null
          peer_group_name: string | null
          peer_group_one_month_total_return: number | null
          peer_group_one_year_total_return: number | null
          peer_group_ten_year_total_return: number | null
          peer_group_three_month_total_return: number | null
          peer_group_three_year_total_return: number | null
          peer_group_ytd_total_return: number | null
          preferred_benchmark1_id: number | null
          preferred_benchmark2_id: number | null
          preferred_net: number | null
          quarterly_standard_deviation_annualized_3y: number | null
          quarterly_standard_deviation_annualized_5y: number | null
          real_estate_exposure_generic: number | null
          rsquared_1y_vs_category: number | null
          rsquared_1y_vs_pg: number | null
          rsquared_3y_vs_category: number | null
          rsquared_3y_vs_pg: number | null
          rsquared_5y_vs_category: number | null
          rsquared_5y_vs_pg: number | null
          sales_growth_1_yr_generic: number | null
          securitized_fixed_income_exposure_generic: number | null
          security_id: string
          security_name: string | null
          sharpe_peer_group_rank: number | null
          sharpe_rank: number | null
          stock_net: number | null
          technology_exposure_generic: number | null
          ten_year_total_return_peer_group_rank_nav: number | null
          ten_year_total_return_peer_group_size_nav: number | null
          ten_year_total_return_rank_category_size_nav: number | null
          ten_year_total_return_rank_nav: number | null
          thesis: string | null
          three_month_total_return: number | null
          three_month_total_return_nav: number | null
          three_month_total_return_peer_group_rank_nav: number | null
          three_month_total_return_peer_group_size_nav: number | null
          three_month_total_return_rank_category_size_nav: number | null
          three_month_total_return_rank_nav: number | null
          three_year_tax_cost_ratio_generic: number | null
          three_year_total_return_peer_group_rank_nav: number | null
          three_year_total_return_peer_group_size_nav: number | null
          three_year_total_return_rank_category_size_nav: number | null
          three_year_total_return_rank_nav: number | null
          tracking_error_1y_vs_category: number | null
          tracking_error_1y_vs_pg: number | null
          tracking_error_3y_vs_category: number | null
          tracking_error_3y_vs_pg: number | null
          tracking_error_5y_vs_category: number | null
          tracking_error_5y_vs_pg: number | null
          united_kingdom_total_exposure_generic: number | null
          updated_at: string
          upside_downside_1y_vs_category: number | null
          upside_downside_1y_vs_pg: number | null
          upside_downside_3y_vs_category: number | null
          upside_downside_3y_vs_pg: number | null
          upside_downside_5y_vs_category: number | null
          upside_downside_5y_vs_pg: number | null
          utilities_exposure_generic: number | null
          ycharts_benchmark_category: string | null
          ytd_total_return: number | null
          ytd_total_return_nav: number | null
          ytd_total_return_peer_group_rank_nav: number | null
          ytd_total_return_peer_group_size_nav: number | null
          ytd_total_return_rank_category_size_nav: number | null
          ytd_total_return_rank_nav: number | null
        }
        Insert: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          africa_middle_east_total_exposure?: number | null
          alpha_1y_vs_category?: number | null
          alpha_3y_vs_category?: number | null
          alpha_5y_vs_category?: number | null
          alpha_peer_group_rank?: number | null
          alpha_rank?: number | null
          alt_1?: string | null
          alt_2?: string | null
          alt_3?: string | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_ten_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          annualized_five_year_total_return_nav?: number | null
          annualized_ten_year_total_return_nav?: number | null
          annualized_three_year_total_return_nav?: number | null
          asia_developed_total_exposure_generic?: number | null
          asia_emerging_total_exposure?: number | null
          assets_under_management?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure_generic?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          beta_1y_vs_category?: number | null
          beta_3y_vs_category?: number | null
          beta_5y_vs_category?: number | null
          bond_net?: number | null
          broad_asset_class?: string | null
          broad_category_group?: string | null
          calmar_ratio_1y?: number | null
          calmar_ratio_3y?: number | null
          calmar_ratio_5y?: number | null
          cash_net?: number | null
          category_five_year_total_return?: number | null
          category_group_style_five_year_total_return?: number | null
          category_group_style_one_month_total_return?: number | null
          category_group_style_one_year_total_return?: number | null
          category_group_style_ten_year_total_return?: number | null
          category_group_style_three_month_total_return?: number | null
          category_group_style_three_year_total_return?: number | null
          category_group_style_ytd_total_return?: number | null
          category_index?: string | null
          category_name?: string | null
          category_one_month_total_return?: number | null
          category_one_year_total_return?: number | null
          category_ten_year_total_return?: number | null
          category_three_month_total_return?: number | null
          category_three_year_total_return?: number | null
          category_ytd_total_return?: number | null
          communication_services_exposure_generic?: number | null
          consumer_cyclical_exposure_generic?: number | null
          consumer_defensive_exposure_generic?: number | null
          convertible_net?: number | null
          corporate_fixed_income_exposure_generic?: number | null
          created_at?: string
          deleted_at?: string | null
          detailed_security_type?: string | null
          discount_or_premium_to_nav?: number | null
          dividend_growth_ttm?: number | null
          effective_duration?: number | null
          energy_exposure_generic?: number | null
          enhanced_market_alpha_12_month?: number | null
          enhanced_market_alpha_36_month?: number | null
          enhanced_market_alpha_60_month?: number | null
          enhanced_market_beta_12_month?: number | null
          enhanced_market_beta_36_month?: number | null
          eps_growth_1_yr_generic?: number | null
          eps_growth_qoq?: number | null
          equity_style_internal?: string | null
          equity_stylebox_large_cap_blend_exposure?: number | null
          equity_stylebox_large_cap_growth_exposure?: number | null
          equity_stylebox_large_cap_value_exposure?: number | null
          equity_stylebox_mid_cap_blend_exposure?: number | null
          equity_stylebox_mid_cap_growth_exposure?: number | null
          equity_stylebox_mid_cap_value_exposure?: number | null
          equity_stylebox_small_cap_blend_exposure?: number | null
          equity_stylebox_small_cap_growth_exposure?: number | null
          equity_stylebox_small_cap_value_exposure?: number | null
          europe_developed_total_exposure_generic?: number | null
          europe_emerging_total_exposure?: number | null
          expense_ratio_generic?: number | null
          expense_ratio_peer_group_rank?: number | null
          expense_ratio_rank?: number | null
          financial_services_exposure_generic?: number | null
          five_year_tax_cost_ratio_generic?: number | null
          five_year_total_return_peer_group_rank_nav?: number | null
          five_year_total_return_peer_group_size_nav?: number | null
          five_year_total_return_rank_category_size_nav?: number | null
          five_year_total_return_rank_nav?: number | null
          forward_peg_ratio_1y?: number | null
          fund_company_name?: string | null
          fund_family?: string | null
          government_fixed_income_exposure_generic?: number | null
          healthcare_exposure_generic?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          historical_treynor_measure_1y_vs_category?: number | null
          historical_treynor_measure_1y_vs_pg?: number | null
          historical_treynor_measure_3y_vs_category?: number | null
          historical_treynor_measure_3y_vs_pg?: number | null
          historical_treynor_measure_5y_vs_category?: number | null
          historical_treynor_measure_5y_vs_pg?: number | null
          id?: number
          inception_date?: string | null
          industrials_exposure_generic?: number | null
          information_ratio_1y_vs_category?: number | null
          information_ratio_1y_vs_pg?: number | null
          information_ratio_3y_vs_category?: number | null
          information_ratio_3y_vs_pg?: number | null
          information_ratio_5y_vs_category?: number | null
          information_ratio_5y_vs_pg?: number | null
          information_ratio_peer_group_rank?: number | null
          information_ratio_rank?: number | null
          investment_strategy?: string | null
          last_earnings_release?: string | null
          latin_america_total_exposure_generic?: number | null
          long_description?: string | null
          market_alpha_1y_vs_pg?: number | null
          market_alpha_3y_vs_pg?: number | null
          market_alpha_5y_vs_pg?: number | null
          market_beta_1y_vs_pg?: number | null
          market_beta_3y_vs_pg?: number | null
          market_beta_5y_vs_pg?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          max_drawdown_1y?: number | null
          max_drawdown_3y?: number | null
          max_drawdown_5y?: number | null
          max_manager_tenure?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          morningstar_industry?: string | null
          morningstar_sector?: string | null
          municipal_fixed_income_exposure_generic?: number | null
          next_earnings_release?: string | null
          north_america_total_exposure_generic?: number | null
          number_of_holdings?: number | null
          one_month_total_return?: number | null
          one_month_total_return_nav?: number | null
          one_month_total_return_peer_group_rank_nav?: number | null
          one_month_total_return_peer_group_size_nav?: number | null
          one_month_total_return_rank_category_size_nav?: number | null
          one_month_total_return_rank_nav?: number | null
          one_year_tax_cost_ratio_generic?: number | null
          one_year_total_return_nav?: number | null
          one_year_total_return_peer_group_rank_nav?: number | null
          one_year_total_return_peer_group_size_nav?: number | null
          one_year_total_return_rank_category_size_nav?: number | null
          one_year_total_return_rank_nav?: number | null
          other_fixed_income_exposure_generic?: number | null
          other_net?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          peer_group_five_year_total_return?: number | null
          peer_group_name?: string | null
          peer_group_one_month_total_return?: number | null
          peer_group_one_year_total_return?: number | null
          peer_group_ten_year_total_return?: number | null
          peer_group_three_month_total_return?: number | null
          peer_group_three_year_total_return?: number | null
          peer_group_ytd_total_return?: number | null
          preferred_benchmark1_id?: number | null
          preferred_benchmark2_id?: number | null
          preferred_net?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure_generic?: number | null
          rsquared_1y_vs_category?: number | null
          rsquared_1y_vs_pg?: number | null
          rsquared_3y_vs_category?: number | null
          rsquared_3y_vs_pg?: number | null
          rsquared_5y_vs_category?: number | null
          rsquared_5y_vs_pg?: number | null
          sales_growth_1_yr_generic?: number | null
          securitized_fixed_income_exposure_generic?: number | null
          security_id: string
          security_name?: string | null
          sharpe_peer_group_rank?: number | null
          sharpe_rank?: number | null
          stock_net?: number | null
          technology_exposure_generic?: number | null
          ten_year_total_return_peer_group_rank_nav?: number | null
          ten_year_total_return_peer_group_size_nav?: number | null
          ten_year_total_return_rank_category_size_nav?: number | null
          ten_year_total_return_rank_nav?: number | null
          thesis?: string | null
          three_month_total_return?: number | null
          three_month_total_return_nav?: number | null
          three_month_total_return_peer_group_rank_nav?: number | null
          three_month_total_return_peer_group_size_nav?: number | null
          three_month_total_return_rank_category_size_nav?: number | null
          three_month_total_return_rank_nav?: number | null
          three_year_tax_cost_ratio_generic?: number | null
          three_year_total_return_peer_group_rank_nav?: number | null
          three_year_total_return_peer_group_size_nav?: number | null
          three_year_total_return_rank_category_size_nav?: number | null
          three_year_total_return_rank_nav?: number | null
          tracking_error_1y_vs_category?: number | null
          tracking_error_1y_vs_pg?: number | null
          tracking_error_3y_vs_category?: number | null
          tracking_error_3y_vs_pg?: number | null
          tracking_error_5y_vs_category?: number | null
          tracking_error_5y_vs_pg?: number | null
          united_kingdom_total_exposure_generic?: number | null
          updated_at?: string
          upside_downside_1y_vs_category?: number | null
          upside_downside_1y_vs_pg?: number | null
          upside_downside_3y_vs_category?: number | null
          upside_downside_3y_vs_pg?: number | null
          upside_downside_5y_vs_category?: number | null
          upside_downside_5y_vs_pg?: number | null
          utilities_exposure_generic?: number | null
          ycharts_benchmark_category?: string | null
          ytd_total_return?: number | null
          ytd_total_return_nav?: number | null
          ytd_total_return_peer_group_rank_nav?: number | null
          ytd_total_return_peer_group_size_nav?: number | null
          ytd_total_return_rank_category_size_nav?: number | null
          ytd_total_return_rank_nav?: number | null
        }
        Update: {
          "1_to_3_years_maturity_bond_exposure"?: number | null
          "3_to_5_years_maturity_bond_exposure"?: number | null
          a_bond_exposure_generic?: number | null
          aa_bond_exposure_generic?: number | null
          aaa_bond_exposure_generic?: number | null
          africa_middle_east_total_exposure?: number | null
          alpha_1y_vs_category?: number | null
          alpha_3y_vs_category?: number | null
          alpha_5y_vs_category?: number | null
          alpha_peer_group_rank?: number | null
          alpha_rank?: number | null
          alt_1?: string | null
          alt_2?: string | null
          alt_3?: string | null
          annualized_daily_five_year_total_return?: number | null
          annualized_daily_one_year_total_return?: number | null
          annualized_daily_ten_year_total_return?: number | null
          annualized_daily_three_year_return?: number | null
          annualized_five_year_total_return_nav?: number | null
          annualized_ten_year_total_return_nav?: number | null
          annualized_three_year_total_return_nav?: number | null
          asia_developed_total_exposure_generic?: number | null
          asia_emerging_total_exposure?: number | null
          assets_under_management?: number | null
          b_bond_exposure_generic?: number | null
          basic_materials_exposure_generic?: number | null
          bb_bond_exposure_generic?: number | null
          bbb_bond_exposure_generic?: number | null
          below_b_bond_exposure_generic?: number | null
          beta_1y_vs_category?: number | null
          beta_3y_vs_category?: number | null
          beta_5y_vs_category?: number | null
          bond_net?: number | null
          broad_asset_class?: string | null
          broad_category_group?: string | null
          calmar_ratio_1y?: number | null
          calmar_ratio_3y?: number | null
          calmar_ratio_5y?: number | null
          cash_net?: number | null
          category_five_year_total_return?: number | null
          category_group_style_five_year_total_return?: number | null
          category_group_style_one_month_total_return?: number | null
          category_group_style_one_year_total_return?: number | null
          category_group_style_ten_year_total_return?: number | null
          category_group_style_three_month_total_return?: number | null
          category_group_style_three_year_total_return?: number | null
          category_group_style_ytd_total_return?: number | null
          category_index?: string | null
          category_name?: string | null
          category_one_month_total_return?: number | null
          category_one_year_total_return?: number | null
          category_ten_year_total_return?: number | null
          category_three_month_total_return?: number | null
          category_three_year_total_return?: number | null
          category_ytd_total_return?: number | null
          communication_services_exposure_generic?: number | null
          consumer_cyclical_exposure_generic?: number | null
          consumer_defensive_exposure_generic?: number | null
          convertible_net?: number | null
          corporate_fixed_income_exposure_generic?: number | null
          created_at?: string
          deleted_at?: string | null
          detailed_security_type?: string | null
          discount_or_premium_to_nav?: number | null
          dividend_growth_ttm?: number | null
          effective_duration?: number | null
          energy_exposure_generic?: number | null
          enhanced_market_alpha_12_month?: number | null
          enhanced_market_alpha_36_month?: number | null
          enhanced_market_alpha_60_month?: number | null
          enhanced_market_beta_12_month?: number | null
          enhanced_market_beta_36_month?: number | null
          eps_growth_1_yr_generic?: number | null
          eps_growth_qoq?: number | null
          equity_style_internal?: string | null
          equity_stylebox_large_cap_blend_exposure?: number | null
          equity_stylebox_large_cap_growth_exposure?: number | null
          equity_stylebox_large_cap_value_exposure?: number | null
          equity_stylebox_mid_cap_blend_exposure?: number | null
          equity_stylebox_mid_cap_growth_exposure?: number | null
          equity_stylebox_mid_cap_value_exposure?: number | null
          equity_stylebox_small_cap_blend_exposure?: number | null
          equity_stylebox_small_cap_growth_exposure?: number | null
          equity_stylebox_small_cap_value_exposure?: number | null
          europe_developed_total_exposure_generic?: number | null
          europe_emerging_total_exposure?: number | null
          expense_ratio_generic?: number | null
          expense_ratio_peer_group_rank?: number | null
          expense_ratio_rank?: number | null
          financial_services_exposure_generic?: number | null
          five_year_tax_cost_ratio_generic?: number | null
          five_year_total_return_peer_group_rank_nav?: number | null
          five_year_total_return_peer_group_size_nav?: number | null
          five_year_total_return_rank_category_size_nav?: number | null
          five_year_total_return_rank_nav?: number | null
          forward_peg_ratio_1y?: number | null
          fund_company_name?: string | null
          fund_family?: string | null
          government_fixed_income_exposure_generic?: number | null
          healthcare_exposure_generic?: number | null
          historical_sharpe_1y?: number | null
          historical_sharpe_3y?: number | null
          historical_sharpe_5y?: number | null
          historical_sortino_1y?: number | null
          historical_sortino_3y?: number | null
          historical_sortino_5y?: number | null
          historical_treynor_measure_1y_vs_category?: number | null
          historical_treynor_measure_1y_vs_pg?: number | null
          historical_treynor_measure_3y_vs_category?: number | null
          historical_treynor_measure_3y_vs_pg?: number | null
          historical_treynor_measure_5y_vs_category?: number | null
          historical_treynor_measure_5y_vs_pg?: number | null
          id?: number
          inception_date?: string | null
          industrials_exposure_generic?: number | null
          information_ratio_1y_vs_category?: number | null
          information_ratio_1y_vs_pg?: number | null
          information_ratio_3y_vs_category?: number | null
          information_ratio_3y_vs_pg?: number | null
          information_ratio_5y_vs_category?: number | null
          information_ratio_5y_vs_pg?: number | null
          information_ratio_peer_group_rank?: number | null
          information_ratio_rank?: number | null
          investment_strategy?: string | null
          last_earnings_release?: string | null
          latin_america_total_exposure_generic?: number | null
          long_description?: string | null
          market_alpha_1y_vs_pg?: number | null
          market_alpha_3y_vs_pg?: number | null
          market_alpha_5y_vs_pg?: number | null
          market_beta_1y_vs_pg?: number | null
          market_beta_3y_vs_pg?: number | null
          market_beta_5y_vs_pg?: number | null
          maturity_10_to_20_years_generic?: number | null
          maturity_20_to_30_years_generic?: number | null
          maturity_5_to_10_years_generic?: number | null
          maturity_less_than_1_year_generic?: number | null
          max_drawdown_1y?: number | null
          max_drawdown_3y?: number | null
          max_drawdown_5y?: number | null
          max_manager_tenure?: number | null
          monthly_standard_deviation_annualized_1y?: number | null
          morningstar_industry?: string | null
          morningstar_sector?: string | null
          municipal_fixed_income_exposure_generic?: number | null
          next_earnings_release?: string | null
          north_america_total_exposure_generic?: number | null
          number_of_holdings?: number | null
          one_month_total_return?: number | null
          one_month_total_return_nav?: number | null
          one_month_total_return_peer_group_rank_nav?: number | null
          one_month_total_return_peer_group_size_nav?: number | null
          one_month_total_return_rank_category_size_nav?: number | null
          one_month_total_return_rank_nav?: number | null
          one_year_tax_cost_ratio_generic?: number | null
          one_year_total_return_nav?: number | null
          one_year_total_return_peer_group_rank_nav?: number | null
          one_year_total_return_peer_group_size_nav?: number | null
          one_year_total_return_rank_category_size_nav?: number | null
          one_year_total_return_rank_nav?: number | null
          other_fixed_income_exposure_generic?: number | null
          other_net?: number | null
          over_30_years_maturity_bond_exposure?: number | null
          peer_group_five_year_total_return?: number | null
          peer_group_name?: string | null
          peer_group_one_month_total_return?: number | null
          peer_group_one_year_total_return?: number | null
          peer_group_ten_year_total_return?: number | null
          peer_group_three_month_total_return?: number | null
          peer_group_three_year_total_return?: number | null
          peer_group_ytd_total_return?: number | null
          preferred_benchmark1_id?: number | null
          preferred_benchmark2_id?: number | null
          preferred_net?: number | null
          quarterly_standard_deviation_annualized_3y?: number | null
          quarterly_standard_deviation_annualized_5y?: number | null
          real_estate_exposure_generic?: number | null
          rsquared_1y_vs_category?: number | null
          rsquared_1y_vs_pg?: number | null
          rsquared_3y_vs_category?: number | null
          rsquared_3y_vs_pg?: number | null
          rsquared_5y_vs_category?: number | null
          rsquared_5y_vs_pg?: number | null
          sales_growth_1_yr_generic?: number | null
          securitized_fixed_income_exposure_generic?: number | null
          security_id?: string
          security_name?: string | null
          sharpe_peer_group_rank?: number | null
          sharpe_rank?: number | null
          stock_net?: number | null
          technology_exposure_generic?: number | null
          ten_year_total_return_peer_group_rank_nav?: number | null
          ten_year_total_return_peer_group_size_nav?: number | null
          ten_year_total_return_rank_category_size_nav?: number | null
          ten_year_total_return_rank_nav?: number | null
          thesis?: string | null
          three_month_total_return?: number | null
          three_month_total_return_nav?: number | null
          three_month_total_return_peer_group_rank_nav?: number | null
          three_month_total_return_peer_group_size_nav?: number | null
          three_month_total_return_rank_category_size_nav?: number | null
          three_month_total_return_rank_nav?: number | null
          three_year_tax_cost_ratio_generic?: number | null
          three_year_total_return_peer_group_rank_nav?: number | null
          three_year_total_return_peer_group_size_nav?: number | null
          three_year_total_return_rank_category_size_nav?: number | null
          three_year_total_return_rank_nav?: number | null
          tracking_error_1y_vs_category?: number | null
          tracking_error_1y_vs_pg?: number | null
          tracking_error_3y_vs_category?: number | null
          tracking_error_3y_vs_pg?: number | null
          tracking_error_5y_vs_category?: number | null
          tracking_error_5y_vs_pg?: number | null
          united_kingdom_total_exposure_generic?: number | null
          updated_at?: string
          upside_downside_1y_vs_category?: number | null
          upside_downside_1y_vs_pg?: number | null
          upside_downside_3y_vs_category?: number | null
          upside_downside_3y_vs_pg?: number | null
          upside_downside_5y_vs_category?: number | null
          upside_downside_5y_vs_pg?: number | null
          utilities_exposure_generic?: number | null
          ycharts_benchmark_category?: string | null
          ytd_total_return?: number | null
          ytd_total_return_nav?: number | null
          ytd_total_return_peer_group_rank_nav?: number | null
          ytd_total_return_peer_group_size_nav?: number | null
          ytd_total_return_rank_category_size_nav?: number | null
          ytd_total_return_rank_nav?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "securities2_preferred_benchmark1_id_fkey"
            columns: ["preferred_benchmark1_id"]
            isOneToOne: false
            referencedRelation: "category_benchmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "securities2_preferred_benchmark2_id_fkey"
            columns: ["preferred_benchmark2_id"]
            isOneToOne: false
            referencedRelation: "sector_benchmarks"
            referencedColumns: ["id"]
          },
        ]
      }
      security_related_securities: {
        Row: {
          id: number
          related_id: string
          security_id: string
          sort_order: number
        }
        Insert: {
          id?: never
          related_id: string
          security_id: string
          sort_order?: number
        }
        Update: {
          id?: never
          related_id?: string
          security_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "security_related_securities_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      substitutions: {
        Row: {
          approved_at: string | null
          at_risk_id: number
          created_at: string
          id: number
          incumbent_security_id: string
          proposed_security_id: string
          rationale: string | null
          reviewed_at: string | null
          status: string
          swapped_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          at_risk_id: number
          created_at?: string
          id?: number
          incumbent_security_id: string
          proposed_security_id: string
          rationale?: string | null
          reviewed_at?: string | null
          status?: string
          swapped_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          at_risk_id?: number
          created_at?: string
          id?: number
          incumbent_security_id?: string
          proposed_security_id?: string
          rationale?: string | null
          reviewed_at?: string | null
          status?: string
          swapped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "substitutions_at_risk_id_fkey"
            columns: ["at_risk_id"]
            isOneToOne: false
            referencedRelation: "at_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "substitutions_incumbent_security_id_fkey"
            columns: ["incumbent_security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
          {
            foreignKeyName: "substitutions_proposed_security_id_fkey"
            columns: ["proposed_security_id"]
            isOneToOne: false
            referencedRelation: "securities2"
            referencedColumns: ["security_id"]
          },
        ]
      }
      trade_suitability: {
        Row: {
          action: string
          id: number
          new_weight: number | null
          old_weight: number | null
          portfolio_name: string
          rationale: string | null
          reason_code: string
          recorded_at: string
          security_id: string
        }
        Insert: {
          action: string
          id?: never
          new_weight?: number | null
          old_weight?: number | null
          portfolio_name: string
          rationale?: string | null
          reason_code: string
          recorded_at?: string
          security_id: string
        }
        Update: {
          action?: string
          id?: never
          new_weight?: number | null
          old_weight?: number | null
          portfolio_name?: string
          rationale?: string | null
          reason_code?: string
          recorded_at?: string
          security_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
