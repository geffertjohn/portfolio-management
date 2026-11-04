/**
 * allocationChanges.ts
 *
 * The portfolio Change Log, DERIVED from `portfolio_allocations` rather than
 * stored.
 *
 * `holdings_change_log` is NOT the right source, and the reason is not the one
 * recorded here until Nov 2026. It was said to have "no writer anywhere"; it has
 * a live one — the `positions_audit` trigger calls `log_position_change()` on
 * every insert, update and delete of `positions`, and it has been appending
 * continuously since Apr 2026 (208 rows, the newest written the day before this
 * was corrected). What it logs is a change to the CURRENT target: a ticker, an
 * old weight, a new weight and a wall-clock `changed_at`, with **no
 * `effective_date`**. So it cannot say which dated snapshot a change belongs to,
 * which is exactly what a change log keyed by rebalance has to say — and it
 * records only what reached `positions`, while two books' positions are not
 * driven by their own history at all (a derived blend, and one book whose
 * newest snapshot is sixteen months older than its positions).
 *
 * That is the real argument, and it is the stronger one: the table is a
 * per-row audit trail of `positions`, which is a different question from "what
 * changed between these two rebalances". Rebuilding this tab on it would also
 * re-create the drift it is meant to report — a log that disagrees with the
 * grid above it is worse than no log.
 *
 * So this computes the diff on read, the way `quarterlyBrief.ts` assembles a
 * brief from documents that already exist. It is pure and React-free, and it
 * works retroactively — every snapshot a portfolio has ever carried is covered,
 * not just the ones imported after this landed.
 */
import { supabase } from './supabase'
import { fetchAllocationSnapshots } from './portfolioAllocations'

export type AllocationChangeType = 'add' | 'remove' | 'weight_change'

export interface AllocationChange {
  /** Stable within one portfolio — the key the list renders on. */
  key: string
  effectiveDate: string
  securityId: string
  name: string | null
  /** securities2.id for routing; null for cash and for staged-but-unknown symbols. */
  numericId: number | null
  changeType: AllocationChangeType
  /** Percent points, as stored. Null on the side where the holding did not exist. */
  oldWeight: number | null
  newWeight: number | null
}

export interface AllocationSnapshotLike {
  effective_date: string
  weights: Map<string, number>
}

/**
 * Weight moves below this are not reported (percent points).
 *
 * The weights are quarter-point figures from a YCharts export, so an exact
 * comparison is fine in principle — but a float round-trip through JSON and
 * `numeric` can leave 4.000000000000001, and one of those rendered as
 * "4.0% → 4.0%" teaches the reader the column is noise.
 */
const EPSILON = 0.005

/**
 * Diff consecutive snapshots into a change list, newest first.
 *
 * **The earliest snapshot is reported as additions**, not skipped. It is the
 * opening position, and a log whose first entry is the portfolio's second-ever
 * change reads as though the book appeared from nowhere. They are genuinely
 * "added on that date" as far as the record goes.
 */
export function deriveAllocationChanges(
  snapshots: AllocationSnapshotLike[],
): Omit<AllocationChange, 'name' | 'numericId'>[] {
  const asc = [...snapshots].sort((a, b) =>
    a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0,
  )
  const out: Omit<AllocationChange, 'name' | 'numericId'>[] = []

  asc.forEach((snap, i) => {
    const prev = i === 0 ? new Map<string, number>() : asc[i - 1].weights
    const symbols = new Set([...prev.keys(), ...snap.weights.keys()])

    for (const sym of [...symbols].sort()) {
      const before = prev.get(sym) ?? null
      const after = snap.weights.get(sym) ?? null
      if (before == null && after == null) continue

      let changeType: AllocationChangeType
      if (before == null) changeType = 'add'
      else if (after == null) changeType = 'remove'
      else if (Math.abs(after - before) < EPSILON) continue
      else changeType = 'weight_change'

      out.push({
        key: `${snap.effective_date}:${sym}`,
        effectiveDate: snap.effective_date,
        securityId: sym,
        changeType,
        oldWeight: before,
        newWeight: after,
      })
    }
  })

  // Newest first; within a date, the structural changes before the re-weights,
  // because "we sold X" is the headline and "Y moved a point" is the detail.
  const rank: Record<AllocationChangeType, number> = { add: 0, remove: 1, weight_change: 2 }
  return out.sort((a, b) => {
    if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? 1 : -1
    if (a.changeType !== b.changeType) return rank[a.changeType] - rank[b.changeType]
    return a.securityId < b.securityId ? -1 : 1
  })
}

/**
 * The change log for one portfolio.
 *
 * Names come from a SEPARATE `securities2` lookup, never an embed —
 * `portfolio_allocations` has no FK to it (gotcha 14), and a sold holding may
 * not be in `securities2` at all, which is exactly the row a change log exists
 * to show. Those render with a null name rather than being dropped.
 */
export async function fetchAllocationChanges(portfolioName: string): Promise<AllocationChange[]> {
  const snapshots = await fetchAllocationSnapshots(portfolioName)
  const changes = deriveAllocationChanges(snapshots)
  if (changes.length === 0) return []

  const symbols = [...new Set(changes.map((c) => c.securityId))]
  const { data, error } = await supabase
    .from('securities2')
    .select('id, security_id, security_name')
    .in('security_id', symbols)
  if (error) throw error

  const meta = new Map((data ?? []).map((r) => [r.security_id, r]))
  return changes.map((c) => {
    const m = meta.get(c.securityId)
    return { ...c, name: m?.security_name?.trim() || null, numericId: m?.id ?? null }
  })
}
