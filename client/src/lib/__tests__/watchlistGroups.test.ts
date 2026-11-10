import { describe, expect, it } from 'vitest'
import {
  groupWatchlistFunds,
  LARGE_CAP_GROUP_KEY,
  UNCLASSIFIED_GROUP_KEY,
  PENDING_GROUP_KEY,
  toPendingFundRow,
  type WatchlistFundRow,
} from '../watchlistGroups'
import { ASSET_CLASS_ROWS, type AssetClassKey } from '../modelPortfolios'

/**
 * The Watchlist's fund table groups by the firm's asset classes. These cases
 * are the rules that decide what a reader sees, not the plumbing:
 *
 * - every sleeve is present, including the empty ones (an empty sleeve is a
 *   real gap in an idea list, and only visible if the row exists to be empty);
 * - US Large Cap nests three ways and nothing else does;
 * - a fund the category map cannot place is REPORTED, never dropped — the
 *   live case that prompted this file, since `Mid-Cap Value` and `Small Value`
 *   were unmapped and would have silently removed four watched funds.
 */

function row(over: Partial<WatchlistFundRow> & { securityId: string }): WatchlistFundRow {
  return {
    prospectId: 1,
    name: null,
    numericId: 10,
    type: 'Mutual fund',
    categoryName: null,
    assetClass: null,
    cohort: 'category',
    cohortSet: true,
    score: null,
    band: null,
    expenseRatio: null,
    return3y: null,
    return5y: null,
    heldIn: [],
    ...over,
  }
}

const find = (gs: ReturnType<typeof groupWatchlistFunds>, key: string) => gs.find((g) => g.key === key)!

describe('every sleeve is present', () => {
  // Twelve top-level groups: the fourteen classes with the three large-cap
  // keys folded into one nested parent.
  it('returns twelve groups for an empty watchlist', () => {
    const groups = groupWatchlistFunds([])
    expect(groups).toHaveLength(12)
    expect(groups.every((g) => g.count === 0)).toBe(true)
  })

  it('keeps ASSET_CLASS_ROWS order, with US Large Cap at its first member position', () => {
    const groups = groupWatchlistFunds([])
    expect(groups[0].key).toBe(LARGE_CAP_GROUP_KEY)
    // Everything after it follows the taxonomy order, large cap removed.
    const expected = ASSET_CLASS_ROWS
      .map((r) => r.key)
      .filter((k) => !k.startsWith('large_cap_'))
    expect(groups.slice(1).map((g) => g.key)).toEqual(expected)
  })

  // The point of showing an empty sleeve: "nothing good available" and "never
  // looked" are different, and only one of them is visible if the row is gone.
  it('reports a sleeve with no ideas as present and empty, not absent', () => {
    const groups = groupWatchlistFunds([row({ securityId: 'VSMIX', assetClass: 'us_small_cap' })])
    const em = find(groups, 'emerging_market')
    expect(em.count).toBe(0)
    expect(em.funds).toEqual([])
  })
})

describe('US Large Cap is the only nested group', () => {
  it('splits into Blend, Growth and Value in that order', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'VUG', assetClass: 'large_cap_growth' }),
      row({ securityId: 'FELC', assetClass: 'large_cap_blend' }),
    ])
    const lc = find(groups, LARGE_CAP_GROUP_KEY)
    expect(lc.subGroups?.map((s) => s.label)).toEqual(['Blend', 'Growth', 'Value'])
    expect(lc.subGroups?.[0].funds.map((f) => f.securityId)).toEqual(['FELC'])
    expect(lc.subGroups?.[1].funds.map((f) => f.securityId)).toEqual(['VUG'])
    expect(lc.subGroups?.[2].funds).toEqual([])
  })

  // The parent's own `funds` stays empty — a caller rendering both would
  // print every large-cap fund twice.
  it('puts no funds directly on the parent', () => {
    const groups = groupWatchlistFunds([row({ securityId: 'FELC', assetClass: 'large_cap_blend' })])
    const lc = find(groups, LARGE_CAP_GROUP_KEY)
    expect(lc.funds).toEqual([])
    expect(lc.count).toBe(1)
  })

  it('counts the whole parent, sub-groups included', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'FELC', assetClass: 'large_cap_blend' }),
      row({ securityId: 'VUG', assetClass: 'large_cap_growth' }),
      row({ securityId: 'X', assetClass: 'large_cap_value' }),
    ])
    expect(find(groups, LARGE_CAP_GROUP_KEY).count).toBe(3)
  })

  it('leaves every other class flat', () => {
    const groups = groupWatchlistFunds([])
    for (const g of groups.filter((g) => g.key !== LARGE_CAP_GROUP_KEY)) {
      expect(g.subGroups).toBeNull()
    }
  })
})

describe('an unplaceable fund is reported, never dropped', () => {
  // The live case: `Mid-Cap Value` and `Small Value` were missing from
  // ASSET_CLASS_BY_CATEGORY, so FSMVX/NAMAX/QVAL/VSMIX resolved to null. The
  // map is fixed, but a future vendor spelling will do this again — and a
  // fund missing from the list reads as one the firm does not watch.
  it('gives a null asset class its own group at the end', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'NEWFD', assetClass: null, categoryName: 'Some New Vendor Category' }),
      row({ securityId: 'FELC', assetClass: 'large_cap_blend' }),
    ])
    expect(groups[groups.length - 1].key).toBe(UNCLASSIFIED_GROUP_KEY)
    expect(groups[groups.length - 1].funds.map((f) => f.securityId)).toEqual(['NEWFD'])
  })

  // An always-present "Unclassified" row would assert a mapping gap that does
  // not exist, and a reader who sees it every day stops reading it.
  it('omits the group entirely when nothing is unplaceable', () => {
    const groups = groupWatchlistFunds([row({ securityId: 'FELC', assetClass: 'large_cap_blend' })])
    expect(groups.some((g) => g.key === UNCLASSIFIED_GROUP_KEY)).toBe(false)
  })
})

describe('awaiting YCharts is NOT the same as unclassified', () => {
  /**
   * Different causes, different remedies — the `UnpricedReason` split. A fund
   * with no securities2 row resolves itself on the next refresh; a fund whose
   * category the map cannot place stays broken until somebody edits
   * `ASSET_CLASS_BY_CATEGORY`. One heading for both would file a standing
   * defect under a label that clears overnight.
   */
  it('routes a fund with no securities2 row to its own group', () => {
    const groups = groupWatchlistFunds([
      toPendingFundRow({ id: 7, security_id: 'NEWFD' } as never, 'Mutual fund'),
    ])
    expect(groups.some((g) => g.key === UNCLASSIFIED_GROUP_KEY)).toBe(false)
    const pending = find(groups, PENDING_GROUP_KEY)
    expect(pending.funds.map((f) => f.securityId)).toEqual(['NEWFD'])
  })

  it('keeps both groups when both states are present, pending last', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'BADCAT', assetClass: null, categoryName: 'Unknown Vendor Category' }),
      toPendingFundRow({ id: 7, security_id: 'NEWFD' } as never, 'ETF'),
    ])
    expect(groups.slice(-2).map((g) => g.key)).toEqual([UNCLASSIFIED_GROUP_KEY, PENDING_GROUP_KEY])
  })

  /**
   * THE LIVE CASE, 10 Nov 2026. The pending test used to be
   * `numericId == null` — "has no securities2 row" — on the assumption that a
   * row implies the workbook has filled it. The watchlist sync invalidated
   * that: it creates the row as soon as the macro adds the ticker to column B,
   * so ARMIX, DFALX and TDADX arrived with ids 161-163 and nothing else.
   *
   * Keying on the CATEGORY asks the question the two groups genuinely differ
   * on — will this resolve by itself overnight, or is somebody waiting on a
   * map edit.
   */
  it('routes a fund that HAS a row but no category yet to pending', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'ARMIX', numericId: 161, assetClass: null, categoryName: null }),
    ])
    expect(groups.some((g) => g.key === UNCLASSIFIED_GROUP_KEY)).toBe(false)
    expect(find(groups, PENDING_GROUP_KEY).funds.map((f) => f.securityId)).toEqual(['ARMIX'])
  })

  // The other side of the same rule: a row carrying a real category string the
  // map cannot place is a map bug, and no refresh will clear it.
  it('still routes a row WITH an unmapped category to unclassified', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'BADCAT', numericId: 99, assetClass: null, categoryName: 'Some New Vendor Category' }),
    ])
    expect(groups.some((g) => g.key === PENDING_GROUP_KEY)).toBe(false)
    expect(find(groups, UNCLASSIFIED_GROUP_KEY).funds.map((f) => f.securityId)).toEqual(['BADCAT'])
  })

  // Whitespace is not a category.
  it('treats a blank category as absent', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'BLANK', numericId: 5, assetClass: null, categoryName: '   ' }),
    ])
    expect(find(groups, PENDING_GROUP_KEY).funds.map((f) => f.securityId)).toEqual(['BLANK'])
  })

  // A pending row has no score to rank on, so the only honest order is the
  // ticker — not a score comparison between two sets of nulls.
  it('orders pending rows by ticker', () => {
    const groups = groupWatchlistFunds([
      toPendingFundRow({ id: 1, security_id: 'ZFUND' } as never, 'ETF'),
      toPendingFundRow({ id: 2, security_id: 'AFUND' } as never, 'ETF'),
    ])
    expect(find(groups, PENDING_GROUP_KEY).funds.map((f) => f.securityId)).toEqual(['AFUND', 'ZFUND'])
  })
})

describe('ranking within a sleeve', () => {
  const key: AssetClassKey = 'us_mid_cap'

  it('puts the best score first', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'LOW', assetClass: key, score: 55 }),
      row({ securityId: 'HIGH', assetClass: key, score: 82 }),
    ])
    expect(find(groups, key).funds.map((f) => f.securityId)).toEqual(['HIGH', 'LOW'])
  })

  it('breaks a score tie on the cheaper fund', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'PRICEY', assetClass: key, score: 70, expenseRatio: 0.0088 }),
      row({ securityId: 'CHEAP', assetClass: key, score: 70, expenseRatio: 0.0028 }),
    ])
    expect(find(groups, key).funds.map((f) => f.securityId)).toEqual(['CHEAP', 'PRICEY'])
  })

  // An unscored fund is one the workbook has not filled, NOT one that scored
  // nothing — sorting it as a zero would state something untrue about it.
  it('sorts an unscored fund last rather than as a zero', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'NOSCORE', assetClass: key, score: null }),
      row({ securityId: 'TERRIBLE', assetClass: key, score: 12 }),
    ])
    expect(find(groups, key).funds.map((f) => f.securityId)).toEqual(['TERRIBLE', 'NOSCORE'])
  })

  it('falls back to the ticker when nothing else separates two funds', () => {
    const groups = groupWatchlistFunds([
      row({ securityId: 'ZZZ', assetClass: key }),
      row({ securityId: 'AAA', assetClass: key }),
    ])
    expect(find(groups, key).funds.map((f) => f.securityId)).toEqual(['AAA', 'ZZZ'])
  })
})

describe('an idea the firm already holds', () => {
  /**
   * The Watchlist is a list of things being CONSIDERED FOR PURCHASE, and one
   * of them is already owned: VBTLX is watched AND held in three Foundation
   * books. Carried onto the row so the table can say so — rendered the same as
   * an unheld idea, it reads as a candidate nobody has bought yet, which is
   * the opposite of true.
   */
  it('carries the holding books onto the row', () => {
    const groups = groupWatchlistFunds([
      row({
        securityId: 'VBTLX',
        assetClass: 'ig_intermediate_fixed_income',
        heldIn: ['Foundation Balanced', 'Foundation Conservative'],
      }),
    ])
    const r = find(groups, 'ig_intermediate_fixed_income').funds[0]
    expect(r.heldIn).toEqual(['Foundation Balanced', 'Foundation Conservative'])
  })

  it('leaves a genuine idea with an empty list, never null', () => {
    const groups = groupWatchlistFunds([row({ securityId: 'FELC', assetClass: 'large_cap_blend' })])
    expect(find(groups, LARGE_CAP_GROUP_KEY).subGroups?.[0].funds[0].heldIn).toEqual([])
  })

  /**
   * A fund can be bought before the workbook has reached it — a purchase and a
   * YCharts refresh are different events — so a PENDING row has to be able to
   * say it is held too.
   */
  it('says so even for a row still awaiting YCharts data', () => {
    const idea = { id: 7, security_id: 'NEWFD', heldIn: ['Hybrid Growth'] }
    const groups = groupWatchlistFunds([toPendingFundRow(idea as never, 'Mutual fund')])
    expect(find(groups, PENDING_GROUP_KEY).funds[0].heldIn).toEqual(['Hybrid Growth'])
  })

  // The fetch always supplies it, but `toFundRow` is called with rows from two
  // places and an undefined here would render `heldIn.length` as a crash.
  it('defaults to an empty list when the idea does not carry one', () => {
    const groups = groupWatchlistFunds([
      toPendingFundRow({ id: 1, security_id: 'X' } as never, 'ETF'),
    ])
    expect(find(groups, PENDING_GROUP_KEY).funds[0].heldIn).toEqual([])
  })
})
