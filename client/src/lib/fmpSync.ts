import { supabase } from '@/lib/supabase'

const FMP_STABLE = 'https://financialmodelingprep.com/stable'
const RISK_FREE_RATE = 0.0425

function apiKey(): string {
  const key = import.meta.env.VITE_FMP_API_KEY as string | undefined
  if (!key) throw new Error('VITE_FMP_API_KEY is not configured. Add it to your .env file.')
  return key
}

/**
 * Fetch from the FMP stable API.
 * All params (including symbol) are query params.
 * Endpoint may contain a slash for sub-paths (e.g. "historical-price-eod/dividend-adjusted").
 */
async function stableFetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    apikey: apiKey(),
  })
  const res = await fetch(`${FMP_STABLE}/${endpoint}?${qs}`)
  if (!res.ok) throw new Error(`FMP /${endpoint}: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}


// ── Historical price helpers ───────────────────────────────────────────────────

interface PriceRow {
  date: string  // "YYYY-MM-DD"
  adjClose: number
}

/**
 * Return the adjClose of the most recent trading day on or before `targetDate`.
 * Prices array must be sorted newest → oldest (as FMP returns them).
 */
function priceOnOrBefore(prices: PriceRow[], targetDate: Date): number | null {
  const targetTs = targetDate.getTime()
  for (const p of prices) {
    const d = new Date(p.date + 'T00:00:00')
    if (d.getTime() <= targetTs) return p.adjClose
  }
  return null
}

/**
 * Format a Date as "YYYY-MM-DD" for FMP query params.
 */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Calculate total and annualized returns from dividend-adjusted EOD prices.
 *
 * Returns are stored in the `_nav` columns because StockReturnTable reads those
 * for the security row (funds use NAV; for stocks these are the price-based return fields).
 */
function calcReturns(prices: PriceRow[], today: Date): Record<string, number | null> {
  if (prices.length === 0) return {}

  const latestPrice = prices[0].adjClose  // newest record

  // Target dates
  const d1m  = new Date(today.getFullYear(), today.getMonth() - 1,  today.getDate())
  const d3m  = new Date(today.getFullYear(), today.getMonth() - 3,  today.getDate())
  const dYtd = new Date(today.getFullYear() - 1, 11, 31)           // Dec 31 prev year
  const d1y  = new Date(today.getFullYear() - 1,  today.getMonth(), today.getDate())
  const d3y  = new Date(today.getFullYear() - 3,  today.getMonth(), today.getDate())
  const d5y  = new Date(today.getFullYear() - 5,  today.getMonth(), today.getDate())

  const p1m  = priceOnOrBefore(prices, d1m)
  const p3m  = priceOnOrBefore(prices, d3m)
  const pYtd = priceOnOrBefore(prices, dYtd)
  const p1y  = priceOnOrBefore(prices, d1y)
  const p3y  = priceOnOrBefore(prices, d3y)
  const p5y  = priceOnOrBefore(prices, d5y)

  function simpleReturn(base: number | null): number | null {
    return base != null && base !== 0 ? (latestPrice - base) / base : null
  }
  function annualizedReturn(base: number | null, years: number): number | null {
    return base != null && base !== 0 ? Math.pow(latestPrice / base, 1 / years) - 1 : null
  }

  return {
    one_month_total_return_nav:               simpleReturn(p1m),
    three_month_total_return_nav:             simpleReturn(p3m),
    ytd_total_return_nav:                     simpleReturn(pYtd),
    one_year_total_return_nav:                simpleReturn(p1y),
    annualized_three_year_total_return_nav:   annualizedReturn(p3y, 3),
    annualized_five_year_total_return_nav:    annualizedReturn(p5y, 5),
  }
}

// ── Statistical helpers ────────────────────────────────────────────────────────

/**
 * Sample N+1 price points at regular monthly intervals going back count*monthStep months.
 * Returns [today, today-step, today-2*step, ...] (newest first, length = count + 1).
 */
function samplePrices(prices: PriceRow[], today: Date, count: number, monthStep: number): (number | null)[] {
  const samples: (number | null)[] = []
  for (let i = 0; i <= count; i++) {
    const target = new Date(today.getFullYear(), today.getMonth() - i * monthStep, today.getDate())
    samples.push(priceOnOrBefore(prices, target))
  }
  return samples
}

/**
 * Compute simple period returns from a sampled price series (newest first).
 * Returns n-1 valid returns for n prices; skips any pair with a null.
 */
function simpleReturns(samples: (number | null)[]): number[] {
  const returns: number[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const curr = samples[i]
    const prev = samples[i + 1]
    if (curr != null && prev != null && prev !== 0) {
      returns.push((curr - prev) / prev)
    }
  }
  return returns
}

function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Annualize a periodic std dev: sd * sqrt(periodsPerYear). */
function annualizedStdDev(returns: number[], periodsPerYear: number): number | null {
  const sd = sampleStdDev(returns)
  return sd != null ? sd * Math.sqrt(periodsPerYear) : null
}

/**
 * Downside deviation: std dev of min(r, 0) values, annualized.
 * Used in Sortino ratio calculation.
 */
function downsideDev(returns: number[], periodsPerYear: number): number | null {
  const downside = returns.map(r => Math.min(r, 0))
  const sd = sampleStdDev(downside)
  return sd != null ? sd * Math.sqrt(periodsPerYear) : null
}

function calcSharpe(annualReturn: number | null, annualSd: number | null): number | null {
  if (annualReturn == null || annualSd == null || annualSd === 0) return null
  return (annualReturn - RISK_FREE_RATE) / annualSd
}

function calcSortino(annualReturn: number | null, dd: number | null): number | null {
  if (annualReturn == null || dd == null || dd === 0) return null
  return (annualReturn - RISK_FREE_RATE) / dd
}

/**
 * Peak-to-trough max drawdown over a trailing window.
 * Prices array is newest→oldest (as FMP returns).
 */
function calcMaxDrawdown(prices: PriceRow[], today: Date, monthsBack: number): number | null {
  const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsBack, today.getDate())
  const cutoffTs = cutoff.getTime()
  // Filter to window; prices sorted newest→oldest so filter and then reverse
  const window = prices
    .filter(p => new Date(p.date + 'T00:00:00').getTime() >= cutoffTs)
    .reverse()  // now oldest→newest
  if (window.length < 2) return null

  let maxDrawdown = 0
  let peak = window[0].adjClose
  for (const p of window) {
    if (p.adjClose > peak) peak = p.adjClose
    const dd = (p.adjClose - peak) / peak
    if (dd < maxDrawdown) maxDrawdown = dd
  }
  return maxDrawdown  // negative number (e.g. -0.18 = -18%)
}

/**
 * Beta = Cov(stock, SPY) / Var(SPY) using aligned daily log returns.
 */
function calcBeta(
  stockPrices: PriceRow[],
  spyPrices: PriceRow[],
  today: Date,
  monthsBack: number,
): number | null {
  const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsBack, today.getDate())
  const cutoffTs = cutoff.getTime()

  // Build SPY date → price map for quick lookup
  const spyMap = new Map<string, number>()
  for (const p of spyPrices) {
    if (new Date(p.date + 'T00:00:00').getTime() >= cutoffTs) {
      spyMap.set(p.date, p.adjClose)
    }
  }

  // Filter stock to window, sort oldest→newest
  const stockWindow = stockPrices
    .filter(p => new Date(p.date + 'T00:00:00').getTime() >= cutoffTs)
    .reverse()

  const stockReturns: number[] = []
  const spyReturns: number[] = []

  for (let i = 1; i < stockWindow.length; i++) {
    const prevStock = stockWindow[i - 1]
    const currStock = stockWindow[i]
    const prevSpy = spyMap.get(prevStock.date)
    const currSpy = spyMap.get(currStock.date)

    if (
      prevSpy != null && currSpy != null &&
      prevSpy > 0 && currSpy > 0 &&
      prevStock.adjClose > 0 && currStock.adjClose > 0
    ) {
      stockReturns.push(Math.log(currStock.adjClose / prevStock.adjClose))
      spyReturns.push(Math.log(currSpy / prevSpy))
    }
  }

  if (stockReturns.length < 20) return null

  const n = stockReturns.length
  const stockMean = stockReturns.reduce((s, v) => s + v, 0) / n
  const spyMean   = spyReturns.reduce((s, v) => s + v, 0) / n

  let cov = 0
  let varSpy = 0
  for (let i = 0; i < n; i++) {
    const ds = stockReturns[i] - stockMean
    const dm = spyReturns[i] - spyMean
    cov    += ds * dm
    varSpy += dm * dm
  }
  cov    /= n - 1
  varSpy /= n - 1

  return varSpy === 0 ? null : cov / varSpy
}

/**
 * Compute all risk/stat metrics from price history.
 * Requires the returns map (already computed) to reuse 1Y/3Y/5Y annualized returns.
 */
function calcRiskMetrics(
  stockPrices: PriceRow[],
  spyPrices: PriceRow[],
  today: Date,
  returns: Record<string, number | null>,
): Record<string, number | null> {
  if (stockPrices.length === 0) return {}

  // ── Std dev ───────────────────────────────────────────────────────────────
  // 1Y: 12 monthly returns (13 sample prices), annualize × sqrt(12)
  const monthly1Y       = samplePrices(stockPrices, today, 12, 1)
  const monthlyRet1Y    = simpleReturns(monthly1Y)
  const stdDev1Y        = annualizedStdDev(monthlyRet1Y, 12)

  // 3Y: 12 quarterly returns (13 sample prices), annualize × sqrt(4)
  const quarterly3Y     = samplePrices(stockPrices, today, 12, 3)
  const quarterlyRet3Y  = simpleReturns(quarterly3Y)
  const stdDev3Y        = annualizedStdDev(quarterlyRet3Y, 4)

  // 5Y: 20 quarterly returns (21 sample prices), annualize × sqrt(4)
  const quarterly5Y     = samplePrices(stockPrices, today, 20, 3)
  const quarterlyRet5Y  = simpleReturns(quarterly5Y)
  const stdDev5Y        = annualizedStdDev(quarterlyRet5Y, 4)

  // ── Downside deviations ───────────────────────────────────────────────────
  const dd1Y = downsideDev(monthlyRet1Y, 12)
  const dd3Y = downsideDev(quarterlyRet3Y, 4)
  const dd5Y = downsideDev(quarterlyRet5Y, 4)

  // ── Annualized returns (from already-computed returns map) ────────────────
  const ret1Y = returns.one_year_total_return_nav ?? null
  const ret3Y = returns.annualized_three_year_total_return_nav ?? null
  const ret5Y = returns.annualized_five_year_total_return_nav ?? null

  // ── Sharpe ────────────────────────────────────────────────────────────────
  const sharpe1Y = calcSharpe(ret1Y, stdDev1Y)
  const sharpe3Y = calcSharpe(ret3Y, stdDev3Y)
  const sharpe5Y = calcSharpe(ret5Y, stdDev5Y)

  // ── Sortino ───────────────────────────────────────────────────────────────
  const sortino1Y = calcSortino(ret1Y, dd1Y)
  const sortino3Y = calcSortino(ret3Y, dd3Y)
  const sortino5Y = calcSortino(ret5Y, dd5Y)

  // ── Max drawdown ──────────────────────────────────────────────────────────
  const maxDD1Y = calcMaxDrawdown(stockPrices, today, 12)
  const maxDD3Y = calcMaxDrawdown(stockPrices, today, 36)
  const maxDD5Y = calcMaxDrawdown(stockPrices, today, 60)

  // ── Beta vs SPY ───────────────────────────────────────────────────────────
  const beta1Y = calcBeta(stockPrices, spyPrices, today, 12)
  const beta3Y = calcBeta(stockPrices, spyPrices, today, 36)
  const beta5Y = calcBeta(stockPrices, spyPrices, today, 60)

  return {
    monthly_standard_deviation_annualized_1y:    stdDev1Y,
    quarterly_standard_deviation_annualized_3y:  stdDev3Y,
    quarterly_standard_deviation_annualized_5y:  stdDev5Y,
    historical_sharpe_1y:   sharpe1Y,
    historical_sharpe_3y:   sharpe3Y,
    historical_sharpe_5y:   sharpe5Y,
    historical_sortino_1y:  sortino1Y,
    historical_sortino_3y:  sortino3Y,
    historical_sortino_5y:  sortino5Y,
    max_drawdown_1y:        maxDD1Y,
    max_drawdown_3y:        maxDD3Y,
    max_drawdown_5y:        maxDD5Y,
    beta_1y_vs_category:    beta1Y,
    beta_3y_vs_category:    beta3Y,
    beta_5y_vs_category:    beta5Y,
  }
}

// ── Main sync function ────────────────────────────────────────────────────────

/**
 * Fetch data for a single stock symbol from FMP and write the result
 * to the `securities2` row identified by `security_id = symbol`.
 *
 * Calls 14 endpoints concurrently with Promise.allSettled — individual endpoint
 * failures do not abort the sync; available data is still written.
 */
export async function syncStockFromFMP(symbol: string): Promise<void> {
  const sym = symbol.trim().toUpperCase()
  // FMP uses hyphens for share-class tickers (BRK.B → BRK-B); the DB row keeps the
  // original `security_id`, so fetch with the mapped symbol but write back to `sym`.
  const fmpSym = sym.replace(/\./g, '-')

  type Row = Record<string, unknown>

  // 5 years + 3 month buffer to ensure we have data for 5Y return calc
  const today = new Date()
  const histFrom = isoDate(new Date(today.getFullYear() - 5, today.getMonth() - 3, today.getDate()))

  // ── Parallel fetch (partial-failure tolerant) ─────────────────────────────
  // Stock sync now only refreshes identity, earnings dates, and the
  // price-derived trailing returns + risk metrics. All other stock analytics
  // (margins, growth, valuation, analyst, price targets) were retired — they
  // were write-only; the stock detail page reads them live from FMP instead.
  const [profileRes, priceHistoryRes, spyHistoryRes, earningsRes] = await Promise.allSettled([
    stableFetch<Row[]>('profile', { symbol: fmpSym }),
    stableFetch<PriceRow[]>('historical-price-eod/dividend-adjusted', { symbol: fmpSym, from: histFrom }),
    // SPY prices for beta calculation
    stableFetch<PriceRow[]>('historical-price-eod/dividend-adjusted', { symbol: 'SPY', from: histFrom }),
    // Earnings calendar — past + scheduled releases, for last/next earnings dates
    stableFetch<Row[]>('earnings', { symbol: fmpSym, limit: 12 }),
  ])

  function ok<T>(r: PromiseSettledResult<T>, fallback: T): T {
    return r.status === 'fulfilled' ? r.value : fallback
  }

  const profile      = ok(profileRes, [{}])[0] ?? {}
  const priceHistory = ok(priceHistoryRes, [])
  const spyHistory   = ok(spyHistoryRes, [])
  const earnings     = ok(earningsRes, [])

  // ── Last / next earnings dates ─────────────────────────────────────────────
  // The /earnings feed lists past and scheduled releases. "Last" = most recent
  // release on or before today; "next" = soonest release after today.
  const todayStr = isoDate(today)
  const earningsDates = earnings
    .map((r) => (typeof r.date === 'string' ? r.date : null))
    .filter((d): d is string => d != null && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort() // ISO strings sort chronologically
  const lastEarningsRelease = [...earningsDates].reverse().find((d) => d <= todayStr) ?? null
  const nextEarningsRelease = earningsDates.find((d) => d > todayStr) ?? null

  // ── Historical return calculation ──────────────────────────────────────────
  const returns = calcReturns(priceHistory, today)

  // ── Risk metric calculation ────────────────────────────────────────────────
  const riskMetrics = calcRiskMetrics(priceHistory, spyHistory, today, returns)

  // ── Assemble patch ─────────────────────────────────────────────────────────
  const patch: Record<string, unknown> = {}

  function set(col: string, val: unknown) {
    if (val == null) return
    if (typeof val === 'number' && !isFinite(val)) return
    if (typeof val === 'string' && val.trim() === '') return
    patch[col] = val
  }

  // Company identity (also the fallback for the stock list / header)
  set('security_name', profile.companyName)
  set('morningstar_sector', profile.sector)
  set('morningstar_industry', profile.industry)
  set('long_description', profile.description)

  // Earnings dates (drive the stock review schedule)
  set('last_earnings_release', lastEarningsRelease)
  set('next_earnings_release', nextEarningsRelease)

  // Trailing total returns (calculated from dividend-adjusted price history)
  for (const [col, val] of Object.entries(returns)) {
    set(col, val)
  }

  // Risk & statistical metrics (calculated from price history)
  for (const [col, val] of Object.entries(riskMetrics)) {
    set(col, val)
  }

  if (Object.keys(patch).length === 0) {
    throw new Error(`FMP returned no usable data for symbol: ${sym}`)
  }

  const { error } = await supabase.from('securities2').update(patch).eq('security_id', sym)
  if (error) throw new Error(`Failed to save FMP data: ${error.message}`)
}
