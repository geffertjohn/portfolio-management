import { describe, expect, it } from 'vitest'
import { ASSET_CLASS_BY_CATEGORY, ASSET_CLASS_OVERRIDES, assetClassLabel, resolveAssetClass } from '../assetClass'

const sec = (security_id: string, category_name: string | null) => ({ security_id, category_name })

describe('resolveAssetClass', () => {
  it('normalises case and surrounding whitespace, nothing more', () => {
    expect(resolveAssetClass(sec('X', '  large blend  '))).toBe(
      resolveAssetClass(sec('X', 'Large Blend')),
    )
  })

  it('returns null for an unmapped category — null is a real answer', () => {
    // An unplaceable holding must surface as unclassified weight, never be
    // dropped from the rollup, or the tiers stop summing to 100% silently.
    expect(resolveAssetClass(sec('X', 'Some Vendor Category We Do Not Map'))).toBeNull()
  })

  it('returns null when the vendor supplied no category at all', () => {
    // The documented gap: a security created by ticker is seeded from FMP,
    // which publishes no Morningstar category.
    expect(resolveAssetClass(sec('NEWCO', null))).toBeNull()
    expect(resolveAssetClass(sec('NEWCO', '   '))).toBeNull()
  })

  it('places cash by ticker, with no category needed', () => {
    expect(resolveAssetClass(sec('$Cash', null))).toBe('cash')
  })

  it('lets a per-ticker override beat the category', () => {
    const [ticker, expected] = Object.entries(ASSET_CLASS_OVERRIDES)[0]
    expect(resolveAssetClass(sec(ticker, 'Large Blend'))).toBe(expected)
    expect(resolveAssetClass(sec(ticker.toLowerCase(), null))).toBe(expected)
  })
})

describe('the vendor vocabulary is not consistent', () => {
  /**
   * Gotcha 23. VEMAX carries Morningstar's abbreviated spelling; EICOX, EMMF
   * and EYLD carry the spelled-out one. Only the abbreviation was mapped, so
   * three of four emerging-market holdings resolved to null across six books.
   * Deleting either key to "tidy up the duplicate" re-opens it.
   */
  it('maps BOTH live spellings of Diversified Emerging Markets', () => {
    expect(resolveAssetClass(sec('VEMAX', 'Diversified Emerging Mkts'))).toBe('emerging_market')
    expect(resolveAssetClass(sec('EICOX', 'Diversified Emerging Markets'))).toBe('emerging_market')
  })
})

describe('the override list is an escape hatch, not a second map', () => {
  it('stays short — a growing list means the category map is wrong', () => {
    expect(Object.keys(ASSET_CLASS_OVERRIDES).length).toBeLessThanOrEqual(5)
  })
})

describe('assetClassLabel', () => {
  it('labels every key the category map can produce', () => {
    for (const key of new Set(Object.values(ASSET_CLASS_BY_CATEGORY))) {
      expect(assetClassLabel(key), key).toBeTruthy()
    }
  })

  it('has no label for an absent key', () => {
    expect(assetClassLabel(null)).toBeNull()
    expect(assetClassLabel(undefined)).toBeNull()
  })
})
