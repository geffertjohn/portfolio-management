import { FMP_STABLE, apiKey, fmpSymbol, num } from './fmpClient'

export interface RatiosTTM {
  operatingProfitMargin: number | null
}

export async function fetchRatiosTTM(symbol: string): Promise<RatiosTTM> {
  const res = await fetch(
    `${FMP_STABLE}/ratios-ttm?symbol=${fmpSymbol(symbol)}&apikey=${apiKey()}`
  )
  if (!res.ok) throw new Error(`FMP ratios-ttm ${res.status}: ${symbol}`)
  const data = (await res.json()) as unknown[]
  const item = Array.isArray(data) && data.length > 0 && typeof data[0] === 'object'
    ? (data[0] as Record<string, unknown>)
    : null
  return {
    operatingProfitMargin: item ? num(item.operatingProfitMarginTTM) : null,
  }
}

export interface AnnualOperatingMargin {
  fiscalYear: string
  operatingProfitMargin: number | null
}

/**
 * Fetches annual operating margins from the FMP ratios endpoint.
 * Returns the `limit` most recent fiscal years (newest first).
 */
export async function fetchAnnualOperatingMargins(
  symbol: string,
  limit = 2
): Promise<AnnualOperatingMargin[]> {
  const res = await fetch(
    `${FMP_STABLE}/ratios?symbol=${fmpSymbol(symbol)}&period=annual&limit=${limit}&apikey=${apiKey()}`
  )
  if (!res.ok) throw new Error(`FMP ratios ${res.status}: ${symbol}`)
  const data = (await res.json()) as unknown[]
  if (!Array.isArray(data)) return []
  return data
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    .map((r) => ({
      fiscalYear: fiscalYearOf(r),
      operatingProfitMargin: num(r.operatingProfitMargin),
    }))
}

function fiscalYearOf(r: Record<string, unknown>): string {
  if (typeof r.fiscalYear === 'string') return r.fiscalYear
  if (typeof r.fiscalYear === 'number') return String(r.fiscalYear)
  if (typeof r.date === 'string') return String(new Date(r.date + 'T00:00:00').getFullYear())
  return ''
}

async function fetchArray(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as unknown
  return Array.isArray(data)
    ? data.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    : []
}

function margin(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  return numerator / denominator
}

export interface FcfMargins {
  /** Trailing-twelve-month free cash flow margin (FCF / revenue). */
  ttm: number | null
  /** Most recent fiscal years (newest first). */
  annual: { fiscalYear: string; fcfMargin: number | null }[]
}

/**
 * Derives free cash flow margin (freeCashFlow / revenue) since FMP exposes no
 * native FCF-margin field. Combines the cash-flow statement (freeCashFlow) with
 * the income statement (revenue), for both the TTM window and `limit` fiscal years.
 */
export async function fetchFcfMargins(symbol: string, limit = 2): Promise<FcfMargins> {
  const key = apiKey()
  const sym = fmpSymbol(symbol)
  const [cfTtm, incTtm, cfAnnual, incAnnual] = await Promise.all([
    fetchArray(`${FMP_STABLE}/cash-flow-statement-ttm?symbol=${sym}&apikey=${key}`),
    fetchArray(`${FMP_STABLE}/income-statement-ttm?symbol=${sym}&apikey=${key}`),
    fetchArray(`${FMP_STABLE}/cash-flow-statement?symbol=${sym}&period=annual&limit=${limit}&apikey=${key}`),
    fetchArray(`${FMP_STABLE}/income-statement?symbol=${sym}&period=annual&limit=${limit}&apikey=${key}`),
  ])

  const ttm = margin(
    cfTtm[0] ? num(cfTtm[0].freeCashFlow) : null,
    incTtm[0] ? num(incTtm[0].revenue) : null
  )

  const revenueByYear = new Map<string, number | null>()
  for (const r of incAnnual) revenueByYear.set(fiscalYearOf(r), num(r.revenue))

  const annual = cfAnnual.map((r) => {
    const fiscalYear = fiscalYearOf(r)
    return {
      fiscalYear,
      fcfMargin: margin(num(r.freeCashFlow), revenueByYear.get(fiscalYear) ?? null),
    }
  })

  return { ttm, annual }
}

export interface TtmGrowth {
  /** Trailing-twelve-month revenue growth vs the prior TTM window. */
  revenueGrowth: number | null
  /** Trailing-twelve-month diluted EPS growth vs the prior TTM window. */
  epsGrowth: number | null
}

/**
 * Trailing-twelve-month revenue and EPS growth. FMP has no native TTM growth
 * field, but `income-statement-ttm` returns rolling TTM snapshots (one per
 * quarter-end, newest first), so row[0] is the current TTM and row[4] is the
 * TTM one year (4 quarters) earlier. Growth = current / year-ago - 1.
 *
 * EPS growth is suppressed when the year-ago base is non-positive, since the
 * ratio is meaningless (sign-flipping) across a zero/negative EPS.
 */
export async function fetchTtmGrowth(symbol: string): Promise<TtmGrowth> {
  const rows = await fetchArray(
    `${FMP_STABLE}/income-statement-ttm?symbol=${fmpSymbol(symbol)}&apikey=${apiKey()}`
  )
  const cur = rows[0]
  const prior = rows[4]
  if (!cur || !prior) return { revenueGrowth: null, epsGrowth: null }

  const growth = (a: number | null, b: number | null): number | null =>
    a === null || b === null || b <= 0 ? null : a / b - 1

  const curEps = num(cur.epsDiluted) ?? num(cur.epsdiluted)
  const priorEps = num(prior.epsDiluted) ?? num(prior.epsdiluted)

  return {
    revenueGrowth: growth(num(cur.revenue), num(prior.revenue)),
    epsGrowth: growth(curEps, priorEps),
  }
}

export interface Cagr3y {
  revenue: number | null
  eps: number | null
}

/**
 * 3-year revenue and EPS CAGR on an annual fiscal-year basis:
 *   (latest FY / FY 3 years prior) ^ (1/3) - 1
 *
 * Uses diluted EPS (`epsDiluted`). FMP exposes no native CAGR field. Each
 * metric is null if fewer than 4 fiscal years exist or the base is non-positive
 * (a CAGR across a zero/negative base is meaningless).
 */
export async function fetchCagr3y(symbol: string): Promise<Cagr3y> {
  const rows = await fetchArray(
    `${FMP_STABLE}/income-statement?symbol=${fmpSymbol(symbol)}&period=annual&limit=4&apikey=${apiKey()}`
  )
  if (rows.length < 4) return { revenue: null, eps: null }

  const cagr = (latest: number | null, base: number | null): number | null =>
    latest === null || base === null || base <= 0 ? null : Math.pow(latest / base, 1 / 3) - 1

  const latest = rows[0]
  const base = rows[3]
  return {
    revenue: cagr(num(latest.revenue), num(base.revenue)),
    eps: cagr(num(latest.epsDiluted) ?? num(latest.epsdiluted), num(base.epsDiluted) ?? num(base.epsdiluted)),
  }
}

export interface ScorecardMetrics {
  operatingMargin: number | null
  fcfMargin: number | null
  revGrowthTtm: number | null
  epsGrowthTtm: number | null
  revCagr3y: number | null
  epsCagr3y: number | null
}

/**
 * All six stock Scorecard metrics for a symbol, in one call — the same values
 * the Scorecard cards show, bundled for the Alternatives comparison tables.
 * Each underlying fetch fails independently (Promise.allSettled).
 */
export async function fetchScorecardMetrics(symbol: string): Promise<ScorecardMetrics> {
  const [ratios, fcf, ttm, cagr] = await Promise.allSettled([
    fetchRatiosTTM(symbol),
    fetchFcfMargins(symbol, 1),
    fetchTtmGrowth(symbol),
    fetchCagr3y(symbol),
  ])
  const val = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null)
  return {
    operatingMargin: val(ratios)?.operatingProfitMargin ?? null,
    fcfMargin: val(fcf)?.ttm ?? null,
    revGrowthTtm: val(ttm)?.revenueGrowth ?? null,
    epsGrowthTtm: val(ttm)?.epsGrowth ?? null,
    revCagr3y: val(cagr)?.revenue ?? null,
    epsCagr3y: val(cagr)?.eps ?? null,
  }
}
