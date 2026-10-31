/**
 * jobRuns.ts — health of the scheduled Claude Code routines.
 *
 * The six weekday/weekly jobs (plus the earnings-call summary) run in the
 * Claude Code harness, which the React app has no bridge to: it cannot read the
 * scheduler's task list, its run history, or whether this morning's run is
 * still in flight. Everything here is read back from `job_runs`, a heartbeat
 * row each job writes for itself.
 *
 * WHY A HEARTBEAT AND NOT THE DELIVERABLES. Inferring health from what a job
 * wrote — the newest `research_reports` row, `at_risk.last_reviewed_at` — looks
 * equivalent and is not. A job that ran and correctly found nothing to do
 * writes nothing, and so does a job that died on its first tool call. Those are
 * the two cases that most need telling apart, and the deliverable tables cannot
 * tell them apart at all. It is not hypothetical: two jobs read as `running`
 * all day in Oct 2026 while doing nothing, which is what prompted this.
 *
 * Same shape as `importRuns.ts`, which solves the identical problem for the
 * spreadsheet importers — including the part that does the real work there:
 * judging a run against when it was DUE rather than against how old the data
 * is. A weekday job that stops firing leaves no row at all, so absence is the
 * only evidence there will ever be, and absence is only readable against a
 * schedule.
 */
import { supabase } from './supabase'

export type JobRunStatus = 'running' | 'success' | 'partial' | 'failed'

export interface JobRun {
  id: number
  job_id: string
  started_at: string
  finished_at: string | null
  status: JobRunStatus
  items_considered: number | null
  items_written: number | null
  summary: string | null
  errors: string[]
}

/** Weekdays, or Mondays only. The two cadences the scheduler actually runs. */
export type JobCadence = 'weekday' | 'weekly_monday'

export interface JobDefinition {
  /** The scheduler's own taskId — the value the job writes as `job_id`. */
  id: string
  label: string
  cadence: JobCadence
  /** Local wall-clock time the scheduler fires it (jitter is inside the grace). */
  hour: number
  minute: number
  /** What a run of this job leaves behind, named so a reader can go check. */
  writes: string
  purpose: string
}

/**
 * The scheduled routines, mirroring `.claude/scheduled-tasks/<id>/SKILL.md`.
 *
 * This list is a DESCRIPTION, not an authority: the scheduler owns the task
 * list, and `job_id` is plain text precisely so a job added there can log
 * before anything here knows its name. A run whose `job_id` is absent from this
 * catalog still lands in the table and is shown as an unrecognised job rather
 * than dropped — the alternative is a new job that silently never appears.
 */
export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    id: 'at-risk-review', label: 'At-Risk review',
    cadence: 'weekday', hour: 9, minute: 9,
    writes: 'at_risk · alert_events',
    purpose: 'Flags newly deteriorated holdings, re-measures the ones already flagged, clears recoveries, and alerts on an expired sell timer.',
  },
  {
    id: 'post-earnings-brief', label: 'Post-earnings brief',
    cadence: 'weekday', hour: 9, minute: 31,
    writes: 'research_reports',
    purpose: 'Fills actuals against each pre-brief, answers the street questions, and grades the thesis and risk checks.',
  },
  {
    id: 'pre-earnings-brief', label: 'Pre-earnings brief',
    cadence: 'weekday', hour: 9, minute: 32,
    writes: 'research_reports',
    purpose: 'Expectations and thesis checks for held stocks reporting in the next few days.',
  },
  {
    id: 'earnings-call-summary', label: 'Earnings call summary',
    cadence: 'weekday', hour: 9, minute: 42,
    writes: 'earnings_call_summaries',
    purpose: 'Committee read of each newly transcribed call — sentiment, guidance, highlights and lowlights.',
  },
  {
    id: 'watchlist-research', label: 'Watchlist research',
    cadence: 'weekday', hour: 10, minute: 16,
    writes: 'research_reports',
    purpose: 'Rates watchlist ideas carrying no research — a standalone buy/hold/sell with bear/base/bull targets.',
  },
  {
    id: 'weekly-risk-report', label: 'Weekly risk report',
    cadence: 'weekly_monday', hour: 7, minute: 20,
    writes: 'risk_reports',
    purpose: 'Per-portfolio concentration and factor drift on the current book, with compliance verification.',
  },
  {
    id: 'reviews-due-digest', label: 'Reviews due digest',
    cadence: 'weekly_monday', hour: 7, minute: 38,
    writes: '— (informational)',
    purpose: 'Weekly digest of portfolio and per-security reviews that are due or overdue. Read-only.',
  },
]

/**
 * How long a due run gets to land before it counts as missed.
 *
 * Generous on purpose: the scheduler adds up to ~11 minutes of jitter, the
 * committee jobs take several minutes each, and the machine has to be awake.
 * A tighter window would report a miss every morning someone opened the laptop
 * late, which is how a health signal gets ignored.
 */
const GRACE_MINS = 180

/** A `running` row older than this did not finish — nothing takes three hours. */
const STALL_HOURS = 3

/**
 * The most recent scheduled run that should ALREADY have landed.
 *
 * Steps back a day while today's run is still inside its grace window, then
 * back to the previous day the job actually runs — so Monday morning expects
 * FRIDAY's weekday run rather than a Saturday one that was never scheduled.
 */
export function lastExpectedRun(def: JobDefinition, now: Date = new Date()): Date {
  const due = new Date(now)
  due.setHours(def.hour, def.minute, 0, 0)
  if (now.getTime() < due.getTime() + GRACE_MINS * 60_000) due.setDate(due.getDate() - 1)
  if (def.cadence === 'weekly_monday') {
    while (due.getDay() !== 1) due.setDate(due.getDate() - 1)
  } else {
    while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() - 1)
  }
  return due
}

export type JobHealth =
  | 'ok'          // finished on schedule
  | 'running'     // started recently, still in flight
  | 'stalled'     // started, never recorded an end
  | 'failed'      // ended reporting failure
  | 'partial'     // ended having done some of its work
  | 'overdue'     // last finished run predates the run that was due
  | 'never_run'   // no row at all

export interface JobStatus {
  def: JobDefinition
  latest: JobRun | null
  health: JobHealth
  /** The run that should already have landed — the basis for `overdue`. */
  expected: Date
}

export const JOB_HEALTH_LABELS: Record<JobHealth, string> = {
  ok: 'Healthy',
  running: 'Running',
  stalled: 'Did not finish',
  failed: 'Failed',
  partial: 'Partial',
  overdue: 'Missed a run',
  never_run: 'No run recorded',
}

/** Newest run per job_id. Jobs that have never logged are simply absent. */
export async function fetchLatestJobRuns(): Promise<Map<string, JobRun>> {
  const { data, error } = await supabase
    .from('job_runs')
    .select('id, job_id, started_at, finished_at, status, items_considered, items_written, summary, errors')
    .order('started_at', { ascending: false })
    .limit(500)
  if (error) throw error

  const latest = new Map<string, JobRun>()
  for (const row of (data ?? []) as JobRun[]) {
    if (!latest.has(row.job_id)) latest.set(row.job_id, row)
  }
  return latest
}

/** Every run for one job, newest first — the panel's per-job history. */
export async function fetchJobRunHistory(jobId: string, limit = 20): Promise<JobRun[]> {
  const { data, error } = await supabase
    .from('job_runs')
    .select('id, job_id, started_at, finished_at, status, items_considered, items_written, summary, errors')
    .eq('job_id', jobId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as JobRun[]
}

/**
 * Grade one job from its newest run.
 *
 * Order matters. A job whose newest row is `failed` is reported as failed even
 * when an older run succeeded recently enough to look current — the failure is
 * the newer fact and the more useful one. A `running` row is graded by its age,
 * not its status: that is the whole point of writing the row at the start, so
 * the one state the job cannot report about itself (dying mid-run) is readable
 * from the outside.
 */
export function gradeJob(
  def: JobDefinition,
  latest: JobRun | null,
  now: Date = new Date(),
): JobStatus {
  const expected = lastExpectedRun(def, now)
  if (!latest) return { def, latest: null, health: 'never_run', expected }

  if (latest.status === 'running') {
    const ageHours = (now.getTime() - new Date(latest.started_at).getTime()) / 3_600_000
    return { def, latest, health: ageHours > STALL_HOURS ? 'stalled' : 'running', expected }
  }
  if (latest.status === 'failed') return { def, latest, health: 'failed', expected }
  if (latest.status === 'partial') return { def, latest, health: 'partial', expected }

  const ended = new Date(latest.finished_at ?? latest.started_at)
  if (ended.getTime() < expected.getTime()) return { def, latest, health: 'overdue', expected }
  return { def, latest, health: 'ok', expected }
}

/** Every catalogued job, graded. Ordered by the catalog, not by health. */
export function gradeAllJobs(
  runs: Map<string, JobRun>,
  now: Date = new Date(),
): JobStatus[] {
  return JOB_DEFINITIONS.map((def) => gradeJob(def, runs.get(def.id) ?? null, now))
}

/**
 * Health states that are worth the advisor's attention.
 *
 * `never_run` is deliberately NOT one of them. It is indistinguishable from
 * "the heartbeat was only just added", so treating it as a problem would dump
 * one action per job into the hub the day this shipped and teach the reader to
 * dismiss the whole source. It shows in the panel and raises nothing.
 */
const ACTIONABLE: JobHealth[] = ['stalled', 'failed', 'partial', 'overdue']

export function needsAttention(s: JobStatus): boolean {
  return ACTIONABLE.includes(s.health)
}

/** "Oct 30, 9:14 AM" — a run is an event, so it renders in local time. */
export function fmtRunTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** How long a finished run took, or null while it is still open. */
export function runDuration(run: JobRun): string | null {
  if (!run.finished_at) return null
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  if (ms < 0) return null
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return '<1 min'
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}
