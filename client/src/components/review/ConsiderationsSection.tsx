import { useMemo } from 'react'
import {
  ANNUAL_DECISION_OPTIONS, ANNUAL_DECISION_LABELS,
  type HoldingAssessment, type AnnualDecision,
} from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { fmtUtcLongDate } from '@/lib/formatters'
import type { PortfolioPosition } from '@/types/position'

/**
 * The advisor's handoff to the investment committee.
 *
 * **Written BEFORE the committee looks, and that is the point.** A proposal
 * recorded after reading the committee's view is not an independent one, and
 * the record could not show that it was. So this section closes with a handoff
 * that stamps a queue, and the committee step waits on it.
 *
 * Once handed off the fields go read-only. Not to be officious — if the
 * proposal can still be edited while the committee is forming a view on it,
 * then what the committee answered and what the file says the advisor proposed
 * can differ, and nothing would record which came first.
 */
export function ConsiderationsSection({
  positions,
  assessments,
  considerations,
  requestedAt,
  busy,
  onChange,
  onConsiderationsChange,
  onRequest,
  onCancelRequest,
}: {
  positions: PortfolioPosition[]
  assessments: Record<string, HoldingAssessment>
  considerations: string
  requestedAt: string | null
  busy: boolean
  onChange: (securityId: string, field: keyof HoldingAssessment, value: string | number | boolean | null) => void
  onConsiderationsChange: (value: string) => void
  onRequest: () => void
  onCancelRequest: () => void
}) {
  const holdings = useMemo(
    () => positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId)),
    [positions],
  )
  const locked = requestedAt !== null
  const proposed = holdings.filter((h) => assessments[h.securityId]?.proposedDecision).length

  return (
    <div>
      <p className="text-sm text-gray-600">
        What you are inclined to do, and anything you want the committee to weigh, recorded
        before they look. Leave a holding blank to say nothing about it.
      </p>

      {locked && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-800">
            Handed to the committee on {fmtUtcLongDate(requestedAt)}. Frozen so their read and
            your proposal cannot drift apart.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onCancelRequest}
            className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50"
          >
            Withdraw handoff
          </button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2 font-medium">Holding</th>
              <th className="py-1 pr-2 font-medium w-20 text-right">Weight</th>
              <th className="py-1 pr-2 font-medium w-36">Proposal</th>
              <th className="py-1 pr-2 font-medium w-20">Target %</th>
              <th className="py-1 font-medium">Rationale <span className="font-normal text-gray-400">(optional)</span></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const a = assessments[h.securityId]
              const decision = a?.proposedDecision ?? ''
              // A target weight only means something for a size change; for keep
              // or exit it would be noise, or a contradiction.
              const wantsWeight = decision === 'increase' || decision === 'reduce' || decision === 'replace'
              return (
                <tr key={h.securityId} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-1.5 pr-2 align-top font-medium text-gray-800" title={h.name ?? undefined}>
                    {h.ticker}
                  </td>
                  <td className="py-1.5 pr-2 align-top text-right tabular-nums text-gray-500">
                    {h.weight.toFixed(2)}%
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <select
                      value={decision}
                      disabled={locked}
                      onChange={(e) => onChange(h.securityId, 'proposedDecision', e.target.value || null)}
                      className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                    >
                      <option value="">—</option>
                      {ANNUAL_DECISION_OPTIONS.map((o: AnnualDecision) => (
                        <option key={o} value={o}>{ANNUAL_DECISION_LABELS[o]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    {wantsWeight ? (
                      <input
                        type="number" min={0} max={100} step={0.25}
                        value={a?.proposedWeight ?? ''}
                        disabled={locked}
                        onChange={(e) => onChange(h.securityId, 'proposedWeight', e.target.value === '' ? null : Number(e.target.value))}
                        className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs tabular-nums text-gray-900 focus:border-gray-500 focus:outline-none disabled:bg-gray-50"
                      />
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-1.5 align-top">
                    {/*
                      A rationale worth recording runs to paragraphs, so this is a
                      growing textarea rather than the single-line input it was. A
                      real one here reached 1,043 characters and a 265px input
                      showed about thirty of them — the advisor was handed a view
                      recorded in their name that they could not read, which is the
                      MarkReviewedModal lesson over again. Capped so seven of these
                      do not push the handoff button off the page.
                    */}
                    <AutoGrowTextarea
                      value={a?.proposedRationale ?? ''}
                      disabled={locked}
                      placeholder={decision ? 'Why…' : ''}
                      maxHeightPx={200}
                      onChange={(v) => onChange(h.securityId, 'proposedRationale', v || null)}
                      className="w-full min-h-[2rem] rounded border border-gray-300 px-1.5 py-1 text-xs leading-relaxed text-gray-900 focus:border-gray-500 focus:outline-none disabled:bg-gray-50"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">
          Anything else for the committee <span className="text-gray-400">(optional)</span>
        </label>
        <AutoGrowTextarea
          value={considerations}
          disabled={locked}
          onChange={onConsiderationsChange}
          maxHeightPx={320}
          placeholder="Concerns, constraints, anything you want them to weigh that the numbers do not show…"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-50"
        />
      </div>

      {!locked && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-600">
            {proposed === 0
              ? 'No proposals yet — you can hand off without any, and ask the committee to look cold.'
              : `${proposed} ${proposed === 1 ? 'proposal' : 'proposals'} recorded.`}
            {' '}The committee runs in Claude Code, so this queues the review rather than starting it.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onRequest}
            className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Handing off…' : 'Hand off to committee'}
          </button>
        </div>
      )}
    </div>
  )
}
