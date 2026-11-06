/**
 * fundPeers.ts — one fund against the others in its category.
 *
 * Answers the question the scorecard cannot: **are these two funds the same
 * thing?** The scorecard ranks a fund WITHIN its cohort, so it says how well a
 * holding has done against its category — never whether the alternative you are
 * considering is a different bet or the same one in another wrapper.
 *
 * That gap is not theoretical. The Nov 2026 Foundation Conservative review
 * turned on it: the portfolio manager concluded VBILX and VBTLX are NOT one
 * sleeve because their holdings differ (60% vs 52% government, 39% vs 25%
 * corporate, 0% vs 21% securitized) while the risk manager concluded they ARE
 * one position because their realised returns sit 31bp apart over three years.
 * Both were right, about different things — and every composition number in
 * that argument had to be fetched from the fund provider, because the app held
 * none of them.
 *
 * Pure and React-free: the panel, the committee and any future PDF derive the
 * same comparison from here rather than restating it.
 */
import { supabase } from '@/lib/supabase'
import type { SecurityDetail } from './securities'
import { buildFundScorecard, type ScorecardCohort } from './fundScorecard'

/** Why a fund is in the comparison. */
export type PeerRole = 'subject' | 'held' | 'watchlist'

export interface FundComposition {
  effectiveDuration: number | null
  secYield: number | null
  creditQuality: number | null
  investmentGrade: number | null
  /**
   * The five Morningstar bond sectors that sum to the BOND SLEEVE, in order.
   *
   * **Cash and derivative are NOT among them**, which is measured rather than
   * assumed: across the 29 funds reporting a bond breakdown, these five land
   * within 0.5pp of 100% on 28 — the 29th is an equity ETF reporting zeros —
   * while adding cash and derivative holds for only 14 and reaches 120%.
   */
  fixedIncome: { label: string; value: number | null }[]
  /**
   * The five summed — the reconciliation, not a figure in its own right.
   *
   * **Null unless every component is present.** A sum over a partial set looks
   * like a complete one and is the easiest way to assert a breakdown
   * reconciles when it does not.
   */
  fixedIncomeSum: number | null
  /**
   * Whether the bond sleeve reconciles to 100%.
   *
   * **Null means "no bond sleeve", not "failed"** — an equity fund reports the
   * five as zeros rather than nulls, so a sum of 0 is a fund with no bonds and
   * reporting it as a broken reconciliation would cry wolf on every equity row.
   */
  fixedIncomeReconciles: boolean | null
  /** Reported beside the sleeve, deliberately outside its 100%. */
  cashExposure: number | null
  /** Ditto, and frequently negative — the offset for a fund short futures. */
  derivativeExposure: number | null
  /** The eleven Morningstar sectors, in a fixed order. */
  sectors: { label: string; value: number | null }[]
  sectorSum: number | null
}

export interface FundPeerRow {
  securityId: string
  name: string | null
  role: PeerRole
  /**
   * The weight in each book holding it, heaviest first. **Empty when unheld.**
   *
   * NOT a sum. An earlier version added the weights across books and printed
   * VBILX at "91%", which is not a weight of anything — percentages of
   * different portfolios cannot be added, and weighting them properly would
   * need portfolio market values the app does not hold. The range is the
   * honest reduction: four books between 3% and 33%.
   */
  books: { portfolio: string; pct: number }[]
  /** Heaviest single-book weight, for ordering and the headline. Null if unheld. */
  maxWeightPct: number | null
  expenseRatio: number | null
  /** Scorecard on the comparison's single cohort, so the totals are comparable. */
  score: number | null
  /** This fund's OWN designated cohort, when it differs from the one used. */
  ownCohort: ScorecardCohort | null
  composition: FundComposition
  maxDrawdown3y: number | null
  stdDev3y: number | null
  turnover: number | null
  holdings: number | null
}

export interface FundPeerComparison {
  categoryName: string
  /** The cohort every row is graded on. */
  cohort: ScorecardCohort
  /**
   * False when the funds do not all designate the same cohort.
   *
   * **The scores are still comparable — that is the point of forcing one** —
   * but the reader should know the figures differ from what each fund's own
   * page shows. Grading sleeve-mates on different yardsticks is exactly what
   * inverted the VBILX/VBTLX ranking: VBILX is graded on category and VBTLX on
   * peer despite sharing both a category and a peer group, and the printed
   * totals reversed the order every underlying metric produced.
   */
  cohortIsUnanimous: boolean
  rows: FundPeerRow[]
}

const FI_SECTORS: [string, keyof SecurityDetail][] = [
  ['Government', 'government_fixed_income_exposure_generic'],
  ['Corporate', 'corporate_fixed_income_exposure_generic'],
  ['Securitized', 'securitized_fixed_income_exposure_generic'],
  ['Municipal', 'municipal_fixed_income_exposure_generic'],
  ['Other', 'other_fixed_income_exposure_generic'],
]

/** Within half a point of the sleeve, which is what the vendor's rounding gives. */
const RECONCILE_TOLERANCE = 0.005

const SECTORS: [string, keyof SecurityDetail][] = [
  ['Basic materials', 'basic_materials_exposure_generic'],
  ['Communication services', 'communication_services_exposure_generic'],
  ['Consumer cyclical', 'consumer_cyclical_exposure_generic'],
  ['Consumer defensive', 'consumer_defensive_exposure_generic'],
  ['Energy', 'energy_exposure'],
  ['Financial services', 'financial_services_exposure'],
  ['Healthcare', 'healthcare_exposure_generic'],
  ['Industrials', 'industrials_exposure'],
  ['Real estate', 'real_estate_exposure'],
  ['Technology', 'technology_exposure_generic'],
  ['Utilities', 'utilities_exposure_generic'],
]

function num(s: SecurityDetail, key: keyof SecurityDetail): number | null {
  const v = s[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function breakdown(s: SecurityDetail, defs: [string, keyof SecurityDetail][]) {
  const items = defs.map(([label, key]) => ({ label, value: num(s, key) }))
  const complete = items.every((i) => i.value != null)
  const sum = complete ? items.reduce((a, i) => a + (i.value as number), 0) : null
  return { items, sum }
}

export function buildComposition(s: SecurityDetail): FundComposition {
  const fi = breakdown(s, FI_SECTORS)
  const sec = breakdown(s, SECTORS)
  // A sum of exactly nothing is an equity fund, not a broken bond sleeve.
  const hasSleeve = fi.sum != null && fi.sum > RECONCILE_TOLERANCE
  return {
    effectiveDuration: num(s, 'effective_duration'),
    secYield: num(s, 'sec_yield_generic'),
    creditQuality: num(s, 'average_credit_quality_score'),
    investmentGrade: num(s, 'investment_grade_bond_allocation_generic'),
    fixedIncome: fi.items,
    fixedIncomeSum: fi.sum,
    fixedIncomeReconciles: fi.sum == null || !hasSleeve
      ? null
      : Math.abs(fi.sum - 1) <= RECONCILE_TOLERANCE,
    cashExposure: num(s, 'cash_fixed_income_exposure'),
    derivativeExposure: num(s, 'derivative_fixed_income_exposure'),
    sectors: sec.items,
    sectorSum: sec.sum,
  }
}

export interface HeldWeight {
  books: { portfolio: string; pct: number }[]
}

/**
 * The subject plus every fund in the same `category_name`, graded alike.
 *
 * `category_name` is the key, not `peer_group_name`: the vendor vocabulary is
 * inconsistent across the three classification columns and this repo already
 * names `category_name` the authority (see `resolveAssetClass`). Matching is
 * trimmed and case-insensitive for the same reason that lookup is.
 */
export function buildFundPeerComparison(
  subject: SecurityDetail,
  universe: SecurityDetail[],
  held: Map<string, HeldWeight>,
  watched: Set<string>,
): FundPeerComparison {
  const key = (s: SecurityDetail) => (s.category_name ?? '').trim().toLowerCase()
  const want = key(subject)

  // The cohort the SUBJECT is graded on governs the whole table, defaulting to
  // category — the house convention, 38 of 44 funds.
  const cohort: ScorecardCohort = subject.scorecard_cohort === 'peer' ? 'peer' : 'category'

  const members = universe.filter(
    (s) => key(s) === want && (s.security_id === subject.security_id
      || held.has(s.security_id) || watched.has(s.security_id)),
  )
  if (!members.some((s) => s.security_id === subject.security_id)) members.unshift(subject)

  const rows: FundPeerRow[] = members.map((s) => {
    const isSubject = s.security_id === subject.security_id
    const h = held.get(s.security_id) ?? null
    const own = s.scorecard_cohort === 'peer' ? 'peer'
      : s.scorecard_cohort === 'category' ? 'category' : null
    return {
      securityId: s.security_id,
      name: s.security_name,
      role: isSubject ? 'subject' : h ? 'held' : 'watchlist',
      books: h ? [...h.books].sort((x, y) => y.pct - x.pct) : [],
      maxWeightPct: h && h.books.length > 0
        ? Math.max(...h.books.map((x) => x.pct)) : null,
      expenseRatio: num(s, 'expense_ratio_generic'),
      score: buildFundScorecard(s, cohort).hasData
        ? buildFundScorecard(s, cohort).total
        : null,
      ownCohort: own,
      composition: buildComposition(s),
      maxDrawdown3y: num(s, 'max_drawdown_3y'),
      stdDev3y: num(s, 'monthly_standard_deviation_annualized_3y'),
      turnover: num(s, 'turnover_ratio_generic'),
      holdings: num(s, 'number_of_holdings_generic'),
    }
  })

  // Subject first, then the other holdings by weight, then the ideas. A
  // comparison is read from the thing being questioned outwards.
  const order: Record<PeerRole, number> = { subject: 0, held: 1, watchlist: 2 }
  rows.sort((a, b) =>
    order[a.role] - order[b.role]
    || (b.maxWeightPct ?? 0) - (a.maxWeightPct ?? 0)
    || a.securityId.localeCompare(b.securityId))

  const designated = rows.map((r) => r.ownCohort).filter((c): c is ScorecardCohort => c != null)
  return {
    categoryName: subject.category_name ?? '',
    cohort,
    cohortIsUnanimous: designated.every((c) => c === cohort),
    rows,
  }
}

// ── Data access ───────────────────────────────────────────────────────────────

/**
 * The comparison for one fund, assembled from the live book.
 *
 * Three reads, none of them avoidable: the funds sharing the category, the
 * positions that say which are held and at what weight, and the open watchlist
 * ideas. The category filter is applied server-side AND again in the pure
 * builder — `ilike` without wildcards is a case-insensitive match but will
 * still miss a stored value with stray whitespace, and the builder trims.
 *
 * A fund with no `category_name` returns an empty comparison rather than
 * matching every other uncategorised fund, which is what an unguarded `''`
 * would do.
 */
export async function fetchFundPeerComparison(
  subject: SecurityDetail,
): Promise<FundPeerComparison> {
  const category = (subject.category_name ?? '').trim()
  if (category === '') {
    return { categoryName: '', cohort: 'category', cohortIsUnanimous: true, rows: [] }
  }

  const [universe, positions, prospects] = await Promise.all([
    supabase.from('securities2').select('*').ilike('category_name', category),
    supabase.from('positions').select('security_id, portfolio_name, allocation_pct')
      .is('deleted_at', null),
    supabase.from('prospects').select('security_id').is('removed_at', null),
  ])
  if (universe.error) throw universe.error
  if (positions.error) throw positions.error
  if (prospects.error) throw prospects.error

  // Kept PER BOOK rather than summed. The comparison is about the fund, but a
  // fund's weight is a property of a portfolio, and 33% in one book plus 25% in
  // another is not 58% of anything.
  const held = new Map<string, HeldWeight>()
  for (const p of positions.data ?? []) {
    if (!p.security_id || !p.portfolio_name) continue
    const cur = held.get(p.security_id) ?? { books: [] }
    cur.books.push({ portfolio: p.portfolio_name, pct: Number(p.allocation_pct) || 0 })
    held.set(p.security_id, cur)
  }

  const watched = new Set((prospects.data ?? []).map((p) => p.security_id).filter(Boolean))

  return buildFundPeerComparison(
    subject, (universe.data ?? []) as unknown as SecurityDetail[], held, watched,
  )
}
