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
  CATEGORY_LABELS,
  type ActionItem,
  type ActionCategory,
  type ActionPriority,
} from './actionItems'
import { fetchReviewSchedules, isOverdue, isDueSoon, effectiveReviewDay } from './reviewSchedules'
import { formatDate } from './fundFormat'
import { fetchPortfolioReviewSchedules, CADENCE_LABELS } from './portfolioReviews'
import { fetchUnacknowledgedAlerts } from './alertRules'
import { fetchAllFiles, PORTFOLIO_DOCS_BUCKET, type StoredFile } from './documents'
import {
  fetchLatestActualAllocation, portfoliosWithActualAllocation,
  type CurrentAllocation,
} from './currentAllocation'
import { fetchRebalanceSchedules } from './rebalanceSchedule'
import { fetchPositionsByPortfolioId } from './positions'
import { computePositionBands, isCashTicker } from './positionBands'
import { computeAllocationBands } from './allocationBands'
import { fetchSecurities } from './securities'
import {
  fetchDirectModelPortfolioId, fetchModelPortfolioById, fetchModelPortfolioByObjective,
  fetchModelPortfolios,
} from './modelPortfolios'
import { fetchActiveAtRisk, isBreached, failingMetrics } from './atRisk'
import {
  daysSince, fetchLatestImportRuns, fmtImportDate, missedScheduledRefresh,
  refreshDueLabel, YCHARTS_DATA_SOURCES, ychartsAsOf,
} from './importRuns'
import {
  fetchLatestJobRuns, fmtRunTime, gradeAllJobs, JOB_HEALTH_LABELS, needsAttention,
  type JobStatus,
} from './jobRuns'

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
  | 'job_health'

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
  job_health: 'Automation',
}

/**
 * One row of the hub.
 *
 * The three text fields carry each fact ONCE, because a row that prints the
 * same thing three ways is harder to read than one that prints it once:
 *
 *   subject  the entity the action is about, and the row's lead text
 *   title    only what the Type COLUMN does not already say
 *   context  a second entity, when it is not the subject
 *
 * The Type column is the act. A security review that is simply due therefore
 * has no `title` at all — "Review MSI" beside a "Review" badge and an "MSI"
 * column said one fact three times, which is what this shape replaced. Reserve
 * `title` for a state the type cannot express: "Sell timer expired", "Out of
 * band", the cadence of a portfolio review.
 *
 * NOTE: the Actions table renders `title` in the TYPE column ("Portfolio
 * Review · Quarterly"), not beside the subject, which read as clutter. It also
 * leads the Task cell for rows that have no subject (manual tasks, firm-wide
 * operations), and `actionLabel` composes it for export.
 */
export interface UnifiedAction {
  /** Stable unique key, prefixed by source (e.g. "manual:12", "review:AAPL"). */
  key: string
  category: ActionCategory
  source: ActionSource
  /** The entity acted on. Null for firm-wide operations, where `title` leads. */
  subject: string | null
  /** The distinguishing state, or null when the badge alone says it. */
  title: string | null
  subtitle: string | null
  /** A second entity — e.g. the portfolio an IC memo on a security is for. */
  context: string | null
  /** Where "Open" navigates — the source workflow for derived actions. */
  route: string | null
  dueDate: string | null
  priority: ActionPriority
  /** Manual actions are editable here; derived ones are completed in their workflow. */
  isManual: boolean
  manual?: ActionItem
}

/** The row as one line — CSV export, and anywhere a single string is wanted. */
export function actionLabel(a: UnifiedAction): string {
  return [a.subject, a.title].filter(Boolean).join(' — ') || SOURCE_LABELS[a.source]
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
    // A manual task is free text: its title IS its subject, so it leads.
    subject: null,
    title: item.title,
    subtitle: item.description,
    context: item.security_symbol ?? item.portfolio_name ?? null,
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
      subject: m.security_id,
      title: 'Decision pending',
      subtitle: `Committee recommends ${m.recommendation ?? '—'} · awaiting CIO sign-off`,
      context: pname || null,
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
    subject: c.security_id,
    title: 'Unfinished draft',
    subtitle: 'Add-security workflow',
    context: c.portfolio_name,
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
async function fetchDriftActions(files: StoredFile[] | null): Promise<UnifiedAction[]> {
  // The Express file store being down must not take out the whole Actions hub.
  if (!files) return []

  const folders = new Set(files.map((f) => f.folder).filter(Boolean) as string[])
  const withFiles = [...portfoliosWithActualAllocation(folders)]
  if (withFiles.length === 0) return []

  // IN PARALLEL. This was a `for` loop with an await in its body, so six
  // portfolios meant six serialised rounds of "download a spreadsheet and parse
  // it" — and each round re-listed the whole bucket, because
  // fetchLatestActualAllocation did that for itself until it learned to take a
  // listing. Nothing here depends on the previous portfolio's answer.
  const results = await Promise.all(
    withFiles.map(async (name): Promise<UnifiedAction | null> => {
    try {
      const [actual, positions, model] = await Promise.all([
        fetchLatestActualAllocation(name, files),
        fetchPositionsByPortfolioId(name),
        resolveModelForPortfolio(name),
      ])
      if (!actual || positions.length === 0) return null

      const bands = computePositionBands(positions, model)
      let breaches = 0
      for (const b of bands) {
        const a = actualWeightFor(actual.weights, b.symbol)
        if (a == null) continue
        if ((b.lower != null && a < b.lower - 0.005) || (b.upper != null && a > b.upper + 0.005)) breaches++
      }
      if (breaches === 0) return null

      return {
        key: `drift:${name}`,
        category: 'trade' as const,
        source: 'drift' as const,
        subject: name,
        title: null,
        subtitle: `${breaches} position${breaches > 1 ? 's' : ''} outside drift tolerance`,
        context: null,
        route: `/portfolio/${encodeURIComponent(name)}`,
        dueDate: null,
        priority: 'medium' as const,
        isManual: false,
      }
    } catch {
      // One unreadable portfolio must not drop the others.
      return null
    }
  }),
  )
  return results.filter((a): a is UnifiedAction => a !== null)
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
async function fetchAllocationBandActions(files: StoredFile[] | null): Promise<UnifiedAction[]> {
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
  if (files) {
    withActual = portfoliosWithActualAllocation(
      new Set(files.map((f) => f.folder).filter(Boolean) as string[]),
    )
  }

  // Resolved UP FRONT and in parallel. The loop below used to await one of
  // these per portfolio, and each await re-listed the whole bucket — the two
  // together were most of the ~50 seconds this page took to render. Nothing in
  // the loop depends on another portfolio's allocation.
  const actualByPortfolio = new Map<string, CurrentAllocation | null>()
  await Promise.all([...withActual].map(async (name) => {
    try {
      actualByPortfolio.set(name, await fetchLatestActualAllocation(name, files ?? undefined))
    } catch {
      actualByPortfolio.set(name, null)  // falls back to position targets below
    }
  }))

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
    const actual = actualByPortfolio.get(name)
    if (actual) { weights = actual.weights; basis = 'actual' }
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
      subject: name,
      title: 'Out of band',
      subtitle: `${named.length > 0 ? named.join(', ') : `${breached.length} band(s)`}` +
        ` · vs ${basis === 'actual' ? 'actual holdings' : 'position targets'}`,
      context: null,
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
      subject: null,
      title: 'YCharts refresh needs attention',
      subtitle: failed > 0
        ? `${failed} dataset${failed > 1 ? 's' : ''} wrote nothing on the last run — ${broken[0]!.errors[0] ?? 'no error recorded'}`
        : `Last run reported errors — ${broken[0]!.errors[0] ?? 'see the import log'}`,
      context: null,
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
    subject: null,
    title: `YCharts refresh did not run ${refreshDueLabel(missed)}`,
    subtitle: `Last landed ${fmtImportDate(oldest)} — check the launchd agent, or import the workbook by hand`,
    context: null,
    route: '/settings/import-export',
    dueDate: null,
    // One missed morning is often just a machine asleep; several is a break.
    priority: age >= REFRESH_STALE_AFTER_DAYS ? 'high' : 'medium',
    isManual: false,
  }]
}

/**
 * The scheduled Claude Code routines, surfaced when one stops working.
 *
 * Exactly the `data_refresh` argument one layer up: these jobs run before
 * anyone is looking, and a job that dies leaves the deliverable tables looking
 * identical to a job that ran and found nothing to do. `job_runs` is the only
 * place the difference is recorded, and a health panel nobody opens is not
 * monitoring — so an unhealthy job comes to the advisor here.
 *
 * `never_run` raises nothing (see `needsAttention`): it cannot be told apart
 * from a heartbeat that was only just added.
 */
async function fetchJobHealthActions(): Promise<UnifiedAction[]> {
  let statuses: JobStatus[]
  try {
    statuses = gradeAllJobs(await fetchLatestJobRuns())
  } catch {
    // A missing heartbeat table must not take out the whole hub.
    return []
  }

  return statuses.filter(needsAttention).map((s) => ({
    key: `job:${s.def.id}`,
    category: 'operational' as const,
    source: 'job_health' as const,
    subject: s.def.label,
    title: JOB_HEALTH_LABELS[s.health],
    subtitle: jobHealthDetail(s),
    context: null,
    route: '/actions?automation=1',
    dueDate: null,
    // A job that died or wrote nothing is a hole in the record; one that did
    // part of its work still produced something to read.
    priority: (s.health === 'partial' ? 'medium' : 'high') as ActionPriority,
    isManual: false,
  }))
}

function jobHealthDetail(s: JobStatus): string {
  const run = s.latest
  if (s.health === 'overdue') {
    return run
      ? `Last finished ${fmtRunTime(run.finished_at ?? run.started_at)} — a run was due ${fmtRunTime(s.expected.toISOString())}`
      : 'No run on record'
  }
  if (!run) return 'No run on record'
  if (s.health === 'stalled') {
    return `Started ${fmtRunTime(run.started_at)} and never recorded an end — it died mid-run`
  }
  return run.errors[0] ?? run.summary ?? `Reported ${run.status} at ${fmtRunTime(run.finished_at ?? run.started_at)}`
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
        subject: s.portfolioName,
        title: 'Schedule unknown',
        subtitle: `${s.frequency} cadence · no allocation history to date it from`,
        context: null,
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
      subject: s.portfolioName,
      title: null,
      subtitle: `${s.frequency} · last rebalanced ${fmtScheduleDate(s.anchor)}`,
      context: null,
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
  // ONE bucket listing for the whole hub, fetched before the fan-out and handed
  // to the two sources that need it. They used to fetch it themselves, and so
  // did `fetchLatestActualAllocation` on every call inside their loops: SEVEN
  // identical requests for the same 15 files. A parameter rather than a cache,
  // because a cache would go stale behind an upload and this one cannot.
  let portfolioFiles: StoredFile[] | null = null
  try {
    portfolioFiles = (await fetchAllFiles(PORTFOLIO_DOCS_BUCKET)).files
  } catch {
    // The Express file store being down must not take out the whole hub; the
    // two sources that need it return nothing and the other ten still load.
    portfolioFiles = null
  }

  const [manual, reviews, portfolioReviews, alerts, atRisk, ic, candidates, drift, dataRefresh, allocationBands, scheduledRebalances, jobHealth] = await Promise.all([
    fetchActionItems(),
    fetchReviewSchedules(),
    fetchPortfolioReviewSchedules(),
    fetchUnacknowledgedAlerts(),
    fetchActiveAtRisk(),
    fetchIcActions(),
    fetchCandidateActions(),
    fetchDriftActions(portfolioFiles),
    fetchDataRefreshActions(),
    fetchAllocationBandActions(portfolioFiles),
    fetchScheduledRebalanceActions(),
    fetchJobHealthActions(),
  ])

  // Include closed manual items too; the Actions page decides what to show.
  const manualActions = manual.map(manualToAction)

  const reviewActions: UnifiedAction[] = reviews.map((s) => {
    // The schedule, or an earlier call this stock never got reviewed for. A
    // stock's schedule points at its NEXT call, so a review nobody did had
    // stopped being asked for here as well as on the calendar — and the aging
    // line is exactly where "how far behind" belongs.
    const due = effectiveReviewDay(s)
    return {
      key: `review:${s.security_id}`,
      category: 'security',
      source: 'security_review',
      subject: s.symbol,
      title: null,
      subtitle: s.name,
      context: null,
      route: s.security_numeric_id != null ? `/security/${s.security_numeric_id}` : null,
      dueDate: due,
      priority: duePriority(due),
      isManual: false,
    }
  })

  // `next_review_at` is passed through RAW here, unlike the security reviews
  // above which go through `effectiveReviewDay`. This column holds real INSTANTS — the
  // seed trigger writes `now()`, microseconds and all
  // (`2026-06-30T00:08:28.751295Z`) — so its LOCAL day is the intended day, and
  // forcing it to UTC would move those rows a day forward. See `localDayKey`.
  const portfolioReviewActions: UnifiedAction[] = portfolioReviews.map((s) => ({
    key: `preview:${s.portfolio_name}:${s.cadence}`,
    category: 'portfolio',
    source: 'portfolio_review',
    subject: s.portfolio_name,
    title: CADENCE_LABELS[s.cadence],
    subtitle: null,
    context: null,
    route: `/portfolio/${encodeURIComponent(s.portfolio_name)}/review/${s.cadence}`,
    dueDate: s.next_review_at,
    priority: duePriority(s.next_review_at),
    isManual: false,
  }))

  const alertActions: UnifiedAction[] = alerts.map((a) => ({
    key: `alert:${a.id}`,
    category: 'security',
    source: 'alert',
    subject: a.security_symbol ?? a.security_id,
    title: null,
    subtitle: `${a.metric_field} breached threshold`,
    context: null,
    route: a.security_numeric_id != null ? `/security/${a.security_numeric_id}` : null,
    dueDate: null,
    priority: 'high',
    isManual: false,
  }))

  // Only a BREACHED entry is an action.
  //
  // Every at-risk row used to appear here, which made sense while flagging was
  // manual: the list was a standing to-do. The committee now raises, re-measures
  // and clears these on its own, so a running timer needs nothing from the
  // advisor — surfacing them all would bury the one row that does. An entry
  // earns a place only when the timer has expired with a metric still red,
  // which is precisely the moment a decision falls to the CIO.
  const atRiskActions: UnifiedAction[] = atRisk
    .filter((r) => isBreached(r))
    .map((r) => {
      const due = r.removal_date ? r.removal_date.slice(0, 10) : null
      const stillRed = failingMetrics(r.metrics_detail)
      return {
        key: `atrisk:${r.id}`,
        category: 'security',
        source: 'at_risk',
        subject: r.securities2?.security_id ?? r.security_id,
        title: 'Sell timer expired',
        subtitle: stillRed.length > 0 ? `Still red: ${stillRed.map((m) => m.label).join(', ')}` : null,
        context: null,
        route: '/at-risk',
        dueDate: due,
        priority: 'high',
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
    ...jobHealth,
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

/**
 * How far ahead the list looks. Dated actions beyond the horizon are dropped
 * from the view entirely — the group header keeps the count, so nothing goes
 * missing without a number saying so.
 */
export const HORIZON_OPTIONS = [7, 30, 90, 0] as const
export type Horizon = typeof HORIZON_OPTIONS[number]

/**
 * The Actions list as CSV.
 *
 * Here rather than in the page (audit §22) because half the concern already
 * lived here — `actionLabel` exists precisely so the export and the row agree
 * on what an action is called, and splitting the two invites a CSV column that
 * says something the screen does not.
 *
 * Returns the TEXT; the page owns the download, which is a DOM act.
 */
export function buildActionsCsv(actions: UnifiedAction[]): string {
  const rows: string[][] = [['Category', 'Source', 'Task', 'Context', 'Due', 'Priority', 'Status']]
  for (const a of actions) {
    rows.push([
      CATEGORY_LABELS[a.category],
      SOURCE_LABELS[a.source],
      actionLabel(a),
      a.context ?? '',
      a.dueDate ?? '',
      a.priority,
      // A derived action has no stored status — it is completed in its own
      // workflow, never from this page.
      a.isManual ? (a.manual?.status ?? '') : 'active',
    ])
  }
  return rows.map(quoteRow).join('\n')
}

/**
 * Every field quoted, with `"` doubled.
 *
 * Unconditional, not just for fields containing a comma: an action title is
 * free text that routinely carries commas, quotes and em-dashes, and a
 * half-quoted file is one that opens misaligned in Excel without erroring.
 */
function quoteRow(cells: string[]): string {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
}

/** Which half of the list to show: real tasks, projected ones, or both. */
export type SourceFilter = 'all' | 'manual' | 'derived'
/** Date buckets (the default) or the category facet. */
export type GroupBy = 'bucket' | 'category'

/** `0` means no horizon. Undated actions are never filtered out by it. */
export function withinHorizon(dueDate: string | null, days: Horizon): boolean {
  if (days === 0 || !dueDate) return true
  return daysUntil(dueDate) <= days
}

/** Whole days from today to a due date; negative when it has passed. */
export function daysUntil(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dueDate.length <= 10 ? dueDate + 'T00:00:00' : dueDate); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/** "124d overdue" / "in 6d" / "today" — the aging column. */
export function agingLabel(dueDate: string | null): string | null {
  if (!dueDate) return null
  const n = daysUntil(dueDate)
  if (n === 0) return 'today'
  return n < 0 ? `${-n}d overdue` : `in ${n}d`
}

// ── Collapsing repeated derived actions ─────────────────────────────────────
//
// One fact printed many times is not many facts. 36 portfolio reviews all due
// the same day say one thing — the portfolio review process has not run since
// June — and printing it 36 times buries every other row in the bucket.
//
// Only DERIVED actions cluster. A manual task is individually actionable, and
// two of them sharing a due date is a coincidence rather than a common cause.

/** Below this, the rows are easier to read as themselves. */
const COLLAPSE_MIN = 3

export interface ActionCluster {
  key: string
  /** Set when the rows collapse behind one summary line; null renders the row. */
  label: string | null
  items: UnifiedAction[]
}

/**
 * The LOCAL calendar day a due date falls on, as YYYY-MM-DD.
 *
 * Everything on this page treats a due date as a day: `bucketOf` and
 * `daysUntil` round to local midnight, and `formatDate` renders a bare date at
 * local noon. Several of these sources store a `timestamptz`, so the UTC prefix
 * of the string is NOT that day — two Equity Income reviews stamped
 * `2026-06-30T00:08Z` fall on 29 June here. Keying on the raw string split them
 * out of a cluster whose header showed their own date; keying on the UTC prefix
 * would have put them in a cluster labelled a day after the rows inside it.
 */
function localDayKey(dueDate: string): string {
  const d = new Date(dueDate.length <= 10 ? dueDate + 'T12:00:00' : dueDate)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The cluster a derived action belongs to; null for one that never clusters. */
function clusterKeyOf(a: UnifiedAction): string | null {
  return a.isManual ? null : `${a.source}|${a.dueDate ? localDayKey(a.dueDate) : 'none'}`
}

/**
 * Walked in one pass over the caller's order, so a cluster lands exactly where
 * its first member was and the sort the page applied still holds.
 */
export function clusterActions(items: UnifiedAction[]): ActionCluster[] {
  const counts = new Map<string, number>()
  for (const a of items) {
    const k = clusterKeyOf(a)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const out: ActionCluster[] = []
  const emitted = new Set<string>()
  for (const a of items) {
    const k = clusterKeyOf(a)
    if (k == null || (counts.get(k) ?? 0) < COLLAPSE_MIN) {
      out.push({ key: a.key, label: null, items: [a] })
      continue
    }
    if (emitted.has(k)) continue
    emitted.add(k)
    const group = items.filter((x) => clusterKeyOf(x) === k)
    const due = group[0].dueDate
    out.push({
      key: `cluster:${k}`,
      // Formatted by the same helper the rows use, so a header can never
      // disagree with the dates printed under it.
      label: `${SOURCE_LABELS[group[0].source]} — ${group.length} ${due ? `due ${formatDate(due)}` : 'open'}`,
      items: group,
    })
  }
  return out
}

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
