import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchCommitteeDocs, countByGroup, GROUP_OF, DOC_GROUP_LABELS,
  type DocGroup,
} from '@/lib/committeeReports'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { CommitteeFeed } from '@/components/CommitteeFeed'

/**
 * Committee Reports — everything the AI investment committee has written.
 *
 * **The first firm-wide view of it.** Every existing reader of the five
 * deliverable tables is scoped to one security, portfolio or candidate, so
 * until this page the answer to "what has the committee produced" did not
 * exist anywhere — 115 research reports, 41 call summaries and 78 risk reports
 * were written and unreadable in aggregate.
 *
 * Read-only. The dashboard carries a short feed that links here; this is where
 * the whole record lives.
 */

const GROUP_ORDER: DocGroup[] = ['briefs', 'research', 'calls', 'risk', 'memos']

export function CommitteeReportsPage() {
  const [group, setGroup] = useState<DocGroup | 'all'>('all')
  const [q, setQ] = useState('')

  const { data: docs = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.committeeDocs,
    queryFn: () => fetchCommitteeDocs(),
    staleTime: 5 * 60 * 1000,
  })

  const counts = useMemo(() => countByGroup(docs), [docs])
  const shown = useMemo(() => {
    const needle = q.trim().toUpperCase()
    return docs.filter((d) =>
      (group === 'all' || GROUP_OF[d.kind] === group)
      && (needle === '' || d.subject.toUpperCase().includes(needle)))
  }, [docs, group, q])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Committee Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Everything the investment committee has written — briefs, research, call summaries,
            risk reports and memos.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by ticker or portfolio…"
          className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {isLoading && <p className="mt-6 text-sm text-gray-500">Reading the committee's output…</p>}
      {error && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the reports: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            <FilterChip label="All" count={docs.length} active={group === 'all'} onClick={() => setGroup('all')} />
            {GROUP_ORDER.map((g) => (
              <FilterChip
                key={g}
                label={DOC_GROUP_LABELS[g]}
                count={counts[g]}
                active={group === g}
                onClick={() => setGroup(g)}
              />
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <p className="text-xs text-gray-500">
                {shown.length} document{shown.length === 1 ? '' : 's'}
                {shown.length !== docs.length && ` of ${docs.length}`}, newest first
              </p>
            </div>
            <CommitteeFeed docs={shown} />
          </div>
        </>
      )}
    </div>
  )
}

function FilterChip({ label, count, active, onClick }: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label} <span className={active ? 'text-blue-100' : 'text-gray-400'}>{count}</span>
    </button>
  )
}
