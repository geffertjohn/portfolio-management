/**
 * fmpIndexMovers.ts
 *
 * REST data for the index gainers/losers board: index constituents (cached
 * daily — membership rarely changes) and a one-shot baseline batch quote per
 * symbol. The baseline gives the previous close (price − change) used to compute
 * intraday % change against the live last-trade from the websocket stream.
 *
 * NOTE: FMP's own /biggest-gainers and /biggest-losers endpoints are a GLOBAL,
 * micro-cap-dominated feed and ignore index membership — they cannot be scoped
 * to S&P/Nasdaq/Dow constituents. So we build the movers list ourselves:
 * constituents + baselines + live stream, sorted client-side.
 */

const FMP_STABLE = 'https://financialmodelingprep.com/stable'

export type IndexKey = 'sp500' | 'nasdaq' | 'dowjones'

export const INDEX_META: Record<IndexKey, { label: string; endpoint: string }> = {
  sp500:    { label: 'S&P 500',     endpoint: 'sp500-constituent' },
  nasdaq:   { label: 'Nasdaq 100',  endpoint: 'nasdaq-constituent' },
  dowjones: { label: 'Dow Jones',   endpoint: 'dowjones-constituent' },
}

export interface Constituent {
  symbol: string
  name: string | null
}

export interface Baseline {
  /** Most recent REST price (last trade at fetch time). */
  price: number
  /** Previous close = price − change; the denominator for intraday %. */
  prevClose: number
}

function apiKey(): string {
  const key = import.meta.env.VITE_FMP_API_KEY as string | undefined
  if (!key) throw new Error('VITE_FMP_API_KEY is not configured.')
  return key
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FMP ${res.status}: ${url}`)
  return res.json() as Promise<unknown>
}

function asArray(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw)
    ? raw.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    : []
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export async function fetchIndexConstituents(index: IndexKey): Promise<Constituent[]> {
  const rows = asArray(await fetchJson(`${FMP_STABLE}/${INDEX_META[index].endpoint}?apikey=${apiKey()}`))
  return rows
    .map((r) => ({
      symbol: typeof r.symbol === 'string' ? r.symbol.toUpperCase() : '',
      name: typeof r.name === 'string' ? r.name : null,
    }))
    .filter((c) => c.symbol !== '')
}

/** Chunk to keep request URLs well under length limits. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Batch baseline quotes keyed by UPPER symbol. Uses batch-quote-short (compact:
 * symbol/price/change/volume) and derives prevClose = price − change.
 */
export async function fetchBaselines(symbols: string[]): Promise<Record<string, Baseline>> {
  const out: Record<string, Baseline> = {}
  const batches = chunk(symbols, 100)
  const results = await Promise.all(
    batches.map((batch) =>
      fetchJson(`${FMP_STABLE}/batch-quote-short?symbols=${batch.join(',')}&apikey=${apiKey()}`).then(asArray),
    ),
  )
  for (const rows of results) {
    for (const r of rows) {
      const sym = typeof r.symbol === 'string' ? r.symbol.toUpperCase() : null
      const price = num(r.price)
      const change = num(r.change)
      if (!sym || price == null || change == null) continue
      const prevClose = price - change
      if (prevClose <= 0) continue // guard against div-by-zero in % calc
      out[sym] = { price, prevClose }
    }
  }
  return out
}
