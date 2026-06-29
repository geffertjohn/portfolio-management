import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ── Shared row type ─────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>

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
    .select(`id, category_ticker, category_benchmark, category, ${CATEGORY_RETURN_COLS}`)
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
    .select(`id, ticker, sector_benchmarks, sector, ${SECTOR_RETURN_COLS}`)
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
