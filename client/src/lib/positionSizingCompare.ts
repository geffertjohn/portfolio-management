/**
 * positionSizingCompare.ts
 *
 * Parses an uploaded "actual allocations" workbook (YCharts export:
 * col A = ticker, col B = allocation in percent points) and compares each
 * holding's actual weight against its effective allocation band.
 *
 * **It returns the whole book, not just what is wrong with it.** This used to
 * surface band breaches alone, so a portfolio sitting inside its limits — the
 * normal case — reported "all matched holdings are within their allocation
 * limits" and a bare count, and the advisor could not see the allocations they
 * had just uploaded. That is the wrong shape for the evidence step of a
 * documented review: the reviewer has to be able to see what they reviewed,
 * and a step that renders a verdict with no numbers behind it is a step that
 * decides away from the evidence. `rows` carries every holding; `breaches`
 * stays as the filtered view the summary line counts.
 *
 * `rows` also carries the two kinds of mismatch, rather than relegating them
 * to a footnote: a target position absent from the file (`missing`) and a file
 * ticker that is not a target position (`off_model`). Both are findings about
 * the book, and a holding left out of a sizing review reads as one with
 * nothing to answer for.
 */
import * as XLSX from 'xlsx'
import type { PortfolioPosition } from '@/types/position'
import { computePositionBands, isCashTicker, type BandModel } from './positionBands'

/** Tolerance (percent points) so rounding noise doesn't register as a breach. */
const EPS = 0.005

const TICKER_HEADERS = new Set(['SECURITY TICKER/CUSIP', 'TICKER', 'SYMBOL'])

/**
 * Headers that exist ONLY on the rebalance-upload template, never on a
 * holdings export. See `allocationFileKind`.
 */
const TARGET_TEMPLATE_HEADERS = [
  /\blower\s+tolerance\b/i,
  /\b(?:higher|upper)\s+tolerance\b/i,
  /\bcash\s+indicator\b/i,
  /\balternate\s+products?\b/i,
]

export type AllocationFileKind =
  /** What the book actually holds. The only kind that may be read as an actual allocation. */
  | 'holdings'
  /** The rebalance-upload template: a SPECIFICATION of what the book should hold. */
  | 'targets'
  /** Parsed to nothing — not this kind of sheet at all. */
  | 'unreadable'

export interface AllocationFile {
  kind: AllocationFileKind
  /** ticker (UPPER) → weight in percent points. Empty when `unreadable`. */
  weights: Map<string, number>
}

/**
 * Read an allocation workbook AND say which kind of allocation it is.
 *
 * **A TARGET FILE AND A HOLDINGS FILE ARE BOTH `Ticker, Weight` AND MEAN
 * OPPOSITE THINGS.** The advisor's `Portfolio Documents` folder carries both
 * shapes, and until Nov 2026 nothing distinguished them, so a target file
 * uploaded there silently became "the actual allocation" and every drift and
 * band measurement for that book compared the targets against themselves.
 * Three live states on 17 Nov 2026:
 *
 * - **Core Growth / Equity Income** — `Security Ticker/CUSIP,Target`, two
 *   columns, weights that are genuinely drifted (BSX 1.22% against a 2.50%
 *   target). Real holdings; the measurement was always valid for these.
 * - **Hybrid Balanced / Hybrid Conservative** — the six-column template, and
 *   all 17 weights IDENTICAL to `positions`. Drift came out as exactly zero
 *   and no breach could ever be raised: a false negative in an audit surface.
 * - **ETF Conservative Balanced** — the six-column template carrying a NEW
 *   lineup (CPLB 14.0, SPMO 7.0, UITB 26.0, none of them in `positions`) while
 *   `positions` still held the old one. The difference was reported as drift.
 *   That is a false POSITIVE, and it is what the Actions hub was showing.
 *
 * **The test is the HEADER, not whether the weights match `positions`.**
 * Equality with the stored targets identifies Hybrid Balanced and misses ETF
 * Conservative Balanced completely, because that book's targets are stale — so
 * weight equality is a coincidence that may or may not hold, while the header
 * is a fact about where the file came from. The tolerance and cash-indicator
 * columns are the signature: they describe a BAND, and only a specification
 * has bands. What you hold has no tolerance.
 *
 * One marker is enough. Each of the four is template-only, and demanding two
 * would let a trimmed export through — the failure this exists to stop.
 */
export function readAllocationFile(buf: ArrayBuffer): AllocationFile {
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })

  // Look for the markers on the header row — the row naming the ticker column,
  // or failing that the first row. Scoped rather than scanning the whole sheet
  // so a holding whose NAME happened to contain "cash indicator" could not
  // reclassify the file.
  const headerRow =
    rows.find((r) => {
      const a = r?.[0]
      return typeof a === 'string' && TICKER_HEADERS.has(a.trim().toUpperCase())
    }) ?? rows[0]
  const headerText = (headerRow ?? [])
    .map((c) => (typeof c === 'string' ? c : ''))
    .join(' | ')
  const isTemplate = TARGET_TEMPLATE_HEADERS.some((re) => re.test(headerText))

  const weights = new Map<string, number>()
  for (const r of rows) {
    const raw = r?.[0]
    const sym = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
    const wCell = r?.[1]
    const w = typeof wCell === 'number' ? wCell : typeof wCell === 'string' ? parseFloat(wCell) : NaN
    if (!sym || !Number.isFinite(w)) continue
    if (TICKER_HEADERS.has(sym)) continue
    weights.set(sym, (weights.get(sym) ?? 0) + w)
  }

  // An empty parse is `unreadable` whatever the header said: a file with the
  // template's headers and no rows is not a target vector, it is nothing.
  if (weights.size === 0) return { kind: 'unreadable', weights }
  return { kind: isTemplate ? 'targets' : 'holdings', weights }
}

/**
 * ticker (UPPER) → weight in percent points, whatever KIND of file it is.
 *
 * Callers that are measuring the book against its model must use
 * `readAllocationFile` and refuse a `targets` file — comparing a target vector
 * with itself is not a measurement. This stays for the paths where the advisor
 * has just chosen the file by hand and the kind is theirs to assert.
 */
export function parseActualAllocations(buf: ArrayBuffer): Map<string, number> {
  return readAllocationFile(buf).weights
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

export type SizingStatus =
  /** Matched in the file and inside its band. */
  | 'within'
  /** Matched and above the upper limit. */
  | 'over'
  /** Matched and below the lower limit. */
  | 'under'
  /** A target position carrying no weight in the uploaded file. */
  | 'missing'
  /** A weight in the file that is not a target position. */
  | 'off_model'

/** One line of the comparison — every target position, plus anything held off-model. */
export interface SizingRow {
  symbol: string
  name: string | null
  numericId: number | null
  /** null for an off-model holding, which has no target. */
  target: number | null
  lower: number | null
  upper: number | null
  /** null for a target position missing from the file. */
  actual: number | null
  status: SizingStatus
  /** Distance past the breached limit (percent points); null unless over/under. */
  breachBy: number | null
  /** actual − target (percent points); null unless both are known. */
  drift: number | null
}

export interface SizingComparison {
  /** Every holding — the book as uploaded, breaches flagged in place. */
  rows: SizingRow[]
  breaches: SizingBreach[]
  /** Count of holdings matched in the file and within their band. */
  withinCount: number
  /** Position tickers with no actual weight in the uploaded file. */
  unmatchedPositions: string[]
  /** File tickers that are not a target position (held off-model). */
  unmatchedFile: string[]
  /**
   * Sum of EVERY weight in the file, off-model holdings included — a file that
   * does not reconcile to 100% is a broken export, not a rounding quirk, and
   * the same claim the allocation import makes about its own per-date totals.
   */
  actualTotal: number
  /** Sum of the model's target weights, for the same reconciliation. */
  targetTotal: number
}

export function compareSizing(
  positions: PortfolioPosition[],
  modelPortfolio: BandModel,
  actuals: Map<string, number>,
): SizingComparison {
  const bands = computePositionBands(positions, modelPortfolio)
  const positionKeys = new Set(bands.map((b) => b.symbol.toUpperCase()))
  const rows: SizingRow[] = []
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
      rows.push({ ...b, actual: null, status: 'missing', breachBy: null, drift: null })
      continue
    }
    const drift = actual - b.target
    if (b.upper != null && actual > b.upper + EPS) {
      const breachBy = actual - b.upper
      breaches.push({ ...b, actual, direction: 'over', breachBy })
      rows.push({ ...b, actual, status: 'over', breachBy, drift })
    } else if (b.lower != null && actual < b.lower - EPS) {
      const breachBy = b.lower - actual
      breaches.push({ ...b, actual, direction: 'under', breachBy })
      rows.push({ ...b, actual, status: 'under', breachBy, drift })
    } else {
      withinCount++
      rows.push({ ...b, actual, status: 'within', breachBy: null, drift })
    }
  }

  // Cash-like tickers are folded into the cash position above, never "off-model".
  const unmatchedFile = [...actuals.keys()].filter((k) => !positionKeys.has(k) && !isCashTicker(k))
  for (const symbol of unmatchedFile) {
    rows.push({
      symbol,
      name: null,
      numericId: null,
      target: null,
      lower: null,
      upper: null,
      actual: actuals.get(symbol) ?? null,
      status: 'off_model',
      breachBy: null,
      drift: null,
    })
  }

  // Heaviest first — the book as an advisor reads it. Breaches are flagged in
  // place rather than hoisted: the summary line already counts them, and
  // re-ordering a book by what is wrong with it loses the shape of the book.
  // Off-model holdings have no target and sort to the bottom.
  rows.sort((a, b) => (b.target ?? -1) - (a.target ?? -1) || a.symbol.localeCompare(b.symbol))

  // Largest breach first.
  breaches.sort((a, b) => b.breachBy - a.breachBy)

  let actualTotal = 0
  for (const v of actuals.values()) actualTotal += v
  const targetTotal = bands.reduce((sum, b) => sum + b.target, 0)

  return { rows, breaches, withinCount, unmatchedPositions, unmatchedFile, actualTotal, targetTotal }
}
