/**
 * tradeSuitability.ts
 *
 * Records why a position was added, changed, or removed — satisfying the
 * best-interest suitability documentation requirement before or at the time
 * of each holdings change.
 */
import { supabase } from './supabase'
import type {
  ThesisStatus, BusinessTrend, ValuationCall, MonitorConviction, HoldingAction,
} from './holdingReviews'

export type TradeAction = 'add' | 'increase' | 'decrease' | 'replace' | 'remove'

export type ReasonCode =
  | 'new_position'
  | 'rebalance_ips'
  | 'client_request'
  | 'sector_rotation'
  | 'risk_reduction'
  | 'tax_loss_harvest'
  | 'other'

export interface TradeSuitability {
  id: number
  portfolio_name: string
  security_id: string
  action: TradeAction
  reason_code: ReasonCode
  rationale: string | null
  old_weight: number | null
  new_weight: number | null
  recorded_at: string
  // Monitoring assessment captured at the time of the change (Edit Position).
  thesis_status: ThesisStatus | null
  business_trend: BusinessTrend | null
  valuation: ValuationCall | null
  conviction: MonitorConviction | null
  monitor_action: HoldingAction | null
}

export const ACTION_LABELS: Record<TradeAction, string> = {
  add:      'New Position',
  increase: 'Increase',
  decrease: 'Decrease',
  replace:  'Replace',
  remove:   'Remove',
}

export const ACTION_COLORS: Record<TradeAction, string> = {
  add:      'bg-green-100 text-green-700',
  increase: 'bg-blue-100 text-blue-700',
  decrease: 'bg-amber-100 text-amber-700',
  replace:  'bg-purple-100 text-purple-700',
  remove:   'bg-red-100 text-red-700',
}

export const REASON_LABELS: Record<ReasonCode, string> = {
  new_position:      'New position',
  rebalance_ips:     'Rebalance per IPS',
  client_request:    'Client request',
  sector_rotation:   'Sector rotation',
  risk_reduction:    'Risk reduction',
  tax_loss_harvest:  'Tax-loss harvesting',
  other:             'Other',
}

export const REASON_OPTIONS_BY_ACTION: Record<TradeAction, ReasonCode[]> = {
  add:      ['new_position', 'client_request', 'other'],
  increase: ['rebalance_ips', 'client_request', 'sector_rotation', 'other'],
  decrease: ['rebalance_ips', 'client_request', 'risk_reduction', 'tax_loss_harvest', 'other'],
  replace:  ['client_request', 'sector_rotation', 'risk_reduction', 'rebalance_ips', 'other'],
  remove:   ['risk_reduction', 'client_request', 'rebalance_ips', 'tax_loss_harvest', 'other'],
}

/**
 * Reason codes offered for each monitoring Action (add/hold/trim/exit/watchlist)
 * from the full-monitoring review. Drives the Edit Position reason dropdown so
 * the documented reason aligns with the advisor's Action call.
 */
export const REASON_OPTIONS_BY_MONITOR_ACTION: Record<HoldingAction, ReasonCode[]> = {
  add:       ['new_position', 'rebalance_ips', 'client_request', 'sector_rotation', 'other'],
  hold:      ['rebalance_ips', 'client_request', 'other'],
  trim:      ['rebalance_ips', 'risk_reduction', 'tax_loss_harvest', 'sector_rotation', 'client_request', 'other'],
  exit:      ['risk_reduction', 'tax_loss_harvest', 'rebalance_ips', 'client_request', 'other'],
  watchlist: ['risk_reduction', 'rebalance_ips', 'client_request', 'other'],
}

export function determineTradeAction(
  oldSecurityId: string,
  newSecurityId: string,
  oldWeight: number,
  newWeight: number,
): TradeAction {
  if (oldSecurityId !== newSecurityId) return 'replace'
  if (newWeight > oldWeight) return 'increase'
  return 'decrease'
}

export async function recordTradeSuitability(note: {
  portfolio_name: string
  security_id: string
  action: TradeAction
  reason_code: ReasonCode
  rationale?: string | null
  old_weight?: number | null
  new_weight?: number | null
  thesis_status?: ThesisStatus | null
  business_trend?: BusinessTrend | null
  valuation?: ValuationCall | null
  conviction?: MonitorConviction | null
  monitor_action?: HoldingAction | null
}): Promise<void> {
  const { error } = await supabase.from('trade_suitability').insert({
    portfolio_name: note.portfolio_name,
    security_id:    note.security_id,
    action:         note.action,
    reason_code:    note.reason_code,
    rationale:      note.rationale?.trim() || null,
    old_weight:     note.old_weight ?? null,
    new_weight:     note.new_weight ?? null,
    thesis_status:  note.thesis_status ?? null,
    business_trend: note.business_trend ?? null,
    valuation:      note.valuation ?? null,
    conviction:     note.conviction ?? null,
    monitor_action: note.monitor_action ?? null,
  })
  if (error) throw error
}

export async function fetchTradeSuitabilityByPortfolio(
  portfolioName: string,
): Promise<TradeSuitability[]> {
  const { data, error } = await supabase
    .from('trade_suitability')
    .select('*')
    .eq('portfolio_name', portfolioName)
    .order('recorded_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TradeSuitability[]
}
