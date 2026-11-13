import { describe, it, expect } from 'vitest'
import {
  assessFundFlag, atRiskMetricsFromScorecard, autoFlagNote, autoFlagPlan,
  designatedCohort, failingScorecardRows, metricKeyFor, AUTO_FLAG_MIN_FAILING,
} from '../fundAtRisk'
import { buildFundScorecard, type FundScorecard, type ScorecardRow } from '../fundScorecard'
import { gradeAtRiskMetric, isMetricFailing } from '../atRisk'
import type { SecurityDetail } from '../securities'

/**
 * The point of recording a fund's failing metrics is that the entry becomes
 * re-measurable. So most of these cases run the result back through the SHARED
 * grader — if `gradeAtRiskMetric` does not agree with the scorecard's own tier,
 * the mapping is wrong however reasonable it looks.
 */

function row(over: Partial<ScorecardRow> = {}): ScorecardRow {
  return {
    label: 'Sharpe Ratio 3Y', weight: 0.2, displayVal: 150, size: 200,
    tier: 4, score: 5, tier3Threshold: 100, tier2Threshold: 50, tier1Threshold: 20,
    higherIsBetter: false, tier1Exclusive: false, ...over,
  }
}

describe('which rows count as failing', () => {
  it('takes tier 4 and nothing else', () => {
    const rows = [row({ tier: 1 }), row({ tier: 2 }), row({ tier: 3 }), row({ tier: 4 })]
    expect(failingScorecardRows(rows)).toHaveLength(1)
    expect(failingScorecardRows(rows)[0].tier).toBe(4)
  })

  it('does NOT count a metric with no data', () => {
    // A reading we could not take is not evidence against the fund. Counting it
    // would also inflate the sell timer, which is sized on the failing count.
    expect(failingScorecardRows([row({ tier: null, displayVal: null })])).toHaveLength(0)
  })
})

describe('the resulting metric grades the way the scorecard tiered it', () => {
  const metric = (over: Partial<ScorecardRow>) =>
    atRiskMetricsFromScorecard([row({ tier: 4, ...over })], 'category')[0]

  it('is RED while the reading is still in tier 4', () => {
    // rank 150 of 200 = 75th percentile: beats neither the tier-3 line (100)
    // nor the tier-2 line (50), and lower is better.
    const m = metric({ displayVal: 150 })
    expect(gradeAtRiskMetric(m)).toBe('red')
    expect(isMetricFailing(m)).toBe(true)
  })

  it('goes AMBER once back in tier 3, which clears the flag', () => {
    // The whole reason tier 3 is the first comparator: "recovered" has to mean
    // out of the bottom tier, not all the way to top-quartile.
    const m = { ...metric({ displayVal: 150 }), currentValue: 80 }
    expect(gradeAtRiskMetric(m)).toBe('yellow')
    expect(isMetricFailing(m)).toBe(false)
  })

  it('goes GREEN at tier 2 or better', () => {
    expect(gradeAtRiskMetric({ ...metric({ displayVal: 150 }), currentValue: 30 })).toBe('green')
  })

  it('handles a higher-is-better reading the same way', () => {
    // Manager tenure: 2 years is tier 4; the lines out are 3 and 5.
    const m = atRiskMetricsFromScorecard(
      [row({ label: 'Manager Tenure', displayVal: 2, size: null, tier: 4, tier3Threshold: 3, tier2Threshold: 5, tier1Threshold: 7, higherIsBetter: true })],
      'category',
    )[0]
    expect(gradeAtRiskMetric(m)).toBe('red')
    expect(gradeAtRiskMetric({ ...m, currentValue: 4 })).toBe('yellow')
    expect(gradeAtRiskMetric({ ...m, currentValue: 6 })).toBe('green')
  })
})

describe('what the entry records', () => {
  it('names the cohort, because the same metric ranks differently in each', () => {
    const [cat] = atRiskMetricsFromScorecard([row()], 'category')
    const [peer] = atRiskMetricsFromScorecard([row()], 'peer')
    expect(cat.label).toBe('Sharpe Ratio 3Y (vs category)')
    expect(peer.label).toBe('Sharpe Ratio 3Y (vs peer group)')
    // Distinct keys, so flagging on both cohorts does not collapse to one row.
    expect(cat.key).not.toBe(peer.key)
  })

  it('freezes the reading and the two lines it failed', () => {
    const [m] = atRiskMetricsFromScorecard([row()], 'category')
    expect(m.flaggedValue).toBe(150)
    expect(m.flaggedBenchmark).toBe(100)   // tier 3 line
    expect(m.flaggedBenchmark2).toBe(50)   // tier 2 line
    expect(m.currentValue).toBeNull()      // nothing re-measured yet
  })

  it('uses live comparators, not frozen ones', () => {
    // A fund's cohort re-ranks every quarter, so the real test is beating the
    // cohort as it is NOW — the same reasoning as a stock's growth benchmarks.
    expect(atRiskMetricsFromScorecard([row()], 'category')[0].basis).toBe('benchmarks')
  })

  it('makes a key that survives a label with punctuation', () => {
    expect(metricKeyFor('Upside/Downside 5Y')).toBe('upside_downside_5y')
    expect(metricKeyFor('R-Square 3Y')).toBe('r_square_3y')
  })
})

describe('against a scorecard built from a real security row', () => {
  // Ranks deep in a 200-fund category: bottom-tier on both rank metrics given.
  const security = {
    sharpe_rank: 180, three_year_total_return_rank_category_size_nav: 200,
    alpha_rank: 170,
    max_manager_tenure: 9,
  } as unknown as SecurityDetail

  it('flags only the metrics that actually have bottom-tier data', () => {
    const { rows } = buildFundScorecard(security, 'category')
    const metrics = atRiskMetricsFromScorecard(rows, 'category')
    const labels = metrics.map((m) => m.label)
    expect(labels).toContain('Sharpe Ratio 3Y (vs category)')
    expect(labels).toContain('Alpha 3Y (vs category)')
    // Tenure of 9 years is tier 1 — not flagged.
    expect(labels.join(' ')).not.toContain('Manager Tenure')
    // Metrics with no underlying data are absent rather than counted.
    expect(metrics.every((m) => m.flaggedValue !== null)).toBe(true)
  })

  it('every flagged metric reads red, so the count that sizes the timer is real', () => {
    const { rows } = buildFundScorecard(security, 'category')
    const metrics = atRiskMetricsFromScorecard(rows, 'category')
    expect(metrics.length).toBeGreaterThan(0)
    for (const m of metrics) expect(isMetricFailing(m), m.label).toBe(true)
  })
})

/**
 * FPX as it stands in the book — the case the UI offers to flag.
 *
 * Pinned with the security's real column values because the browser could not
 * exercise the write (the permission classifier blocks it), so this is what
 * stands in for clicking the button: the exact composition the workspace
 * performs, on the exact row it would perform it against.
 */
describe('FPX against its designated peer-group cohort', () => {
  const fpx = {
    security_id: 'FPX',
    scorecard_cohort: 'peer',
    broad_asset_class: 'US Equity',
    upside_downside_5y_vs_pg: 0.862859,
    // 1481bp against equity bands topping out at 775bp -- TIER 1.
    tracking_error_3y_vs_pg: 0.14807271,
    max_manager_tenure: 20.48,
    sharpe_peer_group_rank: 26,
    three_year_total_return_peer_group_size_nav: 342,
    alpha_peer_group_rank: 18,
    information_ratio_peer_group_rank: 8,
    one_year_total_return_peer_group_rank_nav: 53,
    one_year_total_return_peer_group_size_nav: 367,
  } as unknown as SecurityDetail

  const { rows } = buildFundScorecard(fpx, 'peer')
  const metrics = atRiskMetricsFromScorecard(rows, 'peer')

  it('finds the one reading the review offers to record', () => {
    expect(metrics.map((m) => m.label)).toEqual(['Upside/Downside 5Y (vs peer group)'])
  })

  /**
   * IT USED TO BE TWO. FPX's R-Squared of 0.642 was a tier-4 reading against
   * it until tracking error replaced R-Squared in the scorecard (13 Nov 2026).
   * Not tracking its peer group is what an active mandate is FOR, and FPX
   * deviates 1481bp -- the top tier. The flag list moving is the intended
   * effect of that change, not a regression, and this test is where it shows.
   */
  it('no longer counts "does not track its peer group" against it', () => {
    expect(metrics.map((m) => m.label).join(' ')).not.toContain('Tracking Error')
    expect(metrics.map((m) => m.label).join(' ')).not.toContain('R-Square')
  })

  it('freezes the reading and the lines it failed', () => {
    const [ud] = metrics
    expect(ud.flaggedValue).toBeCloseTo(0.8629, 4)
    expect(ud.flaggedBenchmark).toBe(0.9)    // out of tier 4
    expect(ud.flaggedBenchmark2).toBe(1.0)   // into tier 2
  })

  it('it reads red, so the sell timer is sized on a real failure', () => {
    // Not zero, which is what every fund entry has recorded until now — and
    // zero takes the longest rung on the day table.
    expect(metrics).toHaveLength(1)
    for (const m of metrics) expect(isMetricFailing(m), m.label).toBe(true)
  })

  it('leaves its strong metrics alone', () => {
    // Information ratio 8th of 342 and 20 years of manager tenure are tier 1;
    // a flag that swept them in would misreport the evidence.
    const labels = metrics.map((m) => m.label).join(' ')
    expect(labels).not.toContain('Information Ratio')
    expect(labels).not.toContain('Manager Tenure')
  })
})

/**
 * The automatic flag.
 *
 * It writes to a governed table and opens a sell timer, so the cases that
 * matter most are the ones where it must REFUSE: an unscored fund, and a fund
 * whose low total is missing columns rather than bad readings. Both would flag
 * under a naive reading of the rule, and both are measured against the same
 * live book that made a one-dial rule untenable — "any bottom-tier metric"
 * would flag eight of 45 held funds, six of them healthy.
 */
function card(over: Partial<FundScorecard> = {}): FundScorecard {
  return { rows: [], total: 0, hasData: true, ...over }
}

describe('assessFundFlag', () => {
  it('flags a red total score', () => {
    const a = assessFundFlag(card({ total: 47.8, rows: [row({ tier: 4 })] }))
    expect(a.qualifies).toBe(true)
    expect(a.reason).toBe('red_score')
    expect(a.band).toBe('red')
  })

  it(`flags ${AUTO_FLAG_MIN_FAILING} bottom-tier readings even on a green total`, () => {
    // The second dial: a strong expense ratio can hold a total above 70 while
    // the readings that describe performance are all in the bottom tier.
    const rows = [row({ tier: 4 }), row({ tier: 4, label: 'Alpha 3Y' }), row({ tier: 4, label: 'Information Ratio 3Y' })]
    const a = assessFundFlag(card({ total: 82, rows }))
    expect(a.qualifies).toBe(true)
    expect(a.reason).toBe('broad_failure')
    expect(a.band).toBe('green')
  })

  it('reports BOTH when the score is red and the failure is broad', () => {
    const rows = Array.from({ length: 4 }, (_, i) => row({ tier: 4, label: `M${i}` }))
    expect(assessFundFlag(card({ total: 47.8, rows })).reason).toBe('both')
  })

  it('does NOT flag one or two bottom-tier readings on a healthy total', () => {
    // VVIAX and VIGAX fail only Manager Tenure at a total of 94.3; AVERX and
    // FPX only Upside/Downside. Those describe a fund rather than
    // judge it, and flagging them would teach the reader to ignore the list.
    expect(assessFundFlag(card({ total: 94.3, rows: [row({ tier: 4 })] })).qualifies).toBe(false)
    expect(assessFundFlag(card({ total: 72.5, rows: [row({ tier: 4 }), row({ tier: 4, label: 'R' })] })).qualifies).toBe(false)
  })

  it('never flags an UNSCORED fund, though its total of 0 bands red', () => {
    // buildFundScorecard returns total 0 with hasData false, and scoreBand(0)
    // is red — so without the guard a workbook gap puts a fund on a sell timer.
    const a = assessFundFlag(card({ total: 0, hasData: false }))
    expect(a.qualifies).toBe(false)
    expect(a.band).toBeNull()
    expect(a.blockedNoReadings).toBe(false)
    expect(assessFundFlag(null).qualifies).toBe(false)
  })

  it('refuses a red score with NO bottom-tier reading, and says why', () => {
    // A flag must carry its readings: addToAtRisk sizes the sell timer on the
    // failing count, so an empty array takes the longest rung and leaves
    // nothing to re-measure — the defect that left IAGG with a timer into
    // Sept 2027. A red total with nothing in tier 4 means missing columns.
    const a = assessFundFlag(card({ total: 31, rows: [row({ tier: 3 }), row({ tier: null, displayVal: null })] }))
    expect(a.qualifies).toBe(false)
    expect(a.blockedNoReadings).toBe(true)
    expect(a.band).toBe('red')
  })
})

describe('designatedCohort', () => {
  it('reads peer only when it is set explicitly', () => {
    expect(designatedCohort({ scorecard_cohort: 'peer' } as never)).toBe('peer')
    expect(designatedCohort({ scorecard_cohort: 'category' } as never)).toBe('category')
    // An unset cohort is GRADED against the category rather than skipped; the
    // surfaces say on screen that nothing was designated.
    expect(designatedCohort({ scorecard_cohort: null } as never)).toBe('category')
  })
})

describe('autoFlagPlan', () => {
  /** A fund ranked dead last on every rank metric — red by any reading. */
  const failingFund = (securityId: string) => ({
    security_id: securityId,
    scorecard_cohort: 'category',
    one_year_total_return_rank_nav: 600, one_year_total_return_rank_category_size_nav: 600,
    three_year_total_return_rank_nav: 500, three_year_total_return_rank_category_size_nav: 500,
    five_year_total_return_rank_nav: 400, five_year_total_return_rank_category_size_nav: 400,
    sharpe_rank: 490, information_ratio_rank: 480, alpha_rank: 470,
    expense_ratio_rank: 590,
  }) as unknown as SecurityDetail

  it('excludes a security already on the list, so re-ticking adds nothing twice', () => {
    expect(autoFlagPlan([failingFund('IAGG')], new Set())).toHaveLength(1)
    expect(autoFlagPlan([failingFund('IAGG')], new Set(['IAGG']))).toHaveLength(0)
  })

  it('judges against the DESIGNATED cohort, not whatever is on screen', () => {
    // The card's toggle is for looking. A fund designated peer carries no
    // category ranks here, so a plan built on the category would see no data.
    const peerOnly = { ...failingFund('X'), scorecard_cohort: 'peer' } as unknown as SecurityDetail
    expect(autoFlagPlan([peerOnly], new Set())).toHaveLength(0)
    expect(autoFlagPlan([failingFund('X')], new Set())[0].cohort).toBe('category')
  })
})

describe('autoFlagNote', () => {
  it('stands on its own — names the measure, the threshold and the review', () => {
    // Read a year later beside a sell timer, by someone without the review open.
    const [entry] = autoFlagPlan(
      [{
        security_id: 'IAGG', scorecard_cohort: 'category',
        one_year_total_return_rank_nav: 600, one_year_total_return_rank_category_size_nav: 600,
        three_year_total_return_rank_nav: 500, three_year_total_return_rank_category_size_nav: 500,
        five_year_total_return_rank_nav: 400, five_year_total_return_rank_category_size_nav: 400,
        sharpe_rank: 490, information_ratio_rank: 480, alpha_rank: 470, expense_ratio_rank: 590,
      } as unknown as SecurityDetail],
      new Set(),
    )
    const note = autoFlagNote(entry, 'Hybrid Balanced', 'quarterly', new Date('2026-11-09T00:00:00Z'))
    expect(note).toContain('Hybrid Balanced')
    expect(note).toContain('quarterly')
    expect(note).toContain('November 9, 2026')
    expect(note).toContain('60')          // the threshold, not just the verdict
    expect(note).toContain('bottom tier')
  })
})
