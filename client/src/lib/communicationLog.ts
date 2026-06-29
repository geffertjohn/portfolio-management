import { supabase } from './supabase'

export type CommType = 'meeting' | 'call' | 'email' | 'note'

export interface CommEntry {
  id: number
  client_id: number | null
  portfolio_name: string | null
  security_id: string | null
  type: CommType
  subject: string
  notes: string | null
  occurred_at: string
  follow_up_due: string | null
  follow_up_notes: string | null
  created_at: string
  // joined
  client_name?: string | null
  security_symbol?: string | null
}

export async function fetchCommunicationLog(clientId: number): Promise<CommEntry[]> {
  const { data, error } = await supabase
    .from('communication_log')
    .select('*, clients(name), securities2(security_id)')
    .eq('client_id', clientId)
    .order('occurred_at', { ascending: false })
  if (error) throw error
  // DB stores type as text; domain type narrows it to CommType
  return (data ?? []).map((row) => ({
    ...row,
    client_name: row.clients?.name ?? null,
    security_symbol: row.securities2?.security_id ?? null,
  })) as CommEntry[]
}

export async function createCommEntry(entry: {
  client_id?: number | null
  portfolio_name?: string | null
  security_id?: string | null
  type: CommType
  subject: string
  notes?: string
  occurred_at?: string
  follow_up_due?: string | null
  follow_up_notes?: string | null
}): Promise<void> {
  const { error } = await supabase.from('communication_log').insert(entry)
  if (error) throw error
}

export async function deleteCommEntry(id: number): Promise<void> {
  const { error } = await supabase.from('communication_log').delete().eq('id', id)
  if (error) throw error
}
