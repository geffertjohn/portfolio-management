/**
 * households.ts
 *
 * Fetches aggregated position data across all portfolios belonging to clients
 * in the same household. Used for household-level concentration and suitability review.
 */
import { supabase } from './supabase'
import { formatPortfolioSecuritySymbol } from '@/lib/positionDisplay'

export interface HouseholdMember {
  id: number
  name: string
  portfolioNames: string[]
}

export interface HouseholdPosition {
  securityId: string
  ticker: string
  name: string | null
  assetClass: string | null
  /** portfolio_name → allocation_pct */
  byPortfolio: Record<string, number>
  maxWeight: number
  portfolioCount: number
}

/** Returns all clients sharing the given household_name, with their linked portfolios. */
export async function fetchHouseholdMembers(householdName: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, client_portfolios(portfolio_name)')
    .eq('household_name', householdName)
    .is('deleted_at', null)
    .order('name')
  if (error) throw error
  // DB stores portfolio_name as nullable text; domain treats it as non-null
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    portfolioNames: (row.client_portfolios ?? []).map((cp) => cp.portfolio_name) as string[],
  }))
}

/**
 * Returns all active positions across every portfolio linked to any client in the household,
 * grouped by security. Securities held in multiple portfolios appear once with a `byPortfolio`
 * map containing each portfolio's weight.
 */
export async function fetchHouseholdPositions(householdName: string): Promise<{
  positions: HouseholdPosition[]
  portfolioNames: string[]
}> {
  // 1. All client IDs in the household
  const { data: clients, error: clientErr } = await supabase
    .from('clients')
    .select('id')
    .eq('household_name', householdName)
    .is('deleted_at', null)
  if (clientErr) throw clientErr

  const clientIds = (clients ?? []).map((c: { id: number }) => c.id)
  if (clientIds.length === 0) return { positions: [], portfolioNames: [] }

  // 2. All portfolio names linked to those clients
  const { data: cps, error: cpErr } = await supabase
    .from('client_portfolios')
    .select('portfolio_name')
    .in('client_id', clientIds)
  if (cpErr) throw cpErr

  // DB stores portfolio_name as nullable text; domain treats it as non-null
  const portfolioNames = [...new Set((cps ?? []).map((r) => r.portfolio_name) as string[])]
  if (portfolioNames.length === 0) return { positions: [], portfolioNames: [] }

  // 3. All active positions across those portfolios
  const { data: rows, error: posErr } = await supabase
    .from('positions')
    .select('portfolio_name, security_id, allocation_pct, securities2(security_name, broad_asset_class)')
    .in('portfolio_name', portfolioNames)
    .is('deleted_at', null)
  if (posErr) throw posErr

  // 4. Aggregate by security_id
  type JoinedSec = { security_name: string | null; broad_asset_class: string | null }
  type PositionRow = {
    portfolio_name: string
    security_id: string
    allocation_pct: number | string
    securities2: JoinedSec | JoinedSec[] | null
  }
  const secMap = new Map<string, HouseholdPosition>()
  for (const row of (rows ?? []) as PositionRow[]) {
    const sid = row.security_id
    const sec = Array.isArray(row.securities2) ? row.securities2[0] : row.securities2
    if (!secMap.has(sid)) {
      secMap.set(sid, {
        securityId: sid,
        ticker: formatPortfolioSecuritySymbol(sid),
        name: sec?.security_name ?? null,
        assetClass: sec?.broad_asset_class ?? null,
        byPortfolio: {},
        maxWeight: 0,
        portfolioCount: 0,
      })
    }
    const entry = secMap.get(sid)!
    entry.byPortfolio[row.portfolio_name] = Number(row.allocation_pct)
    entry.maxWeight = Math.max(entry.maxWeight, Number(row.allocation_pct))
    entry.portfolioCount = Object.keys(entry.byPortfolio).length
  }

  // Sort: multi-portfolio overlap first, then by max weight descending
  const positions = [...secMap.values()].sort((a, b) => {
    if (b.portfolioCount !== a.portfolioCount) return b.portfolioCount - a.portfolioCount
    return b.maxWeight - a.maxWeight
  })

  return { positions, portfolioNames }
}
