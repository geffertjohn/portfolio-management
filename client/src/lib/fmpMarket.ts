/**
 * fmpMarket.ts
 *
 * On-demand (live) FMP fetches for the stock detail UI: current quote/52-week
 * range, last/next earnings dates, and price-based trailing returns. These were
 * previously synced into `securities2` via fmpSync; for stocks they are now
 * fetched live so the UI reflects current FMP data without a manual sync.
 */

import { FMP_STABLE, apiKey, asArray, fmpFetch, fmpSymbol, num, str } from './fmpClient'

// ── Company profile (identity) ──────────────────────────────────────────────

export interface Profile {
  companyName: string | null
  description: string | null
  sector: string | null
  industry: string | null
}

export async function fetchProfile(symbol: string): Promise<Profile> {
  const rows = asArray(await fmpFetch(`${FMP_STABLE}/profile?symbol=${fmpSymbol(symbol)}&apikey=${apiKey()}`))
  const p = rows[0] ?? {}
  return {
    companyName: str(p.companyName),
    description: str(p.description),
    sector: str(p.sector),
    industry: str(p.industry),
  }
}

// ── Quote (price + 52-week range) ───────────────────────────────────────────

export interface Quote {
  price: number | null
  yearHigh: number | null
  yearLow: number | null
}

export async function fetchQuote(symbol: string): Promise<Quote> {
  const rows = asArray(await fmpFetch(`${FMP_STABLE}/quote?symbol=${fmpSymbol(symbol)}&apikey=${apiKey()}`))
  const q = rows[0] ?? {}
  return {
    price: num(q.price),
    yearHigh: num(q.yearHigh),
    yearLow: num(q.yearLow),
  }
}

// ── Earnings dates (last / next) ────────────────────────────────────────────

export interface EarningsDates {
  /** Most recent earnings release on or before today (YYYY-MM-DD). */
  lastEarnings: string | null
  /** Soonest scheduled release after today (YYYY-MM-DD). */
  nextEarnings: string | null
}

export async function fetchEarningsDates(symbol: string): Promise<EarningsDates> {
  const rows = asArray(await fmpFetch(`${FMP_STABLE}/earnings?symbol=${fmpSymbol(symbol)}&limit=12&apikey=${apiKey()}`))
  const today = new Date().toISOString().slice(0, 10)
  const dates = rows
    .map((r) => (typeof r.date === 'string' ? r.date : null))
    .filter((d): d is string => d != null && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort() // ISO strings sort chronologically
  return {
    lastEarnings: [...dates].reverse().find((d) => d <= today) ?? null,
    nextEarnings: dates.find((d) => d > today) ?? null,
  }
}

// ── Daily dividend-adjusted price series ────────────────────────────────────

export interface DailyPrice {
  date: string // YYYY-MM-DD
  adjClose: number
}

/**
 * Daily dividend-adjusted closes for `symbol` over [from, to], sorted ASC.
 * `adjClose` already folds in splits + dividends, so a ratio of two points is a
 * total return. FMP returns newest→oldest; we sort ascending for the caller.
 */
export async function fetchDailyAdjustedSeries(
  symbol: string,
  from: string,
  to?: string,
): Promise<DailyPrice[]> {
  const url = `${FMP_STABLE}/historical-price-eod/dividend-adjusted?symbol=${fmpSymbol(symbol)}&from=${from}${to ? `&to=${to}` : ''}&apikey=${apiKey()}`
  const rows = asArray(await fmpFetch(url))
    .map((r) => ({ date: typeof r.date === 'string' ? r.date : '', adjClose: num(r.adjClose) ?? NaN }))
    .filter((p) => p.date !== '' && Number.isFinite(p.adjClose))
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return rows
}

// ── Trailing returns (dividend-adjusted, price-based) ───────────────────────

export interface TrailingReturns {
  fiveDay: number | null
  oneMonth: number | null
  threeMonth: number | null
  ytd: number | null
  oneYear: number | null
  threeYear: number | null
  fiveYear: number | null
}

interface PriceRow {
  date: string
  adjClose: number
}

/** adjClose of the most recent trading day on or before `target`. Prices newest → oldest. */
function priceOnOrBefore(prices: PriceRow[], target: Date): number | null {
  const ts = target.getTime()
  for (const p of prices) {
    if (new Date(p.date + 'T00:00:00').getTime() <= ts) return p.adjClose
  }
  return null
}

export async function fetchStockReturns(symbol: string): Promise<TrailingReturns> {
  const empty: TrailingReturns = {
    fiveDay: null, oneMonth: null, threeMonth: null, ytd: null, oneYear: null, threeYear: null, fiveYear: null,
  }

  const today = new Date()
  // 5 years + 3 month buffer to ensure a base price exists for the 5Y calc
  const from = new Date(today.getFullYear() - 5, today.getMonth() - 3, today.getDate())
    .toISOString().slice(0, 10)

  const prices: PriceRow[] = asArray(
    await fmpFetch(`${FMP_STABLE}/historical-price-eod/dividend-adjusted?symbol=${fmpSymbol(symbol)}&from=${from}&apikey=${apiKey()}`)
  )
    .map((r) => ({ date: typeof r.date === 'string' ? r.date : '', adjClose: num(r.adjClose) ?? NaN }))
    .filter((p) => p.date !== '' && Number.isFinite(p.adjClose))

  if (prices.length === 0) return empty

  const latest = prices[0].adjClose
  const simple = (base: number | null): number | null =>
    base != null && base !== 0 ? (latest - base) / base : null
  const annualized = (base: number | null, years: number): number | null =>
    base != null && base !== 0 ? Math.pow(latest / base, 1 / years) - 1 : null

  const at = (y: number, mOffset: number, d: number) =>
    priceOnOrBefore(prices, new Date(y, mOffset, d))

  return {
    // 5 trading sessions ago (newest-first series → index 5).
    fiveDay:    simple(prices[5]?.adjClose ?? null),
    oneMonth:   simple(at(today.getFullYear(), today.getMonth() - 1, today.getDate())),
    threeMonth: simple(at(today.getFullYear(), today.getMonth() - 3, today.getDate())),
    ytd:        simple(at(today.getFullYear() - 1, 11, 31)),
    oneYear:    simple(at(today.getFullYear() - 1, today.getMonth(), today.getDate())),
    threeYear:  annualized(at(today.getFullYear() - 3, today.getMonth(), today.getDate()), 3),
    fiveYear:   annualized(at(today.getFullYear() - 5, today.getMonth(), today.getDate()), 5),
  }
}
