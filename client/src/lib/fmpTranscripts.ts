import { FMP_STABLE, FMP_V3, apiKey, fmpSymbol } from './fmpClient'

export interface EarningsTranscript {
  symbol: string
  quarter: number
  year: number
  date: string
  content: string
}

/**
 * Fetch the most recent earnings call transcript for a stock symbol.
 * Uses v3 API with limit=1 — single call, returns newest transcript first.
 */
export async function fetchLatestTranscript(symbol: string): Promise<EarningsTranscript | null> {
  const sym = symbol.trim().toUpperCase()
  const qs = new URLSearchParams({ limit: '1', apikey: apiKey() })
  const res = await fetch(`${FMP_V3}/earning_call_transcript/${fmpSymbol(sym)}?${qs}`)
  if (!res.ok) throw new Error(`FMP transcript/${sym}: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as EarningsTranscript[]
  return data?.[0] ?? null
}

export interface KeyExecutive {
  name: string
  title: string
}

/**
 * Fetch the current key executives for a symbol.
 * Returns a name → title map for fast lookup in the transcript viewer.
 */
export async function fetchKeyExecutives(symbol: string): Promise<KeyExecutive[]> {
  const sym = symbol.trim().toUpperCase()
  const qs = new URLSearchParams({ symbol: fmpSymbol(sym), apikey: apiKey() })
  const res = await fetch(`${FMP_STABLE}/key-executives?${qs}`)
  if (!res.ok) return []
  const data = (await res.json()) as { name?: string; title?: string }[]
  if (!Array.isArray(data)) return []
  return data
    .filter((e) => typeof e.name === 'string' && typeof e.title === 'string')
    .map((e) => ({ name: e.name as string, title: e.title as string }))
}
