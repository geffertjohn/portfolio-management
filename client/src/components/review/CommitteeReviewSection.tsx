import { ANNUAL_DECISION_LABELS } from '@/lib/holdingReviews'
import { committeeStage, type PortfolioReviewMemo } from '@/lib/portfolioReviewMemos'
import { fmtUtcLongDate } from '@/lib/formatters'

/**
 * The committee's read on the portfolio — **read-only, and it waits.**
 *
 * The roles run in the Claude Code harness; there is no Express → Anthropic
 * bridge, which the charter records as a deliberate position. So this surface
 * cannot start a run, and it does not offer a button that looks like it could.
 * It reports one of three states, derived from two facts rather than a stored
 * status that could contradict them: not handed off, handed off and waiting,
 * or a memo has landed.
 *
 * The waiting state says WHO acts next and how, because "AI research pending"
 * on a card with nothing behind it is a mistake this codebase has already made
 * once — a watchlist idea sat 23 days describing an absence as if something
 * were coming.
 */
export function CommitteeReviewSection({
  memo,
  requestedAt,
  portfolioName,
}: {
  memo: PortfolioReviewMemo | null
  requestedAt: string | null
  portfolioName: string
}) {
  const stage = committeeStage(requestedAt, memo)

  if (stage === 'not_requested') {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-700">Not yet handed off</p>
        <p className="mt-1 text-sm text-gray-500">
          Finish <span className="font-medium">Considerations</span> and hand the review off.
          Your proposals are recorded first so the committee answers the portfolio
          independently, rather than reacting to a decision already made.
        </p>
      </div>
    )
  }

  if (stage === 'awaiting') {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-medium text-blue-900">Awaiting committee</p>
        <p className="mt-1 text-sm text-blue-800">
          Handed off {fmtUtcLongDate(requestedAt)}. Nothing is running yet — the committee
          roles run in Claude Code, not in this app, so this review sits in the queue until a
          run picks it up.
        </p>
        <p className="mt-2 text-xs text-blue-700">
          To run it: ask Claude Code for the annual committee review of{' '}
          <span className="font-medium">{portfolioName}</span>. The portfolio manager, risk
          manager and macro strategist read this review&rsquo;s proposals and write back a
          single memo.
        </p>
      </div>
    )
  }

  const m = memo!
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">Committee memo</p>
        <p className="text-xs text-gray-400">Delivered {fmtUtcLongDate(m.createdAt)}</p>
      </div>

      {m.summary && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{m.summary}</p>
        </div>
      )}

      <RoleBlock label="Portfolio manager" body={m.pmAssessment} />
      <RoleBlock label="Risk manager" body={m.riskAssessment} />
      <RoleBlock label="Macro strategist" body={m.macroContext} />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Per-holding recommendations
        </p>
        {m.recommendations.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">
            The committee recommended no position changes.
          </p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-2 font-medium">Holding</th>
                <th className="py-1 pr-2 font-medium w-32">Recommends</th>
                <th className="py-1 pr-2 font-medium w-24 text-right">Target %</th>
                <th className="py-1 font-medium">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {m.recommendations.map((r) => (
                <tr key={r.securityId} className="border-t border-gray-100 align-top">
                  <td className="py-1.5 pr-2 font-medium text-gray-800">{r.securityId}</td>
                  <td className="py-1.5 pr-2 text-gray-700">
                    {r.recommendation ? ANNUAL_DECISION_LABELS[r.recommendation] : '—'}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                    {r.targetWeight == null ? '—' : `${r.targetWeight}%`}
                  </td>
                  <td className="py-1.5 text-gray-600">{r.rationale ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Recommend-only. Nothing here changes a position or stages a trade — the decision of
        record is yours, in the next step.
      </p>
    </div>
  )
}

function RoleBlock({ label, body }: { label: string; body: string | null }) {
  if (!body) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{body}</p>
    </div>
  )
}
