/**
 * importRuns.ts
 *
 * Provenance for spreadsheet imports.
 *
 * YCharts data carries no as-of date of its own — a figure refreshed this morning
 * and one from three months ago render identically. Every importer records a run
 * here, and the newest run per source is the freshness stamp the UI shows.
 *
 * Writes are best-effort: a failed log must never fail the import that produced
 * the data (see `recordImportRuns`).
 */
import { supabase } from './supabase'

export type ImportSource =
  | 'ycharts_benchmarks'
  | 'ycharts_funds'
  | 'ycharts_portfolios'
  | 'ycharts_allocations'

/**
 * `partial` = wrote rows but reported errors; `failed` = wrote nothing. Recorded
 * rather than inferred from `rows_written`, because the workbook runs its three
 * importers independently and can genuinely half-succeed.
 */
export type ImportStatus = 'success' | 'partial' | 'failed'

export interface ImportRun {
  id: number
  source: ImportSource
  file_name: string | null
  imported_at: string
  rows_written: number
  errors: string[]
  status: ImportStatus
}

/** One dataset's result within a single upload. */
export interface ImportRunInput {
  source: ImportSource
  rows: number
  errors?: string[]
  /** Defaults to `partial` when errors are present, otherwise `success`. */
  status?: ImportStatus
}

/**
 * Log the datasets one uploaded file wrote. A single workbook feeds three of
 * them, so this takes a list — each gets its own row, keeping per-dataset
 * provenance even though they share a file and a timestamp.
 *
 * Never throws: the data is already committed by the time this runs, so a
 * logging failure would report a successful import as failed.
 */
export async function recordImportRuns(
  runs: ImportRunInput[],
  file: File,
): Promise<void> {
  if (runs.length === 0) return
  const { error } = await supabase.from('import_runs').insert(
    runs.map((r) => ({
      source: r.source,
      file_name: file.name,
      rows_written: r.rows,
      errors: r.errors ?? [],
      status: r.status ?? ((r.errors?.length ?? 0) > 0 ? 'partial' : 'success'),
    })),
  )
  if (error) console.warn('import_runs: could not log this upload —', error.message)
}

/** Newest run per source, keyed by source. Sources never imported are absent. */
export async function fetchLatestImportRuns(): Promise<Map<ImportSource, ImportRun>> {
  const { data, error } = await supabase
    .from('import_runs')
    .select('id, source, file_name, imported_at, rows_written, errors, status')
    .order('imported_at', { ascending: false })
  if (error) throw error

  const latest = new Map<ImportSource, ImportRun>()
  for (const row of (data ?? []) as ImportRun[]) {
    if (!latest.has(row.source)) latest.set(row.source, row)
  }
  return latest
}

/** The YCharts imports that feed stored figures — the default freshness basis. */
export const YCHARTS_DATA_SOURCES: ImportSource[] = [
  'ycharts_benchmarks',
  'ycharts_funds',
  'ycharts_portfolios',
]

/**
 * The "YCharts data as of" date for a given set of sources — the OLDEST of them,
 * because a table mixing two datasets is only as current as its stalest input.
 *
 * Pass the sources a surface actually reads: a fund's return table draws on the
 * fund and benchmark imports, so a stale *portfolio* import must not make it look
 * older than it is. Null until at least one of those sources has been imported.
 */
export function ychartsAsOf(
  runs: Map<ImportSource, ImportRun>,
  sources: ImportSource[] = YCHARTS_DATA_SOURCES,
): ImportRun | null {
  const present = sources
    .map((s) => runs.get(s))
    .filter((r): r is ImportRun => r != null && r.status !== 'failed')
  if (present.length === 0) return null
  return present.reduce((oldest, r) => (r.imported_at < oldest.imported_at ? r : oldest))
}

// ── Did the scheduled refresh actually run? ─────────────────────────────────
//
// The stamp above answers "how old is this data". It cannot answer "did this
// morning's job fire", and those come apart badly for a job that runs every
// weekday: age-based thresholds (45 days on the stamp, 3 in the Actions hub)
// stay quiet for a week or more while a broken schedule delivers nothing. The
// refresh silently never ran from launchd at all until 2026-09-10, and nothing
// in the app said so.
//
// A missed run leaves NO import_runs row, so absence is the only evidence. That
// makes it readable only against when a run was DUE.

/** Weekdays at 05:30 local (the launchd agent), VM + Excel leg takes ~5 min. */
const REFRESH_HOUR = 5
const REFRESH_MINUTE = 30
/** How long a due run gets to land before it counts as missed. */
const REFRESH_GRACE_MINS = 90

/**
 * The most recent scheduled refresh that should ALREADY have landed.
 *
 * Steps back a day while today's run is still within its grace window, then
 * back over the weekend — so Monday at 06:00 expects FRIDAY's run, not a
 * Saturday one that was never scheduled, and 05:35 on a weekday does not report
 * a miss for a job that is still mid-flight.
 */
export function lastExpectedRefresh(now: Date = new Date()): Date {
  const due = new Date(now)
  due.setHours(REFRESH_HOUR, REFRESH_MINUTE, 0, 0)
  if (now.getTime() < due.getTime() + REFRESH_GRACE_MINS * 60_000) {
    due.setDate(due.getDate() - 1)
  }
  while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() - 1)
  return due
}

/**
 * When the scheduled refresh has not delivered, the run it should have made.
 * Null when the data is current, nothing has ever been imported, or `sources`
 * names nothing the scheduled job writes.
 *
 * Only the three workbook datasets count: `ycharts_allocations` is a manual
 * upload on its own cadence, so judging the 05:30 job by it would report a miss
 * every single day.
 */
export function missedScheduledRefresh(
  runs: Map<ImportSource, ImportRun>,
  sources: ImportSource[] = YCHARTS_DATA_SOURCES,
  now: Date = new Date(),
): Date | null {
  const scheduled = sources.filter((s) => YCHARTS_DATA_SOURCES.includes(s))
  if (scheduled.length === 0) return null
  const latest = ychartsAsOf(runs, scheduled)
  if (!latest) return null
  const due = lastExpectedRefresh(now)
  return new Date(latest.imported_at).getTime() < due.getTime() ? due : null
}

/** "today" / "Friday" — how to refer to a due run in a one-line stamp. */
export function refreshDueLabel(due: Date, now: Date = new Date()): string {
  const sameDay = due.toDateString() === now.toDateString()
  if (sameDay) return 'today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (due.toDateString() === yesterday.toDateString()) return 'yesterday'
  return due.toLocaleDateString(undefined, { weekday: 'long' })
}

/** Whole days since the run. */
export function daysSince(run: ImportRun): number {
  return Math.floor((Date.now() - new Date(run.imported_at).getTime()) / 86_400_000)
}

/** "Sep 5, 2026" */
export function fmtImportDate(run: ImportRun): string {
  return new Date(run.imported_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}
