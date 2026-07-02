/**
 * fmpSegments.ts
 *
 * Revenue segmentation from FMP — revenue split by product line and by
 * geographic region, for both annual and quarterly periods. Feeds the
 * "Revenue by Product" / "Revenue by Geography" tabs in the Financials block.
 *
 * FMP stable endpoints (newest-period first):
 *   /revenue-product-segmentation?symbol=&period=annual|quarter
 *   /revenue-geographic-segmentation?symbol=&period=annual|quarter
 * Each row: { symbol, fiscalYear, period ("FY"|"Q1".."Q4"), date, data: { segment: value } }
 */
import { FMP_STABLE, apiKey, fmpSymbol, fmpFetch, asArray, num, str } from './fmpClient'

export type SegmentKind = 'product' | 'geo'
export type SegmentPeriodType = 'annual' | 'quarter'

/** One reporting period's segment breakdown. */
export interface SegmentPeriod {
  /** "FY 2025" / "Q2 2026" — matches the FinancialsSection label convention. */
  fiscalLabel: string
  /** Period-end date (ISO). */
  date: string
  /** Sum of all segment values for the period. */
  total: number
  /** segment name → revenue (dollars). */
  data: Record<string, number>
}

const ENDPOINT: Record<SegmentKind, string> = {
  product: 'revenue-product-segmentation',
  geo:     'revenue-geographic-segmentation',
}

/**
 * Fetch a symbol's revenue segments for the given kind + period. Returns rows
 * newest-first (as FMP serves them); empty periods are dropped.
 */
export async function fetchRevenueSegments(
  symbol: string,
  kind: SegmentKind,
  period: SegmentPeriodType,
): Promise<SegmentPeriod[]> {
  const url = `${FMP_STABLE}/${ENDPOINT[kind]}?symbol=${fmpSymbol(symbol)}&period=${period}&apikey=${apiKey()}`
  const rows = asArray(await fmpFetch(url))
  const out: SegmentPeriod[] = []
  for (const r of rows) {
    const rawData = r.data
    if (!rawData || typeof rawData !== 'object') continue

    const data: Record<string, number> = {}
    let total = 0
    for (const [seg, v] of Object.entries(rawData as Record<string, unknown>)) {
      const n = num(v)
      if (n === null) continue
      data[seg] = n
      total += n
    }
    if (Object.keys(data).length === 0) continue

    const periodStr = str(r.period) ?? 'FY'
    const year = num(r.fiscalYear)
    const date = str(r.date) ?? ''
    const fiscalLabel = year !== null
      ? `${periodStr} ${year}`
      : date ? `FY ${new Date(date + 'T00:00:00').getFullYear()}` : periodStr

    out.push({ fiscalLabel, date, total, data })
  }
  return out
}

/**
 * The union of segment names across the given periods, ordered by their value
 * in the most recent period (descending); names absent from the latest period
 * are appended in first-seen order. Used for stable table columns / chart series.
 */
export function orderedSegmentNames(periods: SegmentPeriod[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const latest = periods[0]
  if (latest) {
    for (const name of Object.keys(latest.data).sort((a, b) => (latest.data[b] ?? 0) - (latest.data[a] ?? 0))) {
      seen.add(name)
      ordered.push(name)
    }
  }
  for (const p of periods) {
    for (const name of Object.keys(p.data)) {
      if (!seen.has(name)) { seen.add(name); ordered.push(name) }
    }
  }
  return ordered
}
