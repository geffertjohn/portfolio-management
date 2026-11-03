import { describe, expect, it } from 'vitest'
import {
  EMPTY, consensusColor, fmtDecimalPct, fmtEstimate, fmtInt, fmtNum, fmtSignedPct,
  fmtText, fmtUsd, fmtUsdCompact, fmtUtcLongDate, stripTotalReturn, toLocalDateInputValue,
} from '../formatters'

/**
 * Formatting is where a correct figure becomes a wrong statement. The two date
 * helpers are the sharp cases — they exist because the same `timestamptz`
 * rendered the wrong way produced a review filed under tomorrow's date and a
 * sell timer that contradicted its own brief on the same screen.
 *
 * The zone is pinned in vitest.config.ts; in UTC neither bug can reproduce.
 */

describe('every formatter reports absence as absence', () => {
  it('never renders null, undefined or a non-finite number as a figure', () => {
    for (const f of [fmtDecimalPct, fmtNum, fmtInt, fmtUsd, fmtUsdCompact, fmtSignedPct]) {
      for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
        expect(f(v as number | null | undefined), `${f.name}(${String(v)})`).toBe(EMPTY)
      }
    }
    expect(fmtText(null)).toBe(EMPTY)
    expect(fmtText('   ')).toBe(EMPTY)
    expect(fmtUtcLongDate(null)).toBe(EMPTY)
    expect(fmtUtcLongDate('not a date')).toBe(EMPTY)
  })

  it('renders a real zero as zero, not as absent', () => {
    expect(fmtNum(0)).toBe('0.00')
    expect(fmtUsd(0)).toBe('$0.00')
    expect(fmtDecimalPct(0)).toBe('0.00%')
  })
})

describe('percentages', () => {
  it('reads a decimal-stored value as a percentage', () => {
    expect(fmtDecimalPct(0.0831)).toBe('8.31%')
    expect(fmtDecimalPct(-0.021)).toBe('-2.10%')
  })

  it('always signs a signed percentage, including zero', () => {
    expect(fmtSignedPct(0.0123)).toBe('+1.23%')
    expect(fmtSignedPct(-0.021)).toBe('-2.10%')
    expect(fmtSignedPct(0)).toBe('+0.00%')
  })
})

describe('fmtUsdCompact', () => {
  it('abbreviates at each tier', () => {
    expect(fmtUsdCompact(16_780_000_000)).toBe('$16.78B')
    expect(fmtUsdCompact(3_200_000_000_000)).toBe('$3.20T')
    expect(fmtUsdCompact(4_500_000)).toBe('$4.50M')
  })

  /**
   * Audit §11. Two components reimplement this and both drop to "M" too
   * early, so a $400k segment prints "$0.40M"; neither has the trillion tier,
   * so $3.2T prints "$3200.00B". The lib version below is the right answer,
   * and these are the assertions those two must satisfy once replaced.
   */
  it('falls through to plain dollars below a million', () => {
    expect(fmtUsdCompact(400_000)).toBe('$400,000.00')
    expect(fmtUsdCompact(999_999)).toBe('$999,999.00')
  })

  it('switches tier exactly at the boundary', () => {
    expect(fmtUsdCompact(1_000_000)).toBe('$1.00M')
    expect(fmtUsdCompact(999_999_999)).toBe('$1000.00M')
    expect(fmtUsdCompact(1_000_000_000)).toBe('$1.00B')
  })

  it('puts the sign outside the dollar symbol, once', () => {
    expect(fmtUsdCompact(-16_780_000_000)).toBe('-$16.78B')
  })
})

describe('dates — the two halves of one problem', () => {
  /**
   * Gotcha 24. `at_risk.removal_date` is a calendar day Postgres widened to UTC
   * midnight; read through a negative-offset zone it comes back a day early.
   * COIN's card said "expires February 10, 2027" against a row holding the 11th.
   */
  it('renders a stored calendar day as that day', () => {
    expect(fmtUtcLongDate('2027-02-11T00:00:00Z')).toBe('February 11, 2027')
    expect(fmtUtcLongDate('2027-02-11 00:00:00+00')).toBe('February 11, 2027')
  })

  it('would be wrong without it — the naive reading loses a day here', () => {
    // Proves the helper is doing work, and that this zone can reproduce the bug.
    expect(new Date('2027-02-11T00:00:00Z').toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })).toBe('February 10, 2027')
  })

  /**
   * The mirror: a review recorded at 20:00 ET was stamped with TOMORROW's date
   * by `toISOString().slice(0,10)`, and the fund path's date box is read-only,
   * so the advisor could not correct it.
   */
  it('stamps "the day the user did this" in the user\'s own day', () => {
    expect(toLocalDateInputValue(new Date('2026-09-14T20:00:00-04:00'))).toBe('2026-09-14')
    expect(new Date('2026-09-14T20:00:00-04:00').toISOString().slice(0, 10)).toBe('2026-09-15')
  })
})

describe('stripTotalReturn', () => {
  it('removes the qualifier and tidies the spacing', () => {
    expect(stripTotalReturn('Russell 1000 Growth Total Return')).toBe('Russell 1000 Growth')
    expect(stripTotalReturn('S&P 1500 Health Care (Sector) Total Return'))
      .toBe('S&P 1500 Health Care (Sector)')
  })

  it('leaves a name that never carried it alone', () => {
    expect(stripTotalReturn('Bloomberg US Aggregate')).toBe('Bloomberg US Aggregate')
    expect(stripTotalReturn(null)).toBe('')
  })
})

describe('consensusColor', () => {
  it('separates strong calls from ordinary ones', () => {
    expect(consensusColor('Strong Buy')).toBe('text-green-700')
    expect(consensusColor('Strong Sell')).toBe('text-red-700')
    expect(consensusColor('Buy')).toBe('text-green-600')
    expect(consensusColor('Sell')).toBe('text-red-600')
  })

  it('maps the grade vocabulary onto the same three colours', () => {
    for (const l of ['Overweight', 'Outperform', 'Accumulate', 'Moderate Buy']) {
      expect(consensusColor(l), l).toBe('text-green-600')
    }
    for (const l of ['Underweight', 'Underperform', 'Reduce']) {
      expect(consensusColor(l), l).toBe('text-red-600')
    }
    for (const l of ['Hold', 'Neutral', 'Market Perform', 'Equal Weight']) {
      expect(consensusColor(l), l).toBe('text-yellow-600')
    }
  })

  it('is case-insensitive and has a colour for nothing at all', () => {
    expect(consensusColor('strong buy')).toBe(consensusColor('STRONG BUY'))
    expect(consensusColor(null)).toBe('text-gray-500')
    expect(consensusColor('Something Else')).toBe('text-gray-700')
  })
})

describe('fmtEstimate', () => {
  it('renders each unit the briefs record, so three surfaces cannot disagree', () => {
    expect(fmtEstimate(0.321, 'pct')).toBe('32.10%')
    expect(fmtEstimate(16_780_000_000, 'usd_large')).toBe('$16.78B')
    expect(fmtEstimate(7.25, 'usd')).toBe('$7.25')
    expect(fmtEstimate(null, 'usd')).toBe(EMPTY)
  })
})
