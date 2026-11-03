import { describe, expect, it } from 'vitest'
import { rankQuartileColor, scorecardColor } from '../scorecardColor'

/**
 * Three states, not two. The At-Risk job clears a flag on amber, so a rule that
 * collapsed amber into red would make a flag nobody can escape — and a flag
 * nobody can escape stops being information.
 */

describe('scorecardColor — two comparators', () => {
  const both = { benchmark: 10, benchmark2: 12, higherIsBetter: true }

  it('is green only when it beats BOTH', () => {
    expect(scorecardColor({ ...both, value: 13 })).toBe('green')
  })

  it('is red only when it beats NEITHER', () => {
    expect(scorecardColor({ ...both, value: 9 })).toBe('red')
  })

  it('is amber when it beats exactly one — either one', () => {
    expect(scorecardColor({ ...both, value: 11 })).toBe('yellow')
    expect(scorecardColor({ benchmark: 12, benchmark2: 10, higherIsBetter: true, value: 11 }))
      .toBe('yellow')
  })

  it('treats a tie as beating the comparator', () => {
    expect(scorecardColor({ ...both, value: 12 })).toBe('green')
  })

  it('inverts the whole comparison when lower is better', () => {
    const lower = { benchmark: 10, benchmark2: 12, higherIsBetter: false }
    expect(scorecardColor({ ...lower, value: 9 })).toBe('green')
    expect(scorecardColor({ ...lower, value: 13 })).toBe('red')
    expect(scorecardColor({ ...lower, value: 11 })).toBe('yellow')
  })
})

describe('scorecardColor — fewer comparators', () => {
  it('grades against whichever single comparator is present', () => {
    expect(scorecardColor({ value: 11, benchmark: 10, higherIsBetter: true })).toBe('green')
    expect(scorecardColor({ value: 9, benchmark2: 10, higherIsBetter: true })).toBe('red')
  })

  it('falls back to neutral only when neither comparator exists', () => {
    expect(scorecardColor({ value: 1, neutral: 0, higherIsBetter: true })).toBe('green')
    expect(scorecardColor({ value: -1, neutral: 0, higherIsBetter: true })).toBe('red')
  })

  it('never colours a missing or non-finite value', () => {
    for (const value of [null, undefined, NaN, Infinity]) {
      expect(scorecardColor({ value, benchmark: 10, higherIsBetter: true })).toBe('none')
    }
  })
})

describe('scorecardColor — a peer rank overrides the comparators', () => {
  it('ignores a benchmark that would say otherwise', () => {
    // Value loses to both comparators, but a top-quartile rank already
    // expresses the whole comparison, so it wins.
    expect(scorecardColor({
      value: 1, benchmark: 10, benchmark2: 12, higherIsBetter: true, rankPct: 0.1,
    })).toBe('green')
  })

  it('does not treat a non-finite rank as a rank', () => {
    expect(scorecardColor({ value: 13, benchmark: 10, higherIsBetter: true, rankPct: NaN }))
      .toBe('green')
  })
})

describe('rankQuartileColor', () => {
  it('splits at the quartile boundaries, lower being better', () => {
    expect(rankQuartileColor(0)).toBe('green')
    expect(rankQuartileColor(0.249)).toBe('green')
    expect(rankQuartileColor(0.25)).toBe('yellow')
    expect(rankQuartileColor(0.499)).toBe('yellow')
    expect(rankQuartileColor(0.5)).toBe('red')
    expect(rankQuartileColor(1)).toBe('red')
  })
})
