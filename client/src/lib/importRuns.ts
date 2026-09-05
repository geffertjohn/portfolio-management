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
 * the data (see `recordImportRun`).
 */
import { supabase } from './supabase'

export type ImportSource =
  | 'ycharts_benchmarks'
  | 'ycharts_funds'
  | 'ycharts_security'
  | 'ycharts_security_metrics'
  | 'ycharts_portfolios'
  | 'ycharts_allocations'

export interface ImportRun {
  id: number
  source: ImportSource
  file_name: string | null
  imported_at: string
  rows_written: number
  errors: string[]
}

/**
 * Log one import. Never throws — the data is already committed by the time this
 * runs, so a logging failure would report a successful import as failed.
 */
export async function recordImportRun(
  source: ImportSource,
  file: File,
  rowsWritten: number,
  errors: string[] = [],
): Promise<void> {
  const { error } = await supabase.from('import_runs').insert({
    source,
    file_name: file.name,
    rows_written: rowsWritten,
    errors,
  })
  if (error) console.warn(`import_runs: could not log ${source} run —`, error.message)
}

/** Newest run per source, keyed by source. Sources never imported are absent. */
export async function fetchLatestImportRuns(): Promise<Map<ImportSource, ImportRun>> {
  const { data, error } = await supabase
    .from('import_runs')
    .select('id, source, file_name, imported_at, rows_written, errors')
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
  const present = sources.map((s) => runs.get(s)).filter((r): r is ImportRun => r != null)
  if (present.length === 0) return null
  return present.reduce((oldest, r) => (r.imported_at < oldest.imported_at ? r : oldest))
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
