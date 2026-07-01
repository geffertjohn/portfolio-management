import {
  ANNUAL_PURPOSE, DEEP_REVIEW_AREAS,
  ANNUAL_DECISION_OPTIONS, ANNUAL_DECISION_LABELS,
  type HoldingAssessment,
} from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

interface DeepReviewSectionProps {
  positions: PortfolioPosition[]
  assessments: Record<string, HoldingAssessment>
  onChange: (securityId: string, field: keyof HoldingAssessment, value: string | number | boolean | null) => void
}

export function DeepReviewSection({ positions, assessments, onChange }: DeepReviewSectionProps) {
  const holdings = positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
  const decided = holdings.filter((p) => assessments[p.securityId]?.annualDecision).length

  return (
    <div>
      <blockquote className="border-l-2 border-gray-300 pl-3 text-sm italic text-gray-600">“{ANNUAL_PURPOSE}”</blockquote>
      <p className="mt-2 text-sm text-gray-600">The true investment-committee-level review. For each stock, revisit:</p>

      <dl className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {DEEP_REVIEW_AREAS.map((a) => (
          <div key={a.area} className="flex gap-1.5 text-xs">
            <dt className="font-medium text-gray-700">{a.area}:</dt>
            <dd className="text-gray-500">{a.question}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2 font-medium">Holding</th>
              <th className="py-1 pr-2 font-medium w-36">Decision</th>
              <th className="py-1 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((p) => {
              const a = assessments[p.securityId]
              return (
                <tr key={p.securityId} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-1.5 pr-2 font-medium text-gray-800" title={p.name ?? undefined}>{p.ticker}</td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={a?.annualDecision ?? ''}
                      onChange={(e) => onChange(p.securityId, 'annualDecision', e.target.value)}
                      className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    >
                      <option value="">—</option>
                      {ANNUAL_DECISION_OPTIONS.map((o) => (
                        <option key={o} value={o}>{ANNUAL_DECISION_LABELS[o]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <input
                      type="text"
                      value={a?.annualNotes ?? ''}
                      onChange={(e) => onChange(p.securityId, 'annualNotes', e.target.value)}
                      placeholder="Rationale (optional)"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-gray-400">{decided} of {holdings.length} holdings decided · output: Keep / Increase / Reduce / Replace / Exit</p>
    </div>
  )
}
