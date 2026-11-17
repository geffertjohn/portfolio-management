import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ychartsCodes.test.ts — THE SHEET HEADER MUST BE A REAL YCHARTS CODE.
 *
 * The header in the YCharts workbook does TWO jobs: it is the metric code
 * `YCP()`/`YCI()` reads AND the DB column name the importers map to. Only the
 * second job was ever checked — `tsc` catches a column that does not exist,
 * nothing caught a code that does not exist — so three columns shipped fetching
 * an undocumented string:
 *
 *  - `over_30_years_maturity_bond_exposure` and `effective_maturity` are the
 *    metrics' DISPLAY NAMES, not codes. Both returned a figure for most funds
 *    and nothing for a few, which is the worst possible failure shape: PYTRX
 *    stored 11.94% beyond 30 years against 4.60% on the vendor's own page, and
 *    DHRIX — the fund whose maturity profile the Nov 2026 Hybrid Balanced
 *    review most needed — came back null. The seven maturity buckets summed to
 *    between 97.9% and 109.3% across funds for months.
 *  - `maturity_other_generic`, the vendor's explicit residual bucket, was never
 *    requested at all, so the ladder could not have closed even with the right
 *    code.
 *
 * This reads the vocabulary lifted from the add-in reference workbook by
 * `scripts/refresh/extract-ycharts-codes.ts`, the same way `schemaContract`
 * reads `supabase/schema.sql` — offline, no credentials, no Excel.
 *
 * IT IS NOT A SUBSTITUTE FOR RUNNING THE SHEET. A documented code can still
 * return `ERR: NO DATA` for a given fund, and the vocabulary is a snapshot that
 * ages. What it closes is the one failure this repo kept repeating: a string
 * nobody could have fetched anything meaningful with, shipped because it looked
 * like the others.
 */

const REPO = resolve(__dirname, '../../../..')

function readLines(rel: string): string[] {
  return readFileSync(resolve(REPO, rel), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
}

/** code → the tabs it appears on (`mf-m`, `etf-i`, `mp-m`, …). */
const VOCAB: Map<string, Set<string>> = (() => {
  const out = new Map<string, Set<string>>()
  for (const line of readLines('scripts/refresh/ycharts-codes.txt')) {
    const [code, flags = ''] = line.split('\t')
    out.set(code, new Set(flags.split(' ').filter(Boolean)))
  }
  return out
})()

/**
 * UNDOCUMENTED CODES THAT WORK, and every one is a `_generic` suffix we add or
 * drop relative to the documented spelling — in BOTH directions, which is why
 * no rule of thumb replaces checking.
 *
 * These are populated on the live book, so the vendor honours them as aliases.
 * That is not the same as a contract: an alias can return the right figure, a
 * different one, or nothing, per fund, and nothing says which. Two members of
 * this class already failed that way. They are listed rather than exempted
 * wholesale so each repointing is one line of a PR diff, and the test below
 * REFUSES an entry that has become documented — an alias list that cannot
 * shrink is how a stopgap becomes permanent.
 */
const KNOWN_ALIASES: Record<string, string> = {
  // `investment_grade_bond_allocation_generic` WAS HERE and was repointed to
  // `investment_grade_bond_allocation_morn` on 17 Nov 2026 — the first entry
  // taken off this list, and the proof that it is meant to shrink. It went
  // first because its per-fund values had no coherent denominator; the `_morn`
  // family turned out to be Morningstar ALLOCATIONS (a share of assets) where
  // the `*_exposure` family is a share of its sleeve, which is very likely why.
  // Documented: `aaa_bond_exposure`. Carried on the Securities sheet since
  // before the reference was checked; deliberately not "corrected", because
  // repointing a populated column buys nothing on its own.
  aaa_bond_exposure_generic: 'aaa_bond_exposure',
  // Documented: `consumer_defensive_exposure` — this one ADDS the suffix.
  consumer_defensive_exposure_generic: 'consumer_defensive_exposure',
  // These three DROP it.
  energy_exposure: 'energy_exposure_generic',
  industrials_exposure: 'industrials_exposure_generic',
  real_estate_exposure: 'real_estate_exposure_generic',
  // Documented: `government_fixed_income_exposure`. Note the neighbouring
  // `government_bond_exposure_generic` is a DIFFERENT family — the bond_exposure
  // family is credit ratings and countries, the fixed_income_exposure family is
  // the Morningstar sector breakdown. Taking government from the first returns
  // 0 on every bond fund.
  government_fixed_income_exposure_generic: 'government_fixed_income_exposure',
  municipal_fixed_income_exposure_generic: 'municipal_fixed_income_exposure',
  securitized_fixed_income_exposure_generic: 'securitized_fixed_income_exposure',
  small_cap_exposure: 'latest_percent_market_cap_small_generic (or a stylebox code)',
  united_states_region_total_exposure_generic: 'united_states_total_exposure',
}

describe('every code we request is a real YCharts code', () => {
  /**
   * ONE SHEET SERVES BOTH mutual funds AND ETFs, so a code present for only one
   * of them errors on every row of the other type. The intersection is the
   * requirement, not the union — and it is only checkable because the extractor
   * records membership per tab.
   */
  it('fund composition codes exist on BOTH the Mutual Fund and ETF Metrics tabs', () => {
    const bad: string[] = []
    for (const code of readLines('scripts/refresh/fund-composition-codes.txt')) {
      if (code in KNOWN_ALIASES) continue
      const tabs = VOCAB.get(code)
      if (!tabs || !tabs.has('mf-m') || !tabs.has('etf-m')) {
        bad.push(`${code} → ${tabs ? [...tabs].join(' ') : 'NOT A CODE'}`)
      }
    }
    expect(bad, 'not valid Metrics codes for both fund types').toEqual([])
  })

  /**
   * METRICS AND INFO ARE NOT INTERCHANGEABLE: a code from an `| Info` tab
   * returns ERR under `YCP` and vice versa, and the Securities sheet carries
   * both families side by side (C..N are `YCI`, O rightward `YCP`). Checking
   * the families separately is what makes that mistake visible.
   */
  it('fund info codes exist on BOTH the Mutual Fund and ETF Info tabs', () => {
    const bad: string[] = []
    for (const code of readLines('scripts/refresh/fund-info-codes.txt')) {
      if (code in KNOWN_ALIASES) continue
      const tabs = VOCAB.get(code)
      if (!tabs || !tabs.has('mf-i') || !tabs.has('etf-i')) {
        bad.push(`${code} → ${tabs ? [...tabs].join(' ') : 'NOT A CODE'}`)
      }
    }
    expect(bad, 'not valid Info codes for both fund types').toEqual([])
  })

  /**
   * The benchmark sheets fetch composition against the row's ETF PROXY, because
   * YCharts computes no holdings for a total-return index — every composition
   * metric returns ERR: INVALID CALC on one, proven across all 42 category
   * rows. So an ETF or model-portfolio Metrics code is the requirement here.
   */
  it('benchmark composition codes are ETF or model-portfolio Metrics codes', () => {
    const bad: string[] = []
    for (const code of readLines('scripts/refresh/benchmark-composition-codes.txt')) {
      if (code in KNOWN_ALIASES) continue
      const tabs = VOCAB.get(code)
      if (!tabs || !(tabs.has('etf-m') || tabs.has('mp-m'))) {
        bad.push(`${code} → ${tabs ? [...tabs].join(' ') : 'NOT A CODE'}`)
      }
    }
    expect(bad, 'not valid Metrics codes for a benchmark row').toEqual([])
  })

  /**
   * The two that shipped broken. Pinned by name so neither can come back by
   * someone reaching for the display name again — which is the natural thing to
   * do, since the reference prints it in the cell next door.
   */
  it('rejects the display names that were mistaken for codes', () => {
    for (const displayName of ['over_30_years_maturity_bond_exposure', 'effective_maturity']) {
      expect(VOCAB.has(displayName), `${displayName} is a display name, not a code`).toBe(false)
    }
    // And the codes that replaced them are real, for both fund types.
    for (const code of ['maturity_greater_than_30_years_generic', 'effective_maturity_generic',
                        'maturity_other_generic', 'duration_generic']) {
      const tabs = VOCAB.get(code)
      expect(tabs?.has('mf-m') && tabs?.has('etf-m'), `${code} should be a Metrics code`).toBe(true)
    }
  })

  /**
   * THE ALIAS LIST MUST BE ABLE TO SHRINK. If one of these turns out to be
   * documented after all — an add-in update, or a mistake in reading the
   * reference — the entry is no longer an exception and leaving it would exempt
   * a code that needs no exemption. Same reasoning as `REVIEW_AMNESTY` being
   * pinned to a cutoff: a list of deliberate exceptions is only safe while it
   * cannot quietly grow or rot.
   */
  it('no entry in KNOWN_ALIASES is actually documented', () => {
    const stale = Object.keys(KNOWN_ALIASES).filter((c) => VOCAB.has(c))
    expect(stale, 'documented now — remove from KNOWN_ALIASES and repoint the sheet').toEqual([])
  })

  /** Each alias names the documented code to repoint to, or the list is a to-do with no target. */
  it('every alias names its documented replacement', () => {
    for (const [alias, documented] of Object.entries(KNOWN_ALIASES)) {
      expect(documented.length, `${alias} has no replacement named`).toBeGreaterThan(3)
    }
  })

  /**
   * A vocabulary that silently shrank — a renamed tab, a changed reference
   * layout — would turn every assertion above into a rubber stamp by making
   * every code "undocumented" and therefore... still failing. The real risk is
   * the opposite: an extract that captured display names as codes would make
   * everything pass. Both are caught by pinning the shape.
   */
  it('the vocabulary looks like a vocabulary', () => {
    expect(VOCAB.size).toBeGreaterThan(2000)
    // Display names contain spaces and capitals; codes must not.
    for (const code of VOCAB.keys()) expect(code).toMatch(/^[a-z0-9_]+$/)
    // All six tabs contributed.
    const flags = new Set([...VOCAB.values()].flatMap((s) => [...s]))
    expect([...flags].sort()).toEqual(['etf-i', 'etf-m', 'mf-i', 'mf-m', 'mp-i', 'mp-m'])
  })
})
