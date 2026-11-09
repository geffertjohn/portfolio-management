import { describe, expect, it } from 'vitest'
import {
  CATEGORY_METRICS, PEER_GROUP_METRICS, SCORE_GREEN_MIN, SCORE_YELLOW_MIN,
  buildFundScorecard, categoryScorecardScore, fmtScorecardValue,
  peerGroupScorecardScore, scoreBand,
} from '../fundScorecard'
import type { SecurityDetail } from '../securities'

/**
 * This math decides whether a fund is kept, and it is rendered twice — the
 * on-page table and the review-evidence PDF — from this one module, so the two
 * cannot disagree. What a test adds is the arithmetic itself: a mistyped weight
 * changes every score in the book and nothing on screen would look wrong.
 */

const sec = (over: Record<string, unknown>) => over as unknown as SecurityDetail

/** Top decile on every rank, best tier on every value — should score exactly 100. */
const perfect = sec({
  one_year_total_return_rank_nav: 1, one_year_total_return_rank_category_size_nav: 600,
  three_year_total_return_rank_nav: 1, three_year_total_return_rank_category_size_nav: 500,
  five_year_total_return_rank_nav: 1, five_year_total_return_rank_category_size_nav: 400,
  sharpe_rank: 1, information_ratio_rank: 1, alpha_rank: 1, expense_ratio_rank: 1,
  upside_downside_5y_vs_category: 1.5,
  max_manager_tenure: 12.5,
  rsquared_3y_vs_category: 0.98,
})

describe('the weights are an invariant', () => {
  it('sums to exactly 1.0 in both cohorts', () => {
    for (const [name, metrics] of [['category', CATEGORY_METRICS], ['peer', PEER_GROUP_METRICS]] as const) {
      const sum = metrics.reduce((t, m) => t + m.weight, 0)
      expect(sum, name).toBeCloseTo(1, 10)
    }
  })

  it('weighs the two cohorts identically — only the columns differ', () => {
    expect(PEER_GROUP_METRICS.map((m) => [m.label, m.weight]))
      .toEqual(CATEGORY_METRICS.map((m) => [m.label, m.weight]))
  })

  it('scores a fund that is best-in-class on everything at exactly 100', () => {
    // Ties the weights to the multipliers: either drifting breaks this.
    expect(categoryScorecardScore(perfect)).toBeCloseTo(100, 6)
  })
})

describe('rank-based tiers', () => {
  const at = (pct: number) => buildFundScorecard(
    sec({ one_year_total_return_rank_nav: pct * 1000, one_year_total_return_rank_category_size_nav: 1000 }),
    'category',
  ).rows[0]

  it('splits at the documented percentiles, lower rank being better', () => {
    expect(at(0.09).tier).toBe(1)
    expect(at(0.10).tier).toBe(2)
    expect(at(0.24).tier).toBe(2)
    expect(at(0.25).tier).toBe(3)
    expect(at(0.49).tier).toBe(3)
    expect(at(0.50).tier).toBe(4)
  })

  it('pays weight × multiplier, quartering down the tiers', () => {
    // 1Y return carries 5% of the card.
    expect(at(0.09).score).toBeCloseTo(5, 6)
    expect(at(0.10).score).toBeCloseTo(3.75, 6)
    expect(at(0.25).score).toBeCloseTo(2.5, 6)
    expect(at(0.50).score).toBeCloseTo(1.25, 6)
  })

  it('scores nothing — not zero — when the cohort size is missing or zero', () => {
    // A missing denominator is unknown, not worst-in-class.
    for (const size of [null, 0, undefined]) {
      const row = buildFundScorecard(
        sec({ one_year_total_return_rank_nav: 1, one_year_total_return_rank_category_size_nav: size }),
        'category',
      ).rows[0]
      expect(row.tier, String(size)).toBeNull()
      expect(row.score).toBeNull()
    }
  })
})

describe('value-based tiers', () => {
  const row = (label: string, s: SecurityDetail) =>
    buildFundScorecard(s, 'category').rows.find((r) => r.label === label)!

  it('pays a new manager nothing, whatever tier the tenure bucket says', () => {
    const fresh = row('Manager Tenure', sec({ max_manager_tenure: 0.5 }))
    expect(fresh.score).toBe(0)
    expect(row('Manager Tenure', sec({ max_manager_tenure: 12 })).score).toBeCloseTo(5, 6)
  })

  it('never pays R-squared nothing — it has no zero case', () => {
    const worst = row('R-Square 3Y', sec({ rsquared_3y_vs_category: 0.1 }))
    expect(worst.tier).toBe(4)
    expect(worst.score).toBeCloseTo(1.25, 6)
  })

  /**
   * Upside/Downside rounds to 2dp BEFORE comparing, so a stored 0.9997 — which
   * the table prints as "1.00" — lands in tier 2 rather than reading as tier 3
   * against the figure shown beside it.
   */
  it('tiers upside/downside on the figure it displays, not the stored one', () => {
    const r = row('Upside/Downside 5Y', sec({ upside_downside_5y_vs_category: 0.9997 }))
    expect(fmtScorecardValue(r.displayVal, r.valueType)).toBe('1.00')
    expect(r.tier).toBe(2)
    expect(r.score).toBe(8)
  })

  it('pays upside/downside in fixed points, not weight × multiplier', () => {
    const score = (v: number) => row('Upside/Downside 5Y', sec({ upside_downside_5y_vs_category: v })).score
    expect(score(1.5)).toBe(10)
    expect(score(1.0)).toBe(8)
    expect(score(0.9)).toBe(6)
    expect(score(0.5)).toBe(4)
    expect(score(0)).toBe(0)
  })
})

describe('a fund with nothing loaded', () => {
  it('has no score at all, rather than a zero that reads as a verdict', () => {
    expect(categoryScorecardScore(sec({}))).toBeNull()
    expect(peerGroupScorecardScore(sec({}))).toBeNull()
    expect(buildFundScorecard(sec({}), 'category').hasData).toBe(false)
  })

  it('still returns every row, so the table shows what is missing', () => {
    expect(buildFundScorecard(sec({}), 'category').rows).toHaveLength(CATEGORY_METRICS.length)
  })
})

describe('the two cohorts read different columns', () => {
  it('does not let category data score the peer card', () => {
    expect(categoryScorecardScore(perfect)).toBeCloseTo(100, 6)
    // Manager Tenure is the ONE column the two cohorts share — a fund is as
    // long-managed against its peers as against its category — so that 5 is
    // the whole of what a category-only row can contribute to the peer card.
    expect(peerGroupScorecardScore(perfect)).toBeCloseTo(5, 6)
  })

  it('shares exactly one column between the cohorts', () => {
    const cat = new Set(CATEGORY_METRICS.flatMap((m) => [m.rankKey, m.sizeKey, m.valueKey].filter(Boolean)))
    const shared = PEER_GROUP_METRICS
      .flatMap((m) => [m.rankKey, m.sizeKey, m.valueKey].filter(Boolean))
      .filter((k) => cat.has(k))
    expect(shared).toEqual(['max_manager_tenure'])
  })
})

describe('fmtScorecardValue', () => {
  it('formats each kind of cell the way its column is read', () => {
    expect(fmtScorecardValue(66.4)).toBe('66')          // a rank is an integer
    expect(fmtScorecardValue(12.5, 'tenure')).toBe('12.5')
    expect(fmtScorecardValue(0.951, 'rsquared')).toBe('0.95')
    expect(fmtScorecardValue(1.179, 'updown')).toBe('1.18')
    expect(fmtScorecardValue(null)).toBe('—')
  })
})

/**
 * The green/yellow/red line was written out in FOUR places across
 * `FundMonitoringPanel` and `FundScorecard` — two dots, a headline figure and
 * the table's total row — so the firm's definition of an acceptable fund could
 * be changed in one file and missed in three, showing a fund green in a header
 * and amber in the table it heads. That is the `consensusColor` failure, and
 * these pin the one definition that replaced them.
 */
describe('scoreBand', () => {
  it('bands at both thresholds, inclusive at each floor', () => {
    expect(scoreBand(SCORE_GREEN_MIN)).toBe('green')
    expect(scoreBand(SCORE_GREEN_MIN - 0.1)).toBe('yellow')
    expect(scoreBand(SCORE_YELLOW_MIN)).toBe('yellow')
    expect(scoreBand(SCORE_YELLOW_MIN - 0.1)).toBe('red')
  })

  it('returns null for an unscored fund rather than red', () => {
    // "Not scored" is not "scored badly": a fund whose cohort columns the
    // workbook has not filled has no reading, and painting it red would report
    // a data gap as a judgement about the fund. Both dots gate on this.
    expect(scoreBand(null)).toBeNull()
    expect(scoreBand(undefined)).toBeNull()
    expect(scoreBand(Number.NaN)).toBeNull()
    expect(categoryScorecardScore(sec({}))).toBeNull()
    expect(scoreBand(categoryScorecardScore(sec({})))).toBeNull()
  })

  it('bands the perfect fixture green, so the thresholds face the real scale', () => {
    // Guards against the band and the scoring drifting onto different scales —
    // a /100 total read against a 0–1 threshold would make everything red.
    expect(scoreBand(categoryScorecardScore(perfect))).toBe('green')
  })
})
