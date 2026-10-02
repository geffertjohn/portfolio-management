import { PORTFOLIO_STRATEGIES, strategyScopeValue } from '@/lib/compliance'
import type { Portfolio } from '@/types/portfolio'

/**
 * The scope picker shared by the Portfolio Rules and Position Rules forms —
 * a whole strategy, or one portfolio.
 *
 * Strategies come first because a rule that should cover a family is the easy
 * thing to miss: picking the five Foundation portfolios one at a time produces
 * five rules that then drift apart, and leaves any Foundation portfolio added
 * later silently ungoverned.
 *
 * Only strategies that actually have portfolios are offered, and each carries
 * its count so an empty or one-portfolio family is obvious before it is chosen.
 */
export function ScopeSelect({
  portfolios,
  value,
  onChange,
  id,
}: {
  portfolios: Portfolio[]
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const countByStrategy = new Map<string, number>()
  for (const p of portfolios) {
    if (!p.portfolio_strategy) continue
    countByStrategy.set(p.portfolio_strategy, (countByStrategy.get(p.portfolio_strategy) ?? 0) + 1)
  }
  const strategies = PORTFOLIO_STRATEGIES.filter((s) => (countByStrategy.get(s) ?? 0) > 0)

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
    >
      <option value="">Select scope…</option>
      {strategies.length > 0 && (
        <optgroup label="Whole strategy">
          {strategies.map((s) => (
            <option key={s} value={strategyScopeValue(s)}>
              All {s} portfolios ({countByStrategy.get(s)})
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Individual portfolio">
        {portfolios.map((p) => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </optgroup>
    </select>
  )
}
