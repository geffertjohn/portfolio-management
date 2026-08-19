import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ── Shared row type ─────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>

/**
 * FALLBACK ETF proxy map, keyed by benchmark ticker.
 *
 * The authoritative proxy is the `etf_proxy` COLUMN on `category_benchmarks` /
 * `sector_benchmarks`, maintained through the benchmark Excel upload — always
 * resolve through `resolveEtfProxy()`, which prefers that column. This map only
 * covers a benchmark whose row has no `etf_proxy` set (e.g. a newly added row
 * before the next upload), so it is deliberately partial.
 *
 * Why a proxy at all: FMP does not serve the total-return index symbols
 * (^SPXTR, ^RLGTR, the ^SP15…STR sector indices — all confirmed "not found"),
 * so benchmark trailing returns come from the representative ETF's
 * dividend-adjusted closes (= total return) via `fetchStockReturns`, the same
 * method used for the security row. The index symbols FMP *does* serve (^RUI,
 * ^RLG, ^RLV) are PRICE return only and would understate the benchmark by
 * ~0.5–2.5%/yr, so they are not used here.
 */
export const BENCHMARK_ETF_PROXY: Record<string, string> = {
  // Category / style indices
  '^SPXTR': 'IVV',  // S&P 500
  '^RLGTR': 'IWF',  // Russell 1000 Growth
  '^RLVTR': 'IWD',  // Russell 1000 Value
  '^RDGTR': 'IWP',  // Russell Mid Cap Growth
  '^RMCTR': 'IWR',  // Russell Mid Cap
  '^RUOTR': 'IWO',  // Russell 2000 Growth
  '^RUTTR': 'IWM',  // Russell 2000
  // S&P 500 sector indices → SPDR sector ETFs
  '^SP15IFTSTR': 'XLK',  // Technology
  '^SP15FINSTR': 'XLF',  // Financials
  '^SP15HCSTR':  'XLV',  // Health Care
  '^SP15CNDSTR': 'XLY',  // Consumer Discretionary
  '^SP15CMSVST': 'XLC',  // Communication Services
  '^SP15INSTR':  'XLI',  // Industrials
  '^SP15CNSSTR': 'XLP',  // Consumer Staples
  '^SPXUSTR':    'XLU',  // Utilities
  '^SP15NRGSTR': 'XLE',  // Energy
  '^SP15RESTR':  'XLRE', // Real Estate
}

/** Fallback-map lookup only. Prefer `resolveEtfProxy()`, which reads the DB column first. */
export function benchmarkEtfProxy(ticker: string | null | undefined): string | null {
  return ticker ? (BENCHMARK_ETF_PROXY[ticker.toUpperCase()] ?? null) : null
}

/**
 * The ETF whose dividend-adjusted returns stand in for this benchmark.
 *
 * Reads the benchmark row's own `etf_proxy` (the source of truth, loaded from
 * the benchmark workbook) and falls back to `BENCHMARK_ETF_PROXY` only when the
 * row has none. Returns null when neither knows a proxy, in which case callers
 * fall back to the stored YCharts return columns.
 */
export function resolveEtfProxy(
  bench: Pick<BenchmarkOption, 'ticker' | 'etf_proxy'> | null | undefined,
): string | null {
  if (!bench) return null
  const fromDb = bench.etf_proxy?.trim()
  return fromDb ? fromDb.toUpperCase() : benchmarkEtfProxy(bench.ticker)
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark name lookups (header rows, comparison tables)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns both the original value and a hyphen-normalized variant (hyphens → spaces). */
function hyphenVariants(s: string): string[] {
  const normalized = s.replace(/-/g, ' ')
  return normalized === s ? [s] : [s, normalized]
}

/**
 * Looks up the category_benchmark from category_benchmarks where category matches
 * the security's ycharts_benchmark_category value. Matches with or without hyphens.
 */
export async function fetchCategoryBenchmark(category: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('category_benchmarks')
    .select('category_benchmark')
    .in('category', hyphenVariants(category))
    .not('category_benchmark', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.category_benchmark ?? null
}

/**
 * Looks up the peer_group_benchmark from peer_group_benchmarks where peer_group_category
 * matches the security's peer_group_name value. Matches with or without hyphens.
 */
export async function fetchPeerGroupBenchmark(peerGroupName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('peer_group_benchmarks')
    .select('peer_group_benchmark')
    .in('peer_group_category', hyphenVariants(peerGroupName))
    .not('peer_group_benchmark', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.peer_group_benchmark ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Model-portfolio benchmark lookups (Total Returns + Allocation Comparison)
// ─────────────────────────────────────────────────────────────────────────────

export interface BenchmarkReturns {
  security_name: string | null
  one_month_total_return: number | null
  three_month_total_return: number | null
  ytd_total_return: number | null
  one_year_total_return: number | null
  annualized_three_year_total_return: number | null
  annualized_five_year_total_return: number | null
  annualized_ten_year_total_return: number | null
  annualized_daily_all_time_total_return: number | null
}

const BENCHMARK_SELECT = 'security_name, one_month_total_return, three_month_total_return, ytd_total_return, one_year_total_return, annualized_three_year_total_return, annualized_five_year_total_return, annualized_ten_year_total_return, annualized_daily_all_time_total_return'

/** Returns the trailing-return subset for a model-portfolio benchmark (Total Returns table). */
export async function fetchBenchmarkByName(name: string): Promise<BenchmarkReturns | null> {
  const { data, error } = await supabase
    .from('model_portfolio_benchmarks')
    .select(BENCHMARK_SELECT)
    .eq('security_name', name)
    .maybeSingle()
  if (error) throw error
  return data as BenchmarkReturns | null
}

/**
 * The tradeable ticker behind a model-portfolio benchmark name, for pricing the
 * benchmark row on the FMP performance engine.
 *
 * The five YCharts composite benchmarks store a `P:` portfolio id in
 * `security_id`, which FMP cannot price — those resolve to a null symbol so the
 * caller skips the live lookup rather than firing a request that must fail.
 */
export async function fetchModelBenchmarkTicker(
  name: string,
): Promise<{ symbol: string | null; label: string | null }> {
  const { data, error } = await supabase
    .from('model_portfolio_benchmarks')
    .select('security_id, security_name')
    .eq('security_name', name)
    .maybeSingle()
  if (error) throw error
  if (!data) return { symbol: null, label: null }
  const id = (data.security_id ?? '').trim()
  const tradeable = id && !id.includes(':') ? id.toUpperCase() : null
  return { symbol: tradeable, label: data.security_name ?? null }
}

/** Returns the full model-portfolio benchmark row (Allocation Comparison tables). */
export async function fetchBenchmarkAll(name: string): Promise<AnyRow | null> {
  const { data, error } = await supabase
    .from('model_portfolio_benchmarks')
    .select('*')
    .eq('security_name', name)
    .maybeSingle()
  if (error) throw error
  return data as AnyRow | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark picker options (category + sector benchmark lists)
// ─────────────────────────────────────────────────────────────────────────────

// category_benchmarks carries full monthly + annual returns and risk ratios
const CATEGORY_RETURN_COLS = 'one_month_total_return, three_month_total_return, ytd_total_return, annualized_daily_one_year_total_return, annualized_daily_three_year_return, annualized_daily_five_year_total_return, historical_sharpe_1y, historical_sortino_1y, historical_sharpe_3y, historical_sortino_3y, eps_growth_1_yr_generic, sales_growth_1_yr_generic, eps_growth_3_yr_generic, sales_growth_3_yr_generic'

// Sector benchmarks are ETFs — full monthly/annual set + equity growth metrics
const SECTOR_RETURN_COLS = 'one_month_total_return, three_month_total_return, ytd_total_return, annualized_daily_one_year_total_return, annualized_daily_three_year_return, annualized_daily_five_year_total_return, sales_growth_1_yr_generic, eps_growth_1_yr_generic, sales_growth_3_yr_generic, eps_growth_3_yr_generic, historical_sharpe_1y, historical_sortino_1y'

export interface BenchmarkOption {
  id: number
  ticker: string
  /** Representative ETF for trailing returns — authoritative over BENCHMARK_ETF_PROXY. */
  etf_proxy: string | null
  // category_benchmarks fields
  category_benchmark: string | null
  category: string | null
  // sector_benchmarks fields
  sector_benchmarks: string | null
  sector: string | null
  // monthly returns — present in sector_benchmarks; null-filled for category_benchmarks
  one_month_total_return: number | null
  three_month_total_return: number | null
  ytd_total_return: number | null
  // annual returns — present in both tables
  annualized_daily_one_year_total_return: number | null
  annualized_daily_three_year_return: number | null
  annualized_daily_five_year_total_return: number | null
  // equity growth — present in both tables
  sales_growth_1_yr_generic: number | null
  eps_growth_1_yr_generic: number | null
  sales_growth_3_yr_generic: number | null
  eps_growth_3_yr_generic: number | null
  // 1-year risk — present in sector_benchmarks; null-filled for category_benchmarks
  historical_sharpe_1y: number | null
  historical_sortino_1y: number | null
  // 3-year risk — present in category_benchmarks; absent from sector_benchmarks
  historical_sharpe_3y: number | null
  historical_sortino_3y: number | null
}

export type BenchmarkSource = 'category_benchmarks' | 'sector_benchmarks'

function dedupByTicker(rows: BenchmarkOption[]): BenchmarkOption[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    if (seen.has(r.ticker)) return false
    seen.add(r.ticker)
    return true
  })
}

export async function fetchBenchmarkOptions(): Promise<BenchmarkOption[]> {
  // The column in category_benchmarks is `category_ticker`, not `ticker`.
  // We select it by name and normalise it to `ticker` in the mapping so the
  // rest of the app can treat both benchmark sources uniformly.
  const { data, error } = await supabase
    .from('category_benchmarks')
    .select(`id, category_ticker, category_benchmark, category, etf_proxy, ${CATEGORY_RETURN_COLS}`)
    .order('category_ticker', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  // Rename category_ticker → ticker to normalise with sector_benchmarks shape
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const { category_ticker, ...rest } = r
    return {
      sector_benchmarks: null,
      sector: null,
      ticker: (category_ticker as string) ?? '',
      ...rest,
    }
  }) as BenchmarkOption[]
  return dedupByTicker(rows)
}

export async function fetchSectorBenchmarkOptions(): Promise<BenchmarkOption[]> {
  const { data, error } = await supabase
    .from('sector_benchmarks')
    .select(`id, ticker, sector_benchmarks, sector, etf_proxy, ${SECTOR_RETURN_COLS}`)
    .order('ticker', { ascending: true })
  if (error) throw error
  const rows = (data ?? []).map((r) => ({
    category_benchmark: null,
    category: null,
    historical_sharpe_3y: null,
    historical_sortino_3y: null,
    ...r,
  })) as BenchmarkOption[]
  return dedupByTicker(rows)
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks settings page — raw table dumps
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch every row of a benchmark table ordered by id (Benchmarks settings page). */
export async function fetchBenchmarkTable(table: string): Promise<AnyRow[]> {
  const { data, error } = await (supabase as SupabaseClient).from(table).select('*').order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as AnyRow[]
}

/** Distinct model-portfolio benchmark names (Model Portfolios benchmark dropdown). */
export async function fetchModelPortfolioBenchmarkOptions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('model_portfolio_benchmarks')
    .select('security_name')
    .order('security_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => r.security_name as string).filter(Boolean)
}
