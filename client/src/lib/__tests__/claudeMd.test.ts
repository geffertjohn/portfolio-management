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

  it('numbers the gotchas in order', () => {
    // They ran 1–20, 22, 25, 21, 23, 24. The numbers are cross-referenced by
    // prose throughout ("gotcha 24"), so they are REORDERED, never renumbered.
    const ns = [...CLAUDE_MD.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]))
    const gotchas = ns.slice(ns.indexOf(1, ns.lastIndexOf(1)))
    expect(gotchas).toEqual([...gotchas].sort((a, b) => a - b))
    expect(gotchas[gotchas.length - 1]).toBe(gotchas.length)
  })
})
