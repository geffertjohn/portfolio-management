import { supabase } from './supabase'

export type ActionPriority = 'low' | 'medium' | 'high'
export type ActionStatus = 'open' | 'in_progress' | 'closed'

export interface ActionItem {
  id: number
  title: string
  description: string | null
  security_id: string | null
  portfolio_name: string | null
  due_date: string | null
  priority: ActionPriority
  status: ActionStatus
  resolution_notes: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // joined
  security_symbol?: string | null
  security_name?: string | null
}

export async function fetchActionItems(filters?: { status?: ActionStatus }): Promise<ActionItem[]> {
  let q = supabase
    .from('action_items')
    .select('*, securities2(security_id, security_name)')
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    security_symbol: row.securities2?.security_id ?? null,
    security_name: row.securities2?.security_name ?? null,
  }))
}

export async function fetchActionItemsBySecurity(securityId: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('security_id', securityId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

export async function fetchActionItemsByPortfolio(portfolioName: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select('*, securities2(security_id, security_name)')
    .eq('portfolio_name', portfolioName)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    security_symbol: row.securities2?.security_id ?? null,
    security_name: row.securities2?.security_name ?? null,
  }))
}

export async function createActionItem(item: {
  title: string
  description?: string
  security_id?: string | null
  portfolio_name?: string | null
  due_date?: string | null
  priority: ActionPriority
}): Promise<void> {
  const { error } = await supabase.from('action_items').insert(item)
  if (error) throw error
}

export async function updateActionItemStatus(
  id: number,
  status: ActionStatus,
  resolution_notes?: string
): Promise<void> {
  const { data: current, error: fetchError } = await supabase
    .from('action_items')
    .select('status')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const patch: Record<string, unknown> = { status }
  if (status === 'closed') {
    patch.closed_at = new Date().toISOString()
    if (resolution_notes) patch.resolution_notes = resolution_notes
  }
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
}

export async function updateActionItem(
  id: number,
  updates: Partial<Pick<ActionItem, 'title' | 'description' | 'due_date' | 'priority' | 'status' | 'resolution_notes'>>
): Promise<void> {
  const { error } = await supabase.from('action_items').update(updates).eq('id', id)
  if (error) throw error
}

/** Soft-delete: sets deleted_at and preserves the row for regulatory retention. */
export async function deleteActionItem(id: number): Promise<void> {
  const { error } = await supabase
    .from('action_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
