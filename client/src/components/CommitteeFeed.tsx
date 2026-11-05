import { Link } from 'react-router-dom'
import {
  DOC_KIND_LABELS, GROUP_OF, docHref,
  type CommitteeDoc, type DocGroup, type DocTone,
} from '@/lib/committeeReports'
import { formatDate } from '@/lib/fundFormat'

/**
 * The committee's written output as a list.
 *
 * Shared by the dashboard section and `/committee` so the two cannot describe
 * the same document differently — the `fundScorecard` split, applied to a feed.
 * Presentation only: it fetches nothing and decides nothing about which
 * documents belong here.
 *
 * **No status is rendered.** 102 of the 115 research reports and every call
 * summary carry `status = 'draft'`, and nothing in the app has ever written
 * `'final'` — so the flag never meant "provisional", it meant "written by a
 * job". Badging these as drafts would invent an approval step the firm does
 * not run, and would put a "Draft" chip on essentially every row, which is no
 * signal at all.
 */

const GROUP_CHIP: Record<DocGroup, string> = {
  briefs: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  research: 'bg-violet-50 text-violet-700 ring-violet-200',
  calls: 'bg-sky-50 text-sky-700 ring-sky-200',
  risk: 'bg-orange-50 text-orange-700 ring-orange-200',
  memos: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const TONE_CHIP: Record<DocTone, string> = {
  good: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-600',
}

export function CommitteeFeed({ docs }: { docs: CommitteeDoc[] }) {
  if (docs.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-500">No committee documents.</p>
  }
  return (
    <ul className="divide-y divide-gray-100">
      {docs.map((d) => (
        <li key={d.id} className="px-4 py-3 hover:bg-gray-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${GROUP_CHIP[GROUP_OF[d.kind]]}`}>
                  {DOC_KIND_LABELS[d.kind]}
                </span>
                <Link to={docHref(d)} className="text-sm font-semibold text-blue-600 hover:underline">
                  {d.subject}
                </Link>
                {d.period && <span className="text-xs text-gray-500">{d.period}</span>}
                {d.signal && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${TONE_CHIP[d.tone]}`}>
                    {d.signal}
                  </span>
                )}
              </div>
              {/* The excerpt is the point of the row: "Thesis intact — Eaton
                  beat on both lines" is readable without opening anything. */}
              {d.excerpt && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600">{d.excerpt}</p>
              )}
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">
              {formatDate(d.writtenAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
