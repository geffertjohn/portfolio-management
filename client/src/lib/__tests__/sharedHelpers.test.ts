import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Nobody re-implements a shared helper.
 *
 * `lib/formatters.ts` is the single source for display formatting, and twice it
 * has been quietly duplicated instead of imported — each copy then drifting:
 *
 *  - two components grew their own money ladder whose last two branches were
 *    byte-identical, so a $400k figure printed "$0.40M", and neither had a
 *    trillion tier, so $3.2T printed "$3200.00B";
 *  - `TipRanksPanel` grew its own `consensusColor` that returned the strong
 *    shade for any label containing "Buy", flattening "Moderate Buy" into
 *    "Strong Buy" and disagreeing with every other analyst surface.
 *
 * A convention in a document did not stop either. This does, and it names the
 * helper to import rather than only saying no.
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url))

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Everything except `lib/formatters.ts`, which is allowed to define them. */
const FILES = sourceFiles(SRC)
  .filter((f) => !f.endsWith(join('lib', 'formatters.ts')))
  .map((f) => ({ path: f.slice(SRC.length), text: readFileSync(f, 'utf8') }))

describe('the source tree', () => {
  it('has files to scan', () => {
    // Guards the guard: a broken path would make every check below vacuous.
    expect(FILES.length).toBeGreaterThan(50)
    expect(FILES.some((f) => f.path.includes('FinancialsSection'))).toBe(true)
  })
})

describe('no second implementation of a shared formatter', () => {
  it('abbreviates money only through fmtUsdCompact', () => {
    // The ladder's signature is dividing by a billion and fixing the decimals.
    const offenders = FILES
      .filter((f) => /\/\s*1_000_000_000\s*\)\s*\.toFixed|\/\s*1e9\s*\)\s*\.toFixed/.test(f.text))
      .map((f) => f.path)
    expect(offenders, 'import fmtUsdCompact from @/lib/formatters instead').toEqual([])
  })

  it('colours an analyst consensus only through consensusColor', () => {
    const offenders = FILES
      .filter((f) => /const consensusColor\s*[=:]/.test(f.text))
      .map((f) => f.path)
    expect(offenders, 'import consensusColor from @/lib/formatters instead').toEqual([])
  })

  /**
   * The unmapped-category warning now reaches three ends — the Import /
   * Export banner, the unattended refresh's log, and the `import_runs` row the
   * Actions hub reads. Two of them had written their own sentence. The Actions
   * hub keys its action off the message, so two phrasings of one gap would
   * raise two actions for it.
   *
   * **It matches the phrase only inside a STRING LITERAL**, which is the
   * signature of building the message rather than referring to the concept.
   * A bare mention caught `WatchlistPage`'s comment explaining why a pending
   * fund is grouped apart from an unmapped one — a sentence that is entirely
   * correct and that the author would have had to reword to satisfy a test.
   * A guard that fires on prose is a guard that gets deleted, which is the
   * same argument the other two rest on: name the structural signature, not
   * the subject.
   */
  it('phrases an unmapped category only through unmappedCategoryWarning', () => {
    const offenders = FILES
      .filter((f) => !f.path.endsWith(join('lib', 'assetClass.ts')))
      .filter((f) => /['"`][^'"`\n]*unmapped categor/i.test(f.text))
      .map((f) => f.path)
    expect(offenders, 'import unmappedCategoryWarning from @/lib/assetClass instead').toEqual([])
  })

  // Guards the guard. Narrowing the pattern to a string literal above could
  // have made it match nothing at all, and a check that cannot fail is worse
  // than no check because it reads as cover. The one legitimate
  // implementation is the positive control: the pattern must still find the
  // message where it IS built.
  it('would still catch a real second implementation', () => {
    const assetClass = readFileSync(join(SRC, 'lib', 'assetClass.ts'), 'utf8')
    expect(/['"`][^'"`\n]*unmapped categor/i.test(assetClass)).toBe(true)
  })
})

describe('the helpers it points at are actually exported', () => {
  it('formatters exports both', () => {
    const formatters = readFileSync(join(SRC, 'lib', 'formatters.ts'), 'utf8')
    for (const fn of ['fmtUsdCompact', 'consensusColor']) {
      expect(formatters, fn).toMatch(new RegExp(`export function ${fn}\\b`))
    }
    const assetClass = readFileSync(join(SRC, 'lib', 'assetClass.ts'), 'utf8')
    expect(assetClass, 'unmappedCategoryWarning')
      .toMatch(/export function unmappedCategoryWarning\b/)
  })
})
