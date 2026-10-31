import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchJobRunHistory, fetchLatestJobRuns, fmtRunTime, gradeAllJobs, runDuration,
  JOB_HEALTH_LABELS, lastExpectedRun,
  type JobHealth, type JobRun, type JobStatus,
} from '@/lib/jobRuns'
import { QUERY_KEYS } from '@/hooks/queryKeys'

/**
 * The scheduled Claude Code routines and whether they are actually running.
 *
 * Everything shown here is read back from `job_runs`, which the jobs write for
 * themselves — see the header of `lib/jobRuns.ts` for why health cannot be
 * inferred from the tables they produce.
 */

const HEALTH_STYLES: Record<JobHealth, string> = {
  ok:        'bg-green-100 text-green-800',
  running:   'bg-blue-100 text-blue-800',
  stalled:   'bg-red-100 text-red-800',
  failed:    'bg-red-100 text-red-800',
  partial:   'bg-amber-100 text-amber-800',
  overdue:   'bg-amber-100 text-amber-800',
  never_run: 'bg-gray-100 text-gray-500',
}

const CADENCE_LABELS = { weekday: 'Weekdays', weekly_monday: 'Mondays' } as const

function scheduleLine(s: JobStatus): string {
  const { cadence, hour, minute } = s.def
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const t = `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
  return `${CADENCE_LABELS[cadence]} at ${t}`
}

export function AutomationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: runs, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.jobRuns,
    queryFn: fetchLatestJobRuns,
    staleTime: 1000 * 60,
    enabled: open,
  })

  if (!open) return null
  const statuses = runs ? gradeAllJobs(runs) : []
  const unhealthy = statuses.filter((s) => !['ok', 'running', 'never_run'].includes(s.health)).length

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-gray-900/20" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Automation</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Scheduled committee routines. They run in Claude Code and write a heartbeat here —
              {unhealthy > 0
                ? ` ${unhealthy} need${unhealthy > 1 ? '' : 's'} attention.`
                : ' a job that dies is reported rather than going quiet.'}
            </p>
          </div>
          <button onClick={onClose} className="ml-4 shrink-0 text-sm text-gray-400 hover:text-gray-700">Close</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600">Could not read the job log — {(error as Error).message}</p>
          ) : isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="space-y-2">
              {statuses.map((s) => <JobCard key={s.def.id} status={s} />)}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function JobCard({ status: s }: { status: JobStatus }) {
  const [open, setOpen] = useState(false)
  const run = s.latest

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${HEALTH_STYLES[s.health]}`}>
          {JOB_HEALTH_LABELS[s.health]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900">{s.def.label}</span>
          <span className="mt-0.5 block text-xs text-gray-500">
            {scheduleLine(s)}
            {run
              ? <> · last ran {fmtRunTime(run.started_at)}{runDuration(run) && <> · {runDuration(run)}</>}</>
              : <> · never</>}
          </span>
          {s.health === 'overdue' && (
            <span className="mt-0.5 block text-xs text-amber-700">
              A run was due {fmtRunTime(lastExpectedRun(s.def).toISOString())} and has not landed.
            </span>
          )}
          {s.health === 'stalled' && (
            <span className="mt-0.5 block text-xs text-red-700">
              Started and never recorded an end — it died mid-run.
            </span>
          )}
          {run?.summary && s.health !== 'stalled' && (
            <span className="mt-0.5 block line-clamp-2 text-xs text-gray-600">{run.summary}</span>
          )}
        </span>
        <svg className={`mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-600">{s.def.purpose}</p>
          <p className="mt-1 text-xs text-gray-400">Writes: {s.def.writes}</p>
          <JobHistory jobId={s.def.id} />
        </div>
      )}
    </div>
  )
}

function JobHistory({ jobId }: { jobId: string }) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.jobRunHistory(jobId),
    queryFn: () => fetchJobRunHistory(jobId),
    staleTime: 1000 * 60,
  })

  if (isLoading) return <p className="mt-3 text-xs text-gray-400">Loading history…</p>
  if (runs.length === 0) {
    return (
      <p className="mt-3 text-xs text-gray-400">
        No runs recorded. The heartbeat is written by the job itself, so nothing appears here until it next fires.
      </p>
    )
  }

  return (
    <table className="mt-3 w-full text-xs">
      <thead>
        <tr className="text-left text-gray-400">
          <th className="pb-1 font-medium">Started</th>
          <th className="pb-1 font-medium">Took</th>
          <th className="pb-1 text-right font-medium">Seen</th>
          <th className="pb-1 text-right font-medium">Wrote</th>
          <th className="pb-1 pl-3 font-medium">Result</th>
        </tr>
      </thead>
      <tbody className="text-gray-600">
        {runs.map((r) => <HistoryRow key={r.id} run={r} />)}
      </tbody>
    </table>
  )
}

function HistoryRow({ run: r }: { run: JobRun }) {
  const failed = r.status === 'failed' || (r.status === 'running' && r.finished_at == null)
  return (
    <tr className="border-t border-gray-200">
      <td className="py-1 whitespace-nowrap">{fmtRunTime(r.started_at)}</td>
      <td className="py-1 whitespace-nowrap text-gray-400">{runDuration(r) ?? '—'}</td>
      <td className="py-1 text-right tabular-nums">{r.items_considered ?? '—'}</td>
      <td className="py-1 text-right tabular-nums">{r.items_written ?? '—'}</td>
      <td className={`py-1 pl-3 ${failed ? 'text-red-600' : ''}`}>
        {r.errors[0] ?? r.summary ?? r.status}
      </td>
    </tr>
  )
}
