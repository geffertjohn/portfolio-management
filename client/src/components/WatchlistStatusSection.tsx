import {
  WATCHLIST_TRIGGER_OPTIONS, WATCHLIST_TRIGGER_LABELS, WATCHLIST_FIELDS,
  type HoldingAssessment,
} from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

interface WatchlistStatusSectionProps {
  positions: PortfolioPosition[]
  assessments: Record<string, HoldingAssessment>
  onChange: (securityId: string, field: keyof HoldingAssessment, value: string | boolean | null) => void
}

// Trigger → example, for the guidance table.
const TRIGGER_EXAMPLES: Record<string, string> = {
  fundamental_deterioration: 'Revenue growth slows materially',
  margin_pressure: 'Gross/operating margins decline',
  estimate_cuts: 'Forward EPS revised down',
  thesis_concern: 'Competitive position weakening',
  valuation_issue: 'Stock too expensive relative to growth',
  portfolio_issue: 'Position too large or redundant',
}

export function WatchlistStatusSection({ positions, assessments, onChange }: WatchlistStatusSectionProps) {
  const holdings = positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
  const flaggedCount = holdings.filter((p) => assessments[p.securityId]?.onWatchlist).length

  return (
    <div>
      <p className="text-sm text-gray-600">
        The watchlist is for holdings that are <span className="font-medium text-gray-800">not automatic sells but need
        elevated scrutiny</span>. Flag a holding, pick the trigger, and document the exit conditions.
      </p>

      {/* Trigger guidance */}
      <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-600">Move a stock to the watchlist if:</p>
        <dl className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {WATCHLIST_TRIGGER_OPTIONS.map((t) => (
            <div key={t} className="flex gap-1.5 text-xs">
              <dt className="font-medium text-gray-700">{WATCHLIST_TRIGGER_LABELS[t]}:</dt>
              <dd className="text-gray-500">{TRIGGER_EXAMPLES[t]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 space-y-2">
        {holdings.map((p) => {
          const a = assessments[p.securityId]
          const on = a?.onWatchlist ?? false
          return (
            <div key={p.securityId} className={`rounded-md border p-3 ${on ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onChange(p.securityId, 'onWatchlist', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                  <span className="text-sm font-medium text-gray-900">{p.ticker}</span>
                  <span className="text-xs text-gray-400">{p.name}</span>
                </label>
                {a?.action === 'watchlist' && !on && (
                  <span className="text-xs text-amber-600">Action = Watchlist</span>
                )}
              </div>

              {on && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Trigger</label>
                    <select
                      value={a?.watchlistTrigger ?? ''}
                      onChange={(e) => onChange(p.securityId, 'watchlistTrigger', e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                    >
                      <option value="">—</option>
                      {WATCHLIST_TRIGGER_OPTIONS.map((t) => (
                        <option key={t} value={t}>{WATCHLIST_TRIGGER_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  {WATCHLIST_FIELDS.map((f) => (
                    <div key={String(f.field)}>
                      <label className="block text-xs font-medium text-gray-700">{f.label}</label>
                      <input
                        type="text"
                        value={(a?.[f.field] as string | null) ?? ''}
                        onChange={(e) => onChange(p.securityId, f.field, e.target.value)}
                        placeholder={f.placeholder}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[11px] text-gray-400">{flaggedCount} flagged for the watchlist</p>
    </div>
  )
}
