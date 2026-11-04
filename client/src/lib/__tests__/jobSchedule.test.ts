import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { JOB_DEFINITIONS } from '../jobRuns'

/**
 * `JOB_DEFINITIONS` against the plists launchd actually runs.
 *
 * Audit §21. Three schedules for the same seven jobs disagreed: the plists, this
 * catalog, and CLAUDE.md. The catalog's times were the **app scheduler's** — the
 * one switched off on 3 Nov 2026 — so `gradeJob` was measuring "overdue" against
 * a scheduler that no longer existed. `GRACE_MINS = 180` hid all seven, which is
 * why nothing looked wrong. CLAUDE.md's copy was deleted in §23 and replaced with
 * a pointer; this is the other half.
 *
 * The audit asked for one shared table. A gate is the better instrument here:
 * the plists are the AUTHORITY — they are what launchd reads — so checking the
 * app against them catches a drift that checking against the generator's own
 * table could not. It is also the house pattern (`schemaContract`, `claudeMd`):
 * read a file the repo already keeps current and fail on disagreement.
 */

const LAUNCHAGENTS = join(__dirname, '../../../../scripts/scheduled-jobs/launchagents')

interface PlistJob {
  id: string
  weekdays: number[]
  hour: number
  minute: number
}

function parsePlists(): PlistJob[] {
  const files = readdirSync(LAUNCHAGENTS).filter((f) => f.endsWith('.plist'))
  return files.map((file) => {
    const xml = readFileSync(join(LAUNCHAGENTS, file), 'utf8')

    // The job id is the last ProgramArguments entry: bash, run-job.sh, <id>.
    const args = [...xml.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1])
    const runJobAt = args.findIndex((a) => a.endsWith('run-job.sh'))
    if (runJobAt < 0) throw new Error(`${file}: no run-job.sh in ProgramArguments`)
    const id = args[runJobAt + 1]

    const slots = [...xml.matchAll(
      /<key>Weekday<\/key><integer>(\d+)<\/integer><key>Hour<\/key><integer>(\d+)<\/integer><key>Minute<\/key><integer>(\d+)<\/integer>/g,
    )]
    if (slots.length === 0) throw new Error(`${file}: no StartCalendarInterval slots`)

    const hours = new Set(slots.map((s) => Number(s[2])))
    const minutes = new Set(slots.map((s) => Number(s[3])))
    if (hours.size !== 1 || minutes.size !== 1) {
      // A job that fires at different times on different days would make a
      // single hour/minute in JOB_DEFINITIONS a lie; fail rather than pick one.
      throw new Error(`${file}: slots disagree on time`)
    }
    return {
      id,
      weekdays: slots.map((s) => Number(s[1])).sort(),
      hour: [...hours][0],
      minute: [...minutes][0],
    }
  })
}

const PLISTS = parsePlists()

describe('the plist parser itself', () => {
  it('found all seven agents and read a real time out of each', () => {
    // Guards against the parser silently matching nothing and every assertion
    // below passing vacuously.
    expect(PLISTS).toHaveLength(7)
    for (const p of PLISTS) {
      expect(p.id, p.id).toMatch(/^[a-z-]+$/)
      expect(p.weekdays.length, p.id).toBeGreaterThan(0)
      expect(p.hour, p.id).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('JOB_DEFINITIONS matches the plists launchd runs', () => {
  it('catalogs exactly the jobs that are installed', () => {
    expect([...JOB_DEFINITIONS.map((d) => d.id)].sort())
      .toEqual([...PLISTS.map((p) => p.id)].sort())
  })

  it('agrees with each plist on the time', () => {
    for (const p of PLISTS) {
      const def = JOB_DEFINITIONS.find((d) => d.id === p.id)
      expect(def, p.id).toBeDefined()
      expect({ id: p.id, hour: def!.hour, minute: def!.minute })
        .toEqual({ id: p.id, hour: p.hour, minute: p.minute })
    }
  })

  it('agrees with each plist on the cadence', () => {
    // Mon-only (Weekday 1) is `weekly_monday`; Mon-Fri is `weekday`.
    for (const p of PLISTS) {
      const def = JOB_DEFINITIONS.find((d) => d.id === p.id)!
      const expected = p.weekdays.join(',') === '1' ? 'weekly_monday' : 'weekday'
      expect(def.cadence, p.id).toBe(expected)
    }
  })

  it('keeps at-risk-review strictly before post-earnings-brief', () => {
    // The one ordering that is a CONVENTION rather than operations: the brief
    // reports any same-day change to the at-risk list, and there is only ever
    // one brief per print. Asserted on the plists, not the catalog.
    const at = PLISTS.find((p) => p.id === 'at-risk-review')!
    const post = PLISTS.find((p) => p.id === 'post-earnings-brief')!
    expect(at.hour * 60 + at.minute).toBeLessThan(post.hour * 60 + post.minute)
  })
})
