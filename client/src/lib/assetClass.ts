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
 * Lookup is trimmed, case-insensitive and whitespace-collapsing; see
 * `normalizeCategory`.
 */
export const ASSET_CLASS_BY_CATEGORY: Record<string, AssetClassKey> = {
  // ── US equity — funds & ETFs ───────────────────────────────────────────────
  'Large Blend':                  'large_cap_blend',
  'Large Growth':                 'large_cap_growth',
  'Large Value':                  'large_cap_value',
  'Mid-Cap Blend':                'us_mid_cap',
  'Mid-Cap Growth':               'us_mid_cap',
  // Added Nov 2026. The two VALUE spellings were missing while their blend and
  // growth siblings were mapped, so four watched funds — FSMVX, NAMAX and QVAL
  // (Mid-Cap Value) and VSMIX (Small Value) — resolved to null. Gotcha 23
  // again, and invisible twice over: `scripts/audit/asset-class-coverage.ts`
  // walks HELD securities only, and none of the four is held yet, so nothing
  // would have reported it until the first one was bought and its weight
  // dropped silently out of the allocation rollup.
  'Mid-Cap Value':                'us_mid_cap',
  'Small Blend':                  'us_small_cap',
  'Small Growth':                 'us_small_cap',
  'Small Value':                  'us_small_cap',
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
  // Both spellings are live in the book — VEMAX carries the abbreviated form,
  // EICOX / EMMF / EYLD the spelled-out one. Keep both: dropping either sends
  // real holdings to the unclassified row.
  'Diversified Emerging Mkts':    'emerging_market',
  'Diversified Emerging Markets': 'emerging_market',
  // ── Fixed income ───────────────────────────────────────────────────────────
  'Intermediate Core Bond':       'ig_intermediate_fixed_income',
  'Intermediate Core-Plus Bond':  'ig_intermediate_fixed_income',
  'High Yield Bond':              'non_ig_fixed_income',
  // A global bond fund is multi-sector here, not non-US fixed income: the sleeve
  // it is bought to fill is sector diversification, not currency exposure.
  'Global Bond-USD Hedged':       'multi_sector_fixed_income',
  // The literal case of the same idea, added when VMSAX entered Foundation
  // Conservative (Nov 2026). Its 3% was surfacing as unclassified weight —
  // which is the map working as designed (gotcha 23), not failing, but the
  // sleeve it fills is the one above.
  'Multisector Bond':             'multi_sector_fixed_income',
}

/**
 * Per-ticker escape hatch, for securities the vendor category cannot place.
 *
 * Keep this SHORT. A long list means the category map is wrong, or that the
 * stored-column option this module's header describes has become worth taking.
 */
export const ASSET_CLASS_OVERRIDES: Record<string, AssetClassKey> = {
  // BRK.B. The reason recorded here was "Morningstar publishes no category",
  // and that is no longer true: the row carries `Large Cap Core`, which would
  // resolve to `large_cap_blend`. So this override now overrides a PRESENT
  // category and the two disagree on the sleeve. Left as value deliberately
  // rather than silently re-sleeving a governed classification on the strength
  // of a vendor string; BRK.B is not currently held, so nothing turns on it
  // today. Revisit with the advisor rather than deleting on sight.
  'BRK.B': 'large_cap_value',

  // TIBIX (Thornburg Income Builder Fund I). Morningstar files it as "Global
  // Moderately Aggressive Allocation", which describes the MANDATE — a global
  // 50-70% equity allocation fund — and not the sleeve it fills here. The
  // taxonomy has no global-allocation class, and mapping the CATEGORY to a
  // sleeve would be false in general: a global allocation fund is typically
  // about half US, so the next one to arrive would be silently mis-filed.
  //
  // This fund is atypical for its category and the composition says so
  // (measured 10 Nov 2026): developed-market exposure 90.6% against a US
  // region total of 24.4%, so roughly 66% NON-US DEVELOPED, with emerging at
  // 2.6%. Its Lipper peer group — "Global Equity Income Funds" — reads the
  // same income-oriented international tilt. Set by the advisor on that
  // evidence.
  //
  // Per-ticker is the right instrument precisely BECAUSE the category is not
  // wrong, merely uninformative: a different fund carrying it still resolves
  // to null and still raises the import warning, which is what should happen.
  'TIBIX': 'non_us_developed',
}

/**
 * The one way a vendor `category_name` is reduced to a comparison key.
 *
 * **Exported because there was a second copy and they disagreed.**
 * `prospects.categoryKey` collapsed internal whitespace and this did not, so a
 * vendor string arriving as `Large  Blend` would have matched a watchlist
 * alternative and resolved to `null` in every allocation rollup — two answers
 * for one string, from the function whose whole job is to be the single one.
 * No live row carries irregular whitespace today, so this was latent; gotcha 23
 * is the record of what a silent `null` here costs, and CLAUDE.md already
 * claimed whitespace was handled.
 *
 * **Trim, lowercase, collapse runs of whitespace — and nothing else.** No
 * hyphen or spelling variants: those exist where two vendor vocabularies meet
 * (a fund's "Large Growth" against a benchmark's "US Large Cap Growth") and
 * inventing them here would silently merge sleeves Morningstar considers
 * distinct, which is the opposite failure and a much quieter one.
 */
export function normalizeCategory(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}


const BY_NORMALIZED_CATEGORY: Map<string, AssetClassKey> = new Map(
  Object.entries(ASSET_CLASS_BY_CATEGORY).map(([cat, key]) => [normalizeCategory(cat), key]),
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
/**
 * The categories a STOCK can be given by hand, on the security page.
 *
 * **A stock's category has had no writer since Sep 2026.** It came from the
 * per-ticker YCharts template (`securities2ExcelUpload.ts`), deleted with the
 * two single-security import cards; the workbook's `Securities` sheet is funds
 * only, and FMP supplies no Morningstar category. So a stock added by ticker
 * resolved to no asset class and its weight left every allocation rollup it
 * appeared in, reported only as an "unclassified weight" line.
 *
 * **It is a fixed list, not a text box.** The failure this closes is a
 * `category_name` the map cannot place; a free-text field would let a typo or
 * a fund-side spelling ("Large Blend" on a stock) recreate it one keystroke at
 * a time, and silently. `assetClass.test.ts` asserts every option here
 * resolves, so the picker cannot write a value the resolver will reject — the
 * same `*_OPTIONS ⊆ CHECK` discipline `schemaContract.test.ts` applies to the
 * database.
 *
 * These are the STOCK style-grid spellings ("Core"), not the fund ones
 * ("Blend"), because mixing the two vocabularies on one asset type is how a
 * second spelling of one sleeve gets into the book — see gotcha 23.
 */
export const STOCK_CATEGORY_OPTIONS = [
  'Large Cap Value',
  'Large Cap Core',
  'Large Cap Growth',
  'Mid Cap Core',
  'Mid Cap Growth',
  'Small Cap Core',
  'Small Cap Growth',
] as const

/**
 * Which of these vendor categories the map cannot place.
 *
 * **The question is whether the CATEGORY is known, not whether a particular
 * holding resolves**, so this probes with a synthetic ticker: an override or
 * the cash branch would otherwise mask a vocabulary the map has never seen,
 * and the next security carrying it would fall straight through.
 *
 * Lives here, beside the map, because this is the vocabulary's home and the
 * importers that call it must not each grow their own copy of the rule.
 * Returns distinct, trimmed, sorted — a workbook repeats a category once per
 * fund and the caller wants the set.
 */
export function unmappedCategories(
  categories: Iterable<string | null | undefined>,
): string[] {
  const out = new Set<string>()
  for (const raw of categories) {
    const category = typeof raw === 'string' ? raw.trim() : ''
    // A missing category is not an unmapped one — it is the FMP-created
    // security the module header describes, and a different problem.
    if (category === '') continue
    if (resolveAssetClass({ security_id: '__unmapped_probe__', category_name: category }) === null) {
      out.add(category)
    }
  }
  return [...out].sort()
}

/**
 * The categories of securities this map cannot place — the question an IMPORT
 * WARNING has to ask.
 *
 * **Not the same question as `unmappedCategories`, and the difference is a
 * standing false alarm.** That one asks whether a VOCABULARY is known, probing
 * with a synthetic ticker so a per-ticker override cannot report a category as
 * handled. Correct for an audit of the map. Wrong for a warning: TIBIX carries
 * `Global Moderately Aggressive Allocation` and is placed by
 * `ASSET_CLASS_OVERRIDES`, so nothing is unclassified — yet the synthetic probe
 * still calls the category unmapped, and the import would have raised a
 * high-priority action every morning about a book with no gap in it. A signal
 * that cries wolf gets dismissed.
 *
 * **It keeps the property the synthetic probe was protecting.** The danger
 * recorded at that function is that asking with ONE real ticker lets an
 * override speak for a whole category, so the next security carrying it falls
 * straight through. Asking about EVERY security individually is strictly
 * stronger: a new fund in TIBIX's category has no override of its own, so it is
 * unplaced, so it is reported — which is exactly what should happen, because
 * somebody has to look at its composition too.
 *
 * A security with NO category is skipped, not reported: that is the
 * FMP-created security in the module header, a different problem, and warning
 * on it would fire for every newly added ticker.
 */
export function unplacedCategories(
  securities: Iterable<{ security_id: string; category_name: string | null }>,
): string[] {
  const out = new Set<string>()
  for (const security of securities) {
    const category = security.category_name?.trim()
    if (!category) continue
    if (resolveAssetClass(security) === null) out.add(category)
  }
  return [...out].sort()
}

/**
 * The one sentence every surface uses to report an unmapped vendor category.
 *
 * Phrased once, here, because there are now three places that report it — the
 * Import / Export card's banner, the unattended refresh's log, and the row it
 * writes to `import_runs.warnings` that the Actions hub reads. A message
 * written separately at each end is how `consensusColor` and `fmtUsdCompact`
 * drifted into two behaviours apiece.
 *
 * Returns null for an empty set so a caller can push the result without first
 * testing the length.
 */
export function unmappedCategoryWarning(categories: string[]): string | null {
  if (categories.length === 0) return null
  const quoted = categories.map((c) => `"${c}"`).join(', ')
  return (
    `${categories.length} unmapped categor${categories.length === 1 ? 'y' : 'ies'} — `
    + `holdings in ${quoted} show as unclassified weight in every allocation `
    + 'rollup until added to ASSET_CLASS_BY_CATEGORY'
  )
}

export function resolveAssetClass(
  security: { security_id: string; category_name: string | null },
): AssetClassKey | null {
  const override = ASSET_CLASS_OVERRIDES[security.security_id.trim().toUpperCase()]
  if (override) return override
  if (isCashTicker(security.security_id)) return 'cash'
  const category = security.category_name?.trim()
  if (!category) return null
  return BY_NORMALIZED_CATEGORY.get(normalizeCategory(category)) ?? null
}
