import { describe, expect, it } from 'vitest'
import {
  alternativeKey, alternativesFor, categoryKey, watchlistAlternativesByKey,
  type ProspectIdea,
} from '../prospects'
import { normalizeCategory } from '../assetClass'
import type { SecurityDetail } from '../securities'

/**
 * The annual review's considerations step asks what each holding should be
 * weighed AGAINST, and these are the rules that decide it. A wrong answer here
 * is not visibly wrong — a missing alternative reads exactly like a category
 * nobody has an idea for, which is a finding the advisor would act on.
 */
/**
 * The cast is NARROWED to the `securities2` sub-object, which genuinely cannot
 * be written out (93 columns). The whole literal used to be
 * `as unknown as ProspectIdea`, and that silence cost twice: it hid `heldIn`
 * when the field was added, and it hid `target_price` / `conviction` /
 * `thesis` when they were dropped — the fixture kept naming three columns the
 * table no longer has. A cast that covers more than it must is a type check
 * turned off.
 */
const idea = (securityId: string, category: string | null, id = 1): ProspectIdea => ({
  id, security_id: securityId,
  date_added: '2026-11-01T00:00:00Z', removed_at: null,
  portfolios: [],
  heldIn: [],
  securities2: category === null && securityId === 'NOSEC' ? null : ({
    id, security_id: securityId, security_name: `${securityId} Fund`,
    broad_asset_class: null, detailed_security_type: 'mutual_fund',
    peer_group_name: null, category_name: category, scorecard_cohort: 'category',
  } as unknown as SecurityDetail),
})

describe('categoryKey', () => {
  it('normalises case and whitespace, and nothing else', () => {
    expect(categoryKey(' Large  Blend ')).toBe('large blend')
    expect(categoryKey('LARGE BLEND')).toBe(categoryKey('Large Blend'))
    // Not hyphen or spelling variants: both sides of this comparison are the
    // same securities2 column, and inventing variants would match sleeves the
    // vendor considers distinct.
    expect(categoryKey('Mid-Cap Blend')).not.toBe(categoryKey('Mid Cap Blend'))
  })

  it('treats an empty or missing category as no key at all', () => {
    expect(categoryKey(null)).toBeNull()
    expect(categoryKey('   ')).toBeNull()
  })
})

describe('watchlistAlternativesByKey', () => {
  it('groups the live ideas by the sleeve they would compete in', () => {
    const map = watchlistAlternativesByKey([
      idea('FELC', 'Large Blend', 1), idea('MUSEX', 'Large Blend', 2),
      idea('VUG', 'Large Growth', 3),
    ])
    expect(map.get('large blend')?.map((a) => a.securityId)).toEqual(['FELC', 'MUSEX'])
    expect(map.get('large growth')?.map((a) => a.securityId)).toEqual(['VUG'])
  })

  it('skips an idea with no securities2 row', () => {
    // A watched STOCK never gets one — the workbook sheet is funds-only — and a
    // fund the refresh has not reached yet carries no category to match on.
    expect(watchlistAlternativesByKey([idea('NOSEC', null)]).size).toBe(0)
  })

  it('skips an idea whose row carries no category', () => {
    expect(watchlistAlternativesByKey([idea('PENDING', null, 9)]).size).toBe(0)
  })
})

describe('alternativesFor', () => {
  const map = watchlistAlternativesByKey([
    idea('FELC', 'Large Blend', 1), idea('ICAFX', 'Large Blend', 2),
    idea('VBTLX', 'Intermediate Core Bond', 3),
  ])

  it('returns the ideas sharing the holding\'s category', () => {
    expect(alternativesFor(map, 'VOO', 'Large Blend').map((a) => a.securityId))
      .toEqual(['FELC', 'ICAFX'])
  })

  it('never offers a holding as its own replacement', () => {
    // VBTLX is held in one book and watched for another, so without the
    // self-exclusion its own row would propose swapping it for itself.
    expect(alternativesFor(map, 'VBTLX', 'Intermediate Core Bond')).toEqual([])
  })

  it('returns nothing when the holding has no category', () => {
    expect(alternativesFor(map, 'VOO', null)).toEqual([])
    expect(alternativesFor(map, 'VOO', '  ')).toEqual([])
  })

  it('matches across case and spacing differences', () => {
    expect(alternativesFor(map, 'VOO', 'large   blend').map((a) => a.securityId))
      .toEqual(['FELC', 'ICAFX'])
  })
})

describe('categoryKey agrees with the asset-class resolver', () => {
  /**
   * These two normalise the SAME column — `securities2.category_name` — and
   * they used to disagree: this one collapsed internal whitespace and
   * `resolveAssetClass`'s did not. A vendor string arriving as `Large  Blend`
   * would have matched an alternative here and resolved to `null` in every
   * allocation rollup, which is gotcha 23 with no warning attached.
   *
   * Asserted directly rather than guarded by a source scan: `.trim()
   * .toLowerCase()` appears a dozen times in this tree for unrelated reasons,
   * so a scan would fire on legitimate code and get deleted.
   */
  const SAMPLES = [
    'Large Blend',
    '  Large   Blend  ',
    'Large\tBlend',
    'Mid-Cap Value',
    'Diversified Emerging Markets',
    'MULTISECTOR BOND',
  ]

  it('produces the same key for every shape', () => {
    for (const raw of SAMPLES) {
      expect(categoryKey(raw), raw).toBe(normalizeCategory(raw))
    }
  })

  // The one place they legitimately differ: `categoryKey` maps empty to null
  // so a caller can skip it, which is a contract, not a normalisation rule.
  it('differs only in reporting an empty category as null', () => {
    expect(categoryKey('   ')).toBeNull()
    expect(normalizeCategory('   ')).toBe('')
  })
})

describe('mid- and small-cap pool across styles', () => {
  /**
   * THE RULE, and where it comes from: `ASSET_CLASS_ROWS` gives large cap
   * three rows — blend, growth, value — and mid and small ONE row each. A fund
   * is judged against the sleeve it would fill, so where the firm's own
   * taxonomy says style is not a distinguishing feature, the alternatives must
   * not pretend it is.
   *
   * Live case (10 Nov 2026): FTZIX and AVERX are Mid-Cap Blend and were
   * offered only RSIYX, the one watchlist idea sharing that exact label, while
   * QVAL, NAMAX and FSMVX — all Mid-Cap Value — sat on the list competing for
   * the same sleeve. OBSIX (Small Growth) was offered nothing at all.
   */
  const mids = [
    idea('RSIYX', 'Mid-Cap Blend', 1),
    idea('QVAL', 'Mid-Cap Value', 2),
    idea('NAMAX', 'Mid-Cap Value', 3),
    idea('FSMVX', 'Mid-Cap Value', 4),
  ]

  it('offers every mid-cap idea to a mid-cap holding, whatever the style', () => {
    const byKey = watchlistAlternativesByKey(mids)
    const alts = alternativesFor(byKey, 'FTZIX', 'Mid-Cap Blend').map((a) => a.securityId)
    expect(alts.sort()).toEqual(['FSMVX', 'NAMAX', 'QVAL', 'RSIYX'])
  })

  it('pools small cap the same way, including a style with no idea of its own', () => {
    const byKey = watchlistAlternativesByKey([
      idea('FESM', 'Small Blend', 1),
      idea('TQSMX', 'Small Blend', 2),
      idea('VSMIX', 'Small Value', 3),
    ])
    // OBSIX is Small Growth — no watchlist idea shares that label, and before
    // pooling it was offered nothing.
    expect(alternativesFor(byKey, 'OBSIX', 'Small Growth').map((a) => a.securityId).sort())
      .toEqual(['FESM', 'TQSMX', 'VSMIX'])
  })

  // Self-exclusion still applies across the pool, not just within a style.
  it('never offers a holding itself, even from another style in the pool', () => {
    const byKey = watchlistAlternativesByKey(mids)
    expect(alternativesFor(byKey, 'QVAL', 'Mid-Cap Blend').map((a) => a.securityId))
      .not.toContain('QVAL')
  })
})

describe('everything else still matches on the exact category', () => {
  /**
   * The pool is a LIST, not "every sleeve the taxonomy does not split". Non-US
   * developed is also a single row, and pooling it would offer TIBIX — a
   * global allocation fund placed there by a per-ticker override — against two
   * foreign large-blend index funds. One sleeve holding things that are not
   * substitutes is a judgement about the book, not something to derive.
   */
  it('keeps the three large-cap styles apart', () => {
    const byKey = watchlistAlternativesByKey([
      idea('FELC', 'Large Blend', 1),
      idea('VUG', 'Large Growth', 2),
      idea('MGV', 'Large Value', 3),
    ])
    expect(alternativesFor(byKey, 'VOO', 'Large Blend').map((a) => a.securityId)).toEqual(['FELC'])
    expect(alternativesFor(byKey, 'PWB', 'Large Growth').map((a) => a.securityId)).toEqual(['VUG'])
    expect(alternativesFor(byKey, 'IDHIX', 'Large Value').map((a) => a.securityId)).toEqual(['MGV'])
  })

  it('does not pool non-US developed', () => {
    const byKey = watchlistAlternativesByKey([
      idea('DFALX', 'Foreign Large Blend', 1),
      idea('TIBIX', 'Global Moderately Aggressive Allocation', 2),
    ])
    expect(alternativesFor(byKey, 'IDEQ', 'Foreign Large Blend').map((a) => a.securityId))
      .toEqual(['DFALX'])
  })

  it('does not pool the bond sleeves', () => {
    const byKey = watchlistAlternativesByKey([
      idea('VBTLX', 'Intermediate Core Bond', 1),
      idea('EIHIX', 'High Yield Bond', 2),
    ])
    expect(alternativesFor(byKey, 'BIMIX', 'Intermediate Core Bond').map((a) => a.securityId))
      .toEqual(['VBTLX'])
  })
})

describe('alternativeKey', () => {
  it('returns the sleeve for a pooled one and the category for the rest', () => {
    expect(alternativeKey({ security_id: 'QVAL', category_name: 'Mid-Cap Value' }))
      .toBe(alternativeKey({ security_id: 'RSIYX', category_name: 'Mid-Cap Blend' }))
    expect(alternativeKey({ security_id: 'FELC', category_name: 'Large Blend' }))
      .toBe(categoryKey('Large Blend'))
  })

  // The prefix exists so a sleeve key cannot collide with a vendor category
  // that happens to spell the same.
  it('namespaces the sleeve key', () => {
    expect(alternativeKey({ security_id: 'X', category_name: 'Small Value' })).toBe('sleeve:us_small_cap')
  })

  it('is null when there is no category to match on', () => {
    expect(alternativeKey({ security_id: 'X', category_name: null })).toBeNull()
  })
})
