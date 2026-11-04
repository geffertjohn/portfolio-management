/**
 * reviewSnapshot.ts
 *
 * The frozen evidence behind a stock review — built here rather than inside
 * `MarkReviewedModal`.
 *
 * Stock metrics are never persisted to `securities2`; they are read on demand
 * from FMP. So the only thing that makes a review reconstructable a year later
 * is the `review_log.metrics_snapshot` jsonb written at submit time. That makes
 * this the most audit-load-bearing mapping in the app, and it sat as a closure
 * inside a 760-line modal where nothing could test it (audit §22).
 *
 * It is a pure projection: the caller passes `capturedAt` rather than letting
 * this reach for the clock, which is what makes it testable at all.
 *
 * **It is deliberately a field-by-field copy, not a spread.** The sources are
 * live FMP response shapes that gain fields without warning, and this record is
 * handed to a regulator. Anything not named here must not reach the stored
 * snapshot — `reviewSnapshot.test.ts` holds that with a sentinel, the same
 * safety property `quarterlyBrief.test.ts` enforces on the client-facing brief.
 */
import type { ReviewMetricsSnapshot } from './reviewLog'

/** Only the fields the snapshot reads, so a caller can pass the live objects. */
export interface ReviewSnapshotSources {
  capturedAt: string
  quote: { price?: number | null } | null | undefined
  scorecard: {
    operatingMargin?: number | null
    fcfMargin?: number | null
    revGrowthTtm?: number | null
    epsGrowthTtm?: number | null
    revCagr3y?: number | null
    epsCagr3y?: number | null
  } | null | undefined
  analyst: {
    grades?: {
      consensus?: string | null
      strongBuy?: number | null
      buy?: number | null
      hold?: number | null
      sell?: number | null
      strongSell?: number | null
    } | null
    priceTarget?: {
      targetConsensus?: number | null
      numberOfAnalysts?: number | null
    } | null
  } | null | undefined
  tipranks: {
    totalRecommendations: number
    distinctAnalysts: number
    buy: number
    hold: number
    sell: number
    actions: { upgraded: number; downgraded: number }
    averageReturn: number | null
  } | null | undefined
  /**
   * Passed in rather than computed here: `beatRate` gates on
   * `MIN_RATINGS_FOR_ACCURACY` and returns null below it, and that judgement
   * belongs with the TipRanks module, not duplicated in a mapper.
   */
  tipranksBeatRate: number | null
}

export function buildReviewSnapshot(s: ReviewSnapshotSources): ReviewMetricsSnapshot {
  return {
    capturedAt: s.capturedAt,
    price: s.quote?.price ?? null,
    scorecard: {
      operatingMargin: s.scorecard?.operatingMargin ?? null,
      fcfMargin: s.scorecard?.fcfMargin ?? null,
      revGrowthTtm: s.scorecard?.revGrowthTtm ?? null,
      epsGrowthTtm: s.scorecard?.epsGrowthTtm ?? null,
      revCagr3y: s.scorecard?.revCagr3y ?? null,
      epsCagr3y: s.scorecard?.epsCagr3y ?? null,
    },
    analyst: {
      consensus: s.analyst?.grades?.consensus ?? null,
      targetConsensus: s.analyst?.priceTarget?.targetConsensus ?? null,
      numberOfAnalysts: s.analyst?.priceTarget?.numberOfAnalysts ?? null,
      strongBuy: s.analyst?.grades?.strongBuy ?? null,
      buy: s.analyst?.grades?.buy ?? null,
      hold: s.analyst?.grades?.hold ?? null,
      sell: s.analyst?.grades?.sell ?? null,
      strongSell: s.analyst?.grades?.strongSell ?? null,
    },
    tipranks: s.tipranks
      ? {
          totalRecommendations: s.tipranks.totalRecommendations,
          distinctAnalysts: s.tipranks.distinctAnalysts,
          buy: s.tipranks.buy,
          hold: s.tipranks.hold,
          sell: s.tipranks.sell,
          upgraded: s.tipranks.actions.upgraded,
          downgraded: s.tipranks.actions.downgraded,
          beatRate: s.tipranksBeatRate,
          averageReturn: s.tipranks.averageReturn,
        }
      : null,
  }
}
