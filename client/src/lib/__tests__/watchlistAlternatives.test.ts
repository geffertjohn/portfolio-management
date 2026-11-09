import { describe, expect, it } from 'vitest'
import {
  alternativesFor, categoryKey, watchlistAlternativesByCategory,
  type ProspectIdea,
} from '../prospects'

/**
 * The annual review's considerations step asks what each holding should be
 * weighed AGAINST, and these are the rules that decide it. A wrong answer here
 * is not visibly wrong — a missing alternative reads exactly like a category
 * nobody has an idea for, which is a finding the advisor would act on.
 */
const idea = (securityId: string, category: string | null, id = 1): ProspectIdea => ({
  id, security_id: securityId, target_price: null, conviction: null, thesis: null,
  date_added: '2026-11-01T00:00:00Z', removed_at: null,
  portfolios: [],
  securities2: category === null && securityId === 'NOSEC' ? null : {
    id, security_id: securityId, security_name: `${securityId} Fund`,
    broad_asset_class: null, detailed_security_type: 'mutual_fund',
    peer_group_name: null, category_name: category, scorecard_cohort: 'category',
  },
} as unknown as ProspectIdea)

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

describe('watchlistAlternativesByCategory', () => {
  it('groups the live ideas by the sleeve they would compete in', () => {
    const map = watchlistAlternativesByCategory([
      idea('FELC', 'Large Blend', 1), idea('MUSEX', 'Large Blend', 2),
      idea('VUG', 'Large Growth', 3),
    ])
    expect(map.get('large blend')?.map((a) => a.securityId)).toEqual(['FELC', 'MUSEX'])
    expect(map.get('large growth')?.map((a) => a.securityId)).toEqual(['VUG'])
  })

  it('skips an idea with no securities2 row', () => {
    // A watched STOCK never gets one — the workbook sheet is funds-only — and a
    // fund the refresh has not reached yet carries no category to match on.
    expect(watchlistAlternativesByCategory([idea('NOSEC', null)]).size).toBe(0)
  })

  it('skips an idea whose row carries no category', () => {
    expect(watchlistAlternativesByCategory([idea('PENDING', null, 9)]).size).toBe(0)
  })
})

describe('alternativesFor', () => {
  const map = watchlistAlternativesByCategory([
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
