import { describe, it, expect } from 'vitest'
import { hasTrackRecordFor, trackRecordYears } from '../trackRecord'

/**
 * These cases are the live book as of 4 Nov 2026, because the finding they
 * encode was a misread of exactly this data: the 3 Yr / 5 Yr / 10 Yr columns
 * were filed as dead schema when the real cause is that no model is three
 * years old.
 */
const NOW = new Date('2026-11-04T12:00:00Z')

describe('hasTrackRecordFor', () => {
  it('reports the oldest portfolio as short of three years', () => {
    // ETF Conservative, the oldest of the 19, inception 2024-04-25 → 2.53 yrs.
    expect(hasTrackRecordFor('2024-04-25', 1, NOW)).toBe(true)
    expect(hasTrackRecordFor('2024-04-25', 3, NOW)).toBe(false)
    expect(hasTrackRecordFor('2024-04-25', 5, NOW)).toBe(false)
    expect(hasTrackRecordFor('2024-04-25', 10, NOW)).toBe(false)
  })

  it('reports the youngest portfolio as short of one year', () => {
    // Foundation Conservative, inception 2026-09-24 — its 1 Yr cell is blank
    // for the same reason, which is why the 1 Yr column is checked too.
    expect(hasTrackRecordFor('2026-09-24', 1, NOW)).toBe(false)
  })

  it('answers null when there is no inception date, rather than guessing', () => {
    // "Cannot tell" is a third answer. A false here would print "n/a" over a
    // genuinely missing figure; a true would print an em-dash over a period
    // the model never saw.
    expect(hasTrackRecordFor(null, 3, NOW)).toBeNull()
    expect(hasTrackRecordFor(undefined, 3, NOW)).toBeNull()
    expect(hasTrackRecordFor('', 3, NOW)).toBeNull()
    expect(hasTrackRecordFor('not-a-date', 3, NOW)).toBeNull()
  })

  it('is inclusive on the exact anniversary', () => {
    expect(hasTrackRecordFor('2023-11-04', 3, NOW)).toBe(true)
    expect(hasTrackRecordFor('2023-11-05', 3, NOW)).toBe(false)
  })

  it('does not shift a day in a negative-UTC-offset zone (gotcha 24)', () => {
    // The suite pins TZ=America/New_York precisely so this can fail. Read as a
    // local instant, 2023-11-04 becomes 2023-11-03T20:00-04:00 and the
    // anniversary case above flips.
    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0)
    expect(hasTrackRecordFor('2023-11-04', 3, NOW)).toBe(true)
  })

  it('accepts a full timestamp as well as a bare date', () => {
    expect(hasTrackRecordFor('2024-04-25T00:00:00Z', 3, NOW)).toBe(false)
  })
})

describe('trackRecordYears', () => {
  it('names the gap in the same terms the table footnote uses', () => {
    expect(trackRecordYears('2024-04-25', NOW)).toBeCloseTo(2.5, 1)
    expect(trackRecordYears('2026-09-24', NOW)).toBeCloseTo(0.1, 1)
  })

  it('is null when unknown and never negative', () => {
    expect(trackRecordYears(null, NOW)).toBeNull()
    expect(trackRecordYears('2030-01-01', NOW)).toBe(0)
  })
})
