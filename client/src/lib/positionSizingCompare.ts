/**
 * positionSizingCompare.ts
 *
 * Parses an uploaded "actual allocations" workbook (YCharts export:
 * col A = ticker, col B = allocation in percent points) and compares each
 * holding's actual weight against its effective allocation band. Only band
 * breaches (actual above the upper limit or below the lower limit) are surfaced.
 */
import * as XLSX from 'xlsx'
import type { PortfolioPosition } from '@/types/position'
import { computePositionBands, isCashTicker, type BandModel } from './positionBands'

/** Tolerance (percent points) so rounding noise doesn't register as a breach. */
const EPS = 0.005

/** ticker (UPPER) → actual weight in percent points. */
export function parseActualAllocations(buf: ArrayBuffer): Map<string, number> {
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
  const out = new Map<string, number>()
  for (const r of rows) {
    const raw = r?.[0]
    const sym = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
    const wCell = r?.[1]
    const w = typeof wCell === 'number' ? wCell : typeof wCell === 'string' ? parseFloat(wCell) : NaN
    if (!sym || !Number.isFinite(w)) continue
    if (sym === 'SECURITY TICKER/CUSIP' || sym === 'TICKER' || sym === 'SYMBOL') continue
    out.set(sym, (out.get(sym) ?? 0) + w)
  }
  return out
}

export interface SizingBreach {
  symbol: string
  name: string | null
  numericId: number | null
  target: number
  lower: number | null
  upper: number | null
  actual: number
  direction: 'over' | 'under'
  /** Signed distance past the breached limit (percent points). */
  breachBy: number
}

export interface SizingComparison {
  breaches: SizingBreach[]
  /** Count of holdings matched in the file and within their band. */
  withinCount: number
  /** Position tickers with no actual weight in the uploaded file. */
  unmatchedPositions: string[]
  /** File tickers that are not a target position (held off-model). */
  unmatchedFile: string[]
}

export function compareSizing(
  positions: PortfolioPosition[],
  modelPortfolio: BandModel,
  actuals: Map<string, number>,
): SizingComparison {
  const bands = computePositionBands(positions, modelPortfolio)
  const positionKeys = new Set(bands.map((b) => b.symbol.toUpperCase()))
  const breaches: SizingBreach[] = []
  const unmatchedPositions: string[] = []
  let withinCount = 0

  // All cash-like file tickers (e.g. FDXCASH) collapse into one cash actual that
  // matches the cash position ($Cash). null = no cash row present in the file.
  let cashActual: number | null = null
  for (const [k, v] of actuals) {
    if (isCashTicker(k)) cashActual = (cashActual ?? 0) + v
  }

  for (const b of bands) {
    const actual = isCashTicker(b.symbol) ? cashActual : (actuals.get(b.symbol.toUpperCase()) ?? null)
    if (actual == null) {
      unmatchedPositions.push(b.symbol)
      continue
    }
    if (b.upper != null && actual > b.upper + EPS) {
      breaches.push({ ...b, actual, direction: 'over', breachBy: actual - b.upper })
    } else if (b.lower != null && actual < b.lower - EPS) {
      breaches.push({ ...b, actual, direction: 'under', breachBy: b.lower - actual })
    } else {
      withinCount++
    }
  }

  // Cash-like tickers are folded into the cash position above, never "off-model".
  const unmatchedFile = [...actuals.keys()].filter((k) => !positionKeys.has(k) && !isCashTicker(k))

  // Largest breach first.
  breaches.sort((a, b) => b.breachBy - a.breachBy)
  return { breaches, withinCount, unmatchedPositions, unmatchedFile }
}
