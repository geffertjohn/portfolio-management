/**
 * allocationBands.ts
 *
 * Rolls a portfolio's ACTUAL holdings up to the two allocation tiers and checks
 * each against the model's band. React-free; the single source for both tiers.
 *
 *   tier 1 — Equity / Fixed Income / Alternatives / Cash
 *   tier 2 — the 14 asset classes
 *
 * (Tier 3, a position against its own band, is `computePositionBands` and is
 * already rendered on Allocation → Positions.)
 *
 * BAND-BASED, NOT TARGET-DELTA. `<key>_target = 0` alongside a non-zero upper
 * limit means "permitted but not targeted", NOT "we want zero" — so distance
 * from target says nothing and only in-band / out-of-band counts. Core Growth
 * targets no mid cap yet permits up to 10%, and holds 15.9%: a real breach that
 * a target-delta view would report as "+15.9 over target", and its 2.6% small
 * cap (also target 0, band 0–5) would wrongly read as a breach too.
 *
 * Zero target AND zero band is different again — that class is NOT ALLOWED, so
 * any weight at all is a breach.
 */
import type { AssetClassKey, ModelPortfolio } from './modelPortfolios'
import { ASSET_CLASS_ROWS } from './modelPortfolios'
import { resolveAssetClass } from './assetClass'

/** Which tier-1 bucket each asset class rolls into. */
export const TIER1_OF_ASSET_CLASS: Record<AssetClassKey, Tier1Key> = {
  large_cap_blend: 'equity',
  large_cap_growth: 'equity',
  large_cap_value: 'equity',
  us_mid_cap: 'equity',
  us_small_cap: 'equity',
  non_us_developed: 'equity',
  emerging_market: 'equity',
  ig_intermediate_fixed_income: 'fixed_income',
  ig_short_fixed_income: 'fixed_income',
  non_ig_fixed_income: 'fixed_income',
  non_us_fixed_income: 'fixed_income',
  multi_sector_fixed_income: 'fixed_income',
  alternatives: 'alternatives',
  cash: 'cash',
}

export type Tier1Key = 'equity' | 'fixed_income' | 'alternatives' | 'cash'

export const TIER1_ROWS: { key: Tier1Key; label: string }[] = [
  { key: 'equity', label: 'Equity' },
  { key: 'fixed_income', label: 'Fixed Income' },
  { key: 'alternatives', label: 'Alternatives' },
  { key: 'cash', label: 'Cash' },
]

export type BandStatus = 'ok' | 'above' | 'below' | 'not_allowed'

export interface BandRow {
  key: string
  label: string
  /** Null when the model sets no target — the band alone governs. */
  target: number | null
  lower: number | null
  upper: number | null
  actual: number
  status: BandStatus
}

export interface AllocationBandReport {
  tier1: BandRow[]
  tier2: BandRow[]
  /** Holdings whose asset class could not be resolved — surfaced, never dropped. */
  unclassified: { symbol: string; weight: number }[]
  /** Sum of everything that DID classify; < 100 means unclassified weight exists. */
  classifiedTotal: number
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * A class with no target and no upper limit is not part of this model at all.
 * One with a zero target but a real upper is permitted-but-not-targeted.
 */
function statusFor(actual: number, lower: number | null, upper: number | null, target: number | null): BandStatus {
  const notAllowed = (target == null || target === 0) && (upper == null || upper === 0)
  if (notAllowed) return actual > 0.005 ? 'not_allowed' : 'ok'
  if (upper != null && actual > upper + 0.005) return 'above'
  if (lower != null && actual < lower - 0.005) return 'below'
  return 'ok'
}

/**
 * Compare actual weights (percent points, keyed by ticker) against a model.
 *
 * Rows the model does not use AND the portfolio does not hold are omitted, so a
 * Core Growth report does not list five empty fixed-income sleeves. A class the
 * portfolio holds is ALWAYS listed, even when the model gives it no room —
 * that is exactly the breach worth seeing.
 */
export function computeAllocationBands(
  actualWeights: Map<string, number>,
  securities: { security_id: string; category_name: string | null }[],
  model: ModelPortfolio | null,
): AllocationBandReport {
  const byId = new Map(securities.map((s) => [s.security_id.trim().toUpperCase(), s]))
  const mp = model as unknown as Record<string, unknown> | null

  const byClass = new Map<AssetClassKey, number>()
  const unclassified: { symbol: string; weight: number }[] = []
  for (const [rawSymbol, weight] of actualWeights) {
    const symbol = rawSymbol.trim().toUpperCase()
    const sec = byId.get(symbol) ?? { security_id: symbol, category_name: null }
    const key = resolveAssetClass(sec)
    if (!key) { unclassified.push({ symbol, weight }); continue }
    byClass.set(key, (byClass.get(key) ?? 0) + weight)
  }

  const tier2: BandRow[] = []
  for (const { key, label } of ASSET_CLASS_ROWS) {
    const target = mp ? num(mp[`${key}_target`]) : null
    const lower = mp ? num(mp[`${key}_lower_limit`]) : null
    const upper = mp ? num(mp[`${key}_upper_limit`]) : null
    const actual = byClass.get(key) ?? 0
    // Not in the model and not held — omit rather than pad the table with zeros.
    if (actual === 0 && !target && !upper) continue
    tier2.push({
      key, label,
      // A 0 target beside a 15.9% actual reads as a breach when it is not one,
      // so an unset target is null and the UI shows nothing.
      target: target && target !== 0 ? target : null,
      lower, upper, actual,
      status: statusFor(actual, lower, upper, target),
    })
  }

  const tier1Actual = new Map<Tier1Key, number>()
  for (const [key, w] of byClass) {
    const t1 = TIER1_OF_ASSET_CLASS[key]
    tier1Actual.set(t1, (tier1Actual.get(t1) ?? 0) + w)
  }

  const tier1: BandRow[] = []
  for (const { key, label } of TIER1_ROWS) {
    const target = mp ? num(mp[`${key}_target`]) : null
    const lower = mp ? num(mp[`${key}_lower_limit`]) : null
    const upper = mp ? num(mp[`${key}_upper_limit`]) : null
    const actual = tier1Actual.get(key) ?? 0
    if (actual === 0 && !target && !upper) continue
    tier1.push({
      key, label,
      target: target && target !== 0 ? target : null,
      lower, upper, actual,
      status: statusFor(actual, lower, upper, target),
    })
  }

  let classifiedTotal = 0
  for (const w of byClass.values()) classifiedTotal += w

  return { tier1, tier2, unclassified, classifiedTotal }
}
