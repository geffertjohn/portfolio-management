import { describe, it, expect } from 'vitest'
import {
  parseStrategicAllocationPdfText, StrategicAllocationParseError,
  diffVintages, bandTotal, STRATEGIC_PROFILES,
  type ProfileWeights,
} from '../strategicAllocation'
import { ASSET_CLASS_ROWS } from '../modelPortfolios'

/**
 * The fixture is the REAL extracted text of page 1 of "Strategic Asset
 * Allocation Models January 2026", byte for byte — including the two things
 * that break a naive parse: row labels that wrap mid-phrase, and the
 * letter-spaced "AL TERNATIVE" that appears in both banded rows.
 */
const JANUARY_2026 = `JANUARY 2026
CURRENT POSITIONING CONSERVATIVE MODERATE
CONSERVATIVE
MODERATE MODERATE GROWTH GROWTH
EQUITY 30% 48% 65% 80% 98%
US Large Cap Blend 21% 23% 26% 33% 47%
US Large Cap Growth 0% 3% 7% 9% 8%
US Large Cap Value 0% 3% 7% 9% 8%
US Mid Cap Equity 4% 6% 8% 10% 12%
US Small Cap Equity 0% 2% 4% 5% 6%
Non-US Developed Market Equity 5% 11% 9% 10% 12%
Emerging Market Equity 0% 0% 4% 4% 5%
FIXED INCOME 68% 50% 33% 18% 0%
Investment Grade Intermediate Maturity
Fixed Income 58% 41% 29% 18% 0%
Investment Grade Short Maturity Fixed
Income 0% 0% 0% 0% 0%
Non-Investment Grade Fixed Income 7% 6% 4% 0% 0%
Non-US Fixed Income 3% 3% 0% 0% 0%
Multi-Sector Fixed Income 0% 0% 0% 0% 0%
AL TERNATIVE INVESTMENTS/MANAGED
FUTURES 0% 0% 0% 0% 0%
CASH & CASH AL TERNATIVES 2% 2% 2% 2% 2%
Strategic Asset Allocation Models`

/** October 2026, from the published document — the vintage the models track. */
const OCTOBER_2026 = JANUARY_2026
  .replace('JANUARY 2026', 'OCTOBER 2026')
  .replace('US Large Cap Blend 21% 23% 26% 33% 47%', 'US Large Cap Blend 21% 23% 26% 33% 43%')
  .replace('US Large Cap Growth 0% 3% 7% 9% 8%', 'US Large Cap Growth 0% 3% 7% 9% 10%')
  .replace('US Large Cap Value 0% 3% 7% 9% 8%', 'US Large Cap Value 0% 3% 7% 9% 10%')
  .replace('Non-US Fixed Income 3% 3% 0% 0% 0%', 'Non-US Fixed Income 0% 0% 0% 0% 0%')
  .replace('Multi-Sector Fixed Income 0% 0% 0% 0% 0%', 'Multi-Sector Fixed Income 3% 3% 0% 0% 0%')

describe('parsing the published document', () => {
  it('reads the month from the header, not the upload date', () => {
    const v = parseStrategicAllocationPdfText(JANUARY_2026)
    expect(v.effectiveMonth).toBe('2026-01-01')
    expect(v.label).toBe('January 2026')
  })

  it('reads all fourteen rows across all five profiles', () => {
    const v = parseStrategicAllocationPdfText(JANUARY_2026)
    for (const profile of STRATEGIC_PROFILES) {
      expect(Object.keys(v.weights[profile]), profile).toHaveLength(ASSET_CLASS_ROWS.length)
    }
    expect(v.weights.conservative.large_cap_blend).toBe(21)
    expect(v.weights.growth.large_cap_blend).toBe(47)
    expect(v.weights.moderate.emerging_market).toBe(4)
    expect(v.weights.conservative.cash).toBe(2)
  })

  it('reads a label that wrapped mid-phrase in the extracted text', () => {
    // "Investment Grade Intermediate Maturity \nFixed Income" — the line break
    // falls inside the label, so an exact-string match finds nothing.
    const v = parseStrategicAllocationPdfText(JANUARY_2026)
    expect(v.weights.conservative.ig_intermediate_fixed_income).toBe(58)
    expect(v.weights.conservative.ig_short_fixed_income).toBe(0)
  })

  it('reads the letter-spaced "AL TERNATIVE" rows', () => {
    // A real space sits inside the word in both the band row and the cash row.
    // Without the fix-up neither is found, and the parse loses 2% of cash on
    // every profile while still totalling plausibly.
    const v = parseStrategicAllocationPdfText(JANUARY_2026)
    expect(v.weights.growth.alternatives).toBe(0)
    expect(v.weights.growth.cash).toBe(2)
  })

  it('checks the rows against the printed band totals and reaches 100%', () => {
    const v = parseStrategicAllocationPdfText(JANUARY_2026)
    expect(v.warnings).toEqual([])
    expect(bandTotal(v.weights, 'conservative', 'equity')).toBe(30)
    expect(bandTotal(v.weights, 'conservative', 'fixed_income')).toBe(68)
    expect(bandTotal(v.weights, 'growth', 'equity')).toBe(98)
  })

  it('warns when a row disagrees with the band total printed above it', () => {
    // The document is the authority on both; if they disagree, the parse is
    // wrong or the document is, and either way nobody should write it silently.
    const tampered = JANUARY_2026.replace('US Mid Cap Equity 4%', 'US Mid Cap Equity 9%')
    const v = parseStrategicAllocationPdfText(tampered)
    expect(v.warnings.join(' ')).toMatch(/Conservative: equity rows total 35% against a printed 30%/)
  })

  it('refuses a partial parse rather than writing some of a model set', () => {
    const missingRow = JANUARY_2026.replace(/Emerging Market Equity 0% 0% 4% 4% 5%\n/, '')
    expect(() => parseStrategicAllocationPdfText(missingRow))
      .toThrow(/1 of 14 rows could not be read/)
  })

  it('refuses a document that is not this document', () => {
    expect(() => parseStrategicAllocationPdfText('OCTOBER 2026\nSome other report entirely.'))
      .toThrow(StrategicAllocationParseError)
    expect(() => parseStrategicAllocationPdfText('a document with no month in it'))
      .toThrow(/No month and year found/)
  })

  it('is not confused by the definitions pages naming the same asset classes', () => {
    // Page 2 says "US Mid Cap Equity: Russell Midcap Index: …". The row pattern
    // requires five percentages, so it cannot match prose.
    const withDefs = `${JANUARY_2026}
ASSET CLASS DEFINITIONS
US Mid Cap Equity: Russell Midcap Index: A subset of the Russell 1000 index.
US Small Cap Equity: Russell 2000 Index: measures the small-cap segment.`
    const v = parseStrategicAllocationPdfText(withDefs)
    expect(v.weights.conservative.us_mid_cap).toBe(4)
  })
})

describe('diffing one vintage against the one before it', () => {
  const jan = parseStrategicAllocationPdfText(JANUARY_2026).weights
  const oct = parseStrategicAllocationPdfText(OCTOBER_2026).weights

  it('reports the real January → October moves and nothing else', () => {
    const changes = diffVintages(jan, oct)
    const described = changes
      .map((c) => `${c.profile}/${c.assetClassKey} ${c.from}→${c.to}`)
      .sort()
    expect(described).toEqual([
      'conservative/multi_sector_fixed_income 0→3',
      'conservative/non_us_fixed_income 3→0',
      'growth/large_cap_blend 47→43',
      'growth/large_cap_growth 8→10',
      'growth/large_cap_value 8→10',
      'moderate_conservative/multi_sector_fixed_income 0→3',
      'moderate_conservative/non_us_fixed_income 3→0',
    ])
  })

  it('reports nothing for an unchanged document', () => {
    expect(diffVintages(jan, jan)).toEqual([])
  })

  it('reports nothing when there is no previous vintage', () => {
    // The first upload has nothing to compare against, and inventing a
    // baseline of zeros would report all seventy rows as changes.
    expect(diffVintages(null, oct)).toEqual([])
  })

  it('does not report a float round-trip as a change', () => {
    // numeric() comes back from Postgres as 4.0000000001 often enough.
    const noisy = JSON.parse(JSON.stringify(jan)) as ProfileWeights
    noisy.conservative.us_mid_cap = 4.0000001
    expect(diffVintages(jan, noisy)).toEqual([])
  })

  it('distinguishes a row absent from a document from one published at zero', () => {
    const partial = JSON.parse(JSON.stringify(jan)) as ProfileWeights
    delete partial.conservative.emerging_market
    const changes = diffVintages(partial, jan)
    expect(changes).toHaveLength(1)
    expect(changes[0].from).toBeNull()
    expect(changes[0].to).toBe(0)
  })
})
