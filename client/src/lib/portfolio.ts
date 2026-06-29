import { supabase } from './supabase'
import type { Portfolio } from '@/types/portfolio'

export async function fetchPortfolios(): Promise<Portfolio[]> {
  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data as Portfolio[]
}

export async function updatePortfolioObjective(
  portfolioName: string,
  investment_objective: string | null,
  description: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('portfolio')
    .update({ investment_objective, description })
    .eq('name', portfolioName)
  if (error) throw error
}

export async function updatePortfolioRebalanceDates(
  portfolioName: string,
  last_rebalance_date: string | null,
  next_rebalance_date: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('portfolio')
    .update({ last_rebalance_date, next_rebalance_date })
    .eq('name', portfolioName)
  if (error) throw error
}

export async function fetchPortfolioByName(name: string): Promise<Portfolio | null> {
  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .eq('name', name)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as Portfolio
}
