/**
 * benchmarkExcelUpload.ts
 *
 * Builds a `benchmarks` table patch from either upload template:
 *   - ETF & Mutual Fund Upload Template (sheet: "Fund")   → delegates to buildPatchFromExcelFile
 *   - Portfolio Upload Template          (sheet: "Portfolio") → custom remap below
 *
 * The Portfolio template uses different db_column names than the benchmarks
 * schema expects (e.g. `one_year_total_return` vs `one_year_total_return_nav`,
 * `expense_ratio` vs `expense_ratio_generic`).  This module handles those
 * differences without touching the shared securities2ExcelUpload logic.
 */
import * as XLSX from 'xlsx'
import { buildPatchFromExcelFile } from './securities2ExcelUpload'
import { coerceNumber, coerceDate } from './excelImportShared'

// ── Portfolio template → benchmarks column remapping ────────────────────────
//
// Keys are db_column values from the Portfolio Upload Template.
// Values are:
//   string  → write to this benchmarks column instead
//   null    → skip (no matching column in benchmarks, or not useful there)
//   missing → pass through (db_column name is already correct for benchmarks)

// Exhaustive mapping of every db_column in the Portfolio Upload Template.
// string value  → write to this benchmarks column
// null          → skip entirely
// (no entry)    → column is unknown/unexpected; buildPortfolioBenchmarkPatch skips it
const PORTFOLIO_TO_BENCHMARK: Record<string, string | null> = {
  // ── Identity ──────────────────────────────────────────────────────────────
  'security_id':             null,  // used for row lookup, not written
  'security_name':           'security_name',
  'detailed_security_type':  'detailed_security_type',
  'description':             null,
  'earliest_performance_date': null,
  'assigned_benchmark_symbol': null,

  // ── Portfolio details ─────────────────────────────────────────────────────
  'all_time_high_date':             null,
  'all_time_low_date':              null,
  'expense_ratio':                  'expense_ratio_generic',  // renamed in benchmarks
  'dividend_yield':                 'dividend_yield',
  'number_of_holdings':             'number_of_holdings',
  'turnover_ratio':                 'turnover_ratio',
  'year_high_date':                 'year_high_date',
  'year_low_date':                  'year_low_date',
  'average_credit_quality_score':   'average_credit_quality_score',
  'ytd_tax_cost_ratio':             null,
  'tax_cost_ratio_since_inception': null,

  // ── Total returns (portfolio uses non-_nav; benchmarks/picker reads _nav) ─
  'one_month_total_return':               'one_month_total_return_nav',
  'three_month_total_return':             'three_month_total_return_nav',
  'ytd_total_return':                     'ytd_total_return_nav',
  'one_year_total_return':                'one_year_total_return_nav',
  'annualized_three_year_total_return':   'annualized_three_year_total_return_nav',
  'annualized_five_year_total_return':    'annualized_five_year_total_return_nav',
  'annualized_ten_year_total_return':         'annualized_ten_year_total_return_nav',
  'annualized_daily_all_time_total_return':   'annualized_daily_all_time_total_return',

  // ── Risk — Sharpe (all-time has no matching column) ───────────────────────
  'historical_sharpe_1y':  'historical_sharpe_1y',
  'historical_sharpe_3y':  'historical_sharpe_3y',
  'historical_sharpe_5y':  'historical_sharpe_5y',
  'historical_sharpe_all': null,

  // ── Risk — Sortino ────────────────────────────────────────────────────────
  'historical_sortino_1y':  'historical_sortino_1y',
  'historical_sortino_3y':  'historical_sortino_3y',
  'historical_sortino_5y':  'historical_sortino_5y',
  'historical_sortino_all': null,

  // ── Risk — Standard deviation ─────────────────────────────────────────────
  'monthly_standard_deviation_annualized_1y':  'monthly_standard_deviation_annualized_1y',
  'monthly_standard_deviation_annualized_3y':  'monthly_standard_deviation_annualized_3y',
  'monthly_standard_deviation_annualized_5y':  'monthly_standard_deviation_annualized_5y',
  'monthly_standard_deviation_annualized_all': null,

  // ── Risk — Max drawdown ───────────────────────────────────────────────────
  'max_drawdown_1y':  'max_drawdown_1y',
  'max_drawdown_3y':  'max_drawdown_3y',
  'max_drawdown_5y':  'max_drawdown_5y',
  'max_drawdown_all': null,

  // ── Alpha (portfolio: 'market_alpha_*'; values are usually ERR: NO DATA) ──
  'market_alpha_12_month': null,
  'market_alpha_36_month': null,
  'market_alpha_60_month': null,
  'market_alpha_all':      null,

  // ── Beta ──────────────────────────────────────────────────────────────────
  'quarterly_market_beta_12_month': null,
  'quarterly_market_beta_36_month': null,
  'quarterly_market_beta_60_month': 'enhanced_market_beta_60_month',
  'quarterly_market_beta_all':      null,

  // ── Treynor (strip all-time; remap period ones to vs_category) ────────────
  'historical_treynor_measure_1y':  'historical_treynor_measure_1y_vs_category',
  'historical_treynor_measure_3y':  'historical_treynor_measure_3y_vs_category',
  'historical_treynor_measure_5y':  'historical_treynor_measure_5y_vs_category',
  'historical_treynor_measure_all': null,

  // ── Tracking error (remap to vs_category) ────────────────────────────────
  'tracking_error_1y': 'tracking_error_1y_vs_category',
  'tracking_error_3y': 'tracking_error_3y_vs_category',
  'tracking_error_5y': 'tracking_error_5y_vs_category',

  // ── Upside / downside capture (remap; all-time has no column) ────────────
  'upside_downside_1y':  'upside_downside_1y_vs_category',
  'upside_downside_3y':  'upside_downside_3y_vs_category',
  'upside_downside_5y':  'upside_downside_5y_vs_category',
  'upside_downside_all': null,

  // ── Geographic exposure (pass through — same names) ───────────────────────
  'north_america_total_exposure_generic':      'north_america_total_exposure_generic',
  'latin_america_total_exposure_generic':      'latin_america_total_exposure_generic',
  'united_kingdom_total_exposure_generic':     'united_kingdom_total_exposure_generic',
  'europe_developed_total_exposure_generic':   'europe_developed_total_exposure_generic',
  'europe_emerging_total_exposure':            'europe_emerging_total_exposure',
  'africa_middle_east_total_exposure':         'africa_middle_east_total_exposure',
  'asia_developed_total_exposure_generic':     'asia_developed_total_exposure_generic',
  'asia_emerging_total_exposure':              'asia_emerging_total_exposure',

  // ── Style box (pass through) ──────────────────────────────────────────────
  'equity_stylebox_large_cap_value_exposure':  'equity_stylebox_large_cap_value_exposure',
  'equity_stylebox_large_cap_blend_exposure':  'equity_stylebox_large_cap_blend_exposure',
  'equity_stylebox_large_cap_growth_exposure': 'equity_stylebox_large_cap_growth_exposure',
  'equity_stylebox_mid_cap_value_exposure':    'equity_stylebox_mid_cap_value_exposure',
  'equity_stylebox_mid_cap_blend_exposure':    'equity_stylebox_mid_cap_blend_exposure',
  'equity_stylebox_mid_cap_growth_exposure':   'equity_stylebox_mid_cap_growth_exposure',
  'equity_stylebox_small_cap_value_exposure':  'equity_stylebox_small_cap_value_exposure',
  'equity_stylebox_small_cap_blend_exposure':  'equity_stylebox_small_cap_blend_exposure',
  'equity_stylebox_small_cap_growth_exposure': 'equity_stylebox_small_cap_growth_exposure',

  // ── Sector exposure (pass through) ───────────────────────────────────────
  'basic_materials_exposure_generic':       'basic_materials_exposure_generic',
  'communication_services_exposure_generic':'communication_services_exposure_generic',
  'consumer_cyclical_exposure_generic':     'consumer_cyclical_exposure_generic',
  'consumer_defensive_exposure_generic':    'consumer_defensive_exposure_generic',
  'energy_exposure_generic':                'energy_exposure_generic',
  'financial_services_exposure_generic':    'financial_services_exposure_generic',
  'healthcare_exposure_generic':            'healthcare_exposure_generic',
  'industrials_exposure_generic':           'industrials_exposure_generic',
  'real_estate_exposure_generic':           'real_estate_exposure_generic',
  'technology_exposure_generic':            'technology_exposure_generic',
  'utilities_exposure_generic':             'utilities_exposure_generic',

  // ── Asset allocation (pass through) ──────────────────────────────────────
  'cash_net':       'cash_net',
  'stock_net':      'stock_net',
  'bond_net':       'bond_net',
  'convertible_net':'convertible_net',
  'preferred_net':  'preferred_net',
  'other_net':      'other_net',

  // ── Fixed income credit quality (pass through) ────────────────────────────
  'aaa_bond_exposure_generic':   'aaa_bond_exposure_generic',
  'aa_bond_exposure_generic':    'aa_bond_exposure_generic',
  'a_bond_exposure_generic':     'a_bond_exposure_generic',
  'bbb_bond_exposure_generic':   'bbb_bond_exposure_generic',
  'bb_bond_exposure_generic':    'bb_bond_exposure_generic',
  'b_bond_exposure_generic':     'b_bond_exposure_generic',
  'below_b_bond_exposure_generic':'below_b_bond_exposure_generic',

  // ── Fixed income maturity (pass through) ─────────────────────────────────
  'maturity_less_than_1_year_generic':  'maturity_less_than_1_year_generic',
  '1_to_3_years_maturity_bond_exposure':'1_to_3_years_maturity_bond_exposure',
  '3_to_5_years_maturity_bond_exposure':'3_to_5_years_maturity_bond_exposure',
  'maturity_5_to_10_years_generic':     'maturity_5_to_10_years_generic',
  'maturity_10_to_20_years_generic':    'maturity_10_to_20_years_generic',
  'maturity_20_to_30_years_generic':    'maturity_20_to_30_years_generic',
  'over_30_years_maturity_bond_exposure':'over_30_years_maturity_bond_exposure',

  // ── Fixed income bond analytics (pass through) ────────────────────────────
  'effective_duration':  'effective_duration',
  'yield_to_maturity':   'yield_to_maturity',
  'average_coupon':      'average_coupon',

  // ── Fixed income type exposure (pass through) ─────────────────────────────
  'government_fixed_income_exposure_generic':  'government_fixed_income_exposure_generic',
  'corporate_fixed_income_exposure_generic':   'corporate_fixed_income_exposure_generic',
  'securitized_fixed_income_exposure_generic': 'securitized_fixed_income_exposure_generic',
  'municipal_fixed_income_exposure_generic':   'municipal_fixed_income_exposure_generic',
  'other_fixed_income_exposure_generic':       'other_fixed_income_exposure_generic',

  // ── Worst / best monthly returns (no matching columns in benchmarks) ───────
  'worst_return_three_month': null,
  'worst_return_six_month':   null,
  'worst_return_one_year':    null,
  'worst_return_three_year':  null,
  'worst_return_five_year':   null,
  'worst_return_all_time':    null,
  'best_return_three_month':  null,
  'best_return_six_month':    null,
  'best_return_one_year':     null,
  'best_return_three_year':   null,
  'best_return_five_year':    null,
  'best_return_all_time':     null,

  // ── Additional allocation fields at end of template ───────────────────────
  'stock_long':                          'stock_net',   // also set above; remap for safety
  'bond_long':                           'bond_net',
  // cash_net already mapped above
  'emerging_equity_exposure':            null,
  'large_cap_equity_allocation_generic': null,
  'medium_cap_equity_allocation_generic':null,
  'small_cap_equity_allocation_generic': null,
  'investment_grade_bond_allocation_generic': null,
  'high_yield_bond_allocation_generic':  null,
  'other_bond_exposure_generic':         null,
  'developed_equity_exposure':           null,

  // ── System fields — never written ─────────────────────────────────────────
  'id': null, 'created_at': null, 'updated_at': null,
  'long_description': null, 'related_securities': null,
  'roic': null, 'p_roic': null, 'c_roic': null,
}

const DATE_COLS = new Set([
  'inception_date', 'year_high_date', 'year_low_date',
  'last_earnings_release', 'next_earnings_release',
])

const TEXT_COLS = new Set([
  'security_name', 'detailed_security_type', 'broad_asset_class',
  'broad_category_group', 'peer_group_name', 'fund_family',
  'fund_company_name', 'investment_strategy', 'average_credit_quality_score',
  'morningstar_sector', 'morningstar_industry',
])

function looksLikeDbColumn(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const s = v.trim()
  return s.length > 1 && /^[a-z0-9][a-z0-9_+]*$/.test(s) && /[a-z_]/.test(s)
}

function buildPortfolioBenchmarkPatch(rawRows: unknown[][]): Record<string, unknown> {
  const maxCols = rawRows.reduce((m, r) => Math.max(m, r.length), 0)
  let schemaCol = -1
  let valCol = -1

  for (let c = 0; c < Math.min(maxCols, 3); c++) {
    const hits = rawRows.filter((r) => looksLikeDbColumn(r[c])).length
    if (hits >= 5) {
      schemaCol = c
      let vc = c + 1
      if (vc <= 2) {
        const colVals = rawRows.map((r) => r[vc]).filter((v) => v != null && v !== '')
        const hasNumbers = colVals.some(
          (v) =>
            typeof v === 'number' ||
            (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v.trim()))),
        )
        if (!hasNumbers) vc = c + 2
      }
      valCol = vc
      break
    }
  }

  if (schemaCol === -1) return {}

  const patch: Record<string, unknown> = {}

  for (const row of rawRows) {
    const colRaw = row[schemaCol]
    if (!looksLikeDbColumn(colRaw)) continue
    const key = String(colRaw).trim()

    const raw = row[valCol]
    if (raw == null || raw === '') continue
    if (typeof raw === 'string' && /^ERR\s*:/i.test(raw.trim())) continue

    // Determine target column: explicit remap, explicit skip, or pass-through
    let targetCol: string | null
    if (key in PORTFOLIO_TO_BENCHMARK) {
      targetCol = PORTFOLIO_TO_BENCHMARK[key] // null = skip, string = remapped name
    } else {
      targetCol = key // pass through — db_column name is already valid in benchmarks
    }
    if (targetCol == null) continue

    if (DATE_COLS.has(targetCol)) {
      const d = coerceDate(raw)
      if (d != null) patch[targetCol] = d
    } else if (TEXT_COLS.has(targetCol)) {
      const s = String(raw).trim()
      if (s !== '') patch[targetCol] = s
    } else {
      const n = coerceNumber(raw)
      if (n != null) patch[targetCol] = n
    }
  }

  return patch
}

/**
 * Parse an Excel file (either template format) and return a benchmarks-table patch.
 * Detects template type by sheet name:
 *   "Portfolio" → Portfolio Upload Template (custom remap applied)
 *   anything else → ETF/MF template (delegates to buildPatchFromExcelFile)
 */
export async function buildBenchmarkPatchFromExcelFile(
  symbol: string,
  file: File,
): Promise<Record<string, unknown>> {
  if (!file.name.toLowerCase().match(/\.xlsx?$/)) {
    throw new Error('Please choose an Excel file (.xlsx or .xls).')
  }

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const firstName = wb.SheetNames[0]
  if (!firstName) throw new Error('The workbook has no sheets.')

  const isPortfolioTemplate = firstName.toLowerCase() === 'portfolio'

  if (!isPortfolioTemplate) {
    // ETF/MF template — existing parser handles it correctly
    return buildPatchFromExcelFile(symbol, file)
  }

  // Portfolio template — apply benchmark-specific remapping
  const sheet = wb.Sheets[firstName]
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })

  const patch = buildPortfolioBenchmarkPatch(rawRows)

  if (Object.keys(patch).length === 0) {
    throw new Error(
      'No data found in portfolio template. ' +
        'Ensure the file has been populated with YCharts data (enter the ticker in F1, ' +
        'press F9 to recalculate, then save before uploading).',
    )
  }

  return patch
}
