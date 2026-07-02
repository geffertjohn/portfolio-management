import { useQuery } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  fetchTradeSuitabilityByPortfolio,
  ACTION_LABELS,
  ACTION_COLORS,
  REASON_LABELS,
  type TradeSuitability,
} from '@/lib/tradeSuitability'
import {
  THESIS_STATUS_LABELS, BUSINESS_TREND_LABELS, VALUATION_LABELS,
  CONVICTION_LABELS, ACTION_LABELS as MONITOR_ACTION_LABELS,
} from '@/lib/holdingReviews'
import { formatDate } from '@/lib/fundFormat'

/** Captured monitoring assessment chips (Edit Position), when present. */
function assessmentChips(e: TradeSuitability): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = []
  if (e.monitor_action) chips.push({ label: 'Action', value: MONITOR_ACTION_LABELS[e.monitor_action] })
  if (e.thesis_status)  chips.push({ label: 'Thesis', value: THESIS_STATUS_LABELS[e.thesis_status] })
  if (e.business_trend) chips.push({ label: 'Trend', value: BUSINESS_TREND_LABELS[e.business_trend] })
  if (e.valuation)      chips.push({ label: 'Valuation', value: VALUATION_LABELS[e.valuation] })
  if (e.conviction)     chips.push({ label: 'Conviction', value: CONVICTION_LABELS[e.conviction] })
  return chips
}

interface TradeSuitabilityLogProps {
  portfolioId: string
}

export function TradeSuitabilityLog({ portfolioId }: TradeSuitabilityLogProps) {
  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.tradeSuitability(portfolioId),
    queryFn: () => fetchTradeSuitabilityByPortfolio(portfolioId),
  })

  if (isLoading) {
    return <p className="mt-2 text-sm text-gray-500">Loading suitability log…</p>
  }

  if (error) {
    return (
      <p className="mt-2 text-sm text-red-600">
        Failed to load suitability log:{' '}
        {error instanceof Error ? error.message : String(error)}
      </p>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">No suitability records yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Records are created automatically when you add, edit, or remove positions.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Action badge */}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_COLORS[entry.action]}`}
              >
                {ACTION_LABELS[entry.action]}
              </span>
              {/* Security */}
              <span className="text-sm font-medium text-gray-900">
                {entry.security_id}
              </span>
              {/* Weight change */}
              {(entry.old_weight !== null || entry.new_weight !== null) && (
                <span className="text-xs text-gray-500">
                  {entry.old_weight !== null ? `${entry.old_weight.toFixed(1)}%` : '—'}
                  {' → '}
                  {entry.new_weight !== null ? `${entry.new_weight.toFixed(1)}%` : '—'}
                </span>
              )}
            </div>
            {/* Date */}
            <span className="whitespace-nowrap text-xs text-gray-400">
              {formatDate(entry.recorded_at)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {/* Reason code */}
            <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {REASON_LABELS[entry.reason_code]}
            </span>
            {/* Rationale */}
            {entry.rationale && (
              <p className="text-sm text-gray-600">{entry.rationale}</p>
            )}
          </div>

          {/* Monitoring assessment captured at the time of the change */}
          {assessmentChips(entry).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {assessmentChips(entry).map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-500">
                  <span className="font-medium text-gray-600">{c.label}:</span> {c.value}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
