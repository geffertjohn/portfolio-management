/**
 * actions.ts — the unified Actions hub model.
 *
 * A single `UnifiedAction[]` assembled by per-source adapters over the app's
 * authoritative tables. MANUAL tasks are real `action_items` rows (created,
 * completed, snoozed, recurring). DERIVED actions (reviews, IC, alerts, at-risk,
 * drift) are projected READ-ONLY from their own systems — they carry a route into
 * their workflow and are completed THERE, never from the Actions page. No derived
 * state is duplicated into action_items.
 */
import { supabase } from './supabase'
import {
  fetchActionItems,
  type ActionItem,
  type ActionCategory,
  type ActionPriority,
} from './actionItems'
import { fetchReviewSchedules, isOverdue, isDueSoon } from './reviewSchedules'
import { fetchPortfolioReviewSchedules, CADENCE_LABELS } from './portfolioReviews'
import { fetchUnacknowledgedAlerts } from './alertRules'
import { fetchAllFiles, PORTFOLIO_DOCS_BUCKET } from './documents'
import { fetchLatestActualAllocation, portfoliosWithActualAllocation } from './currentAllocation'
import { fetchRebalanceSchedules } from './rebalanceSchedule'
import { fetchPositionsByPortfolioId } from './positions'
import { computePositionBands, isCashTicker } from './positionBands'
import { computeAllocationBands } from './allocationBands'
import { fetchSecurities } from './securities'
import {
  fetchDirectModelPortfolioId, fetchModelPortfolioById, fetchModelPortfolioByObjective,
  fetchModelPortfolios,
} from './modelPortfolios'
import { fetchActiveAtRisk } from './atRisk'
import {
  daysSince, fetchLatestImportRuns, fmtImportDate, missedScheduledRefresh,
  refreshDueLabel, YCHARTS_DATA_SOURCES, ychartsAsOf,
} from './importRuns'

export type ActionSource =
  | 'manual'
  | 'security_review'
  | 'portfolio_review'
  | 'ic'
  | 'candidate'
  | 'alert'
  | 'at_risk'
  | 'drift'
  | 'allocation_band'
  | 'scheduled_rebalance'
  | 'data_refresh'

export const SOURCE_LABELS: Record<ActionSource, string> = {
  manual: 'Manual',
  security_review: 'Review',
  portfolio_review: 'Portfolio Review',
  ic: 'IC',
  candidate: 'Candidate',
  alert: 'Alert',
  at_risk: 'At-Risk',
  drift: 'Drift',
  allocation_band: 'Allocation',
  scheduled_rebalance: 'Rebalance',
  data_refresh: 'Data',
}

export interface UnifiedAction {
  /** Stable unique key, prefixed by source (e.g. "manual:12", "review:AAPL"). */
  key: string
  category: ActionCategory
  source: ActionSource
  title: string
  subtitle: string | null
  /** Short label for the linked entity (ticker / portfolio / client). */
  linkedLabel: string | null
  /** Where "Open" navigates — the source workflow for derived actions. */
  route: string | null
  dueDate: string | null
  priority: ActionPriority
  /** Manual actions are editable here; derived ones are completed in their workflow. */
  isManual: boolean
  manual?: ActionItem
}

function duePriority(dueDate: string | null): ActionPriority {
  if (dueDate && isOverdue(dueDate)) return 'high'
  if (dueDate && isDueSoon(dueDate)) return 'medium'
  return 'low'
}

// ── Manual adapter ──────────────────────────────────────────────────────────
function manualToAction(item: ActionItem): UnifiedAction {
  const route = item.security_id && item.security_symbol
    ? null // security link resolved in the page (needs numeric id); keep simple
    : item.portfolio_name
      ? `/portfolio/${encodeURIComponent(item.portfolio_name)}`
      : item.linked_type === 'client' && item.linked_id
        ? `/clients/${item.linked_id}`
        : null
  return {
    key: `manual:${item.id}`,
    category: item.category,
    source: 'manual',
    title: item.title,
    subtitle: item.description,
    linkedLabel: item.security_symbol ?? item.portfolio_name ?? null,
    route,
    dueDate: item.due_date,
    priority: item.priority,
    isManual: true,
    manual: item,
  }
}

// ── Derived: pending IC memos (awaiting CIO decision) ───────────────────────
async function fetchIcActions(): Promise<UnifiedAction[]> {
  const { data, error } = await supabase
    .from('ic_memos')
    .select('id, portfolio_name, security_id, addition_id, recommendation, status')
    .eq('status', 'pending_cio')
    .is('deleted_at', null)
  if (error) throw error
  return (data ?? []).map((m) => {
    const pname = m.portfolio_name ?? ''
    const route = m.addition_id != null
      ? `/portfolio/${encodeURIComponent(pname)}/candidate/${m.addition_id}`
      : `/portfolio/${encodeURIComponent(pname)}`
    return {
      key: `ic:${m.id}`,
      category: 'ic' as const,
      source: 'ic' as const,
      title: `IC decision pending — ${m.security_id}`,
      subtitle: `Committee recommends ${m.recommendation ?? '—'} · awaiting CIO sign-off`,
      linkedLabel: pname || null,
      route,
      dueDate: null,
      priority: 'high' as const,
      isManual: false,
    }
  })
}

// ── Derived: in-progress candidate workflows (draft additions) ──────────────
async function fetchCandidateActions(): Promise<UnifiedAction[]> {
  const { data, error } = await supabase
    .from('security_additions')
    .select('id, portfolio_name, security_id, status')
    .eq('status', 'draft')
  if (error) throw error
  return (data ?? []).map((c) => ({
    key: `candidate:${c.id}`,
    category: 'ic' as const,
    source: 'candidate' as const,
    title: `Finish candidate review — ${c.security_id}`,
    subtitle: 'Add-security workflow in draft',
    linkedLabel: c.portfolio_name,
    route: `/portfolio/${encodeURIComponent(c.portfolio_name)}/candidate/${c.id}`,
    dueDate: null,
    priority: 'medium' as const,
    isManual: false,
  }))
}

// ── Derived: positions out of drift tolerance, grouped per portfolio ────────
//
// Drift is ACTUAL vs TARGET, and the two live in different places: the target is
// `positions.allocation_pct` (set from the YCharts allocation import) and the
// actual is the most recent file in the portfolio's Documents folder. This used
// to compare allocation_pct against `positions.target_weight`, which no writer
// ever populated — so the source could not fire a single action. Same band rule
// as the Positions tab, so the two agree.
//
// Only portfolios with an uploaded allocation file can be evaluated; the rest
// have no actual to compare against and are skipped rather than reported clean.
async function fetchDriftActions(): Promise<UnifiedAction[]> {
  let files
  try {
    files = (await fetchAllFiles(PORTFOLIO_DOCS_BUCKET)).files
  } catch {
    // The Express file store being down must not take out the whole Actions hub.
    return []
  }
  const folders = new Set(files.map((f) => f.folder).filter(Boolean) as string[])
  const withFiles = [...portfoliosWithActualAllocation(folders)]
  if (withFiles.length === 0) return []

  const out: UnifiedAction[] = []
  for (const name of withFiles) {
    try {
      const [actual, positions, model] = await Promise.all([
        fetchLatestActualAllocation(name),
        fetchPositionsByPortfolioId(name),
        resolveModelForPortfolio(name),
      ])
      if (!actual || positions.length === 0) continue

      const bands = computePositionBands(positions, model)
      let breaches = 0
      for (const b of bands) {
        const a = actualWeightFor(actual.weights, b.symbol)
        if (a == null) continue
        if ((b.lower != null && a < b.lower - 0.005) || (b.upper != null && a > b.upper + 0.005)) breaches++
      }
      if (breaches === 0) continue

      out.push({
        key: `drift:${name}`,
        category: 'trade' as const,
        source: 'drift' as const,
        title: `Rebalance ${name}`,
        subtitle: `${breaches} position${breaches > 1 ? 's' : ''} outside drift tolerance`,
        linkedLabel: name,
        route: `/portfolio/${encodeURIComponent(name)}`,
        dueDate: null,
        priority: 'medium' as const,
        isManual: false,
      })
    } catch {
      // One unreadable portfolio must not drop the others.
      continue
    }
  }
  return out
}

// ── Derived: asset-class allocation out of band (tiers 1 and 2) ─────────────
//
// The band card on each portfolio's Overview, surfaced as an action. Covers ALL
// portfolios, unlike the tier-3 drift source, because the comparison adapts to
// the data that exists: ACTUAL weights from the allocation file where there is
// one (the all-stock portfolios), otherwise the position targets rolled up
// (every fund/ETF portfolio, which deliberately gets no file).
//
// Batched deliberately. This spans 19 portfolios, so per-portfolio lookups would
// mean ~57 round trips; the reference data is fetched once and joined in memory.
async function fetchAllocationBandActions(): Promise<UnifiedAction[]> {
  const [portfoliosRes, mapRes, models, positionsRes, securities] = await Promise.all([
    supabase.from('portfolio').select('name, security_id, investment_objective'),
    supabase.from('portfolio_model_map').select('security_id, model_portfolio_id'),
    fetchModelPortfolios(),
    // `.is('deleted_at', null)` is load-bearing: positions are SOFT-deleted, so a
    // retired holding still has a row with its old weight. Without the filter a
    // portfolio's rollup includes securities it no longer holds and invents band
    // breaches for asset classes the live lineup has no exposure to at all.
    supabase.from('positions').select('portfolio_name, security_id, allocation_pct')
      .is('deleted_at', null).limit(5000),
    fetchSecurities(),
  ])
  if (portfoliosRes.error) throw portfoliosRes.error
  if (positionsRes.error) throw positionsRes.error

  // Files are optional: a file store that is down must not take out the hub, it
  // just means every portfolio falls back to its position targets.
  let withActual = new Set<string>()
  try {
    const { files } = await fetchAllFiles(PORTFOLIO_DOCS_BUCKET)
    withActual = portfoliosWithActualAllocation(
      new Set(files.map((f) => f.folder).filter(Boolean) as string[]),
    )
  } catch { /* fall through to position targets */ }

  const modelById = new Map(models.map((m) => [m.id, m]))
  const mappedModel = new Map(
    (mapRes.data ?? []).map((r) => [r.security_id as string, r.model_portfolio_id as number]),
  )
  const posByPortfolio = new Map<string, Map<string, number>>()
  for (const r of positionsRes.data ?? []) {
    const name = r.portfolio_name as string
    if (!posByPortfolio.has(name)) posByPortfolio.set(name, new Map())
    posByPortfolio.get(name)!.set(String(r.security_id).trim().toUpperCase(), Number(r.allocation_pct))
  }

  const out: UnifiedAction[] = []
  for (const pf of portfoliosRes.data ?? []) {
    const name = pf.name as string
    const mid = pf.security_id ? mappedModel.get(pf.security_id) : undefined
    const model =
      (mid != null ? modelById.get(mid) : undefined) ??
      models.find((m) => m.investment_objective === pf.investment_objective) ??
      null
    if (!model) continue

    let weights: Map<string, number> | null = null
    let basis: 'actual' | 'holdings' = 'holdings'
    if (withActual.has(name)) {
      try {
        const actual = await fetchLatestActualAllocation(name)
        if (actual) { weights = actual.weights; basis = 'actual' }
      } catch { /* fall back to targets below */ }
    }
    if (!weights) weights = posByPortfolio.get(name) ?? null
    if (!weights || weights.size === 0) continue

    const { tier1, tier2 } = computeAllocationBands(weights, securities, model)
    const breached = [...tier1, ...tier2].filter((r) => r.status !== 'ok')
    if (breached.length === 0) continue

    // Name the classes rather than only counting them — "US Mid Cap Equity" is
    // actionable from the list; "3 asset classes" means opening the portfolio.
    const named = tier2.filter((r) => r.status !== 'ok').map((r) => r.label)
    out.push({
      key: `allocation_band:${name}`,
      category: 'portfolio' as const,
      source: 'allocation_band' as const,
      title: `Allocation out of band — ${name}`,
      subtitle: `${named.length > 0 ? named.join(', ') : `${breached.length} band(s)`}` +
        ` · vs ${basis === 'actual' ? 'actual holdings' : 'position targets'}`,
      linkedLabel: name,
      route: `/portfolio/${encodeURIComponent(name)}`,
      dueDate: null,
      priority: 'medium' as const,
      isManual: false,
    })
  }
  return out
}

/** Actual weight for a ticker; all cash-like symbols collapse to the one cash row. */
function actualWeightFor(weights: Map<string, number>, ticker: string): number | null {
  if (isCashTicker(ticker)) {
    let cash: number | null = null
    for (const [k, v] of weights) if (isCashTicker(k)) cash = (cash ?? 0) + v
    return cash
  }
  return weights.get(ticker.trim().toUpperCase()) ?? null
}

/** The model a portfolio resolves to — map first, investment_objective as fallback. */
async function resolveModelForPortfolio(name: string) {
  const { data: pf } = await supabase
    .from('portfolio').select('security_id, investment_objective').eq('name', name).maybeSingle()
  if (!pf) return null
  const mapped = pf.security_id ? await fetchDirectModelPortfolioId(pf.security_id) : null
  if (mapped != null) return fetchModelPortfolioById(mapped)
  return pf.investment_objective ? fetchModelPortfolioByObjective(pf.investment_objective) : null
}

/**
 * The scheduled YCharts refresh, surfaced as an action.
 *
 * The refresh runs unattended on the mini before anyone is looking, so a failure
 * is otherwise invisible: stale numbers render exactly like fresh ones. Reports
 * whichever is true — a run that failed, or data that has simply gone stale —
 * as ONE action, never both, so a broken job doesn't spam the hub.
 */
const REFRESH_STALE_AFTER_DAYS = 3

async function fetchDataRefreshActions(): Promise<UnifiedAction[]> {
  const runs = await fetchLatestImportRuns()

  const broken = YCHARTS_DATA_SOURCES
    .map((src) => runs.get(src))
    .filter((r) => r != null && r.status !== 'success')
  if (broken.length > 0) {
    const failed = broken.filter((r) => r!.status === 'failed').length
    return [{
      key: 'refresh:failed',
      category: 'operational',
      source: 'data_refresh',
      title: 'YCharts refresh needs attention',
      subtitle: failed > 0
        ? `${failed} dataset${failed > 1 ? 's' : ''} wrote nothing on the last run — ${broken[0]!.errors[0] ?? 'no error recorded'}`
        : `Last run reported errors — ${broken[0]!.errors[0] ?? 'see the import log'}`,
      linkedLabel: null,
      route: '/settings/import-export',
      dueDate: null,
      priority: 'high',
      isManual: false,
    }]
  }

  // Nothing broke — but did the job actually fire? Measured against when a run
  // was DUE, not how old the data is: a weekday schedule that stops leaves no
  // row at all, and pure age stays quiet for days while nothing is delivered.
  const oldest = ychartsAsOf(runs)
  if (oldest == null) return []
  const missed = missedScheduledRefresh(runs)
  if (missed == null) return []

  const age = daysSince(oldest)
  return [{
    key: 'refresh:missed',
    category: 'operational',
    source: 'data_refresh',
    title: `YCharts refresh did not run ${refreshDueLabel(missed)}`,
    subtitle: `Last landed ${fmtImportDate(oldest)} — check the launchd agent, or import the workbook by hand`,
    linkedLabel: null,
    route: '/settings/import-export',
    dueDate: null,
    // One missed morning is often just a machine asleep; several is a break.
    priority: age >= REFRESH_STALE_AFTER_DAYS ? 'high' : 'medium',
    isManual: false,
  }]
}

// ── Scheduled rebalance (the time-based trigger) ────────────────────────────
// Every schedule is projected, due or not, matching the portfolio_review source
// — the hub's date buckets sort them and its filters hide them. The route is the
// portfolio page, where adding an allocation date is what completes the action.
async function fetchScheduledRebalanceActions(): Promise<UnifiedAction[]> {
  const schedules = await fetchRebalanceSchedules()

  return schedules.flatMap((s): UnifiedAction[] => {
    // No cadence on the model means nothing was scheduled, which is not the
    // same as something being overdue — stay silent.
    if (!s.frequency) return []
    const route = `/portfolio/${encodeURIComponent(s.portfolioName)}`

    // A portfolio with no allocation history cannot be scheduled at all. Surface
    // that rather than skipping it: silence reads as "nothing due".
    if (!s.anchor || !s.due) {
      return [{
        key: `rebalance:${s.portfolioName}`,
        category: 'trade' as const,
        source: 'scheduled_rebalance' as const,
        title: `Rebalance schedule unknown — ${s.portfolioName}`,
        subtitle: `${s.frequency} cadence · no allocation history to date it from`,
        linkedLabel: s.portfolioName,
        route,
        dueDate: null,
        priority: 'low' as const,
        isManual: false,
      }]
    }

    return [{
      key: `rebalance:${s.portfolioName}`,
      category: 'trade' as const,
      source: 'scheduled_rebalance' as const,
      title: `Rebalance due — ${s.portfolioName}`,
      subtitle: `${s.frequency} · last rebalanced ${fmtScheduleDate(s.anchor)}`,
      linkedLabel: s.portfolioName,
      route,
      dueDate: s.due,
      priority: duePriority(s.due),
      isManual: false,
    }]
  })
}

/** A bare YYYY-MM-DD is parsed as UTC, so render it as UTC or it slips a day. */
function fmtScheduleDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

// ── Assemble everything ─────────────────────────────────────────────────────
export async function fetchAllActions(): Promise<UnifiedAction[]> {
  const [manual, reviews, portfolioReviews, alerts, atRisk, ic, candidates, drift, dataRefresh, allocationBands, scheduledRebalances] = await Promise.all([
    fetchActionItems(),
    fetchReviewSchedules(),
    fetchPortfolioReviewSchedules(),
    fetchUnacknowledgedAlerts(),
    fetchActiveAtRisk(),
    fetchIcActions(),
    fetchCandidateActions(),
    fetchDriftActions(),
    fetchDataRefreshActions(),
    fetchAllocationBandActions(),
    fetchScheduledRebalanceActions(),
  ])

  // Include closed manual items too; the Actions page decides what to show.
  const manualActions = manual.map(manualToAction)

  const reviewActions: UnifiedAction[] = reviews.map((s) => ({
    key: `review:${s.security_id}`,
    category: 'security',
    source: 'security_review',
    title: `Review ${s.symbol}`,
    subtitle: s.name,
    linkedLabel: s.symbol,
    route: s.security_numeric_id != null ? `/security/${s.security_numeric_id}` : null,
    dueDate: s.next_review_at,
    priority: duePriority(s.next_review_at),
    isManual: false,
  }))

  const portfolioReviewActions: UnifiedAction[] = portfolioReviews.map((s) => ({
    key: `preview:${s.portfolio_name}:${s.cadence}`,
    category: 'portfolio',
    source: 'portfolio_review',
    title: `${CADENCE_LABELS[s.cadence]} review — ${s.portfolio_name}`,
    subtitle: 'Portfolio review due',
    linkedLabel: s.portfolio_name,
    route: `/portfolio/${encodeURIComponent(s.portfolio_name)}/review/${s.cadence}`,
    dueDate: s.next_review_at,
    priority: duePriority(s.next_review_at),
    isManual: false,
  }))

  const alertActions: UnifiedAction[] = alerts.map((a) => ({
    key: `alert:${a.id}`,
    category: 'security',
    source: 'alert',
    title: `Performance alert — ${a.security_symbol ?? a.security_id}`,
    subtitle: `${a.metric_field} breached threshold`,
    linkedLabel: a.security_symbol ?? a.security_id,
    route: a.security_numeric_id != null ? `/security/${a.security_numeric_id}` : null,
    dueDate: null,
    priority: 'high',
    isManual: false,
  }))

  const atRiskActions: UnifiedAction[] = atRisk.map((r) => {
    const due = r.removal_date ? r.removal_date.slice(0, 10) : null
    return {
      key: `atrisk:${r.id}`,
      category: 'security',
      source: 'at_risk',
      title: `At-risk — ${r.securities2?.security_id ?? r.security_id}`,
      subtitle: `${r.metrics.length} deteriorated metric${r.metrics.length === 1 ? '' : 's'} · sell timer`,
      linkedLabel: r.securities2?.security_id ?? r.security_id,
      route: '/at-risk',
      dueDate: due,
      priority: due && (isOverdue(due) || isDueSoon(due)) ? 'high' : 'medium',
      isManual: false,
    }
  })

  return [
    ...manualActions,
    ...reviewActions,
    ...portfolioReviewActions,
    ...ic,
    ...candidates,
    ...alertActions,
    ...atRiskActions,
    ...drift,
    ...allocationBands,
    ...scheduledRebalances,
    ...dataRefresh,
  ]
}

// ── Date bucketing ──────────────────────────────────────────────────────────
export type DateBucket = 'overdue' | 'today' | 'this_week' | 'upcoming' | 'no_date'

export const BUCKET_LABELS: Record<DateBucket, string> = {
  overdue: 'Overdue',
  today: 'Due Today',
  this_week: 'This Week',
  upcoming: 'Upcoming',
  no_date: 'No Date',
}

export const BUCKET_ORDER: DateBucket[] = ['overdue', 'today', 'this_week', 'upcoming', 'no_date']

export function bucketOf(dueDate: string | null): DateBucket {
  if (!dueDate) return 'no_date'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dueDate.length <= 10 ? dueDate + 'T00:00:00' : dueDate); d.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 7) return 'this_week'
  return 'upcoming'
}
