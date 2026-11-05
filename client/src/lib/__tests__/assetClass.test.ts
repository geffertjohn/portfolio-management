import { describe, expect, it } from 'vitest'
import { ASSET_CLASS_BY_CATEGORY, ASSET_CLASS_OVERRIDES, assetClassLabel, resolveAssetClass, unmappedCategories, STOCK_CATEGORY_OPTIONS,
} from '../assetClass'

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

describe('spotting a vocabulary the map has never seen', () => {
  /**
   * Gotcha 23, caught at the import instead of on a portfolio page. A
   * `category_name` the map lacks resolves to null, the weight drops out of
   * the rollup, and the only trace is an "unclassified weight" line under one
   * table — which reads as a data quirk, not a mapping gap. Three of the four
   * emerging-market holdings sat that way across six portfolios because
   * Morningstar publishes two spellings and only one was mapped.
   */

  it('names a category the map does not carry', () => {
    expect(unmappedCategories(['Bank Loan', 'Large Blend'])).toEqual(['Bank Loan'])
  })

  it('says nothing when every category is known', () => {
    expect(unmappedCategories(['Large Blend', 'High Yield Bond', 'Multisector Bond'])).toEqual([])
  })

  it('returns the SET, not one entry per row', () => {
    // A workbook repeats a category once per fund; the caller wants the
    // vocabulary, not the row count.
    expect(unmappedCategories(['Bank Loan', 'Bank Loan', 'Bank Loan'])).toEqual(['Bank Loan'])
  })

  it('sorts, so the warning reads the same twice', () => {
    expect(unmappedCategories(['Preferred Stock', 'Bank Loan'])).toEqual(['Bank Loan', 'Preferred Stock'])
  })

  it('ignores a MISSING category rather than calling it unmapped', () => {
    // An absent category is the FMP-created security — a known, different
    // problem. Reporting it here would cry wolf on every new ticker.
    expect(unmappedCategories([null, undefined, '', '   '])).toEqual([])
  })

  it('matches the map case- and whitespace-insensitively, as the resolver does', () => {
    expect(unmappedCategories(['  large blend  '])).toEqual([])
  })

  it('is not fooled by a per-ticker OVERRIDE', () => {
    // The probe uses a synthetic ticker on purpose: BRK.B resolves only
    // because of its override, so asking with that ticker would report its
    // category as mapped and let the next security carrying it fall through.
    expect(unmappedCategories(['Some Category Only BRK.B Has'])).toEqual(['Some Category Only BRK.B Has'])
  })

  it('covers every category the live book actually uses', () => {
    // The 23 distinct `category_name` values in securities2 on 5 Nov 2026,
    // held or not. This is the assertion that would have failed while
    // "Diversified Emerging Markets" and "Multisector Bond" were missing.
    const inUse = [
      'Diversified Emerging Markets', 'Diversified Emerging Mkts', 'Foreign Large Blend',
      'Global Bond-USD Hedged', 'High Yield Bond', 'Intermediate Core Bond',
      'Intermediate Core-Plus Bond', 'Large Blend', 'Large Cap Core', 'Large Cap Growth',
      'Large Cap Value', 'Large Growth', 'Large Value', 'Mid Cap Core', 'Mid Cap Growth',
      'Mid-Cap Blend', 'Mid-Cap Growth', 'Multisector Bond', 'Small Blend',
      'Small Cap Core', 'Small Cap Growth', 'Small Growth',
    ]
    expect(unmappedCategories(inUse)).toEqual([])
  })
})

describe('the stock category picker can only write placeable values', () => {
  /**
   * The `*_OPTIONS ⊆ CHECK` discipline from `schemaContract.test.ts`, applied
   * to a vocabulary rather than a constraint. The picker exists because a
   * stock's category has had no writer since Sep 2026; an option it can write
   * that `resolveAssetClass` then refuses would recreate the exact bug it was
   * added to close, one selection at a time.
   */

  it('places EVERY option the picker offers', () => {
    expect(unmappedCategories([...STOCK_CATEGORY_OPTIONS])).toEqual([])
  })

  it('offers the STOCK spellings, never the fund ones', () => {
    // "Large Blend" and "Large Cap Core" are one sleeve under two vocabularies.
    // Offering the fund spelling on a stock is how a second spelling enters the
    // book, which is gotcha 23's whole mechanism.
    for (const option of STOCK_CATEGORY_OPTIONS) {
      expect(option, `${option} should use the stock grid`).toMatch(/Cap (Core|Growth|Value)$/)
    }
  })

  it('covers the style grid the held book actually uses', () => {
    // Every category the 55 held stocks carry on 5 Nov 2026. An option missing
    // here means an existing stock cannot be re-selected to its own category.
    const inUse = [
      'Large Cap Core', 'Large Cap Growth', 'Large Cap Value',
      'Mid Cap Core', 'Mid Cap Growth', 'Small Cap Core', 'Small Cap Growth',
    ]
    for (const c of inUse) expect([...STOCK_CATEGORY_OPTIONS], c).toContain(c)
  })

  it('offers no duplicates', () => {
    expect(new Set(STOCK_CATEGORY_OPTIONS).size).toBe(STOCK_CATEGORY_OPTIONS.length)
  })
})
