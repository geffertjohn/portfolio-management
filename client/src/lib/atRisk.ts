/**
 * At-Risk data layer.
 *
 * "At-Risk" = held securities flagged for monitoring and possible replacement
 * (deteriorated scorecard metrics + a sell timer + proposed substitutions).
 * Formerly the "watchlist" table — renamed so "watchlist" can mean buy candidates
 * (see lib/prospects.ts). Backed by the Supabase `at_risk` table.
 *
 * Removal date rules (based on number of red metrics):
 *   5 metrics → 30 days  (Replace)
 *   4 metrics → 90 days  (Monitor)
 *   3 metrics → 180 days (Monitor)
 *   2 metrics → 365 days (Monitor)
 */

import { supabase } from './supabase'
import { scorecardColor, type ScorecardColor } from './scorecardColor'
import type { Json } from '@/types/database.types'

// ── Metric options by asset class ─────────────────────────────────────────────

export const AT_RISK_METRICS_BY_ASSET_CLASS: Record<string, string[]> = {
  equity: ['Alpha 3Y', 'Information Ratio 3Y', 'Sortino Ratio 3Y', 'Max Drawdown 3Y'],
  'fixed income': ['Sortino Ratio 3Y', 'Sharpe Ratio 3Y', 'Max Drawdown 3Y', 'Alpha 3Y'],
  // Mirrors the stock Scorecard cards (StockScorecardPanels)
  stock: ['Operating Margin TTM', 'FCF Margin TTM', 'Revenue Growth TTM', 'EPS Growth TTM', 'Revenue Growth 3Y', 'EPS Growth 3Y'],
}

export function metricsForAssetClass(assetClass: string | null | undefined): string[] {
  if (!assetClass) return []
  return AT_RISK_METRICS_BY_ASSET_CLASS[assetClass.trim().toLowerCase()] ?? []
}

// ── The six stock metrics, and what each is graded against ───────────────────
//
// The two comparison bases are NOT the same, and the difference is why the
// flagged readings are frozen into the row.
//
// A margin card is graded against the security's OWN prior two fiscal years, so
// its bar moves on its own: roll a weak year into the window and the metric goes
// green having improved nothing. Harmless on a card you glance at; not harmless
// as the trigger for a sell timer. So for margins the comparators are captured
// when the flag is raised and every later re-measurement is made against those
// same two numbers — "has it improved since we flagged it", which is what the
// timer actually promises, and a bar a reader can still see a year later.
//
// A growth card is graded against the category and sector benchmarks, which are
// external and move for reasons that have nothing to do with us. Those stay
// LIVE: beating the market as it is now is the real test.

export type MetricBasis = 'prior_years' | 'benchmarks'

export interface AtRiskMetricDef {
  key: string
  label: string
  basis: MetricBasis
  higherIsBetter: boolean
}

export const STOCK_AT_RISK_METRICS: AtRiskMetricDef[] = [
  { key: 'operating_margin_ttm', label: 'Operating Margin TTM', basis: 'prior_years', higherIsBetter: true },
  { key: 'fcf_margin_ttm', label: 'FCF Margin TTM', basis: 'prior_years', higherIsBetter: true },
  { key: 'revenue_growth_ttm', label: 'Revenue Growth TTM', basis: 'benchmarks', higherIsBetter: true },
  { key: 'eps_growth_ttm', label: 'EPS Growth TTM', basis: 'benchmarks', higherIsBetter: true },
  { key: 'revenue_growth_3y', label: 'Revenue Growth 3Y', basis: 'benchmarks', higherIsBetter: true },
  { key: 'eps_growth_3y', label: 'EPS Growth 3Y', basis: 'benchmarks', higherIsBetter: true },
]

export const STOCK_METRIC_BY_KEY = new Map(STOCK_AT_RISK_METRICS.map((m) => [m.key, m]))

/** One flagged metric: what it read when flagged, and what it reads now. */
export interface AtRiskMetric {
  key: string
  label: string
  basis: MetricBasis
  higherIsBetter: boolean
  /** The reading that failed, at flag time. */
  flaggedValue: number | null
  /** Comparators at flag time. For `prior_years` these are the frozen bar. */
  flaggedBenchmark: number | null
  flaggedBenchmark2: number | null
  /** Latest re-measurement. Null until the first review after flagging. */
  currentValue: number | null
  /** Live comparators — used for `benchmarks` metrics only. */
  currentBenchmark: number | null
  currentBenchmark2: number | null
  measuredAt: string | null
}

/**
 * Grade one flagged metric as it stands today.
 *
 * Falls back to the flagged reading when nothing has re-measured it yet, so an
 * entry shows the state that raised it rather than an empty row.
 */
export function gradeAtRiskMetric(m: AtRiskMetric): ScorecardColor {
  const value = m.currentValue ?? m.flaggedValue
  const live = m.basis === 'benchmarks'
  return scorecardColor({
    value,
    benchmark: live ? (m.currentBenchmark ?? m.flaggedBenchmark) : m.flaggedBenchmark,
    benchmark2: live ? (m.currentBenchmark2 ?? m.flaggedBenchmark2) : m.flaggedBenchmark2,
    higherIsBetter: m.higherIsBetter,
  })
}

/**
 * Is this metric still failing?
 *
 * **Amber clears the flag.** A metric beating one of its two comparators has
 * recovered enough to stop counting against the position; only red keeps the
 * timer running. Deliberate — the alternative makes the flag very hard to
 * escape, since beating both a benchmark and a peer is a high bar to clear
 * under pressure.
 */
export function isMetricFailing(m: AtRiskMetric): boolean {
  return gradeAtRiskMetric(m) === 'red'
}

/**
 * The two metrics graded against the security's OWN prior two fiscal years.
 *
 * These are the only ones that can show a business getting worse than it was.
 * The other four are graded against the category and sector benchmarks, so they
 * go red whenever the company grows more slowly than its market — routine for a
 * large steady compounder and no evidence of deterioration at all.
 */
export const MARGIN_METRIC_KEYS = new Set(['operating_margin_ttm', 'fcf_margin_ttm'])

/** How many reds are needed before a name can be flagged. */
export const MIN_REDS_TO_FLAG = 3

/**
 * Does this reading qualify a held stock for the At-Risk list?
 *
 * **A count alone is not enough.** On the 29 Oct 2026 book, 16 names had 3+ reds
 * but three of them (AAPL, MSI, UBER) were pure growth-vs-benchmark with both
 * margins healthy — slower than their market, not deteriorating. Requiring at
 * least one margin red separates the two, and keeps the cases that matter: MSFT
 * qualifies on FCF margin falling 25.4% -> 20.2% -> 17.3%.
 *
 * The `at-risk-review` job applies this rule; it lives here so the rule has one
 * definition and the app can explain a flag rather than restate the reasoning.
 */
export function qualifiesForFlag(metrics: AtRiskMetric[]): boolean {
  const reds = failingMetrics(metrics)
  if (reds.length < MIN_REDS_TO_FLAG) return false
  return reds.some((m) => MARGIN_METRIC_KEYS.has(m.key))
}

/** The metrics still red — what the committee has to see recover. */
export function failingMetrics(metrics: AtRiskMetric[]): AtRiskMetric[] {
  return metrics.filter(isMetricFailing)
}

/** Every flagged metric has recovered to amber or green. */
export function allMetricsRecovered(metrics: AtRiskMetric[]): boolean {
  return metrics.length > 0 && metrics.every((m) => !isMetricFailing(m))
}

/** Narrow the jsonb column, which the generated types surface as `Json`. */
export function parseMetricsDetail(value: unknown): AtRiskMetric[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (raw === null || typeof raw !== 'object') return []
    const o = raw as Record<string, unknown>
    const key = typeof o.key === 'string' ? o.key : null
    if (!key) return []
    const def = STOCK_METRIC_BY_KEY.get(key)
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
    return [{
      key,
      label: typeof o.label === 'string' ? o.label : def?.label ?? key,
      basis: (o.basis === 'prior_years' || o.basis === 'benchmarks') ? o.basis : def?.basis ?? 'benchmarks',
      higherIsBetter: typeof o.higherIsBetter === 'boolean' ? o.higherIsBetter : def?.higherIsBetter ?? true,
      flaggedValue: num(o.flaggedValue),
      flaggedBenchmark: num(o.flaggedBenchmark),
      flaggedBenchmark2: num(o.flaggedBenchmark2),
      currentValue: num(o.currentValue),
      currentBenchmark: num(o.currentBenchmark),
      currentBenchmark2: num(o.currentBenchmark2),
      measuredAt: typeof o.measuredAt === 'string' ? o.measuredAt : null,
    }]
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AtRiskEntry {
  id: number
  security_id: string
  date_added: string
  /** Labels of the metrics red at flag time. Kept for the list view + CSV export. */
  metrics: string[]
  /** The evidence: per-metric readings and comparators. Empty on pre-Oct-2026 rows. */
  metrics_detail: AtRiskMetric[]
  notes: string | null
  removal_date: string | null
  removed_at: string | null
  source: 'manual' | 'committee'
  last_reviewed_at: string | null
  removal_reason: string | null
  removed_by: 'manual' | 'committee' | null
  breach_alerted_at: string | null
}

/** Days on the clock, by how many metrics were red when the flag was raised. */
export function sellTimerDays(redCount: number): number {
  return redCount >= 5 ? 30 : redCount === 4 ? 90 : redCount === 3 ? 180 : 365
}

/**
 * The sell-by date, set ONCE when the flag is raised and never recalculated.
 *
 * Re-deriving it each review would let a position move its own deadline: three
 * reds recovering to two would reset the clock from 180 days to 365, so partial
 * improvement would buy six months. The date is a commitment made when the
 * problem was found.
 */
function calcRemovalDate(redCount: number): string {
  const d = new Date()
  d.setDate(d.getDate() + sellTimerDays(redCount))
  return d.toISOString()
}

export interface AtRiskEntryWithSecurity extends AtRiskEntry {
  securities2: {
    id: number
    security_id: string
    security_name: string | null
    broad_asset_class: string | null
    detailed_security_type: string | null
    peer_group_name: string | null
  } | null
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All active (not removed) at-risk entries, newest first, with security info. */
export async function fetchActiveAtRisk(): Promise<AtRiskEntryWithSecurity[]> {
  const { data, error } = await supabase
    .from('at_risk')
    .select('*, securities2(id, security_id, security_name, broad_asset_class, detailed_security_type, peer_group_name)')
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    ...(row as unknown as AtRiskEntryWithSecurity),
    metrics_detail: parseMetricsDetail((row as { metrics_detail?: unknown }).metrics_detail),
  }))
}

/** Active at-risk entries for a single security. */
export async function fetchAtRiskBySecurity(securityId: string): Promise<AtRiskEntry[]> {
  const { data, error } = await supabase
    .from('at_risk')
    .select('*')
    .eq('security_id', securityId)
    .is('removed_at', null)
    .order('date_added', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    ...(row as unknown as AtRiskEntry),
    metrics_detail: parseMetricsDetail((row as { metrics_detail?: unknown }).metrics_detail),
  }))
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function addToAtRisk(
  securityId: string,
  metrics: AtRiskMetric[],
  notes: string | null,
  source: 'manual' | 'committee' = 'manual',
): Promise<void> {
  const { error } = await supabase
    .from('at_risk')
    .insert({
      security_id: securityId,
      metrics: metrics.map((m) => m.label),
      metrics_detail: metrics as unknown as Json,
      notes: notes?.trim() || null,
      source,
      // Sized on the count that raised the flag, then fixed. See calcRemovalDate.
      removal_date: calcRemovalDate(metrics.length),
    })
  if (error) throw error
}

/**
 * Soft-delete: stamps `removed_at`, preserving the row.
 *
 * A reason is required by CHECK — the committee records which metrics recovered,
 * an advisor records why they overrode it. A flag that vanishes with no account
 * of why is the one thing this list cannot afford, since the whole point is to
 * show that a deteriorating position was watched and dealt with.
 */
export async function removeFromAtRisk(
  entryId: number,
  reason: string,
  by: 'manual' | 'committee' = 'manual',
): Promise<void> {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error('A removal reason is required')
  const { error } = await supabase
    .from('at_risk')
    .update({ removed_at: new Date().toISOString(), removal_reason: trimmed, removed_by: by })
    .eq('id', entryId)
  if (error) throw error
}

/** The timer has run out and something is still red. */
export function isBreached(entry: { removal_date: string | null; metrics_detail: AtRiskMetric[] }): boolean {
  if (!entry.removal_date) return false
  if (new Date(entry.removal_date).getTime() > Date.now()) return false
  // A pre-Oct-2026 row carries no readings; its timer expiring is still a breach.
  return entry.metrics_detail.length === 0 || failingMetrics(entry.metrics_detail).length > 0
}
