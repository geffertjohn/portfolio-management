import { useQuery } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  daysSince, fetchLatestImportRuns, fmtImportDate, missedScheduledRefresh,
  refreshDueLabel, ychartsAsOf, YCHARTS_DATA_SOURCES, type ImportSource,
} from '@/lib/importRuns'

/** Past this many days the stamp turns amber — a quarter-end refresh has been missed. */
const STALE_AFTER_DAYS = 45

/**
 * "YCharts data as of Sep 5, 2026" — the provenance stamp for stored YCharts
 * figures (benchmarks, fund metrics, model-portfolio returns).
 *
 * Renders next to the numbers themselves, because YCharts values carry no as-of
 * date and a months-old figure otherwise looks identical to a fresh one.
 *
 * Pass the `sources` this surface actually reads — the stamp shows the oldest of
 * them, so including an unrelated import would understate freshness. Renders
 * nothing until one of those sources has been imported, so a fresh database
 * doesn't sprout warnings.
 */
export function DataAsOf({
  sources = YCHARTS_DATA_SOURCES,
  className = '',
}: {
  sources?: ImportSource[]
  className?: string
}) {
  const { data: runs } = useQuery({
    queryKey: QUERY_KEYS.importRuns,
    queryFn: fetchLatestImportRuns,
    staleTime: 5 * 60 * 1000,
  })

  const run = runs ? ychartsAsOf(runs, sources) : null
  if (!run) return null

  const days = daysSince(run)
  const stale = days >= STALE_AFTER_DAYS

  // A missed run is reported ahead of plain age: on the morning the schedule
  // first fails the data is still a day old, so the age thresholds say nothing
  // while the thing the user actually wants to know -- did it fire -- is
  // already answerable.
  const missed = runs ? missedScheduledRefresh(runs, sources) : null

  return (
    <span
      className={`text-xs ${missed || stale ? 'text-amber-700' : 'text-gray-400'} ${className}`}
      title={`Imported from ${run.file_name ?? 'an Excel file'} on ${fmtImportDate(run)}`}
    >
      YCharts data as of {fmtImportDate(run)}
      {missed
        ? ` · ${refreshDueLabel(missed)}'s refresh did not run`
        : stale && ` · ${days} days old`}
    </span>
  )
}
