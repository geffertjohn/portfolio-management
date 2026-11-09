import { useMemo } from 'react'
import {
  ANNUAL_DECISION_OPTIONS, ANNUAL_DECISION_LABELS,
  type HoldingAssessment, type AnnualDecision,
} from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioReviewMemo } from '@/lib/portfolioReviewMemos'
import type { PortfolioPosition } from '@/types/position'

/**
 * The decision of record, with the committee's read beside it.
 *
 * **"You proposed" is gone** (Nov 2026), with the per-holding proposal it read
 * from. The considerations step no longer asks the advisor to decide the review
 * before the committee looks at it; it asks what each holding should be weighed
 * against, and the proposing now happens by recording an idea on the watchlist.
 *
 * **The committee's recommendation is still never pre-selected.** Defaulting to
 * it would turn a decision into an acceptance, which is the whole reason the
 * two are shown side by side rather than merged.
 *
 * **The disagreement badge survives, and it now means something different.** It
 * used to mark a proposal and a recommendation formed independently — a SPLIT.
 * With no proposal to compare, it marks the advisor's final decision departing
 * from what the committee recommended, which is an OVERRIDE. Different claim,
 * so a different word: a regulator asking "where did you not follow your own
 * committee" is asking about this column, and letting the old label stand over
 * the new comparison would answer a question nobody asked.
 *
 * **Recorded only.** Nothing here writes `positions` or stages a trade; the
 * advisor executes separately. That is the same guarantee the candidate
 * workflow's CIO decision carries.
 */
export function FinalDecisionSection({
  positions,
  assessments,
  memo,
  onChange,
}: {
  positions: PortfolioPosition[]
  assessments: Record<string, HoldingAssessment>
  memo: PortfolioReviewMemo | null
  onChange: (securityId: string, field: keyof HoldingAssessment, value: string | number | boolean | null) => void
}) {
  const holdings = useMemo(
    () => positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId)),
    [positions],
  )
  const bySecurity = useMemo(
    () => new Map((memo?.recommendations ?? []).map((r) => [r.securityId, r])),
    [memo],
  )
  const decided = holdings.filter((h) => assessments[h.securityId]?.annualDecision).length

  return (
    <div>
      <p className="text-sm text-gray-600">
        Your decision, against what the committee came back with.
        {!memo && ' The committee has not reported yet — you can still decide without them.'}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2 font-medium">Holding</th>
              <th className="py-1 pr-2 font-medium w-28">Committee</th>
              <th className="py-1 pr-2 font-medium w-36">Decision</th>
              <th className="py-1 font-medium">Notes <span className="font-normal text-gray-400">(optional)</span></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const a = assessments[h.securityId]
              const rec = bySecurity.get(h.securityId) ?? null
              const recommended = rec?.recommendation ?? null
              const decision = a?.annualDecision ?? null
              // Both sides must be stated. A row still being filled in is not
              // an override, and badging it as one would flag every holding
              // the moment the committee reports.
              const override = decision !== null && recommended !== null && decision !== recommended
              return (
                <tr key={h.securityId} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 font-medium text-gray-800" title={h.name ?? undefined}>
                    {h.ticker}
                    {override && (
                      <span
                        title="Your decision differs from the committee's recommendation."
                        className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      >
                        override
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-xs text-gray-600">
                    {recommended ? ANNUAL_DECISION_LABELS[recommended] : <span className="text-gray-300">—</span>}
                    {rec?.targetWeight != null && <span className="text-gray-400"> · {rec.targetWeight}%</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {/* Deliberately unselected: neither side is the default. */}
                    <select
                      value={a?.annualDecision ?? ''}
                      onChange={(e) => onChange(h.securityId, 'annualDecision', e.target.value || null)}
                      className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    >
                      <option value="">—</option>
                      {ANNUAL_DECISION_OPTIONS.map((o: AnnualDecision) => (
                        <option key={o} value={o}>{ANNUAL_DECISION_LABELS[o]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <input
                      type="text"
                      value={a?.annualNotes ?? ''}
                      placeholder={override ? 'Why you went against the committee…' : ''}
                      onChange={(e) => onChange(h.securityId, 'annualNotes', e.target.value || null)}
                      className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {decided} of {holdings.length} decided. Recorded only — nothing here changes a
        position or stages a trade.
      </p>
    </div>
  )
}
