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

/**
 * Writes the objective ONLY.
 *
 * It used to take a `description` as well and copy it from whichever model
 * matched the new objective. That stopped working in Nov 2026 when the
 * narrative moved to `model_portfolio_data.objective_statement` and every
 * model's `description` became null: the call then wrote NULL into
 * `portfolio.description`, which is NOT NULL, so changing a portfolio's
 * objective would have failed outright. There is nothing to copy any more —
 * the narrative is resolved from the model at render time.
 */
export async function updatePortfolioObjective(
  portfolioName: string,
  investment_objective: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('portfolio')
    .update({ investment_objective } as never)
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
