import {
  MONITORING_AREAS,
  THESIS_STATUS_OPTIONS, THESIS_STATUS_LABELS,
  BUSINESS_TREND_OPTIONS, BUSINESS_TREND_LABELS,
  VALUATION_OPTIONS, VALUATION_LABELS,
  CONVICTION_OPTIONS, CONVICTION_LABELS,
  ACTION_OPTIONS, ACTION_LABELS,
  type HoldingAssessment,
} from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

interface HoldingMonitorGridProps {
  positions: PortfolioPosition[]
  assessments: Record<string, HoldingAssessment>
  onChange: (securityId: string, field: keyof Omit<HoldingAssessment, 'securityId'>, value: string) => void
}

// One column per categorical assignment, in the order from the spec.
const COLUMNS: {
  field: keyof Omit<HoldingAssessment, 'securityId'>
  label: string
  options: readonly string[]
  labels: Record<string, string>
}[] = [
  { field: 'thesisStatus',  label: 'Thesis Status', options: THESIS_STATUS_OPTIONS,  labels: THESIS_STATUS_LABELS },
  { field: 'businessTrend', label: 'Business Trend', options: BUSINESS_TREND_OPTIONS, labels: BUSINESS_TREND_LABELS },
  { field: 'valuation',     label: 'Valuation',      options: VALUATION_OPTIONS,      labels: VALUATION_LABELS },
  { field: 'conviction',    label: 'Conviction',     options: CONVICTION_OPTIONS,     labels: CONVICTION_LABELS },
  { field: 'action',        label: 'Action',         options: ACTION_OPTIONS,         labels: ACTION_LABELS },
]

export function HoldingMonitorGrid({ positions, assessments, onChange }: HoldingMonitorGridProps) {
  const holdings = positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
  const assessedCount = holdings.filter((p) => {
    const a = assessments[p.securityId]
    return a && (a.thesisStatus || a.businessTrend || a.valuation || a.conviction || a.action)
  }).length

  return (
    <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3">
      {/* Guidance: the five areas to review per holding */}
      <p className="text-xs font-medium text-gray-600">For each holding, review:</p>
      <dl className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {MONITORING_AREAS.map((m) => (
          <div key={m.area} className="flex gap-1.5 text-xs">
            <dt className="font-medium text-gray-700">{m.area}:</dt>
            <dd className="text-gray-500">{m.prompt}</dd>
          </div>
        ))}
      </dl>

      {holdings.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400">No holdings to assess.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-2 font-medium">Holding</th>
                {COLUMNS.map((c) => (
                  <th key={c.field} className="py-1 pr-2 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((p) => {
                const a = assessments[p.securityId]
                return (
                  <tr key={p.securityId} className="border-t border-gray-200">
                    <td className="whitespace-nowrap py-1 pr-2 font-medium text-gray-800" title={p.name ?? undefined}>
                      {p.ticker}
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.field} className="py-1 pr-2">
                        <select
                          value={(a?.[c.field] as string | null) ?? ''}
                          onChange={(e) => onChange(p.securityId, c.field, e.target.value)}
                          className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                        >
                          <option value="">—</option>
                          {c.options.map((o) => (
                            <option key={o} value={o}>{c.labels[o]}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-[11px] text-gray-400">{assessedCount} of {holdings.length} holdings assessed</p>
    </div>
  )
}
