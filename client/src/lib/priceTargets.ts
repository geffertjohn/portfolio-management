/**
 * Scenario price targets on a standalone watchlist read.
 *
 * Pure and React-free: the compact line on the Watchlist card and the full
 * per-scenario block inside the research drawer are both built from here, so
 * the two cannot disagree about what a number means (the `lib/fundScorecard.ts`
 * split). Decide what a reader sees in this file, never in one of the renderers.
 *
 * Only `initial` reports carry these. The earnings briefs answer a different
 * question — they already carry `estimates` for the street's numbers and
 * `review_recommendations` for the allocation call.
 */

export type PriceCase = 'bear' | 'base' | 'bull'

export const PRICE_CASE_ORDER: PriceCase[] = ['bear', 'base', 'bull']

export const PRICE_CASE_LABEL: Record<PriceCase, string> = {
  bear: 'Bear',
  base: 'Base',
  bull: 'Bull',
}

export interface PriceScenario {
  case: PriceCase
  /** The target itself, in the security's trading currency. */
  value: number
  /** 0–1 decimal, or null when the analyst stated no probability. */
  probability: number | null
  /** What has to happen for this case to be the one that lands. */
  premise: string
}

export interface PriceTargets {
  scenarios: PriceScenario[]
  /** Probability-weighted value, when every scenario carries a probability. */
  weighted: number | null
  /** How the targets were derived — the multiple, horizon and discount rate. */
  method: string
  /**
   * The price at which the rating would become a buy.
   *
   * **Null is a real answer, not missing data.** A hold is not always about
   * price: MRVL was held at $200 against a $240 fair value because an
   * unresolved all-stock acquisition changed what was being bought, so no lower
   * price would have made it a buy. `priceLimited: false` says that explicitly
   * and `buyBelowBasis` says what WOULD change the rating. Printing a computed
   * number there would misstate why the name is a hold.
   */
  buyBelow: number | null
  /** The required return `buyBelow` reflects — or, when not price-limited, what would change the call. */
  buyBelowBasis: string
  priceLimited: boolean
}

function isCase(v: unknown): v is PriceCase {
  return v === 'bear' || v === 'base' || v === 'bull'
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Parse the stored jsonb into a usable shape, or null.
 *
 * Tolerant by design: the column is written by an agent, so a row may carry a
 * partial object. A scenario missing its case or value is dropped rather than
 * rendered as a blank row, and an object with no usable scenario yields null so
 * callers can simply test for the block's presence.
 */
export function parsePriceTargets(value: unknown): PriceTargets | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const o = value as Record<string, unknown>

  const raw = Array.isArray(o.scenarios) ? o.scenarios : []
  const scenarios: PriceScenario[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const value_ = num(s.value)
    if (!isCase(s.case) || value_ == null) continue
    scenarios.push({
      case: s.case,
      value: value_,
      probability: num(s.probability),
      premise: str(s.premise),
    })
  }
  if (scenarios.length === 0) return null

  scenarios.sort((a, b) => PRICE_CASE_ORDER.indexOf(a.case) - PRICE_CASE_ORDER.indexOf(b.case))

  return {
    scenarios,
    weighted: num(o.weighted) ?? weightedValue(scenarios),
    method: str(o.method),
    buyBelow: num(o.buyBelow),
    buyBelowBasis: str(o.buyBelowBasis),
    // Default TRUE only when a price is actually given: an object that says
    // nothing about why it is a hold should not assert that price is the reason.
    priceLimited: typeof o.priceLimited === 'boolean' ? o.priceLimited : num(o.buyBelow) != null,
  }
}

/**
 * Probability-weighted value, used only when the row did not store one.
 *
 * Returns null unless EVERY scenario carries a probability and they sum to
 * roughly 1. A weighted average over a partial set would silently
 * under-weight the cases that happen to state a number.
 */
export function weightedValue(scenarios: PriceScenario[]): number | null {
  if (scenarios.length === 0) return null
  if (scenarios.some((s) => s.probability == null)) return null
  const total = scenarios.reduce((sum, s) => sum + (s.probability ?? 0), 0)
  if (Math.abs(total - 1) > 0.02) return null
  return scenarios.reduce((sum, s) => sum + s.value * (s.probability ?? 0), 0)
}

/** The scenario of one case, when present. */
export function scenarioFor(t: PriceTargets, c: PriceCase): PriceScenario | null {
  return t.scenarios.find((s) => s.case === c) ?? null
}

/**
 * How far `price` sits below the buy-below threshold, as a decimal.
 *
 * Negative means the price must still fall. Null when the rating is not
 * price-limited, so a caller cannot accidentally render "0% away" as if the
 * name were on the edge of a buy.
 */
export function gapToBuy(t: PriceTargets, price: number | null | undefined): number | null {
  if (t.buyBelow == null || price == null || !Number.isFinite(price) || price <= 0) return null
  return (t.buyBelow - price) / price
}
