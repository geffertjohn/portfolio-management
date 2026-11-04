import { describe, it, expect } from 'vitest'
import { buildReviewSnapshot, type ReviewSnapshotSources } from '../reviewSnapshot'

/**
 * The snapshot is the ONLY thing that makes a stock review reconstructable —
 * stock metrics are never persisted, so a year later this jsonb is the whole
 * record. These cases are about what reaches it and what must not.
 */

const AT = '2026-11-04T17:00:00.000Z'

function sources(over: Partial<ReviewSnapshotSources> = {}): ReviewSnapshotSources {
  return {
    capturedAt: AT,
    quote: { price: 241.5 },
    scorecard: {
      operatingMargin: 0.312, fcfMargin: 0.188,
      revGrowthTtm: 0.094, epsGrowthTtm: 0.121,
      revCagr3y: 0.077, epsCagr3y: 0.103,
    },
    analyst: {
      grades: { consensus: 'Buy', strongBuy: 12, buy: 20, hold: 7, sell: 1, strongSell: 0 },
      priceTarget: { targetConsensus: 268.4, numberOfAnalysts: 23 },
    },
    tipranks: {
      totalRecommendations: 437, distinctAnalysts: 41,
      buy: 275, hold: 129, sell: 33,
      actions: { upgraded: 4, downgraded: 2 },
      averageReturn: 0.061,
    },
    tipranksBeatRate: 0.58,
    ...over,
  }
}

describe('buildReviewSnapshot', () => {
  it('captures the reading as given, with the caller’s timestamp', () => {
    const s = buildReviewSnapshot(sources())
    expect(s.capturedAt).toBe(AT)
    expect(s.price).toBe(241.5)
    expect(s.scorecard.operatingMargin).toBe(0.312)
    expect(s.analyst.consensus).toBe('Buy')
    expect(s.analyst.numberOfAnalysts).toBe(23)
    expect(s.tipranks?.distinctAnalysts).toBe(41)
    expect(s.tipranks?.upgraded).toBe(4)
  })

  it('takes beatRate from the caller, not from the raw counts', () => {
    // beatRate() gates on MIN_RATINGS_FOR_ACCURACY and returns null on thin
    // coverage. Recomputing it here would dress a 3-rating average up as a
    // track record — the trap CLAUDE.md records for stockSuccessRate.
    expect(buildReviewSnapshot(sources({ tipranksBeatRate: null })).tipranks?.beatRate).toBeNull()
  })

  it('degrades to nulls rather than throwing when a feed is missing', () => {
    // Every source is an on-demand FMP read that can fail independently. A
    // review must still record what it could see.
    const s = buildReviewSnapshot(sources({
      quote: null, scorecard: null, analyst: null, tipranks: null, tipranksBeatRate: null,
    }))
    expect(s.price).toBeNull()
    expect(s.scorecard.operatingMargin).toBeNull()
    expect(s.analyst.consensus).toBeNull()
    expect(s.tipranks).toBeNull()
    expect(s.capturedAt).toBe(AT)
  })

  it('keeps a real zero rather than nulling it', () => {
    // `?? null` and not `|| null`: a 0% margin or 0 sell ratings is a reading,
    // and recording it as "unknown" would misstate the evidence.
    const s = buildReviewSnapshot(sources({
      quote: { price: 0 },
      scorecard: { operatingMargin: 0, fcfMargin: 0, revGrowthTtm: 0, epsGrowthTtm: 0, revCagr3y: 0, epsCagr3y: 0 },
      tipranksBeatRate: 0,
    }))
    expect(s.price).toBe(0)
    expect(s.scorecard.operatingMargin).toBe(0)
    expect(s.tipranks?.beatRate).toBe(0)
  })

  it('does not let a new upstream field ride along into the record', () => {
    // The safety property. These are live FMP response shapes that gain fields
    // without warning, and this record is handed to a regulator — so the
    // mapping is field-by-field and must stay that way. Same guard as the
    // client-facing quarterly brief.
    const SENTINEL = 'MUST_NOT_APPEAR_IN_SNAPSHOT'
    const polluted = sources()
    const inject = (o: unknown) => Object.assign(o as object, { undisclosedField: SENTINEL })
    inject(polluted.quote)
    inject(polluted.scorecard)
    inject(polluted.analyst)
    inject(polluted.analyst!.grades)
    inject(polluted.analyst!.priceTarget)
    inject(polluted.tipranks)

    const serialized = JSON.stringify(polluted)
    expect(serialized, 'the sentinel must be in the INPUT, or this passes vacuously')
      .toContain(SENTINEL)

    expect(JSON.stringify(buildReviewSnapshot(polluted))).not.toContain(SENTINEL)
    expect(JSON.stringify(buildReviewSnapshot(polluted))).not.toContain('undisclosedField')
  })
})
