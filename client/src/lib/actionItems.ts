import { supabase } from './supabase'
import { mapSecurityJoin } from './securityJoin'

export type ActionPriority = 'low' | 'medium' | 'high'
export type ActionStatus = 'open' | 'in_progress' | 'waiting' | 'blocked' | 'snoozed' | 'closed'
export type ActionCategory = 'security' | 'portfolio' | 'ic' | 'compliance' | 'client' | 'trade' | 'operational'
export type ActionRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

/** A polymorphic link to any entity an action concerns (beyond security/portfolio). */
export type ActionLinkedType = 'security' | 'portfolio' | 'client' | 'ic_memo' | 'candidate'

export const CATEGORY_LABELS: Record<ActionCategory, string> = {
  security: 'Security',
  portfolio: 'Portfolio',
  ic: 'IC',
  compliance: 'Compliance',
  client: 'Client',
  trade: 'Trade',
  operational: 'Operational',
}

export const STATUS_LABELS: Record<ActionStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  snoozed: 'Snoozed',
  closed: 'Closed',
}

export const RECURRENCE_LABELS: Record<ActionRecurrence, string> = {
  none: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

/** Active = anything not closed. Used as the default working view. */
export const ACTIVE_STATUSES: ActionStatus[] = ['open', 'in_progress', 'waiting', 'blocked', 'snoozed']

export interface ActionItem {
  id: number
  title: string
  description: string | null
  security_id: string | null
  portfolio_name: string | null
  category: ActionCategory
  source: string
  linked_type: string | null
  linked_id: string | null
  due_date: string | null
  priority: ActionPriority
  status: ActionStatus
  recurrence: ActionRecurrence
  recurrence_interval: number
  snoozed_until: string | null
  resolution_notes: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // joined
  security_symbol?: string | null
  security_name?: string | null
}

const SELECT = '*, securities2(security_id, security_name)'

export async function fetchActionItems(filters?: { status?: ActionStatus }): Promise<ActionItem[]> {
  let q = supabase
    .from('action_items')
    .select(SELECT)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)

  const { data, error } = await q
  if (error) throw error
  // DB stores priority/status/category/recurrence as text; domain type narrows them
  return (data ?? []).map(mapSecurityJoin) as ActionItem[]
}

export async function fetchActionItemsBySecurity(securityId: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('security_id', securityId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as ActionItem[]
}

export async function createActionItem(item: {
  title: string
  description?: string
  category?: ActionCategory
  security_id?: string | null
  portfolio_name?: string | null
  linked_type?: ActionLinkedType | null
  linked_id?: string | null
  due_date?: string | null
  priority: ActionPriority
  recurrence?: ActionRecurrence
  recurrence_interval?: number
}): Promise<void> {
  const { error } = await supabase.from('action_items').insert({
    ...item,
    source: 'manual',
    category: item.category ?? 'operational',
    recurrence: item.recurrence ?? 'none',
    recurrence_interval: item.recurrence_interval ?? 1,
  })
  if (error) throw error
}

/** Advance an ISO date (YYYY-MM-DD) by one recurrence step. */
export function advanceDate(iso: string, recurrence: ActionRecurrence, interval: number): string {
  const d = new Date(iso + 'T00:00:00')
  const n = interval && interval > 0 ? interval : 1
  switch (recurrence) {
    case 'daily': d.setDate(d.getDate() + n); break
    case 'weekly': d.setDate(d.getDate() + 7 * n); break
    case 'monthly': d.setMonth(d.getMonth() + n); break
    case 'quarterly': d.setMonth(d.getMonth() + 3 * n); break
    case 'annual': d.setFullYear(d.getFullYear() + n); break
    default: return iso
  }
  return d.toISOString().slice(0, 10)
}

export async function updateActionItemStatus(
  id: number,
  status: ActionStatus,
  resolution_notes?: string
): Promise<void> {
  // Pull the fields we need both to write the audit row and to spawn the next
  // occurrence of a recurring task when it is closed.
  const { data: current, error: fetchError } = await supabase
    .from('action_items')
    .select('status, title, description, category, security_id, portfolio_name, linked_type, linked_id, due_date, priority, recurrence, recurrence_interval')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const patch: Record<string, unknown> = { status }
  if (status === 'closed') {
    patch.closed_at = new Date().toISOString()
    if (resolution_notes) patch.resolution_notes = resolution_notes
  }
  // Un-snoozing (any status change off 'snoozed') clears the snooze timer.
  if (status !== 'snoozed') patch.snoozed_until = null

  const { error } = await supabase.from('action_items').update(patch).eq('id', id)
  if (error) throw error

  await supabase.from('action_item_events').insert({
    action_item_id: id,
    from_status: current?.status ?? null,
    to_status: status,
    notes: resolution_notes ?? null,
  }).then(({ error: evErr }) => {
    if (evErr) console.warn('Failed to write action_item_event:', evErr.message)
  })

  // Recurring task just completed → spawn the next occurrence.
  const recurrence = (current?.recurrence ?? 'none') as ActionRecurrence
  if (status === 'closed' && recurrence !== 'none') {
    const base = current?.due_date ?? new Date().toISOString().slice(0, 10)
    const nextDue = advanceDate(base, recurrence, current?.recurrence_interval ?? 1)
    const { error: spawnErr } = await supabase.from('action_items').insert({
      title: current!.title,
      description: current!.description,
      category: current!.category,
      security_id: current!.security_id,
      portfolio_name: current!.portfolio_name,
      linked_type: current!.linked_type,
      linked_id: current!.linked_id,
      due_date: nextDue,
      priority: current!.priority,
      recurrence,
      recurrence_interval: current!.recurrence_interval ?? 1,
      source: 'manual',
      status: 'open',
    })
    if (spawnErr) console.warn('Failed to spawn next recurring occurrence:', spawnErr.message)
  }
}

/** Snooze until a date — hides the item from active buckets until then. */
export async function snoozeActionItem(id: number, until: string): Promise<void> {
  const { data: current } = await supabase.from('action_items').select('status').eq('id', id).single()
  const { error } = await supabase
    .from('action_items')
    .update({ status: 'snoozed', snoozed_until: until })
    .eq('id', id)
  if (error) throw error
  await supabase.from('action_item_events').insert({
    action_item_id: id,
    from_status: current?.status ?? null,
    to_status: 'snoozed',
    notes: `Snoozed until ${until}`,
  }).then(({ error: evErr }) => { if (evErr) console.warn('Failed to write action_item_event:', evErr.message) })
}

/** Soft-delete: sets deleted_at and preserves the row for regulatory retention. */
export async function deleteActionItem(id: number): Promise<void> {
  const { error } = await supabase
    .from('action_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
