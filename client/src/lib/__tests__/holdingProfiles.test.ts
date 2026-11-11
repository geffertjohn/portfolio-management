/**
 * Which holding symbols are askable, and how they are spelled to FMP.
 *
 * Every fixture is a real symbol from the Hybrid Balanced book's funds on
 * 11 Nov 2026. The classifier decides what is worth an API call and what
 * would be a wrong answer if it matched; the normaliser is the difference
 * between 212 and 214 hits out of 216.
 */
import { describe, it, expect } from 'vitest'
import { isCusipLike, isCashLike, isProfileable, fmpQuerySymbol } from '../holdingProfiles'

describe('a bond line is not askable', () => {
  it.each([
    ['912810QD3', 'Treasury'],
    ['91282CMM0', 'Treasury note'],
    ['01F0306A1', 'TBA pool'],
    ['060505FL3', 'corporate'],
    ['05330NK16', 'agency'],
    ['02090DAE8', 'corporate'],
  ])('%s (%s) is a CUSIP', (sym) => {
    expect(isCusipLike(sym)).toBe(true)
    expect(isProfileable(sym)).toBe(false)
  })

  it.each(['NVDA', 'BRK.B', 'TSMWF', 'ABX.TO', 'KVUE:DL', 'V', 'T'])(
    'does not mistake the ticker %s for a CUSIP', (sym) => {
      expect(isCusipLike(sym)).toBe(false)
    })

  it('keys on the leading DIGIT, not merely on length', () => {
    // No equity ticker in this book starts with a digit, and every CUSIP
    // does. A pure length test would catch a nine-letter ticker too.
    expect(isCusipLike('ABCDEFGHI')).toBe(false)
    expect(isCusipLike('912810QD3')).toBe(true)
  })
})

describe('a cash sweep is not a company', () => {
  it.each(['USD Cash', 'CNH Cash', 'OMR Cash', 'M:FGUXX', 'M:GVMXX'])(
    '%s is cash-like and never asked about', (sym) => {
      expect(isCashLike(sym)).toBe(true)
      expect(isProfileable(sym)).toBe(false)
    })

  it('matters because a stray match would file cash as an exposure', () => {
    // "Fidelity Cash Central Fund" surfaced as 1.18% of Hybrid Balanced and
    // had to be discounted by hand; the committee prompt now warns about it.
    expect(isProfileable('Fidelity Cash Central Fund')).toBe(false)
  })
})

describe('how a symbol is spelled to FMP', () => {
  it('drops the YCharts dual-listing marker', () => {
    // KVUE:DL is Kenvue and resolves the moment the suffix goes.
    expect(fmpQuerySymbol('KVUE:DL')).toBe('KVUE')
  })

  it('converts a share-class dot to a hyphen', () => {
    // The documented BRK.B / BRK-B trap.
    expect(fmpQuerySymbol('BRK.B')).toBe('BRK-B')
  })

  it('LEAVES an exchange suffix alone — the case fmpSymbol() would break', () => {
    // A blanket dot-to-hyphen would turn these into symbols FMP does not
    // have. One letter after the dot is a share class; two or more is an
    // exchange. This is why the module does not call fmpSymbol().
    expect(fmpQuerySymbol('ABX.TO')).toBe('ABX.TO')
    expect(fmpQuerySymbol('L.TO')).toBe('L.TO')
  })

  it.each(['NVDA', 'AAPL', 'TSMWF', 'SSNLF', 'RHHVF'])('leaves %s untouched', (sym) => {
    expect(fmpQuerySymbol(sym)).toBe(sym)
  })
})

describe('what stays askable', () => {
  it.each(['NVDA', 'BRK.B', 'TSMWF', 'SSNLF', 'ABX.TO', 'KVUE:DL', 'ACA:DL', 'TPL'])(
    '%s is worth a call', (sym) => {
      expect(isProfileable(sym)).toBe(true)
    })
})
