/**
 * rebalanceSchedule.ts
 *
 * The SCHEDULED rebalance trigger — the time-based one of the four. The other
 * three are threshold breaches: tiers 1 and 2 in `allocationBands.ts`, tier 3 in
 * `positionBands.ts`.
 *
 * NOTHING IS STORED. `portfolio.next_rebalance_date` exists but is null on every
 * portfolio, and seeding it would mean computing it from the allocation
 * snapshots anyway — so the snapshots are read directly and the derived date is
 * never written back. `portfolio_allocations` already IS the rebalance record:
 * each `effective_date` is one rebalance, which is what the History grid means
 * by "Each column is a rebalance; the rightmost is current."
 *
 * The useful consequence is that the action completes itself. Adding a dated
 * allocation — in Allocation → History, or through the allocation import — moves
 * the anchor forward and the action disappears, with no "mark rebalanced" button
 * and no second copy of the truth to go stale. That is the derived-action
 * contract: projected read-only, completed in its own workflow.
 */
import { supabase } from './supabase'
import { fetchModelPortfolios } from './modelPortfolios'

/** The three cadences the Edit Model Portfolio form offers, in months. */
export const REBALANCE_INTERVAL_MONTHS: Record<string, number> = {
  'Quarterly': 3,
  'Semi-Annual': 6,
  'Annual': 12,
}

export interface RebalanceSchedule {
  portfolioName: string
  /** `model_portfolio_data.rebalance_frequency`; null when no model resolves. */
  frequency: string | null
  /** Newest allocation snapshot, or the stored column when it is later. */
  anchor: string | null
  /** `anchor` + the cadence interval. Null when either input is missing. */
  due: string | null
}

/**
 * Add whole months to a `YYYY-MM-DD` date, clamping to the end of the target
 * month. Without the clamp a 31 January anchor lands on 3 March, because
 * `Date.UTC` rolls a day overflow forward into the next month.
 */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  const wantMonth = (((m - 1 + months) % 12) + 12) % 12
  const out = new Date(Date.UTC(y, m - 1 + months, d))
  if (out.getUTCMonth() !== wantMonth) out.setUTCDate(0)
  return out.toISOString().slice(0, 10)
}

/** The next scheduled rebalance, or null when the cadence is unset or unknown. */
export function computeRebalanceDue(
  anchor: string | null,
  frequency: string | null,
): string | null {
  if (!anchor || !frequency) return null
  const months = REBALANCE_INTERVAL_MONTHS[frequency.trim()]
  // An unrecognised cadence yields no action rather than a guessed one — a
  // wrong rebalance date is worse than an absent one.
  if (months == null) return null
  return addMonths(anchor, months)
}

/**
 * Newest `effective_date` per portfolio.
 *
 * PAGINATED DELIBERATELY. An unfiltered select is capped at 1000 rows and the
 * table already holds ~1700, so a single call silently drops portfolios and
 * reports them as having no history at all. Ordered by the primary key, which
 * is unique — ordering by a non-unique column makes `range()` paging
 * non-deterministic and can skip or repeat rows.
 */
async function latestSnapshotDates(): Promise<Map<string, string>> {
  const PAGE = 1000
  const out = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('portfolio_allocations')
      .select('portfolio_name, effective_date')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      const name = r.portfolio_name as string
      const date = r.effective_date as string
      const seen = out.get(name)
      if (!seen || date > seen) out.set(name, date)
    }
    if (rows.length < PAGE) break
  }
  return out
}

/** One schedule per portfolio, including those with no anchor or no cadence. */
export async function fetchRebalanceSchedules(): Promise<RebalanceSchedule[]> {
  const [portfoliosRes, mapRes, models, snapshots] = await Promise.all([
    supabase.from('portfolio').select('name, security_id, last_rebalance_date'),
    supabase.from('portfolio_model_map').select('security_id, model_portfolio_id'),
    fetchModelPortfolios(),
    latestSnapshotDates(),
  ])
  if (portfoliosRes.error) throw portfoliosRes.error
  if (mapRes.error) throw mapRes.error

  const modelById = new Map(models.map((m) => [m.id, m]))
  const mappedModel = new Map(
    (mapRes.data ?? []).map((r) => [r.security_id as string, r.model_portfolio_id as number]),
  )

  return (portfoliosRes.data ?? []).map((pf) => {
    const name = pf.name as string
    const modelId = pf.security_id ? mappedModel.get(pf.security_id as string) : undefined
    const model = modelId != null ? modelById.get(modelId) : undefined
    const frequency = model?.rebalance_frequency ?? null

    // The stored column is read but never written: YCharts supplies it for a
    // single portfolio, and ignoring it there would date the schedule from
    // older evidence than we actually hold.
    const candidates = [snapshots.get(name), pf.last_rebalance_date as string | null]
      .filter((d): d is string => !!d)
      .map((d) => d.slice(0, 10))
    const anchor = candidates.length > 0 ? candidates.sort().at(-1)! : null

    return { portfolioName: name, frequency, anchor, due: computeRebalanceDue(anchor, frequency) }
  })
}
