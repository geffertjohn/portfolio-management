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
import { fetchActiveAtRisk } from './atRisk'

export type ActionSource =
  | 'manual'
  | 'security_review'
  | 'portfolio_review'
  | 'ic'
  | 'candidate'
  | 'alert'
  | 'at_risk'
  | 'drift'

export const SOURCE_LABELS: Record<ActionSource, string> = {
  manual: 'Manual',
  security_review: 'Review',
  portfolio_review: 'Portfolio Review',
  ic: 'IC',
  candidate: 'Candidate',
  alert: 'Alert',
  at_risk: 'At-Risk',
  drift: 'Drift',
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
async function fetchDriftActions(): Promise<UnifiedAction[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('portfolio_name, security_id, allocation_pct, target_weight, drift_threshold')
  if (error) throw error
  const byPortfolio = new Map<string, number>()
  for (const p of data ?? []) {
    const target = p.target_weight
    if (target == null) continue
    const drift = (p.allocation_pct ?? 0) - target
    const threshold = p.drift_threshold ?? 5
    if (Math.abs(drift) > threshold) {
      byPortfolio.set(p.portfolio_name, (byPortfolio.get(p.portfolio_name) ?? 0) + 1)
    }
  }
  return [...byPortfolio.entries()].map(([name, count]) => ({
    key: `drift:${name}`,
    category: 'trade' as const,
    source: 'drift' as const,
    title: `Rebalance ${name}`,
    subtitle: `${count} position${count > 1 ? 's' : ''} outside drift tolerance`,
    linkedLabel: name,
    route: `/portfolio/${encodeURIComponent(name)}`,
    dueDate: null,
    priority: 'medium' as const,
    isManual: false,
  }))
}

// ── Assemble everything ─────────────────────────────────────────────────────
export async function fetchAllActions(): Promise<UnifiedAction[]> {
  const [manual, reviews, portfolioReviews, alerts, atRisk, ic, candidates, drift] = await Promise.all([
    fetchActionItems(),
    fetchReviewSchedules(),
    fetchPortfolioReviewSchedules(),
    fetchUnacknowledgedAlerts(),
    fetchActiveAtRisk(),
    fetchIcActions(),
    fetchCandidateActions(),
    fetchDriftActions(),
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
