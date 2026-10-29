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

export interface TranscriptDate {
  fiscalYear: number
  quarter: number
  /** ISO date of the call. */
  date: string
}

/**
 * Every transcribed earnings call for a symbol, newest first.
 *
 * This is the backbone of the Commentary timeline: it is the only source that
 * gives a call's FISCAL period and its date together, which is the identity the
 * briefs, the committee's call summary and the transcript are all keyed to.
 *
 * FMP's list carries a handful of mislabelled historical rows — GOOGL reports a
 * "Q1 2023" call dated 2014-12-02 — so the same (fiscalYear, quarter) can appear
 * twice. Dedupe keeping the NEWEST date per period: the bad row is always the
 * older of the pair, and leaving it in would emit a duplicate table row.
 */
export async function fetchTranscriptDates(symbol: string): Promise<TranscriptDate[]> {
  const sym = symbol.trim().toUpperCase()
  const qs = new URLSearchParams({ symbol: fmpSymbol(sym), apikey: apiKey() })
  const res = await fetch(`${FMP_STABLE}/earning-call-transcript-dates?${qs}`)
  if (!res.ok) throw new Error(`FMP transcript-dates/${sym}: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as { fiscalYear?: number; quarter?: number; date?: string }[]
  if (!Array.isArray(data)) return []

  const newestPerPeriod = new Map<string, TranscriptDate>()
  for (const r of data) {
    if (typeof r.fiscalYear !== 'number' || typeof r.quarter !== 'number' || !r.date) continue
    const row = { fiscalYear: r.fiscalYear, quarter: r.quarter, date: r.date.split(/[\sT]/)[0] }
    const key = `${row.fiscalYear}-Q${row.quarter}`
    const seen = newestPerPeriod.get(key)
    if (!seen || row.date > seen.date) newestPerPeriod.set(key, row)
  }
  return [...newestPerPeriod.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * The transcript for ONE specific call.
 *
 * v3 rather than the stable endpoint on purpose: it returns `quarter`/`year`
 * exactly as `EarningsTranscript` declares them, so `TranscriptViewer` renders a
 * historical call with no change. The stable endpoint returns `period: "Q2"`
 * instead, which would need a second shape for no gain.
 */
export async function fetchTranscript(
  symbol: string,
  fiscalYear: number,
  quarter: number,
): Promise<EarningsTranscript | null> {
  const sym = symbol.trim().toUpperCase()
  const qs = new URLSearchParams({
    year: String(fiscalYear),
    quarter: String(quarter),
    apikey: apiKey(),
  })
  const res = await fetch(`${FMP_V3}/earning_call_transcript/${fmpSymbol(sym)}?${qs}`)
  if (!res.ok) throw new Error(`FMP transcript/${sym} Q${quarter} ${fiscalYear}: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as EarningsTranscript[]
  return data?.[0] ?? null
}
