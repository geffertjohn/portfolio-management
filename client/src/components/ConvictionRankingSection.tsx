import {
  CONVICTION_TIER_OPTIONS, CONVICTION_TIER_INFO,
  CONVICTION_LABELS, type MonitorConviction,
  type HoldingAssessment, type ConvictionTier,
} from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

interface ConvictionRankingSectionProps {
  positions: PortfolioPosition[]
  assessments: Record<string, HoldingAssessment>
  /** Most recent prior conviction per security (from quarterly history), as a hint. */
  recentConviction: Record<string, MonitorConviction>
  onChange: (securityId: string, field: keyof HoldingAssessment, value: string | number | boolean | null) => void
}

export function ConvictionRankingSection({ positions, assessments, recentConviction, onChange }: ConvictionRankingSectionProps) {
  const holdings = positions
    .filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
    .sort((a, b) => b.weight - a.weight)
  const ranked = holdings.filter((p) => assessments[p.securityId]?.convictionTier).length

  return (
    <div>
      <p className="text-sm text-gray-600">Rank every holding from strongest to weakest — this drives position sizing.</p>

      {/* Tier reference */}
      <div className="mt-3 overflow-hidden rounded-md border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="px-3 py-1.5 font-medium">Tier</th><th className="px-3 py-1.5 font-medium">Meaning</th><th className="px-3 py-1.5 text-right font-medium">Target weight</th></tr>
          </thead>
          <tbody>
            {CONVICTION_TIER_OPTIONS.map((t) => (
              <tr key={t} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-medium text-gray-700">Tier {t}</td>
                <td className="px-3 py-1.5 text-gray-500">{CONVICTION_TIER_INFO[t].meaning}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{CONVICTION_TIER_INFO[t].target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2 font-medium">Holding</th>
              <th className="py-1 pr-2 text-right font-medium">Weight</th>
              <th className="py-1 pr-2 font-medium w-28">Tier</th>
              <th className="py-1 pr-2 font-medium">Target</th>
              <th className="py-1 font-medium">Prior conviction</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((p) => {
              const a = assessments[p.securityId]
              const tier = a?.convictionTier ?? null
              const info = tier ? CONVICTION_TIER_INFO[tier] : null
              const w = p.weight
              const outOfBand = info != null && (w < info.lower || (info.upper != null && w > info.upper))
              const prior = recentConviction[p.securityId]
              return (
                <tr key={p.securityId} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-1.5 pr-2 font-medium text-gray-800" title={p.name ?? undefined}>{p.ticker}</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${outOfBand ? 'font-semibold text-amber-600' : 'text-gray-700'}`}>{w.toFixed(1)}%</td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={tier ?? ''}
                      onChange={(e) => onChange(p.securityId, 'convictionTier', e.target.value ? (Number(e.target.value) as ConvictionTier) : null)}
                      className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    >
                      <option value="">—</option>
                      {CONVICTION_TIER_OPTIONS.map((t) => (<option key={t} value={t}>Tier {t}</option>))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2 text-xs text-gray-500">{info ? info.target : '—'}</td>
                  <td className="py-1.5 text-xs text-gray-400">{prior ? CONVICTION_LABELS[prior] : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-gray-400">{ranked} of {holdings.length} holdings ranked · amber weight = outside the tier's target band</p>
    </div>
  )
}
