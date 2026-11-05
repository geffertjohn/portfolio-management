import { describe, it, expect } from 'vitest'
import { attributionWindowsFor } from '../portfolioReviews'
import {
  attributionWindowStart, storedReturnFor, ATTRIBUTION_WINDOW_LABELS,
  type AttributionWindow,
} from '../portfolioPerformance'
import type { StoredSecurityReturns } from '../securities'

/**
 * Which trailing windows an attribution section shows, and what each one
 * actually spans.
 *
 * A fund book has no monthly review at all, so its ANNUAL is the review
 * sitting furthest from the last look at the numbers — ranking a year of
 * decisions against a thirty-day window measures noise, since a bond sleeve's
 * month says nothing about whether holding it for the year was right.
 */

describe('which windows a review shows', () => {
  it('gives a FUND annual the long horizons', () => {
    expect(attributionWindowsFor('annual', 'Foundation')).toEqual(['3m', 'ytd', '1y'])
    expect(attributionWindowsFor('annual', null)).toEqual(['3m', 'ytd', '1y'])
  })

  it('leaves a fund QUARTERLY on the short pair', () => {
    // Scoped to the annual deliberately — a quarterly reading 1M/3M is coherent.
    expect(attributionWindowsFor('quarterly', 'Foundation')).toEqual(['1m', '3m'])
  })

  it('leaves every EQUITY review on the short pair', () => {
    // An Equity monthly is a thirty-day check by definition, and the quarterly
    // or annual that absorbs it inherits that job (see `advanceSchedule`).
    expect(attributionWindowsFor('monthly', 'Equity')).toEqual(['1m', '3m'])
    expect(attributionWindowsFor('quarterly', 'Equity')).toEqual(['1m', '3m'])
    expect(attributionWindowsFor('annual', 'Equity')).toEqual(['1m', '3m'])
  })

  it('labels every window it can return', () => {
    // An unlabelled window renders a blank heading over a table of numbers.
    const all: AttributionWindow[] = ['1m', '3m', 'ytd', '1y']
    for (const w of all) expect(ATTRIBUTION_WINDOW_LABELS[w], w).toBeTruthy()
  })
})

describe('what each window spans', () => {
  // A date late in the year, where YTD and a rolling 1Y are far apart.
  const NOV = new Date('2026-11-05T12:00:00Z')

  it('anchors YTD on 1 JANUARY, not on a day count', () => {
    // The whole reason the window is a name rather than a number: YTD is 309
    // days here and 5 days on 5 January, and the YCharts column behind it is a
    // calendar figure. A day count would be wrong on every date but one.
    expect(attributionWindowStart('ytd', NOV).toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(attributionWindowStart('ytd', new Date('2026-01-05T12:00:00Z'))
      .toISOString().slice(0, 10)).toBe('2026-01-01')
  })

  it('steps a full calendar year back for 1Y, not 365 days', () => {
    expect(attributionWindowStart('1y', NOV).toISOString().slice(0, 10)).toBe('2025-11-05')
  })

  it('keeps 1Y and YTD apart late in the year', () => {
    // If these collapsed onto one date the annual review would show the same
    // ranking twice under two headings.
    expect(attributionWindowStart('1y', NOV).toISOString())
      .not.toBe(attributionWindowStart('ytd', NOV).toISOString())
  })

  it('steps back the short windows by their day counts', () => {
    expect(attributionWindowStart('1m', NOV).toISOString().slice(0, 10)).toBe('2026-10-06')
    expect(attributionWindowStart('3m', NOV).toISOString().slice(0, 10)).toBe('2026-08-07')
  })

  it('never returns a start that is not in the past', () => {
    for (const w of ['1m', '3m', 'ytd', '1y'] as AttributionWindow[]) {
      expect(attributionWindowStart(w, NOV).getTime(), w).toBeLessThan(NOV.getTime())
    }
  })

  it('does not mutate the date it is given', () => {
    const d = new Date('2026-11-05T12:00:00Z')
    attributionWindowStart('1y', d)
    expect(d.toISOString()).toBe('2026-11-05T12:00:00.000Z')
  })
})

describe('which stored column each window reads', () => {
  /**
   * The one place a window can silently read the wrong figure, and the failure
   * is invisible: YTD pointed at the three-month column renders two identical
   * rankings under two headings, which reads as a coincidence, not a bug.
   *
   * Values are VBILX on the live book, where every window differs in sign or
   * magnitude — so a mis-mapping cannot pass by luck.
   */
  const vbilx: StoredSecurityReturns = {
    securityId: 'VBILX', name: 'Vanguard Interm-Term Bond Index Adm',
    numericId: 1, isFund: true,
    oneMonth: 0.02737, threeMonth: -0.007121, ytd: -0.0105, oneYear: -0.005054,
    updatedAt: '2026-11-05T15:00:00Z',
  }

  it('reads each window from its own column', () => {
    expect(storedReturnFor(vbilx, '1m')).toBe(0.02737)
    expect(storedReturnFor(vbilx, '3m')).toBe(-0.007121)
    expect(storedReturnFor(vbilx, 'ytd')).toBe(-0.0105)
    expect(storedReturnFor(vbilx, '1y')).toBe(-0.005054)
  })

  it('gives four DISTINCT figures across the four windows', () => {
    const all = (['1m', '3m', 'ytd', '1y'] as AttributionWindow[]).map((w) => storedReturnFor(vbilx, w))
    expect(new Set(all).size).toBe(4)
  })

  it('reports a missing figure as null rather than falling back', () => {
    // An unpriced holding keeps its weight and is accounted for; substituting a
    // different window's number would rank it against the others as if the two
    // measured the same thing.
    expect(storedReturnFor({ ...vbilx, ytd: null }, 'ytd')).toBeNull()
    expect(storedReturnFor({ ...vbilx, oneYear: null }, '1y')).toBeNull()
  })
})
