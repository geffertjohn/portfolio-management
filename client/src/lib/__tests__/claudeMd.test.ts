import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CLAUDE.md loads into EVERY session, so a wrong line does not sit there
 * harmlessly — it actively misleads, and the reader has no reason to doubt it.
 *
 * Audit §23 found seven wrong claims. Three were the same kind: the document
 * named a file that had been deleted (`AllocationComparison.tsx` described as
 * "left in place"; `FundReturnTable` named as a live consumer twice). That kind
 * is mechanically checkable, so it is checked here rather than trusted.
 *
 * The rest of §23 — a schedule two times out of date, a hub pointing at the
 * wrong page, a localStorage key that never existed — is not reachable from a
 * test. The lesson recorded alongside the fix is to stop DUPLICATING a fact
 * that lives somewhere authoritative, which is why the job schedule is now a
 * pointer to `scripts/scheduled-jobs/README.md` instead of a second copy.
 *
 * A second sweep (4 Nov 2026) found three more, and NONE of them was a file
 * name — the class already guarded here. Two were EXPORTED IDENTIFIERS that
 * outlived their code (`fetchBenchmarkAll`, deleted hours earlier in the same
 * session; `RebalancingPanel` + its `modelDriftPct` prop, deleted months
 * earlier in `95f041c`, in a bullet that also stated a resolution chain the
 * code no longer followed). The third was a COUNT: "147 tests over 11
 * modules", by then 320 over 26.
 *
 * So both classes are checked below. The count is handled the way the schedule
 * was — the document keeps the module count, which a test can verify exactly,
 * and points at `npm run test` for the case count, which it cannot (tests
 * registered by a loop are not greppable, so an exact assertion would be a
 * guess dressed as a gate).
 */

const REPO = fileURLToPath(new URL('../../../..', import.meta.url))
const CLAUDE_MD = readFileSync(join(REPO, 'CLAUDE.md'), 'utf8')

/**
 * Files named deliberately as HISTORY — "X was deleted, do not reintroduce it".
 * Each must stay named for the warning to mean anything, so they are listed
 * rather than silently skipped. A new entry needs a reason.
 */
const DELETED_ON_PURPOSE = new Set([
  'AllocationComparison.tsx',      // Comparison sub-tab removed (c3ee3ff)
  'fmpSync.ts',                    // bulk stock sync — "do not reintroduce"
  'appSettings.ts',                // localStorage-only firm settings, deleted
  'securities2ExcelUpload.ts',     // per-ticker template, deleted Sep 2026
])

/**
 * Functions named deliberately as HISTORY — "X was deleted, do not rebuild it",
 * or borrowed from someone else's API. Listed rather than skipped, same as the
 * files above: each is load-bearing in the sentence that names it.
 */
const REMOVED_ON_PURPOSE = new Set([
  'computePortfolioPerformance',    // performance engine, deleted Sep 2026 (gotcha 18)
  'computePortfolioPeriodReturns',  // ditto
  'computeBenchmarkPeriodReturns',  // ditto
  'syncStockFromFMP',               // bulk FMP sync — "do not reintroduce"
  'upsertRelatedSecurities',        // orphaned by securities2ExcelUpload.ts deletion
  'fetchActionItemsByClient',       // never called, couldn't do what it claimed; deleted Nov 2026
  'getSnapshot',                    // React's useSyncExternalStore contract, not ours

  // Components and panels named as history, or borrowed from elsewhere.
  'PortfolioPerformancePanel',      // deleted with the performance engine (gotcha 18)
  'FundReturnTable',                // deleted; §23 found it named as a live consumer twice
  'FundComparisonPanel',            // removed Sep 2026 with the Related sheet
  'AnalystCoveragePanel',           // deleted Oct 2026; header covers the price
  'AlertRulesSection',              // rule CRUD UI, deleted with the firing engine
  'CompliancePanel',                // per-portfolio tab, replaced by the Settings hub
  'NotificationsPage',              // deleted Nov 2026 (audit §19); named as the mistake not to repeat
  'Median',                         // FMP's targetMedian field, not ours
  'TypeError',                      // JS builtin
])

function allFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) allFiles(full, out)
    else out.push(e)
  }
  return out
}
const PRESENT = new Set(allFiles(REPO))

/**
 * Every word in the APP source — enough to answer "does this name exist".
 *
 * `__tests__` is excluded, and that is not tidiness. This index first included
 * it, and the guard then passed on a deliberately reintroduced
 * `fetchBenchmarkAll` — because the comment three lines below NAMES that
 * function as the example, so the word was in the tree, in the very test
 * meant to catch it. A test whose own prose feeds its index cannot fail.
 * Excluding tests is also right on the merits: CLAUDE.md documents app code,
 * and a function that exists only in a test is not an export anyone can call.
 */
const IDENTIFIERS = (() => {
  const words = new Set<string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === '__tests__') continue
      const full = join(dir, e)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(e)) {
        for (const w of readFileSync(full, 'utf8').match(/[A-Za-z0-9_]+/g) ?? []) words.add(w)
      }
    }
  }
  walk(join(REPO, 'client/src'))

  /*
    CLAUDE.md also documents code that is not TypeScript and does not live in
    the app — the YCharts refresh pipeline, whose macro and scripts it now
    names (`SyncWatchlistTickers`, `watchlist-tickers.cjs`). Those references go
    stale exactly the same way, so they are indexed rather than allowlisted:
    an allowlist entry would be a permanent exemption, while this keeps the
    guard live, so renaming the VBA sub still fails this test.

    Scoped to `scripts/` and to the handful of extensions that hold real source
    there, so it stays a narrow addition rather than a hole big enough for a
    stale client reference to slip through.
  */
  const walkScripts = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === 'archive') continue
      const full = join(dir, e)
      if (statSync(full).isDirectory()) walkScripts(full)
      else if (/\.(bas|sh|ps1|cjs|mjs|ts)$/.test(e)) {
        for (const w of readFileSync(full, 'utf8').match(/[A-Za-z0-9_]+/g) ?? []) words.add(w)
      }
    }
  }
  walkScripts(join(REPO, 'scripts'))

  return words
})()

describe('CLAUDE.md', () => {
  it('references enough files to be worth checking', () => {
    // Guards the guard: a regex that stops matching would pass vacuously.
    const named = [...CLAUDE_MD.matchAll(/`([A-Za-z0-9_./-]+\.tsx?)`/g)]
    expect(named.length).toBeGreaterThan(50)
  })

  it('names no file that does not exist', () => {
    const named = new Set(
      [...CLAUDE_MD.matchAll(/`([A-Za-z0-9_./-]+\.tsx?)`/g)].map((m) => m[1].split('/').pop()!),
    )
    const missing = [...named]
      .filter((f) => !PRESENT.has(f) && !DELETED_ON_PURPOSE.has(f))
      .sort()
    expect(
      missing,
      'CLAUDE.md names a file that is not in the tree — fix the reference, or add it to DELETED_ON_PURPOSE with a reason if it is named as history',
    ).toEqual([])
  })

  it('names no lib/hook export that does not exist', () => {
    // The class the file-name check misses. A verb-prefixed camelCase name in
    // backticks reads as "this function exists and you can call it", which is
    // exactly how `fetchBenchmarkAll` kept being offered after deletion.
    const VERBS = [
      'fetch', 'save', 'compute', 'build', 'parse', 'resolve', 'upsert', 'create',
      'advance', 'grade', 'derive', 'mark', 'qualifies', 'announce', 'classify',
      'map', 'pick', 'assert', 'start', 'complete', 'request', 'cancel', 'discard',
      'publish', 'record', 'snooze', 'acknowledge', 'add', 'remove', 'sync',
      'import', 'export', 'refresh', 'get', 'extract', 'normalize', 'diff',
      'find', 'cluster', 'reconcile', 'strip', 'format', 'is', 'has', 'can',
    ]
    const named = [...CLAUDE_MD.matchAll(/`([a-z][A-Za-z0-9_]{3,})\(?\)?`/g)]
      .map((m) => m[1])
      .filter((n) => VERBS.some((v) => n.startsWith(v)))

    // Guards the guard: a regex that stopped matching would pass vacuously.
    expect(new Set(named).size).toBeGreaterThan(80)

    const missing = [...new Set(named)]
      .filter((n) => !IDENTIFIERS.has(n) && !REMOVED_ON_PURPOSE.has(n))
      .sort()
    expect(
      missing,
      'CLAUDE.md names a function that is not in client/src — fix the reference, or add it to REMOVED_ON_PURPOSE with a reason if it is named as history',
    ).toEqual([])
  })

  it('names no component or type that does not exist', () => {
    // `RebalancingPanel` and its `modelDriftPct` prop sat here for months after
    // `95f041c` deleted both — in a bullet that also stated a drift-resolution
    // chain the code had stopped following. The file-name check could not see
    // it: the document names the component, not `RebalancingPanel.tsx`.
    //
    // Residual gap, stated rather than papered over: a lowercase non-verb prop
    // name like `modelDriftPct` is still not checked, because the candidate set
    // would then include most of the DB column names in this document. Catching
    // the component is what catches the sentence.
    const named = [...CLAUDE_MD.matchAll(/`([A-Z][A-Za-z0-9]{3,})`/g)]
      .map((m) => m[1])
      .filter((n) => !/^[A-Z0-9_]+$/.test(n)) // SCREAMING_CASE consts are their own class

    expect(new Set(named).size).toBeGreaterThan(60) // guards the guard

    const missing = [...new Set(named)]
      .filter((n) => !IDENTIFIERS.has(n) && !REMOVED_ON_PURPOSE.has(n))
      .sort()
    expect(
      missing,
      'CLAUDE.md names a component or type that is not in client/src — fix the reference, or add it to REMOVED_ON_PURPOSE with a reason if it is named as history',
    ).toEqual([])
  })

  it('does not overstate the size of its own test suite', () => {
    // "147 tests over 11 modules" sat here while the suite was 320 over 25.
    //
    // A FLOOR, not an equality, and the first draft of this test got that
    // wrong. An exact count couples this document to every branch that adds a
    // test file: the assertion passed on the branch it was written on and
    // failed the moment an unrelated open PR was checked out. A floor is the
    // claim actually worth making — it still fails if the suite is gutted, and
    // never fails for growing. The case count is left to `npm run test`, which
    // can see tests registered by a loop; a grep for `it(` cannot.
    const claimed = Number(/\*\*(\d+)\+? test modules\*\*/.exec(CLAUDE_MD)?.[1])
    expect(claimed, 'CLAUDE.md should state a module count').toBeGreaterThan(0)
    const actual = readdirSync(join(REPO, 'client/src/lib/__tests__'))
      .filter((f) => f.endsWith('.test.ts')).length
    expect(actual, `CLAUDE.md claims ${claimed}+ test modules; there are ${actual}`)
      .toBeGreaterThanOrEqual(claimed)
  })

  it('numbers the gotchas in order', () => {
    // They ran 1–20, 22, 25, 21, 23, 24. The numbers are cross-referenced by
    // prose throughout ("gotcha 24"), so they are REORDERED, never renumbered.
    const ns = [...CLAUDE_MD.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]))
    const gotchas = ns.slice(ns.indexOf(1, ns.lastIndexOf(1)))
    expect(gotchas).toEqual([...gotchas].sort((a, b) => a - b))
    expect(gotchas[gotchas.length - 1]).toBe(gotchas.length)
  })
})
