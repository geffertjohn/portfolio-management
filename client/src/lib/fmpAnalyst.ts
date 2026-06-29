const FMP_STABLE = 'https://financialmodelingprep.com/stable'

function apiKey(): string {
  const key = import.meta.env.VITE_FMP_API_KEY as string | undefined
  if (!key) throw new Error('VITE_FMP_API_KEY is not configured.')
  return key
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function firstItem(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
    return raw[0] as Record<string, unknown>
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return null
}

async function fmpGet(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FMP ${res.status}: ${url}`)
  return res.json() as Promise<unknown>
}

export interface PriceTargetData {
  targetConsensus: number | null
  targetHigh: number | null
  targetLow: number | null
  targetMedian: number | null
  numberOfAnalysts: number | null
}

export interface GradesData {
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
  consensus: string | null
}

export interface AnalystData {
  priceTarget: PriceTargetData | null
  grades: GradesData | null
}

export async function fetchAnalystData(symbol: string): Promise<AnalystData> {
  const key = apiKey()

  const [ptResult, gradesResult, consensusResult] = await Promise.allSettled([
    fmpGet(`${FMP_STABLE}/price-target-consensus?symbol=${symbol}&apikey=${key}`),
    // grades-historical: monthly snapshot of ALL active analyst ratings (most comprehensive)
    fmpGet(`${FMP_STABLE}/grades-historical?symbol=${symbol}&limit=1&apikey=${key}`),
    // grades-consensus: still used for the computed consensus label string
    fmpGet(`${FMP_STABLE}/grades-consensus?symbol=${symbol}&apikey=${key}`),
  ])

  let priceTarget: PriceTargetData | null = null
  if (ptResult.status === 'fulfilled') {
    const item = firstItem(ptResult.value)
    if (item) {
      priceTarget = {
        targetConsensus:  num(item.targetConsensus),
        targetHigh:       num(item.targetHigh),
        targetLow:        num(item.targetLow),
        targetMedian:     num(item.targetMedian),
        // FMP may return this as numberOfAnalysts, numAnalysts, or numberOfPriceTargets
        numberOfAnalysts: num(item.numberOfAnalysts) ?? num(item.numAnalysts) ?? num(item.numberOfPriceTargets),
      }
      // Only keep if at least one value is present
      if (!Object.values(priceTarget).some((v) => v !== null)) priceTarget = null
    }
  }

  let grades: GradesData | null = null
  if (gradesResult.status === 'fulfilled') {
    const item = firstItem(gradesResult.value)
    if (item) {
      // historical-grades uses analystRatings* field names
      const consensusItem = consensusResult.status === 'fulfilled' ? firstItem(consensusResult.value) : null
      grades = {
        strongBuy:   num(item.analystRatingsStrongBuy)  ?? num(item.strongBuy)  ?? 0,
        buy:         num(item.analystRatingsBuy)        ?? num(item.buy)        ?? 0,
        hold:        num(item.analystRatingsHold)       ?? num(item.hold)       ?? 0,
        sell:        num(item.analystRatingsSell)       ?? num(item.sell)       ?? 0,
        strongSell:  num(item.analystRatingsStrongSell) ?? num(item.strongSell) ?? 0,
        consensus:   consensusItem && typeof consensusItem.consensus === 'string' ? consensusItem.consensus : null,
      }
      // Only keep if there are any ratings
      const total = grades.strongBuy + grades.buy + grades.hold + grades.sell + grades.strongSell
      if (total === 0 && !grades.consensus) grades = null
    }
  }

  return { priceTarget, grades }
}
