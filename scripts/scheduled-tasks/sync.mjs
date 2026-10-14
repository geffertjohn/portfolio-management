#!/usr/bin/env node
/**
 * sync.mjs — keep the scheduled-task prompts in this repo and the ones the
 * scheduler actually runs from in step.
 *
 * The scheduler reads each task from a FIXED location it owns:
 *   ~/.claude/scheduled-tasks/<taskId>/SKILL.md
 * There is no setting that repoints it, so the repo cannot be the live path.
 *
 * SYMLINKS DO NOT WORK, and they fail quietly, which is worse than failing.
 * Linking the scheduler's path at the repo file leaves the task registered,
 * enabled and on schedule — but its frontmatter reads back empty, because the
 * reader does not follow symlinks. The prompt is what lives in that file, so a
 * linked task is a job that looks healthy in every listing and has nothing to
 * run. This was tried, observed, and reverted; copying is the only safe option.
 *
 *   node scripts/scheduled-tasks/sync.mjs            # repo  -> scheduler (deploy)
 *   node scripts/scheduled-tasks/sync.mjs --check    # report drift, exit 1 if any
 *   node scripts/scheduled-tasks/sync.mjs --from-home# scheduler -> repo (capture UI edits)
 *   node scripts/scheduled-tasks/sync.mjs --dry-run  # say what would change
 *
 * After editing a prompt in the app (or with `update_scheduled_task`, which
 * rewrites the scheduler's copy), run --from-home so the repo keeps the change.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, lstatSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_DIR = path.resolve(__dirname, '../../.claude/scheduled-tasks')
const HOME_DIR = path.join(os.homedir(), '.claude', 'scheduled-tasks')

const args = new Set(process.argv.slice(2))
const check = args.has('--check')
const fromHome = args.has('--from-home')
const dryRun = args.has('--dry-run')

/** Task ids are the directories that exist on either side. */
function taskIds() {
  const ids = new Set()
  for (const dir of [REPO_DIR, HOME_DIR]) {
    if (!existsSync(dir)) continue
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) ids.add(e.name)
    }
  }
  return [...ids].sort()
}

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)

let drift = 0, wrote = 0
for (const id of taskIds()) {
  const repoFile = path.join(REPO_DIR, id, 'SKILL.md')
  const homeFile = path.join(HOME_DIR, id, 'SKILL.md')

  // A symlink on the scheduler side is a broken task, not a style choice.
  // It must be REPLACED even when the bytes match: reading through it returns
  // the repo file's contents, so a plain content comparison says "in sync"
  // while the scheduler still cannot read the prompt.
  const linked = existsSync(homeFile) && lstatSync(homeFile).isSymbolicLink()
  if (linked) {
    console.log(`! ${id}: scheduler copy is a SYMLINK — the prompt will not be read.`)
    if (check) { drift++; continue }
    if (fromHome) { drift++; continue } // nothing to capture; fix by deploying
  }

  const src = fromHome ? homeFile : repoFile
  const dst = fromHome ? repoFile : homeFile
  const srcText = read(src)
  const dstText = read(dst)

  if (srcText === null) {
    console.log(`– ${id}: no ${fromHome ? 'scheduler' : 'repo'} copy — skipped`)
    continue
  }
  const needsWrite = srcText !== dstText || (linked && !fromHome)
  if (!needsWrite) continue

  drift++
  const label = linked ? 'symlink' : dstText === null ? 'missing' : 'differs'
  if (check) { console.log(`✗ ${id}: ${fromHome ? 'repo' : 'scheduler'} copy ${label}`); continue }
  if (dryRun) { console.log(`→ ${id}: would write ${dst} (${label})`); continue }

  mkdirSync(path.dirname(dst), { recursive: true })
  // unlink first: writing "through" a symlink would update the repo file instead
  // of replacing the link with a real file.
  if (linked && !fromHome) rmSync(dst, { force: true })
  writeFileSync(dst, srcText)
  console.log(`✓ ${id}: ${fromHome ? 'captured into repo' : 'deployed to scheduler'}`)
  wrote++
}

if (check) {
  console.log(drift === 0 ? '\nIn sync.' : `\n${drift} task(s) out of sync — run without --check to fix.`)
  process.exit(drift === 0 ? 0 : 1)
}
console.log(`\n${wrote} written · ${taskIds().length} task(s) known`)
