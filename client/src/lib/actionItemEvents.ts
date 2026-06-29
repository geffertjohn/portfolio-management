/**
 * actionItemEvents.ts
 *
 * Read access for the `action_item_events` table.
 * Events are written by updateActionItemStatus() in actionItems.ts whenever
 * a status transition occurs, giving a full audit trail per action item.
 */
import { supabase } from './supabase'
import type { ActionStatus } from './actionItems'

export interface ActionItemEvent {
  id: number
  action_item_id: number
  from_status: ActionStatus | null
  to_status: ActionStatus
  notes: string | null
  created_at: string
}

/** Fetch the full status history for one action item, oldest first. */
export async function fetchActionItemEvents(actionItemId: number): Promise<ActionItemEvent[]> {
  const { data, error } = await supabase
    .from('action_item_events')
    .select('*')
    .eq('action_item_id', actionItemId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ActionItemEvent[]
}
