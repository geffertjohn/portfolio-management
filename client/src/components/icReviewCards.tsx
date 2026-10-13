import type { ReactNode } from 'react'
import type {
  ResearchReport, Rating, Conviction, ReportType, ThesisStatus, WatchVerdict, WatchItem,
  EstimateRow, EstimateUnit, StreetQuestion, ThesisCheck, AnswerState, CheckStatus,
} from '@/lib/researchReports'
import type { RiskReport, RiskVerdict } from '@/lib/riskReports'
import type { IcMemo, IcDecision } from '@/lib/icMemos'
import { fmtUsd, fmtUsdCompact, fmtDecimalPct, fmtSignedPct, EMPTY } from '@/lib/formatters'
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

const ANSWER_STATE: Record<AnswerState, { label: string; className: string }> = {
  yes:     { label: 'Answered', className: 'bg-green-100 text-green-700' },
  partial: { label: 'Partly',   className: 'bg-amber-100 text-amber-700' },
  no:      { label: 'Unanswered', className: 'bg-gray-100 text-gray-600' },
}

/**
 * How the print bore on a thesis reason or bear point. Deliberately NOT
 * hit/miss: a quarter rarely settles a durable thesis outright, and forcing a
 * binary verdict onto a multi-year break test overstates what one print proves.
 */
const CHECK_STATUS: Record<CheckStatus, { label: string; className: string }> = {
  supported:     { label: 'Supported',     className: 'bg-green-100 text-green-700' },
  mixed:         { label: 'Mixed',         className: 'bg-amber-100 text-amber-700' },
  undermined:    { label: 'Undermined',    className: 'bg-red-100 text-red-700' },
  not_addressed: { label: 'Not addressed', className: 'bg-gray-100 text-gray-600' },
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
/** Section heading — the two halves an earnings brief is split into. */
function SectionHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="mt-4 flex items-baseline gap-2 border-b border-gray-200 pb-1 first:mt-0">
      <span className="text-xs font-semibold text-gray-400">{n}</span>
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
    </div>
  )
}

function SubHeading({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{children}</p>
}

function fmtEstimate(v: number | null | undefined, unit: EstimateUnit): string {
  if (v == null) return EMPTY
  if (unit === 'pct') return fmtDecimalPct(v)
  if (unit === 'usd_large') return fmtUsdCompact(v)
  return fmtUsd(v)
}

/**
 * Section 1 estimates. The Actual and Surprise columns appear only once something
 * has actually printed, so a pre-brief shows a clean expectations table and the
 * post-brief shows the same rows with the result beside them.
 */
function Estimates({ rows }: { rows: EstimateRow[] }) {
  const hasActuals = rows.some((r) => r.actual != null)
  return (
    <div>
      <SubHeading>Estimates</SubHeading>
      <table className="mt-1.5 w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-400">
            <th className="py-1 text-left font-medium">Metric</th>
            <th className="py-1 text-right font-medium">Estimate</th>
            {hasActuals && <th className="py-1 text-right font-medium">Actual</th>}
            {hasActuals && <th className="py-1 text-right font-medium">Surprise</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key || i} className="border-t border-gray-100 align-top">
              <td className="py-1 pr-2 text-gray-700">
                {row.label}
                {row.source && <span className="block text-xs text-gray-400">{row.source}</span>}
                {row.note && <span className="block text-xs text-gray-500">{row.note}</span>}
              </td>
              <td className="py-1 text-right tabular-nums text-gray-700">
                {fmtEstimate(row.estimate, row.unit)}
                {row.low != null && row.high != null && (
                  <span className="block text-xs text-gray-400">
                    {fmtEstimate(row.low, row.unit)}–{fmtEstimate(row.high, row.unit)}
                  </span>
                )}
              </td>
              {hasActuals && (
                <td className="py-1 text-right font-medium tabular-nums text-gray-900">
                  {fmtEstimate(row.actual, row.unit)}
                </td>
              )}
              {hasActuals && (
                <td className={`py-1 text-right tabular-nums ${
                  row.surprisePct == null ? 'text-gray-400'
                    : row.surprisePct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {row.surprisePct != null ? fmtSignedPct(row.surprisePct) : EMPTY}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Section 1 — what the street wants settled on the call, and whether it was. */
function StreetQuestions({ items }: { items: StreetQuestion[] }) {
  return (
    <div>
      <SubHeading>Questions the street wants answered</SubHeading>
      <ol className="mt-1.5 space-y-2">
        {items.map((q, i) => {
          const a = q.answered ? ANSWER_STATE[q.answered] : null
          return (
            <li key={q.key || i} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-gray-800">{i + 1}. {q.question}</span>
                {a && <Badge className={a.className}>{a.label}</Badge>}
              </div>
              {q.why && <p className="mt-0.5 text-gray-600">{q.why}</p>}
              {q.answer && (
                <p className="mt-0.5 text-gray-700">
                  <span className="text-xs uppercase tracking-wide text-gray-400">Answer </span>
                  {q.answer}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * Section 2 — one half of the thesis evaluation. `test` is the break test copied
 * verbatim out of `security_theses`, so the reader sees the bar the thesis itself
 * set rather than one invented for the quarter.
 */
function ThesisChecks({ heading, items }: { heading: string; items: ThesisCheck[] }) {
  return (
    <div>
      <SubHeading>{heading}</SubHeading>
      <ol className="mt-1.5 space-y-2.5">
        {items.map((c, i) => {
          const s = c.status ? CHECK_STATUS[c.status] : null
          return (
            <li key={c.key || i} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-gray-800">{c.title}</span>
                {s && <Badge className={s.className}>{s.label}</Badge>}
              </div>
              {c.metric && <p className="mt-0.5 text-xs text-gray-500">{c.metric}</p>}
              <p className="mt-0.5 text-gray-600">
                <span className="text-xs uppercase tracking-wide text-gray-400">Test </span>
                {c.test}
              </p>
              {c.watchFor && (
                <p className="mt-0.5 text-gray-600">
                  <span className="text-xs uppercase tracking-wide text-gray-400">Watch </span>
                  {c.watchFor}
                </p>
              )}
              {c.finding && (
                <p className="mt-0.5 text-gray-700">
                  <span className="text-xs uppercase tracking-wide text-gray-400">Finding </span>
                  {c.finding}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** @deprecated legacy pre-Oct-2026 briefs; superseded by the two sections above. */
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
  const isEarnings = r.report_type === 'pre_earnings' || r.report_type === 'post_earnings'
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
        {isEarnings ? (
          <>
            {/* SECTION 1 — what the market expects and wants settled. */}
            <SectionHeading n={1} title="The Street" />
            {r.estimates && r.estimates.length > 0 && <Estimates rows={r.estimates} />}
            <Field label="Commentary" value={r.thesis} />
            {r.street_questions && r.street_questions.length > 0 && (
              <StreetQuestions items={r.street_questions} />
            )}

            {/* SECTION 2 — the firm's own thesis, re-tested against this print. */}
            <SectionHeading n={2} title="Thesis Evaluation" />
            {r.thesis_checks && r.thesis_checks.length > 0 && (
              <ThesisChecks heading="What we're looking for" items={r.thesis_checks} />
            )}
            {r.risk_checks && r.risk_checks.length > 0 && (
              <ThesisChecks heading="Risks we're watching" items={r.risk_checks} />
            )}
            <Field label="Bull case" value={r.bull_case} />
            <Field label="Bear case" value={r.bear_case} />
          </>
        ) : (
          <>
            <Field label="Thesis" value={r.thesis} />
            <Field label="Bull case" value={r.bull_case} />
            <Field label="Bear case" value={r.bear_case} />
          </>
        )}
        {/* Legacy briefs written before the two-section split. */}
        {r.watch_items && r.watch_items.length > 0 && <WatchItems items={r.watch_items} />}
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
