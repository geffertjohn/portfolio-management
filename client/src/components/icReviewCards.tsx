import type { ReactNode } from 'react'
import type {
  ResearchReport, Rating, Conviction, ReportType, ThesisStatus, WatchVerdict, WatchItem,
} from '@/lib/researchReports'
import type { RiskReport, RiskVerdict } from '@/lib/riskReports'
import type { IcMemo, IcDecision } from '@/lib/icMemos'
import { fmtUsd, EMPTY } from '@/lib/formatters'
import { formatDate } from '@/lib/fundFormat'

/**
 * Shared presentational cards for the AI investment team's deliverables
 * (research_reports · risk_reports · ic_memos). Used by the candidate IC Review
 * panel, the security-detail research panel, and the portfolio-detail risk panel.
 * Purely presentational — the only interactivity is the optional CIO decision
 * callback on MemoCard (the parent owns the mutation).
 */

const DECISION_BADGE: Record<IcDecision, string> = {
  approve: 'bg-green-100 text-green-700',
  watchlist: 'bg-amber-100 text-amber-700',
  reject: 'bg-red-100 text-red-700',
}
const DECISION_LABEL: Record<IcDecision, string> = { approve: 'Approve', watchlist: 'Watchlist', reject: 'Reject' }

const VERDICT_BADGE: Record<RiskVerdict, string> = {
  pass: 'bg-green-100 text-green-700',
  warn: 'bg-amber-100 text-amber-700',
  veto: 'bg-red-100 text-red-700',
}

const RATING_LABEL: Record<Rating, string> = { buy: 'Buy', add: 'Add', hold: 'Hold', trim: 'Trim', sell: 'Sell' }
const CONVICTION_LABEL: Record<Conviction, string> = { high: 'High', medium: 'Medium', low: 'Low' }

const REPORT_TYPE_BADGE: Partial<Record<ReportType, { label: string; className: string }>> = {
  pre_earnings:  { label: 'Pre-earnings',  className: 'bg-indigo-100 text-indigo-700' },
  post_earnings: { label: 'Post-earnings', className: 'bg-teal-100 text-teal-700' },
}

const THESIS_STATUS: Record<ThesisStatus, { label: string; className: string }> = {
  intact:  { label: 'Thesis intact',  className: 'bg-green-100 text-green-700' },
  at_risk: { label: 'Thesis at risk', className: 'bg-amber-100 text-amber-700' },
  broken:  { label: 'Thesis broken',  className: 'bg-red-100 text-red-700' },
}

const WATCH_VERDICT: Record<WatchVerdict, { label: string; className: string }> = {
  hit:     { label: 'Hit',     className: 'bg-green-100 text-green-700' },
  miss:    { label: 'Miss',    className: 'bg-red-100 text-red-700' },
  unclear: { label: 'Unclear', className: 'bg-gray-100 text-gray-600' },
}

/**
 * The "what actually matters this print" list.
 *
 * Rendered from the same array on both briefs: unresolved on the pre-brief (what
 * to watch, and the bar), resolved on the post-brief (same item, plus the
 * verdict and the actual figure). Showing the original question next to the
 * answer is the point — a verdict with the question stripped out is unreadable
 * a quarter later.
 */
function WatchItems({ items }: { items: WatchItem[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        What actually matters this print
      </p>
      <ol className="mt-1.5 space-y-2">
        {items.map((it, i) => {
          const v = it.verdict ? WATCH_VERDICT[it.verdict] : null
          return (
            <li key={it.key || i} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-gray-800">{i + 1}. {it.title}</span>
                {v && <Badge className={v.className}>{v.label}</Badge>}
              </div>
              {it.detail && <p className="mt-0.5 text-gray-600">{it.detail}</p>}
              {it.actual && (
                <p className="mt-0.5 text-gray-700">
                  <span className="text-xs uppercase tracking-wide text-gray-400">Actual </span>
                  {it.actual}
                </p>
              )}
              {it.note && <p className="mt-0.5 text-gray-600">{it.note}</p>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = {
  research_analyst: 'Research Analyst',
  devils_advocate: "Devil's Advocate",
  quant_analyst: 'Quant Analyst',
}
const roleLabel = (r: string) => ROLE_LABEL[r] ?? r

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{value}</p>
    </div>
  )
}

export function MemoCard({
  memo, onDecision, deciding = false,
}: {
  memo: IcMemo
  /** When provided and the memo is still open, renders CIO approve/watchlist/reject buttons. */
  onDecision?: (d: IcDecision) => void
  deciding?: boolean
}) {
  const open = memo.decision == null && memo.status !== 'approved' && memo.status !== 'rejected'
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">IC Memo</h3>
        {memo.recommendation && (
          <Badge className={DECISION_BADGE[memo.recommendation]}>Rec: {DECISION_LABEL[memo.recommendation]}</Badge>
        )}
        {memo.decision
          ? <Badge className={DECISION_BADGE[memo.decision]}>CIO: {DECISION_LABEL[memo.decision]}</Badge>
          : <Badge className="bg-sky-100 text-sky-700">Pending CIO</Badge>}
        {memo.proposed_weight != null && (
          <span className="text-xs text-gray-500">Proposed weight: <span className="font-medium text-gray-700">{memo.proposed_weight}%</span></span>
        )}
        <span className="ml-auto text-xs text-gray-400">{formatDate(memo.created_at)}</span>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Recommendation rationale" value={memo.rationale} />
        <Field label="PM sizing rationale" value={memo.pm_rationale} />
        {memo.decided_by && (
          <p className="text-xs text-gray-400">Decided by {memo.decided_by}{memo.decided_at ? ` · ${formatDate(memo.decided_at)}` : ''}</p>
        )}
      </div>
      {onDecision && open && (
        <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-xs font-medium text-gray-500">CIO decision:</span>
          <button type="button" disabled={deciding} onClick={() => onDecision('approve')}
            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
          <button type="button" disabled={deciding} onClick={() => onDecision('watchlist')}
            className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">Watchlist</button>
          <button type="button" disabled={deciding} onClick={() => onDecision('reject')}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
        </div>
      )}
    </div>
  )
}

export function ResearchCard({
  r,
  showTicker = false,
  parentDate,
}: {
  r: ResearchReport
  showTicker?: boolean
  /** `created_at` of the pre-brief this one answers, when the caller can resolve it. */
  parentDate?: string | null
}) {
  const typeBadge = REPORT_TYPE_BADGE[r.report_type]
  const status = r.thesis_status ? THESIS_STATUS[r.thesis_status] : null
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{roleLabel(r.author_role)}</h3>
        {showTicker && <span className="text-xs font-medium text-gray-500">{r.security_id}</span>}
        {typeBadge && <Badge className={typeBadge.className}>{typeBadge.label}</Badge>}
        {status && <Badge className={status.className}>{status.label}</Badge>}
        {r.status === 'draft' && <Badge className="bg-sky-100 text-sky-700">Draft</Badge>}
        {r.rating && <Badge className="bg-gray-100 text-gray-700">{RATING_LABEL[r.rating]}</Badge>}
        {r.conviction && <span className="text-xs text-gray-500">Conviction: {CONVICTION_LABEL[r.conviction]}</span>}
        {(r.fair_value != null || r.current_price != null) && (
          <span className="text-xs text-gray-500">
            Fair value {r.fair_value != null ? fmtUsd(r.fair_value) : EMPTY}
            {' · '}Price {r.current_price != null ? fmtUsd(r.current_price) : EMPTY}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">{formatDate(r.created_at)}</span>
      </div>
      {r.report_type === 'post_earnings' && parentDate && (
        <p className="mt-1 text-xs text-gray-400">
          Answers the pre-earnings brief of {formatDate(parentDate)}
        </p>
      )}
      <div className="mt-3 space-y-3">
        <Field label="Thesis" value={r.thesis} />
        {r.watch_items && r.watch_items.length > 0 && <WatchItems items={r.watch_items} />}
        <Field label="Bull case" value={r.bull_case} />
        <Field label="Bear case" value={r.bear_case} />
        {r.sources && r.sources.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Sources</p>
            <ul className="mt-0.5 space-y-0.5 text-sm">
              {r.sources.map((s, i) => (
                <li key={i}>
                  {s.url
                    ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{s.title ?? s.url}</a>
                    : <span className="text-gray-700">{s.title ?? s.note ?? EMPTY}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function RiskCard({ r }: { r: RiskReport }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Risk Manager</h3>
        <Badge className={VERDICT_BADGE[r.verdict]}>{r.verdict.toUpperCase()}</Badge>
        {r.scope === 'portfolio' && <Badge className="bg-gray-100 text-gray-600">Portfolio</Badge>}
        <span className="ml-auto text-xs text-gray-400">{formatDate(r.created_at)}</span>
      </div>
      <div className="mt-3 space-y-3">
        {r.mandate_checks && r.mandate_checks.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Mandate checks</p>
            <ul className="mt-1 space-y-1 text-sm">
              {r.mandate_checks.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={c.pass ? 'text-green-600' : 'text-red-600'}>{c.pass ? '✓' : '✗'}</span>
                  <span className="text-gray-700">{c.limit}</span>
                  {c.actual != null && c.actual !== '' && <span className="text-xs text-gray-400">({String(c.actual)})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Notes" value={r.notes} />
      </div>
    </div>
  )
}
