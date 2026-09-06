/**
 * securities2ExcelUpload.ts
 *
 * Loads a single security from the YCharts security template into `securities2`.
 *
 * The template is "schema-direct": DB column names run down one column with their
 * values alongside. That is the ONLY layout supported — the label-header and
 * wide-table parsers were removed in Sep 2026 once every file feeding this path
 * became a schema-direct template. Their 436-entry header map had drifted so far
 * that 53 of its 216 targets named columns which no longer existed, 15 of them
 * silently burning PGRST204 retries on every upload.
 */
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { upsertRelatedSecurities } from '@/lib/securities'
import {
  assertExcelFile, coerceDate, coerceNumber, formatSupabaseUpdateError,
} from '@/lib/excelImportShared'

/**
 * Column names a template may still carry in its schema column that are NOT
 * columns of `securities2`. Stripped before the DB update.
 *
 * This is a fast path, not the safety net: `uploadSecurities2FromExcel` also
 * retries on PGRST204, dropping whatever the DB rejects. But that retry costs a
 * round-trip each and gives up after 10, so anything known to be absent belongs
 * here. Two groups:
 *
 *  1. Stock analytics retired in the Jun 2026 slim-down — write-only columns the
 *     stock detail page now reads live from FMP.
 *  2. Names that were mapped by the deleted Excel header map but never existed
 *     on `securities2` (several are real columns on other tables — the benchmark
 *     growth metrics, `average_credit_quality_score` on `portfolio`).
 */
const NON_SECURITIES2_COLS = new Set([
  'close_price', 'year_high', 'year_low', 'year_high_date', 'year_low_date',
  'enhanced_market_beta_60_month', 'gross_profit_margin_ttm', 'free_cash_flow_margin_ttm',
  'eps_ttm', 'return_on_invested_capital', 'free_cash_flow_yield', 'dividend_yield',
  'revenues_growth_annual', 'revenues_growth_3y', 'revenues_growth_5y', 'revenues_growth_qoq',
  'eps_growth_annual', 'eps_growth_3y', 'eps_growth_5y', 'free_cash_flow_growth_5y',
  'forward_pe_ratio', 'eps_est_long_term_growth', 'eps_est_long_term_growth_num_est',
  'eps_est_long_term_growth_std_dev', 'buy_recommendations', 'outperform_recommendations',
  'hold_recommendations', 'underperform_recommendations',
  'sell_recommendations', 'no_opinion_recommendations', 'consensus_recommendation_label',
  'consensus_recommendation', 'price_target', 'price_target_high', 'price_target_low',
  'price_target_num_est', 'price_target_std_dev', 'price_target_upside',
  // (2) never existed on securities2
  'distribution_yield', 'turnover_ratio', 'average_coupon', 'yield_to_maturity',
  'average_credit_quality_score', 'forecasted_earnings_growth',
  'monthly_standard_deviation_annualized_3y', 'monthly_standard_deviation_annualized_5y',
  'eps_growth_3_yr_generic', 'sales_growth_3_yr_generic', 'sales_growth_5_yr_generic',
  '1_month_fund_level_flows', '3_month_fund_level_flows',
  '1_year_fund_level_flows', 'ytd_fund_level_flows',
])

const DATE_COLS = new Set([
  'inception_date',
])

const TEXT_COLS = new Set([
  'security_name',
  'detailed_security_type',
  'security_id',
  'fund_family',
  'fund_company_name',
  'broad_asset_class',
  'broad_category_group',
  'category_name',
  'category_index',
  'ycharts_benchmark_category',
  'peer_group_name',
  // Stock classification
  'morningstar_sector',
  'morningstar_industry',
  'equity_style_internal',
  // Fund — additional descriptive fields
  'investment_strategy',
])

// ── Schema-direct layout helpers ─────────────────────────────────────────────
//
// The YCharts security template uses the following column layout:
//   Col A: DB column name (securities2 field)
//   Col B: human-readable label (displayed in the UI; ignored on upload)
//   Col C: value — populated by YCharts formula =IFERROR(_xll.YCI($F$1,"code"),"")
//   Col E: (ignored) YCharts helper column
//   Col F: (ignored) ticker / F1 reference cell
//
// We detect this layout by finding a column (A–C only) with 5+ snake_case DB
// column names, skip any adjacent label-only column, then read col C as the
// value.  Columns D onward are never scanned or read.

function looksLikeDbColumn(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const s = v.trim()
  // Must be at least 2 chars, only lowercase letters/digits/underscores/plus,
  // and contain at least one letter or underscore (to exclude bare numbers like "13").
  return s.length > 1 && /^[a-z0-9][a-z0-9_+]*$/.test(s) && /[a-z_]/.test(s)
}

/** Returns {schemaCol, valCol} if a schema-direct layout is detected, else null. */
function detectSchemaDirectLayout(
  rows: unknown[][],
): { schemaCol: number; valCol: number } | null {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0)
  // Only scan columns A–C (indices 0–2). Columns D onward (including E/F which
  // hold YCharts ticker helper data) must never be read or influence detection.
  for (let c = 0; c < Math.min(maxCols, 3); c++) {
    const hits = rows.filter((r) => looksLikeDbColumn(r[c])).length
    if (hits >= 5) {
      // Default value column is the one immediately to the right.
      // Some templates insert a human-readable label column between the schema
      // column and the value column (Col A = db_col, Col B = "Fund Company",
      // Col C = value).  Detect that by checking whether the next column has
      // any numeric values — if not, step one column further right.
      let valCol = c + 1
      if (valCol < maxCols && valCol <= 2) {
        const colVals = rows.map((r) => r[valCol]).filter((v) => v != null && v !== '')
        const hasNumbers = colVals.some(
          (v) =>
            typeof v === 'number' ||
            // Use strict numeric parse — labels like "52 Week High" or "1 Month
            // Total Return" start with digits but are NOT pure numbers.  Only
            // count a string value as numeric when Number() succeeds (finite,
            // non-empty string that parses completely as a number).
            (typeof v === 'string' &&
              String(v).trim() !== '' &&
              isFinite(Number(String(v).trim()))),
        )
        if (!hasNumbers) {
          valCol = c + 2
        }
      }
      // Value column must stay within A–C (indices 0–2). If the schema column
      // is at C there is no room for a value column in the allowed range; skip.
      if (valCol > 2) continue
      return { schemaCol: c, valCol }
    }
  }
  return null
}

/**
 * Build a securities2 patch directly from DB column name → value pairs.
 * Skips identity fields (symbol) and applies TEXT_COLS / DATE_COLS coercion.
 */
function buildPatchFromSchemaDirect(
  rows: unknown[][],
  schemaCol: number,
  valCol: number,
): Record<string, unknown> {
  // Columns that exist in the template under a legacy name but map to a different DB column
  const COLUMN_REMAP: Record<string, string> = {
    'inception_date_generic': 'inception_date',
  }

  const SKIP = new Set([
    // System / identity columns
    'symbol', 'security_id', 'id', 'created_at', 'updated_at',
    // Columns removed from securities2 in the April 2026 schema migration.
    // Templates may still contain these in col A — silently drop them so
    // Supabase does not return 400 "column not found in schema cache".
    'description',
    'long_description',  // read-only / user-managed
    // Identity now sourced from FMP only — never written from Excel
    'security_name',
    'last_earnings_release',   // FMP-owned — see refreshSecurityFromFMP
    'next_earnings_release',   // FMP-owned — see refreshSecurityFromFMP
    'morningstar_sector',
    'morningstar_industry',
    'roic',
    'p_roic',
    'c_roic',
    'revenue_growth_annual',
    // Old short names (benchmarks schema migration) — silently drop if templates still have them
    'name',
    'symbol',
    'security_type',
    'asset_class',
    'category_group',
    'inception',
    'expense_ratio',
    'aum',
    'fund_company',
    'nav_premium_discount',
    'fund_flows_1m',
    'fund_flows_3m',
    'fund_flows_1y',
    'fund_flows_ytd',
    'tax_cost_ratio_1y',
    'tax_cost_ratio_3y',
    'tax_cost_ratio_5y',
    'calmar_3y',
    'legal_structure',
    'return_on_equity_5y_mean',
    'pe_5',
    'ps_ratio_3y_mean',
    'revenue_per_share_ttm',
    'category_benchmark_symbol',
    'category_benchmark',
    'peer_group_benchmark_symbol',
    'peer_group_benchmark',
    // Handled separately — upserted to security_related_securities table
    'related_securities',
  ])
  const patch: Record<string, unknown> = {}
  const relatedIds: string[] = []

  function collectRelatedTicker(raw: unknown) {
    if (raw == null || raw === '') return
    const ticker = String(raw).trim().toUpperCase()
    if (ticker && /^[A-Z]{1,6}(\.[A-Z]{1,4})?$/.test(ticker)) {
      relatedIds.push(ticker)
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const colRaw = row[schemaCol]
    if (!looksLikeDbColumn(colRaw)) continue
    const key = COLUMN_REMAP[String(colRaw).trim()] ?? String(colRaw).trim()

    // related_securities spans multiple rows: Col A has the key only on the
    // first row; subsequent rows have blank Col A with tickers in the value col.
    if (key === 'related_securities') {
      collectRelatedTicker(row[valCol])
      // Consume continuation rows (blank schema col, value in val col)
      while (i + 1 < rows.length && !looksLikeDbColumn(rows[i + 1][schemaCol])) {
        i++
        collectRelatedTicker(rows[i][valCol])
      }
      continue
    }

    if (SKIP.has(key)) continue

    const raw = row[valCol]
    if (raw == null || raw === '') continue
    // Skip YCharts/formula error strings (e.g. "ERR: NO DATA", "ERR: INVALID CALC")
    if (typeof raw === 'string' && /^ERR\s*:/i.test(raw.trim())) continue

    if (DATE_COLS.has(key)) {
      const d = coerceDate(raw)
      if (d != null) patch[key] = d
    } else if (TEXT_COLS.has(key)) {
      const s = String(raw).trim()
      if (s !== '') patch[key] = s
    } else {
      const n = coerceNumber(raw)
      if (n != null) patch[key] = n
    }
  }
  if (relatedIds.length > 0) {
    patch.related_securities = relatedIds
  }
  return patch
}

/**
 * Parse the YCharts security template and return the `securities2` column→value
 * patch, without writing anything.
 *
 * Only the schema-direct layout is supported: DB column names down one column,
 * values in the next. The label-header and wide-table parsers were removed once
 * every file feeding this path became a schema-direct template — their 436-entry
 * header map had drifted badly, with 53 of its targets naming columns that no
 * longer exist.
 */
async function buildPatchFromExcelFile(file: File): Promise<Record<string, unknown>> {
  assertExcelFile(file)
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const firstName = wb.SheetNames[0]
  if (!firstName) throw new Error('The workbook has no sheets.')

  // raw: true — read the stored values (numbers, strings, Dates) rather than
  // Excel-formatted strings, so a percentage cell arrives as 0.041, not "4.10%".
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[firstName], {
    header: 1,
    raw: true,
    defval: null,
  })
  const schemaLayout = detectSchemaDirectLayout(rawRows)
  if (!schemaLayout) {
    throw new Error(
      'No template columns found. This importer expects the YCharts security template — ' +
        'DB column names in one column with their values alongside.',
    )
  }

  const patch = buildPatchFromSchemaDirect(rawRows, schemaLayout.schemaCol, schemaLayout.valCol)
  if (Object.keys(patch).length === 0) {
    throw new Error(
      'Template columns detected but no values found. ' +
        'Open the template in Excel on Windows with the YCharts add-in active, ' +
        'enter your ticker in cell F1, press F9 to recalculate, save the file, then upload.',
    )
  }

  for (const col of NON_SECURITIES2_COLS) delete patch[col]

  return patch
}

/**
 * Parse the YCharts security template and apply it to `symbol` in `securities2`.
 * The ticker inside the file is ignored — the caller chooses the target row.
 */
export async function uploadSecurities2FromExcel(symbol: string, file: File): Promise<void> {
  const sym = symbol.trim().toUpperCase()
  const patch = await buildPatchFromExcelFile(file)

  // Extract related securities before sending to securities2
  const relatedIds = Array.isArray(patch.related_securities)
    ? (patch.related_securities as string[])
    : []
  delete patch.related_securities

  // Attempt the update, auto-stripping any columns that don't exist in the
  // schema cache (PGRST204).  Retries up to 10 times so a template with
  // several stale columns still succeeds without the user seeing an error.
  const activePatch = { ...patch }
  const droppedCols: string[] = []
  const MAX_RETRIES = 10

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('securities2')
      .update(activePatch)
      .eq('security_id', sym)

    if (!error) {
      if (relatedIds.length > 0) {
        await upsertRelatedSecurities(sym, relatedIds)
      }
      return
    }

    // PGRST204 = column not found in schema cache.
    // Extract the offending column name and retry without it.
    const colMatch = error.message.match(/column ['"]?([a-z0-9_]+)['"]? of ['"]?securities2['"]?/i)
      ?? error.message.match(/Could not find the ['"]?([a-z0-9_]+)['"]? column/i)

    if ((error.code === 'PGRST204' || error.message.includes('schema cache')) && colMatch) {
      const badCol = colMatch[1]
      delete activePatch[badCol]
      droppedCols.push(badCol)
      continue
    }

    throw new Error(formatSupabaseUpdateError(error))
  }

  throw new Error(
    `Upload failed after stripping ${droppedCols.length} unrecognized column(s): ${droppedCols.join(', ')}. ` +
    'Remove them from the template, or add them to NON_SECURITIES2_COLS if they belong to another table.',
  )
}

/**
 * Reads the ticker out of the YCharts security template (the `security_id` row
 * of the schema-direct layout). Throws if no symbol can be determined.
 */
async function extractSymbolFromExcel(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const firstName = wb.SheetNames[0]
  if (!firstName) throw new Error('The workbook has no sheets.')

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[firstName], {
    header: 1,
    raw: true,
    defval: null,
  })
  const schemaLayout = detectSchemaDirectLayout(rawRows)
  if (schemaLayout) {
    for (const row of rawRows) {
      const colRaw = row[schemaLayout.schemaCol]
      if (typeof colRaw === 'string' && colRaw.trim() === 'security_id') {
        const val = row[schemaLayout.valCol]
        if (val != null && val !== '') {
          const sym = String(val).trim().toUpperCase()
          if (sym) return sym
        }
      }
    }
  }

  throw new Error(
    'Could not find a security_id in the Excel file. This importer expects the ' +
      'YCharts security template, with the ticker on its security_id row.',
  )
}

/**
 * Creates a new securities2 row from an Excel file.
 * Extracts the symbol from the file, inserts the row, then applies the full
 * column mapping so all available data is saved in one step.
 */
export async function addNewSecurityFromExcel(file: File): Promise<string> {
  const symbol = await extractSymbolFromExcel(file)

  // Create the row (upsert so re-runs are safe)
  const { error: insertError } = await supabase
    .from('securities2')
    .upsert({ security_id: symbol }, { onConflict: 'security_id', ignoreDuplicates: true })
  if (insertError) throw new Error(`Could not create security: ${insertError.message}`)

  // Now populate all columns from the file
  await uploadSecurities2FromExcel(symbol, file)

  return symbol
}
