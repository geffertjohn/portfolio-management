/**
 * watchlistGroups.ts — watched funds, grouped by the firm's asset classes.
 *
 * The Watchlist used to split funds by VEHICLE — an ETF column beside a mutual
 * fund column — which is not a question anyone asks of an idea list. Whether
 * FELC is an ETF and ICAFX is a fund says nothing about what either is FOR;
 * both are Large Blend, both compete for the same sleeve, and they sat in
 * different columns. Grouping by sleeve puts the comparison on the page.
 *
 * **The grouping is `resolveAssetClass`, not a vocabulary of its own.** That is
 * the documented single source of truth for which sleeve a security fills, it
 * is what the allocation rollup and the model targets already use, and a second
 * grouping here would be a second place for the rules to be wrong. Building
 * this surfaced the live proof: `Mid-Cap Value` and `Small Value` were missing
 * from `ASSET_CLASS_BY_CATEGORY`, so FSMVX, NAMAX, QVAL and VSMIX resolved to
 * null — gotcha 23, on four ideas, invisible because the coverage audit walks
 * HELD securities and none of the four is held yet.
 *
 * Three shaping decisions, each with a reason:
 *
 * - **All fourteen classes are returned, including the empty ones.** A sleeve
 *   with no idea recorded is a real gap in an idea list — it is the difference
 *   between "nothing good available" and "never looked" — and it is only
 *   visible if the row is there to be empty. The caller greys them.
 * - **US Large Cap is ONE group with three sub-groups**; everything else is
 *   flat. The taxonomy splits large cap three ways and nothing else, so the
 *   nesting mirrors the taxonomy rather than imposing a shape on it.
 * - **An unresolvable fund gets its own group at the END**, never a silent
 *   drop. Same argument as the unclassified-weight row beneath the allocation
 *   table: a fund missing from the list reads as one the firm does not watch,
 *   which is the opposite of what a mapping gap means.
 *
 * **"Unclassified" and "awaiting data" are SEPARATE groups**, for the same
 * reason `UnpricedReason` separates a workbook gap from a feed limit: they
 * have different causes and different remedies. A fund with no `securities2`
 * row is the normal state of one added minutes ago — the refresh adds the
 * ticker and it resolves by itself tomorrow. A fund WITH a row whose category
 * the map cannot place is a bug in the map, and nothing fixes it until
 * somebody edits `ASSET_CLASS_BY_CATEGORY`. Collapsing the two would file a
 * standing defect under a heading that clears overnight.
 */
import { resolveAssetClass } from './assetClass'
import { ASSET_CLASS_ROWS, type AssetClassKey } from './modelPortfolios'
import { scorecardScore, scoreBand, type ScoreBand, type ScorecardCohort } from './fundScorecard'
import { designatedCohort } from './fundAtRisk'
import { getSecurityDisplayType, type SecurityDisplayType } from './securities'
import type { ProspectIdea } from './prospects'
import type { SecurityDetail } from './securities'

/** One fund on the watchlist, flattened for a table row. */
export interface WatchlistFundRow {
  prospectId: number
  securityId: string
  name: string | null
  /** `securities2.id`, for the detail link. Null only if the row is missing. */
  numericId: number | null
  type: SecurityDisplayType
  categoryName: string | null
  /**
   * The sleeve this fund fills, from `resolveAssetClass`. Resolved ONCE here
   * and carried, rather than re-derived at grouping time: two call sites
   * asking the same question is how the answer starts differing. Null means
   * the vendor category is unmapped — see the unclassified group.
   */
  assetClass: AssetClassKey | null
  /** The cohort the score was computed in — the fund's own designation. */
  cohort: ScorecardCohort
  /** False when `scorecard_cohort` is unset, so the caller can say the score is a default. */
  cohortSet: boolean
  score: number | null
  band: ScoreBand | null
  expenseRatio: number | null
  return3y: number | null
  return5y: number | null
}

export interface WatchlistSubGroup {
  key: AssetClassKey
  /** "Blend" / "Growth" / "Value" — the sub-style, not the full class label. */
  label: string
  funds: WatchlistFundRow[]
}

export interface WatchlistGroup {
  /** An `AssetClassKey`, the synthetic `us_large_cap` parent, or `unclassified`. */
  key: string
  label: string
  /** Rows directly in this group. Empty when `subGroups` is set. */
  funds: WatchlistFundRow[]
  /** Only US Large Cap has these; null everywhere else. */
  subGroups: WatchlistSubGroup[] | null
  /** Total across the group, sub-groups included — what an empty check reads. */
  count: number
}

/** The three keys that fold into the one nested parent, in display order. */
const LARGE_CAP: { key: AssetClassKey; label: string }[] = [
  { key: 'large_cap_blend', label: 'Blend' },
  { key: 'large_cap_growth', label: 'Growth' },
  { key: 'large_cap_value', label: 'Value' },
]
const LARGE_CAP_KEYS = new Set<string>(LARGE_CAP.map((l) => l.key))

export const LARGE_CAP_GROUP_KEY = 'us_large_cap'
export const UNCLASSIFIED_GROUP_KEY = 'unclassified'
export const PENDING_GROUP_KEY = 'pending'

/**
 * Flatten one watched fund into a row.
 *
 * **The score is computed in the fund's DESIGNATED cohort**, via the shared
 * `designatedCohort` — not always `category`. VBTLX is designated `peer`, and
 * grading it against its category here while the review grades it against its
 * peer group would put two different numbers for one fund on two screens. The
 * row carries `cohortSet` so a defaulted score can be labelled as one rather
 * than silently presented as a decision somebody made.
 */
export function toFundRow(idea: ProspectIdea, security: SecurityDetail): WatchlistFundRow {
  const cohort = designatedCohort(security)
  const score = scorecardScore(security, cohort)
  return {
    prospectId: idea.id,
    securityId: idea.security_id,
    name: security.security_name ?? null,
    numericId: security.id ?? null,
    type: getSecurityDisplayType(security),
    categoryName: security.category_name ?? null,
    assetClass: resolveAssetClass(security),
    cohort,
    cohortSet: !!security.scorecard_cohort,
    score,
    band: scoreBand(score),
    expenseRatio: num(security.expense_ratio_generic),
    return3y: num(security.annualized_three_year_total_return_nav),
    return5y: num(security.annualized_five_year_total_return_nav),
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * A watched fund that has no `securities2` row yet.
 *
 * `prospects.security_id` has no FK precisely so an idea can be recorded
 * before the firm holds or even prices the thing, so this is the ordinary
 * state of a fund added minutes ago, not an error. Everything a table column
 * would show comes from the YCharts row, so every field is null and the
 * caller says what is happening instead of printing eight dashes.
 */
export function toPendingFundRow(idea: ProspectIdea, type: SecurityDisplayType): WatchlistFundRow {
  return {
    prospectId: idea.id,
    securityId: idea.security_id,
    name: null,
    numericId: null,
    type,
    categoryName: null,
    assetClass: null,
    cohort: 'category',
    cohortSet: false,
    score: null,
    band: null,
    expenseRatio: null,
    return3y: null,
    return5y: null,
  }
}

/**
 * Rank funds within a sleeve: best score first, then cheapest, then ticker.
 *
 * **Score leads because the sleeve is the comparison** — once the funds in a
 * row all do the same job, the question is which does it best, and the
 * scorecard is the firm's own answer to that. A fund with NO score sorts last
 * rather than as a zero: an unscored fund is one the workbook has not filled,
 * not one that scored nothing, and ranking it below a genuine failure would
 * state something untrue about it.
 */
function compareFunds(a: WatchlistFundRow, b: WatchlistFundRow): number {
  if (a.score == null && b.score != null) return 1
  if (a.score != null && b.score == null) return -1
  if (a.score != null && b.score != null && a.score !== b.score) return b.score - a.score
  const ae = a.expenseRatio
  const be = b.expenseRatio
  if (ae != null && be != null && ae !== be) return ae - be
  if (ae == null && be != null) return 1
  if (ae != null && be == null) return -1
  return a.securityId.localeCompare(b.securityId)
}

/**
 * Group watched funds into the firm's fourteen asset classes.
 *
 * Returns twelve top-level groups — the eleven non-large-cap classes plus the
 * nested US Large Cap parent — in `ASSET_CLASS_ROWS` order, with US Large Cap
 * taking the position of its first member. An `unclassified` group is appended
 * **only when something landed in it**, because an empty one would assert a
 * mapping gap that does not exist.
 */
export function groupWatchlistFunds(rows: WatchlistFundRow[]): WatchlistGroup[] {
  const byKey = new Map<string, WatchlistFundRow[]>()
  const unclassified: WatchlistFundRow[] = []
  const pending: WatchlistFundRow[] = []

  for (const row of rows) {
    // No securities2 row at all — awaiting the refresh, not a mapping gap.
    if (row.numericId == null) {
      pending.push(row)
      continue
    }
    if (row.assetClass == null) {
      unclassified.push(row)
      continue
    }
    byKey.set(row.assetClass, [...(byKey.get(row.assetClass) ?? []), row])
  }

  const groups: WatchlistGroup[] = []
  let largeCapEmitted = false

  for (const { key, label } of ASSET_CLASS_ROWS) {
    if (LARGE_CAP_KEYS.has(key)) {
      // Emitted once, at the position of the first large-cap row.
      if (largeCapEmitted) continue
      largeCapEmitted = true
      const subGroups = LARGE_CAP.map((l) => ({
        key: l.key,
        label: l.label,
        funds: (byKey.get(l.key) ?? []).slice().sort(compareFunds),
      }))
      groups.push({
        key: LARGE_CAP_GROUP_KEY,
        label: 'US Large Cap',
        funds: [],
        subGroups,
        count: subGroups.reduce((n, g) => n + g.funds.length, 0),
      })
      continue
    }
    const funds = (byKey.get(key) ?? []).slice().sort(compareFunds)
    groups.push({ key, label, funds, subGroups: null, count: funds.length })
  }

  if (unclassified.length > 0) {
    groups.push({
      key: UNCLASSIFIED_GROUP_KEY,
      label: 'Unclassified',
      funds: unclassified.slice().sort(compareFunds),
      subGroups: null,
      count: unclassified.length,
    })
  }

  if (pending.length > 0) {
    groups.push({
      key: PENDING_GROUP_KEY,
      label: 'Awaiting YCharts data',
      funds: pending.slice().sort((a, b) => a.securityId.localeCompare(b.securityId)),
      subGroups: null,
      count: pending.length,
    })
  }

  return groups
}
