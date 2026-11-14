import { describe, expect, it } from 'vitest'
import {
  TRACKING_ERROR_TIERS, tierBandLines, scoreFormulaLines,
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

/**
 * Defaults to an EQUITY broad asset class, because tracking error is tiered
 * per broad class and a fixture with none gets no tier at all (which is the
 * right behaviour, and has its own test below).
 */
const sec = (over: Record<string, unknown>) =>
  ({ broad_asset_class: 'US Equity', ...over }) as unknown as SecurityDetail

/** Top decile on every rank, best tier on every value — should score exactly 100. */
const perfect = sec({
  one_year_total_return_rank_nav: 1, one_year_total_return_rank_category_size_nav: 600,
  three_year_total_return_rank_nav: 1, three_year_total_return_rank_category_size_nav: 500,
  five_year_total_return_rank_nav: 1, five_year_total_return_rank_category_size_nav: 400,
  sharpe_rank: 1, information_ratio_rank: 1, alpha_rank: 1, expense_ratio_rank: 1,
  upside_downside_5y_vs_category: 1.5,
  max_manager_tenure: 12.5,
  // Top-tier deviation for an EQUITY fund; `sec()` must therefore carry an
  // equity broad_asset_class or the bands cannot be chosen.
  tracking_error_3y_vs_category: 0.09,
})

/** One scorecard row by label, from the category cohort. */
const row = (label: string, s: SecurityDetail) =>
  buildFundScorecard(s, 'category').rows.find((r) => r.label === label)!

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
  it('pays a new manager nothing, whatever tier the tenure bucket says', () => {
    const fresh = row('Manager Tenure', sec({ max_manager_tenure: 0.5 }))
    expect(fresh.score).toBe(0)
    expect(row('Manager Tenure', sec({ max_manager_tenure: 12 })).score).toBeCloseTo(5, 6)
  })

  it('never pays tracking error nothing — it has no zero case', () => {
    // A fund that hugs its index is still a holding, not a zero. Same property
    // R-Squared had before tracking error replaced it (Nov 2026).
    const worst = row('Tracking Error 3Y', sec({ tracking_error_3y_vs_category: 0.0001 }))
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

describe('tracking error is tiered per broad asset class', () => {
  /**
   * Measured 13 Nov 2026 over the 74 non-proxy funds carrying a 3Y figure:
   * fixed income runs p25 65bp / p50 106bp / p75 192bp, equity 248 / 544 / 772.
   * A bond fund at the TOP of its class (395bp) sits below the equity MEDIAN,
   * so one shared threshold set would score asset class, not the manager.
   */

  it('scores the same deviation differently for a bond fund and an equity fund', () => {
    const te = 0.02 // 200bp
    const bond = row('Tracking Error 3Y',
      sec({ broad_asset_class: 'Taxable Bond', tracking_error_3y_vs_category: te }))
    const equity = row('Tracking Error 3Y',
      sec({ broad_asset_class: 'US Equity', tracking_error_3y_vs_category: te }))
    expect(bond.tier).toBe(1)    // top quartile of fixed income
    expect(equity.tier).toBe(4)  // bottom quartile of equity
  })

  it('reads HIGHER as better — the active manager beats the closet indexer', () => {
    // The whole point of replacing R-Squared: PYTRX deviates 32bp for a 39bp
    // fee, FAGIX 395bp. Under R-Squared those were tier 1 and tier 4.
    const hugger = row('Tracking Error 3Y',
      sec({ broad_asset_class: 'Taxable Bond', tracking_error_3y_vs_category: 0.0032 }))
    const active = row('Tracking Error 3Y',
      sec({ broad_asset_class: 'Taxable Bond', tracking_error_3y_vs_category: 0.0395 }))
    expect(hugger.tier).toBe(4)
    expect(active.tier).toBe(1)
    expect(active.score!).toBeGreaterThan(hugger.score!)
    expect(active.higherIsBetter).toBe(true)
  })

  it('gives NO TIER when the broad asset class cannot be placed', () => {
    // Grading a bond fund on equity bands would fail it for being a bond fund,
    // so an unplaceable class scores nothing rather than guessing.
    const r = row('Tracking Error 3Y',
      sec({ broad_asset_class: null, broad_category_group: null, tracking_error_3y_vs_category: 0.02 }))
    expect(r.tier).toBeNull()
    expect(r.score).toBeNull()
    expect(r.displayVal).toBe(0.02)  // the value is still shown
  })

  it('carries the bands it was graded against, so nothing restates them', () => {
    const r = row('Tracking Error 3Y',
      sec({ broad_asset_class: 'Taxable Bond', tracking_error_3y_vs_category: 0.011 }))
    expect([r.tier3Threshold, r.tier2Threshold, r.tier1Threshold])
      .toEqual(TRACKING_ERROR_TIERS['fixed income'])
    expect(r.tier).toBe(2)
  })

  it('bands are strictly increasing in both classes', () => {
    for (const [cls, [t3, t2, t1]] of Object.entries(TRACKING_ERROR_TIERS)) {
      expect(t3, cls).toBeLessThan(t2)
      expect(t2, cls).toBeLessThan(t1)
    }
  })

  it('the peer cohort uses the PEER column on the same 3Y basis', () => {
    // Scoring the peer cohort off the 5Y column would mix a 5-year metric in
    // among 3-year siblings, so the cohorts could differ for a reason that has
    // nothing to do with the cohort.
    const peer = PEER_GROUP_METRICS.find((m) => m.label === 'Tracking Error 3Y')!
    const cat = CATEGORY_METRICS.find((m) => m.label === 'Tracking Error 3Y')!
    expect(peer.valueKey).toBe('tracking_error_3y_vs_pg')
    expect(cat.valueKey).toBe('tracking_error_3y_vs_category')
  })
})

describe('the tooltips explain the row without restating the rule', () => {
  /**
   * Both are built from the thresholds the ROW carries. That is why those
   * fields exist, and a test here is what stops someone "simplifying" the
   * tooltip by hardcoding the bands — at which point the explanation and the
   * tier beside it can disagree, which is the whole failure
   * `lib/scorecardColor.ts` was extracted to prevent.
   */

  it('describes a rank band as a share of the cohort', () => {
    const r = row('Sharpe Ratio 3Y', sec({ sharpe_rank: 7, three_year_total_return_rank_category_size_nav: 353 }))
    const lines = tierBandLines(r)
    expect(lines[0]).toContain('rank 35 or better')
    expect(lines[0]).toContain('top 10%')
    expect(lines[3]).toBe('Tier 4   anything below')
  })

  it('uses the row thresholds, so a changed band changes the tooltip', () => {
    const bond = tierBandLines(row('Tracking Error 3Y',
      sec({ broad_asset_class: 'Taxable Bond', tracking_error_3y_vs_category: 0.02 })))
    const equity = tierBandLines(row('Tracking Error 3Y',
      sec({ broad_asset_class: 'US Equity', tracking_error_3y_vs_category: 0.02 })))
    expect(bond[0]).toContain('1.90%')
    expect(equity[0]).toContain('7.75%')
    expect(bond).not.toEqual(equity)
  })

  it('says ABOVE for Upside/Downside tier 1 and AT OR ABOVE elsewhere', () => {
    // It rounds to 2dp then compares with `>`, so exactly 1.10 is reachable
    // and lands in tier 2. "1.10 and above" would be a lie about a real case.
    const ud = tierBandLines(row('Upside/Downside 5Y', sec({ upside_downside_5y_vs_category: 1.2 })))
    expect(ud[0]).toBe('Tier 1   above 1.10')
    expect(ud[1]).toBe('Tier 2   at or above 1.00')

    const te = tierBandLines(row('Tracking Error 3Y',
      sec({ broad_asset_class: 'US Equity', tracking_error_3y_vs_category: 0.09 })))
    expect(te[0]).toContain('at or above')
  })

  it('has nothing to say when the row has no bands', () => {
    const unplaceable = row('Tracking Error 3Y',
      sec({ broad_asset_class: null, broad_category_group: null, tracking_error_3y_vs_category: 0.02 }))
    expect(tierBandLines(unplaceable)).toEqual([])
  })

  it('shows the weighted arithmetic, and it reconciles to the printed score', () => {
    const r = row('Sharpe Ratio 3Y', sec({ sharpe_rank: 7, three_year_total_return_rank_category_size_nav: 353 }))
    expect(scoreFormulaLines(r)[0]).toBe('20% weight x 100% (tier 1) x 100 = 20.0')
    expect(r.score).toBeCloseTo(20, 6)
  })

  it('shows the EXACT product and names the rounding when the cell differs', () => {
    // The table prints one decimal, so a tooltip reading "5% x 25% x 100 = 1.3"
    // is arithmetic that does not add up. An explanation whose sums are wrong
    // is worse than no explanation.
    const r = row('Tracking Error 3Y',
      sec({ broad_asset_class: 'Taxable Bond', tracking_error_3y_vs_category: 0.001 }))
    expect(r.tier).toBe(4)
    expect(scoreFormulaLines(r)[0]).toBe('5% weight x 25% (tier 4) x 100 = 1.25 (shown as 1.3)')
  })

  it('does not add a rounding note when there is nothing to note', () => {
    const r = row('Sharpe Ratio 3Y', sec({ sharpe_rank: 7, three_year_total_return_rank_category_size_nav: 353 }))
    expect(scoreFormulaLines(r)[0]).not.toContain('shown as')
  })

  it('does NOT present Upside/Downside as a weighted calculation', () => {
    // It awards fixed points. Showing "10% x 100% x 100" would invite the
    // reader to check arithmetic that was never performed.
    const r = row('Upside/Downside 5Y', sec({ upside_downside_5y_vs_category: 1.5 }))
    const lines = scoreFormulaLines(r)
    expect(lines[0]).toBe('Tier 1 -> 10.0 points')
    expect(lines.join(' ')).toContain('not weight x multiplier')
  })

  it('explains the tenure zero case rather than printing a contradiction', () => {
    // Tier 4 at a score of 0 reads as an arithmetic error without this line.
    const r = row('Manager Tenure', sec({ max_manager_tenure: 0.5 }))
    expect(r.tier).toBe(4)
    expect(r.score).toBe(0)
    expect(scoreFormulaLines(r).join(' ')).toContain('1 year or less pays nothing')
  })

  it('says so when a metric was not scored at all', () => {
    const r = row('Manager Tenure', sec({}))
    expect(scoreFormulaLines(r)).toEqual(['Not scored — no value for this metric.'])
  })
})

describe('fmtScorecardValue', () => {
  it('formats each kind of cell the way its column is read', () => {
    expect(fmtScorecardValue(66.4)).toBe('66')          // a rank is an integer
    expect(fmtScorecardValue(12.5, 'tenure')).toBe('12.5')
    expect(fmtScorecardValue(0.0192, 'trackingError')).toBe('1.92%')
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
