import { PORTFOLIO_CONSTRUCTION_AREAS, ANNUAL_CONSTRUCTION_QUESTION } from '@/lib/holdingReviews'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

interface PortfolioConstructionSectionProps {
  positions: PortfolioPosition[]
}

export function PortfolioConstructionSection({ positions }: PortfolioConstructionSectionProps) {
  const holdings = positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
  const cashWeight = positions
    .filter((p) => isCashTicker(p.ticker) || isCashTicker(p.securityId))
    .reduce((s, p) => s + p.weight, 0)

  return (
    <div>
      <p className="text-sm text-gray-600">Not about one stock — about the <span className="font-medium text-gray-800">whole portfolio</span>.</p>

      {/* Quick stats */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Holdings</p>
          <p className="mt-0.5 text-lg font-semibold text-gray-900">{holdings.length}</p>
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Cash level</p>
          <p className="mt-0.5 text-lg font-semibold text-gray-900">{cashWeight.toFixed(1)}%</p>
        </div>
      </div>

      {/* Check areas */}
      <div className="mt-4 overflow-hidden rounded-md border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="px-3 py-1.5 font-medium w-44">Area</th><th className="px-3 py-1.5 font-medium">What you're looking for</th></tr>
          </thead>
          <tbody>
            {PORTFOLIO_CONSTRUCTION_AREAS.map((a) => (
              <tr key={a.area} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-700">{a.area}</td>
                <td className="px-3 py-2 text-gray-500">{a.prompt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <blockquote className="mt-4 rounded-md border-l-2 border-gray-400 bg-gray-50 px-3 py-2 text-sm italic text-gray-700">
        “{ANNUAL_CONSTRUCTION_QUESTION}”
      </blockquote>
      <p className="mt-1 text-xs text-gray-400">Document your assessment in the section notes below.</p>
    </div>
  )
}
