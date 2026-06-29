/**
 * positions.ts
 *
 * CRUD helpers for the `positions` table.
 * The table uses a composite primary key (portfolio_name, security_id).
 * positions.portfolio_name is the FK to portfolio.name (text).
 * positions.security_id is the text ticker (e.g. "UITB"), a FK to securities2.security_id.
 */
import { supabase } from './supabase'
import { formatPortfolioSecuritySymbol } from '@/lib/positionDisplay'
import type { PortfolioPosition } from '@/types/position'

export async function updatePosition(
  portfolioName: string,
  oldSecurityId: string,
  newSecurityId: string,
  allocationPct: number
): Promise<void> {
  if (oldSecurityId !== newSecurityId) {
    // Soft-delete old position
    const { error: delError } = await supabase
      .from('positions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('portfolio_name', portfolioName)
      .eq('security_id', oldSecurityId)
      .is('deleted_at', null)
    if (delError) throw delError

    // Upsert new position — clears deleted_at in case this security was previously soft-deleted
    const { error: upsertError } = await supabase
      .from('positions')
      .upsert(
        { portfolio_name: portfolioName, security_id: newSecurityId, allocation_pct: allocationPct, deleted_at: null },
        { onConflict: 'portfolio_name,security_id' }
      )
    if (upsertError) throw upsertError
  } else {
    const { error } = await supabase
      .from('positions')
      .update({ allocation_pct: allocationPct })
      .eq('portfolio_name', portfolioName)
      .eq('security_id', oldSecurityId)
      .is('deleted_at', null)
    if (error) throw error
  }
}

/** Soft-delete: sets deleted_at and preserves the row for regulatory retention. */
export async function deletePosition(
  portfolioName: string,
  securityId: string
): Promise<void> {
  const { error } = await supabase
    .from('positions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('portfolio_name', portfolioName)
    .eq('security_id', securityId)
    .is('deleted_at', null)
  if (error) throw error
}

export async function createPosition(
  portfolioName: string,
  securityId: string,
  allocationPct: number
): Promise<void> {
  // deleted_at: null clears the field if this position was previously soft-deleted,
  // restoring it rather than creating a duplicate composite-key conflict.
  const { error } = await supabase
    .from('positions')
    .upsert(
      { portfolio_name: portfolioName, security_id: securityId, allocation_pct: allocationPct, deleted_at: null },
      { onConflict: 'portfolio_name,security_id' }
    )
  if (error) throw error
}

export async function updatePositionBands(
  portfolioName: string,
  securityId: string,
  lowerLimit: number | null,
  targetWeight: number | null,
  upperLimit: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('positions')
    .update({ lower_limit: lowerLimit, target_weight: targetWeight, upper_limit: upperLimit })
    .eq('portfolio_name', portfolioName)
    .eq('security_id', securityId)
    .is('deleted_at', null)
  if (error) throw error
}

export async function updatePositionLimits(
  portfolioName: string,
  securityId: string,
  lowerLimit: number | null,
  upperLimit: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('positions')
    .update({ lower_limit: lowerLimit, upper_limit: upperLimit })
    .eq('portfolio_name', portfolioName)
    .eq('security_id', securityId)
    .is('deleted_at', null)
  if (error) throw error
}

type EmbeddedSecurity = { id: number; security_id: string; security_name: string | null; broad_asset_class: string | null; category_name: string | null; expense_ratio_generic: number | null }

interface PositionQueryRow {
  portfolio_name: string
  security_id: string
  allocation_pct: number
  sort_order: number | null
  updated_at: string | null
  target_weight: number | null
  drift_threshold: number | null
  lower_limit: number | null
  upper_limit: number | null
  securities2: EmbeddedSecurity | EmbeddedSecurity[] | null
}

function embeddedSecurity(
  val: EmbeddedSecurity | EmbeddedSecurity[] | null | undefined,
): EmbeddedSecurity | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

export async function fetchPortfoliosHoldingSecurity(
  securityId: string
): Promise<Array<{ portfolioId: string; portfolioName: string; portfolioStrategy: string | null; weight: number }>> {
  const { data, error } = await supabase
    .from('positions')
    .select('portfolio_name, allocation_pct, portfolio(name, portfolio_strategy)')
    .eq('security_id', securityId)
    .is('deleted_at', null)
  if (error) throw error
  return (data ?? []).map((row) => {
    const p = Array.isArray(row.portfolio) ? row.portfolio[0] : row.portfolio
    return {
      portfolioId: row.portfolio_name as string,
      portfolioName: (p?.name ?? row.portfolio_name) as string,
      portfolioStrategy: (p?.portfolio_strategy ?? null) as string | null,
      weight: Number(row.allocation_pct),
    }
  })
}

export async function fetchPositionsByPortfolioId(
  portfolioName: string
): Promise<PortfolioPosition[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('portfolio_name, security_id, allocation_pct, sort_order, updated_at, target_weight, drift_threshold, lower_limit, upper_limit, securities2(id, security_id, security_name, broad_asset_class, category_name, expense_ratio_generic)')
    .eq('portfolio_name', portfolioName)
    .is('deleted_at', null)
    .order('allocation_pct', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as unknown as PositionQueryRow[]
  return rows.map((row) => {
    const sec = embeddedSecurity(row.securities2)
    const rawSymbol = row.security_id
    const ticker = rawSymbol ? formatPortfolioSecuritySymbol(rawSymbol) : '—'
    const name =
      sec?.security_name?.trim() ||
      (ticker === 'Cash' ? 'Cash' : null)
    return {
      portfolioId: row.portfolio_name,
      securityId: row.security_id,
      numericId: sec?.id ?? null,
      ticker,
      name,
      weight: Number(row.allocation_pct),
      updatedAt: row.updated_at ?? null,
      targetWeight: row.target_weight ?? null,
      driftThreshold: row.drift_threshold ?? null,
      assetClass: sec?.broad_asset_class ?? null,
      categoryName: sec?.category_name ?? null,
      lowerLimit: row.lower_limit ?? null,
      upperLimit: row.upper_limit ?? null,
      expenseRatio: sec?.expense_ratio_generic ?? null,
    }
  })
}
