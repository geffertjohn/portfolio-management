import { describe, expect, it } from 'vitest'
import { ASSET_CLASS_BY_CATEGORY, ASSET_CLASS_OVERRIDES, assetClassLabel, normalizeCategory, resolveAssetClass, unmappedCategories, unplacedCategories, unmappedCategoryWarning, STOCK_CATEGORY_OPTIONS,
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
    // The 23 distinct `category_name` values carried by a held or WATCHED,
    // non-proxy security on 9 Nov 2026. This is the assertion that would have
    // failed while "Diversified Emerging Markets" and "Multisector Bond" were
    // missing, and again while "Mid-Cap Value" and "Small Value" were.
    //
    // **WATCHED is part of the scope, and that is the correction.** The list
    // used to read "held or not", but it was built from held securities, and
    // `scripts/audit/asset-class-coverage.ts` walks held ones too — so the
    // value spellings sat unmapped on four watchlist funds with nothing able
    // to report it. An idea becomes a holding; placing it a day before the
    // purchase rather than a day after is the whole margin this assertion has.
    //
    // Benchmark PROXIES are excluded deliberately. They carry sector and
    // maturity categories ("Technology", "Short Government", "Ultrashort
    // Bond") that the firm's fourteen-class taxonomy has no sleeve for, and
    // inventing one so a proxy resolves would put an index stand-in into an
    // allocation rollup it is not part of.
    const inUse = [
      'Diversified Emerging Markets', 'Foreign Large Blend',
      'Global Bond-USD Hedged', 'High Yield Bond', 'Intermediate Core Bond',
      'Intermediate Core-Plus Bond', 'Large Blend', 'Large Cap Core', 'Large Cap Growth',
      'Large Cap Value', 'Large Growth', 'Large Value', 'Mid Cap Core', 'Mid Cap Growth',
      'Mid-Cap Blend', 'Mid-Cap Growth', 'Mid-Cap Value', 'Multisector Bond', 'Small Blend',
      'Small Cap Core', 'Small Cap Growth', 'Small Growth', 'Small Value',
    ]
    expect(inUse).toHaveLength(23)
    expect(unmappedCategories(inUse)).toEqual([])
  })

  it('keeps the abbreviated emerging-market spelling although nothing carries it now', () => {
    // `Diversified Emerging Mkts` was VEMAX's category when gotcha 23 was
    // found; VEMAX now carries the spelled-out form and the abbreviation is
    // present on NO row in securities2. The key stays anyway — the vendor
    // vocabulary moved once and can move back, and the cost of an unused key
    // is nothing against the cost of a sleeve silently emptying. This is the
    // "never delete a key to tidy up a duplicate" rule, asserted rather than
    // only written down.
    expect(unmappedCategories(['Diversified Emerging Mkts'])).toEqual([])
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

describe('unmappedCategoryWarning', () => {
  /**
   * One phrasing, shared by the Import / Export banner, the unattended
   * refresh's log line, and the `import_runs.warnings` row the Actions hub
   * reads. Three ends writing their own sentence is how `consensusColor` and
   * `fmtUsdCompact` each drifted into two behaviours.
   */
  it('says nothing when every category is mapped', () => {
    expect(unmappedCategoryWarning([])).toBeNull()
  })

  // The caller pushes the result without testing a length first, so the null
  // is load-bearing rather than a convenience.
  it('names the categories and what the gap costs', () => {
    const msg = unmappedCategoryWarning(['Mid-Cap Value', 'Small Value'])
    expect(msg).toContain('"Mid-Cap Value", "Small Value"')
    expect(msg).toContain('unclassified weight')
    expect(msg).toContain('ASSET_CLASS_BY_CATEGORY')
  })

  it('agrees with itself about one', () => {
    expect(unmappedCategoryWarning(['Bank Loan'])).toContain('1 unmapped category ')
    expect(unmappedCategoryWarning(['Bank Loan', 'Preferred Stock'])).toContain('2 unmapped categories ')
  })

  // The message must be stable for a given gap: the Actions hub builds its key
  // from it, so a message that varied run to run would raise a new action every
  // morning instead of the same one.
  it('is stable for the same input', () => {
    expect(unmappedCategoryWarning(['Small Value']))
      .toBe(unmappedCategoryWarning(['Small Value']))
  })
})

describe('TIBIX is placed by ticker, not by its category', () => {
  /**
   * Thornburg Income Builder carries "Global Moderately Aggressive
   * Allocation" — a MANDATE, not a sleeve, and the taxonomy has no
   * global-allocation class. The fund is atypical for its category:
   * developed-market exposure 90.6% against a US region total of 24.4%
   * (measured 10 Nov 2026), so roughly two thirds non-US developed.
   */
  it('resolves to non-US developed', () => {
    expect(resolveAssetClass({ security_id: 'TIBIX', category_name: 'Global Moderately Aggressive Allocation' }))
      .toBe('non_us_developed')
  })

  /**
   * THE REASON IT IS AN OVERRIDE AND NOT A MAP ENTRY. A global allocation
   * fund is typically about half US, so mapping the category to a sleeve
   * would file the next one silently and wrongly. Another fund carrying it
   * must still resolve to null, and therefore still be reported.
   */
  it('leaves the category itself unplaced for any other fund', () => {
    expect(resolveAssetClass({ security_id: 'SOMEOTHER', category_name: 'Global Moderately Aggressive Allocation' }))
      .toBeNull()
  })
})

describe('unplacedCategories vs unmappedCategories', () => {
  /**
   * Two questions that look alike and are not. `unmappedCategories` asks
   * whether a VOCABULARY is known and probes with a synthetic ticker, so an
   * override cannot speak for a whole category — right for auditing the map.
   * `unplacedCategories` asks whether any SECURITY was left unclassified —
   * right for a warning, which is about the book rather than the map.
   *
   * Getting this wrong is a standing false alarm: the import would have
   * raised a high-priority action every morning naming TIBIX's category,
   * over a book with nothing unclassified in it.
   */
  it('reports nothing when an override placed the only holder', () => {
    expect(unplacedCategories([
      { security_id: 'TIBIX', category_name: 'Global Moderately Aggressive Allocation' },
    ])).toEqual([])
  })

  it('while the vocabulary probe still calls that category unmapped', () => {
    expect(unmappedCategories(['Global Moderately Aggressive Allocation']))
      .toEqual(['Global Moderately Aggressive Allocation'])
  })

  // The property the synthetic probe existed to protect, kept: an override
  // speaks for its own ticker and for no other.
  it('still reports a DIFFERENT fund carrying the overridden category', () => {
    expect(unplacedCategories([
      { security_id: 'TIBIX', category_name: 'Global Moderately Aggressive Allocation' },
      { security_id: 'NEWFD', category_name: 'Global Moderately Aggressive Allocation' },
    ])).toEqual(['Global Moderately Aggressive Allocation'])
  })

  it('reports a genuinely unknown category', () => {
    expect(unplacedCategories([{ security_id: 'XYZ', category_name: 'Bank Loan' }]))
      .toEqual(['Bank Loan'])
  })

  // A missing category is the FMP-created security, a different problem —
  // warning on it would fire for every newly added ticker.
  it('ignores a security with no category at all', () => {
    expect(unplacedCategories([
      { security_id: 'NEW', category_name: null },
      { security_id: 'BLANK', category_name: '   ' },
    ])).toEqual([])
  })

  it('returns the set, sorted, not one entry per holding', () => {
    expect(unplacedCategories([
      { security_id: 'B', category_name: 'Preferred Stock' },
      { security_id: 'A', category_name: 'Bank Loan' },
      { security_id: 'C', category_name: 'Bank Loan' },
    ])).toEqual(['Bank Loan', 'Preferred Stock'])
  })

  // Cash resolves through its own branch, so it is placed, not a finding.
  it('does not report cash', () => {
    expect(unplacedCategories([{ security_id: '$Cash', category_name: null }])).toEqual([])
  })
})

describe('normalizeCategory is the ONE way a vendor category becomes a key', () => {
  /**
   * There were two, and they disagreed. `prospects.categoryKey` collapsed
   * internal whitespace; the resolver's own normalizer only trimmed. So a
   * vendor string arriving as `Large  Blend` would have matched a watchlist
   * alternative and resolved to `null` in every allocation rollup — two
   * answers for one string, from the function whose job is to be the single
   * one. Latent (no live row carries irregular whitespace), and CLAUDE.md
   * already claimed whitespace was handled.
   */
  it('collapses internal whitespace, not just the ends', () => {
    expect(normalizeCategory('  Large   Blend  ')).toBe('large blend')
    expect(normalizeCategory('Large\tBlend')).toBe('large blend')
    expect(normalizeCategory('Large\nBlend')).toBe('large blend')
  })

  // The fix is only worth anything if the RESOLVER sees it.
  it('lets resolveAssetClass place a category with a double space', () => {
    expect(resolveAssetClass({ security_id: 'X', category_name: 'Large  Blend' }))
      .toBe('large_cap_blend')
    expect(resolveAssetClass({ security_id: 'X', category_name: ' diversified  emerging   markets ' }))
      .toBe('emerging_market')
  })

  // ...and that the import warning agrees, rather than reporting a category
  // the rollup can place.
  it('keeps the unmapped probe in step', () => {
    expect(unmappedCategories(['Large  Blend'])).toEqual([])
    expect(unplacedCategories([{ security_id: 'X', category_name: 'Large  Blend' }])).toEqual([])
  })

  /**
   * What it must NOT do. Hyphen and spelling variants exist where two vendor
   * vocabularies meet — a fund's "Large Growth" against a benchmark's "US
   * Large Cap Growth" — and folding them here would silently merge sleeves
   * Morningstar considers distinct, which is the quieter failure.
   */
  it('does not fold punctuation or spelling', () => {
    expect(normalizeCategory('Mid-Cap Value')).toBe('mid-cap value')
    expect(normalizeCategory('Mid Cap Value')).toBe('mid cap value')
    expect(normalizeCategory('Mid-Cap Value')).not.toBe(normalizeCategory('Mid Cap Value'))
  })

  it('leaves an empty string empty, so a caller can test it', () => {
    expect(normalizeCategory('')).toBe('')
    expect(normalizeCategory('   ')).toBe('')
  })
})
