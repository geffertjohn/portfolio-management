/**
 * positionsDrift.ts
 *
 * Does `positions` still say what the newest allocation snapshot says?
 *
 * `positions` holds the CURRENT target weights and `portfolio_allocations` holds
 * the dated history, so the newest snapshot and the positions table are meant to
 * be the same statement twice. Only the IMPORT path keeps that true
 * (`syncPositionsFromLatestSnapshot`); a hand edit in the History grid used to
 * change history and leave positions behind in the database, with nothing on
 * screen saying the two sub-tabs now disagreed.
 *
 * The comparison is pure and lives here so it can be tested, and so the panel
 * and any future writer read the same definition of "drifted".
 *
 * **A wholesale re-point is NOT safe to do automatically**, which is why this
 * reports rather than fixes. On the live book two portfolios already diverge,
 * for opposite reasons: Equity Income & Core Growth is a DERIVED BLEND whose
 * positions are computed from its two parents and whose history is not the
 * authority (re-pointing would delete 25 rows), and ETF Conservative's newest
 * snapshot is sixteen months older than its positions, so syncing would quietly
 * revert a live book to a 2025 lineup. Telling the advisor is useful; deciding
 * for them is not.
 */

/** Portfolios whose positions are COMPUTED, so history cannot be the authority. */
export const DERIVED_BLEND_PORTFOLIOS = new Set(['Equity Income & Core Growth'])

/** Below this (percent points) a weight difference is float noise, not a change. */
const EPSILON = 0.005

/**
 * Is this the column that states the CURRENT target?
 *
 * Only the newest date does, so only an edit there is pushed through to
 * `positions`; every earlier column is history and writes nothing. Pulled out
 * of the panel so the rule is stated once and can be tested — getting it
 * backwards would either leave the newest edit stale (the original defect) or
 * let a correction to an old column rewrite a live book.
 */
export function isCurrentTargetDate(date: string, dates: string[]): boolean {
  if (dates.length === 0) return false
  // Not `dates.at(-1)`: the caller's ordering is not a guarantee worth relying
  // on when the answer decides whether a position is written.
  let newest = dates[0]
  for (const d of dates) if (d > newest) newest = d
  return date === newest
}

export interface PositionsDrift {
  /** The snapshot compared against. */
  effectiveDate: string
  /** Held in positions but absent from the newest snapshot. */
  extra: string[]
  /** In the newest snapshot but not held in positions. */
  missing: string[]
  /** Held in both, at different weights. */
  reweighted: string[]
}

export function driftCount(d: PositionsDrift): number {
  return d.extra.length + d.missing.length + d.reweighted.length
}

/**
 * Compare a portfolio's positions against one allocation snapshot.
 *
 * Returns null when there is nothing to compare — no snapshot, or an empty one.
 * A zero weight is ABSENT, matching the importer, which skips zero rows rather
 * than writing a position nobody holds.
 */
export function comparePositionsToSnapshot(
  positions: { security_id: string; allocation_pct: number | null }[],
  snapshot: { effectiveDate: string; weights: Map<string, number> } | null,
): PositionsDrift | null {
  if (!snapshot) return null
  const target = new Map([...snapshot.weights].filter(([, w]) => w !== 0))
  if (target.size === 0) return null

  const held = new Map(positions.map((p) => [p.security_id, p.allocation_pct ?? 0]))
  const extra = [...held.keys()].filter((s) => !target.has(s)).sort()
  const missing = [...target.keys()].filter((s) => !held.has(s)).sort()
  const reweighted = [...target.keys()]
    .filter((s) => held.has(s) && Math.abs(held.get(s)! - target.get(s)!) > EPSILON)
    .sort()

  return { effectiveDate: snapshot.effectiveDate, extra, missing, reweighted }
}
