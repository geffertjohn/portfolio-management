import { supabase } from './supabase'

export interface Client {
  id: number
  name: string
  household_name: string | null
  email: string | null
  notes: string | null
  model_portfolio_name: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ClientPortfolio {
  id: number
  client_id: number
  portfolio_name: string   // FK → portfolio.name
  created_at: string
  // joined
  portfolio_strategy?: string | null
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchClientById(id: number): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/** Soft-delete: sets deleted_at and preserves the row for regulatory retention. */
export async function archiveClient(id: number): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function fetchClientPortfolios(clientId: number): Promise<ClientPortfolio[]> {
  const { data, error } = await supabase
    .from('client_portfolios')
    .select('*, portfolio(portfolio_strategy)')
    .eq('client_id', clientId)
  if (error) throw error
  // DB stores portfolio_name as nullable text; domain type narrows it
  return (data ?? []).map((row) => ({
    ...row,
    portfolio_strategy: row.portfolio?.portfolio_strategy ?? null,
  })) as ClientPortfolio[]
}

export async function createClient(client: {
  name: string
  household_name?: string
  email?: string
  notes?: string
  model_portfolio_name?: string | null
}): Promise<Client> {
  const { data, error } = await supabase.from('clients').insert(client).select().single()
  if (error) throw error
  return data
}

export async function updateClient(id: number, updates: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase.from('clients').update(updates).eq('id', id)
  if (error) throw error
}

export async function linkPortfolioToClient(clientId: number, portfolioName: string): Promise<void> {
  const { error } = await supabase
    .from('client_portfolios')
    .upsert({ client_id: clientId, portfolio_name: portfolioName }, { onConflict: 'client_id,portfolio_name' })
  if (error) throw error
}

export async function unlinkPortfolioFromClient(clientId: number, portfolioName: string): Promise<void> {
  const { error } = await supabase
    .from('client_portfolios')
    .delete()
    .eq('client_id', clientId)
    .eq('portfolio_name', portfolioName)
  if (error) throw error
}
