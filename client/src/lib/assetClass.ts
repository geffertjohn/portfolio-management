/**
 * assetClass.ts
 *
 * Which of the firm's asset classes a security belongs to — the single source
 * of truth, in the same spirit as `classifySecurity()` for stock/ETF/fund.
 * Never re-implement this inline; call `resolveAssetClass()`.
 *
 * It is DERIVED from the vendor category rather than stored on `securities2`,
 * deliberately:
 *
 *   - The rules live in git, so a mapping change shows up in a PR diff. A stored
 *     column would record the value but not the reasoning or the change.
 *   - It applies to a security the moment it appears, with no seeding pass and
 *     nothing to drift out of sync with `category_name`.
 *   - `resolveAssetClass` is the only caller-visible surface, so adding a stored
 *     override column later is a change INSIDE this function. Callers don't move.
 *
 * WHY `category_name` AND NOT THE OTHER TWO classification fields: `securities2`
 * carries three, and they disagree. FLCSX is Morningstar "Large Blend", Lipper
 * "Large-Cap Value Funds" (`peer_group_name`) and YCharts "US Large Cap Value"
 * (`ycharts_benchmark_category`). Morningstar's `category_name` is the chosen
 * authority; the other two stay load-bearing for the peer scorecard and the
 * `category_benchmarks` lookup respectively, and must not be repurposed.
 *
 * KNOWN GAP: securities created by ticker (`AddSecurityModal` →
 * `createSecurityBySymbol`) are seeded from FMP, which supplies no Morningstar
 * category, so they resolve to null until a YCharts workbook import fills
 * `category_name`. Surface unclassified weight rather than silently dropping it.
 */
import type { AssetClassKey } from './modelPortfolios'
import { ASSET_CLASS_ROWS } from './modelPortfolios'
import { isCashTicker } from './positionBands'

/**
 * Morningstar `category_name` → asset class.
 *
 * Covers both vocabularies in the book: funds/ETFs use "Large Blend" and
 * "Mid-Cap Growth", individual stocks use "Large Cap Core" and "Mid Cap Growth".
 * "Core" and "Blend" are the same sleeve.
 *
 * Growth and value sub-styles fold into the single mid- and small-cap sleeves,
 * because the taxonomy has one class for each (`us_mid_cap`, `us_small_cap`) —
 * only large cap is split three ways.
 *
 * Lookup is trimmed and case-insensitive; see `normalize`.
 */
export const ASSET_CLASS_BY_CATEGORY: Record<string, AssetClassKey> = {
  // ── US equity — funds & ETFs ───────────────────────────────────────────────
  'Large Blend':                  'large_cap_blend',
  'Large Growth':                 'large_cap_growth',
  'Large Value':                  'large_cap_value',
  'Mid-Cap Blend':                'us_mid_cap',
  'Mid-Cap Growth':               'us_mid_cap',
  'Small Blend':                  'us_small_cap',
  'Small Growth':                 'us_small_cap',
  // ── US equity — individual stocks (style grid, "Core" = "Blend") ───────────
  'Large Cap Core':               'large_cap_blend',
  'Large Cap Growth':             'large_cap_growth',
  'Large Cap Value':              'large_cap_value',
  'Mid Cap Core':                 'us_mid_cap',
  'Mid Cap Growth':               'us_mid_cap',
  'Small Cap Core':               'us_small_cap',
  'Small Cap Growth':             'us_small_cap',
  // ── Non-US equity ──────────────────────────────────────────────────────────
  'Foreign Large Blend':          'non_us_developed',
  'Diversified Emerging Mkts':    'emerging_market',
  // ── Fixed income ───────────────────────────────────────────────────────────
  'Intermediate Core Bond':       'ig_intermediate_fixed_income',
  'Intermediate Core-Plus Bond':  'ig_intermediate_fixed_income',
  'High Yield Bond':              'non_ig_fixed_income',
  // A global bond fund is multi-sector here, not non-US fixed income: the sleeve
  // it is bought to fill is sector diversification, not currency exposure.
  'Global Bond-USD Hedged':       'multi_sector_fixed_income',
}

/**
 * Per-ticker escape hatch, for securities the vendor category cannot place.
 *
 * Keep this SHORT. A long list means the category map is wrong, or that the
 * stored-column option this module's header describes has become worth taking.
 */
export const ASSET_CLASS_OVERRIDES: Record<string, AssetClassKey> = {
  // Morningstar publishes no category for BRK.B.
  'BRK.B': 'large_cap_value',
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

const BY_NORMALIZED_CATEGORY: Map<string, AssetClassKey> = new Map(
  Object.entries(ASSET_CLASS_BY_CATEGORY).map(([cat, key]) => [normalize(cat), key]),
)

const LABEL_BY_KEY: Map<AssetClassKey, string> = new Map(
  ASSET_CLASS_ROWS.map(({ key, label }) => [key, label]),
)

/** Display label for an asset class, from the single ASSET_CLASS_ROWS source. */
export function assetClassLabel(key: AssetClassKey | null | undefined): string | null {
  return key ? LABEL_BY_KEY.get(key) ?? null : null
}

/**
 * The asset class for a security, or null when it cannot be placed.
 *
 * Null is a real answer — an unclassified holding must surface as unclassified
 * weight, never be silently dropped from a rollup, or the tier totals stop
 * summing to 100% with nothing saying why.
 */
export function resolveAssetClass(
  security: { security_id: string; category_name: string | null },
): AssetClassKey | null {
  const override = ASSET_CLASS_OVERRIDES[security.security_id.trim().toUpperCase()]
  if (override) return override
  if (isCashTicker(security.security_id)) return 'cash'
  const category = security.category_name?.trim()
  if (!category) return null
  return BY_NORMALIZED_CATEGORY.get(normalize(category)) ?? null
}
