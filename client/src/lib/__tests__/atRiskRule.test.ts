import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  MIN_REDS_TO_FLAG, STOCK_METRIC_BY_KEY, qualifiesForFlag, isMetricFailing,
  type AtRiskMetric,
} from '../atRisk'

/**
 * The at-risk flag rule, pinned across its two copies.
 *
 * Audit §19 called `qualifiesForFlag` dead code with a doc comment claiming to
 * be the single definition of a rule whose only live consumer is a job prompt
 * restating it in prose — and asked which copy is authoritative so the other
 * could be deleted. Neither can be: **a prompt cannot call TypeScript**, and
 * deleting the TypeScript would leave the rule with no machine-readable form at
 * all, while deleting the prose would stop the job working.
 *
 * So both stay and this holds them together. `at-risk-review/SKILL.md` step 4
 * is what actually runs; `qualifiesForFlag` is what the app would use to
 * explain a flag. If the threshold moves in one, the build fails.
 *
 * The prompt is read from the repo copy, which is the right one: `run-job.sh`
 * resolves prompts with `git show main:…`, so what CI sees on a branch is what
 * the jobs will run once it merges.
 */

const PROMPT = readFileSync(
  join(__dirname, '../../../../.claude/scheduled-tasks/at-risk-review/SKILL.md'),
  'utf8',
)

/**
 * A reading built the way the job writes one. `gradeAtRiskMetric` reads
 * `currentValue ?? flaggedValue` against the comparator pair its `basis`
 * selects, so a fixture that omits `basis` grades nothing.
 */
function reading(key: string, failing: boolean): AtRiskMetric {
  const def = STOCK_METRIC_BY_KEY.get(key)
  if (!def) throw new Error(`not a stock at-risk metric: ${key}`)
  return {
    key,
    label: def.label,
    basis: def.basis,
    higherIsBetter: def.higherIsBetter,
    // Red beats neither comparator; green beats both.
    flaggedValue: failing ? 1 : 9,
    flaggedBenchmark: 5,
    flaggedBenchmark2: 5,
    currentValue: null,
    currentBenchmark: null,
    currentBenchmark2: null,
    measuredAt: null,
  }
}
const red = (key: string) => reading(key, true)
const green = (key: string) => reading(key, false)

const GROWTH = ['revenue_growth_ttm', 'eps_growth_ttm', 'revenue_growth_3y', 'eps_growth_3y']
const MARGINS = ['operating_margin_ttm', 'fcf_margin_ttm']

describe('the prompt is readable and still states the rule', () => {
  it('found the prompt', () => {
    // Without this, a moved prompt would make every assertion below vacuous.
    expect(PROMPT.length).toBeGreaterThan(1000)
    expect(PROMPT).toContain('FLAG the newly deteriorated')
  })
})

describe('qualifiesForFlag agrees with the job prompt', () => {
  it('states the same red count', () => {
    // Prompt: "3 or more red metrics AND at least one of those reds is a MARGIN metric"
    const m = PROMPT.match(/(\d+) or more red metrics/)
    expect(m, 'the prompt no longer states a red count in the expected form').not.toBeNull()
    expect(Number(m![1])).toBe(MIN_REDS_TO_FLAG)
  })

  it('states the same margin requirement, and names both margin metrics', () => {
    expect(PROMPT).toMatch(/at least one of those reds is a MARGIN metric/i)
    for (const key of MARGINS) expect(PROMPT, key).toContain(key)
  })
})

describe('the fixtures grade the way the app does', () => {
  it('builds a red that is red and a green that is green', () => {
    // Otherwise every "does not flag" assertion below passes for the wrong reason.
    for (const k of [...GROWTH, ...MARGINS]) {
      expect(isMetricFailing(red(k)), `${k} red`).toBe(true)
      expect(isMetricFailing(green(k)), `${k} green`).toBe(false)
    }
  })
})

describe('the rule itself', () => {
  it('needs the count AND a margin red', () => {
    // Three growth reds is slower-than-market, not deterioration — the 29 Oct
    // 2026 case that excluded AAPL, MSI and UBER.
    expect(qualifiesForFlag([...GROWTH.slice(0, 3).map(red), ...MARGINS.map(green)])).toBe(false)
    // Two reds including a margin still misses the count.
    expect(qualifiesForFlag([red('operating_margin_ttm'), red(GROWTH[0]), ...GROWTH.slice(1).map(green)])).toBe(false)
    // Three reds, one of them a margin — MSFT on FCF margin.
    expect(qualifiesForFlag([red('fcf_margin_ttm'), red(GROWTH[0]), red(GROWTH[1]), green(GROWTH[2])])).toBe(true)
  })

  it('does not flag a clean name', () => {
    expect(qualifiesForFlag([...GROWTH.map(green), ...MARGINS.map(green)])).toBe(false)
    expect(qualifiesForFlag([])).toBe(false)
  })
})
