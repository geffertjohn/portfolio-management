import { useState } from 'react'
import { THESIS_SCORECARD_FIELDS, type HoldingAssessment } from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

interface ThesisScorecardSectionProps {
  positions: PortfolioPosition[]
  assessments: Record<string, HoldingAssessment>
  onChange: (securityId: string, field: keyof HoldingAssessment, value: string | boolean | null) => void
}

const SCORECARD_KEYS = THESIS_SCORECARD_FIELDS.map((f) => f.field)

function filledCount(a: HoldingAssessment | undefined): number {
  if (!a) return 0
  return SCORECARD_KEYS.filter((f) => !!a[f]).length
}

export function ThesisScorecardSection({ positions, assessments, onChange }: ThesisScorecardSectionProps) {
  const holdings = positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  return (
    <div>
      <p className="text-sm text-gray-600">
        Update the <span className="font-medium text-gray-800">evidence behind the ownership decision</span> for each
        holding — not the whole thesis. Expand a holding to edit its scorecard.
      </p>

      <div className="mt-4 space-y-2">
        {holdings.map((p) => {
          const a = assessments[p.securityId]
          const n = filledCount(a)
          const open = expanded.has(p.securityId)
          return (
            <div key={p.securityId} className="rounded-md border border-gray-200">
              <button
                type="button"
                onClick={() => toggle(p.securityId)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{p.ticker}</span>
                  <span className="text-xs text-gray-400">{p.name}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  {n > 0 && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">{n}/{SCORECARD_KEYS.length}</span>}
                  <span>{open ? '▲' : '▼'}</span>
                </span>
              </button>
              {open && (
                <div className="space-y-3 border-t border-gray-100 p-3">
                  {THESIS_SCORECARD_FIELDS.map((f) => (
                    <div key={String(f.field)}>
                      <label className="block text-xs font-medium text-gray-700">{f.label}</label>
                      <textarea
                        value={(a?.[f.field] as string | null) ?? ''}
                        onChange={(e) => onChange(p.securityId, f.field, e.target.value)}
                        rows={2}
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
    </div>
  )
}
