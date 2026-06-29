import { supabase } from './supabase'

export interface AssetClassTarget {
  id: number
  portfolio_name: string
  asset_class: string
  lower_limit: number
  target: number
  upper_limit: number
  sort_order: number | null
}

export async function fetchAssetClassTargets(portfolioName: string): Promise<AssetClassTarget[]> {
  const { data, error } = await supabase
    .from('portfolio_asset_class_targets')
    .select('*')
    .eq('portfolio_name', portfolioName)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('asset_class', { ascending: true })
  if (error) throw error
  return (data ?? []) as AssetClassTarget[]
}

export async function upsertAssetClassTarget(
  portfolioName: string,
  assetClass: string,
  lowerLimit: number,
  target: number,
  upperLimit: number,
): Promise<void> {
  const { error } = await supabase
    .from('portfolio_asset_class_targets')
    .upsert(
      { portfolio_name: portfolioName, asset_class: assetClass, lower_limit: lowerLimit, target, upper_limit: upperLimit, updated_at: new Date().toISOString() },
      { onConflict: 'portfolio_name,asset_class' }
    )
  if (error) throw error
}

export async function deleteAssetClassTarget(id: number): Promise<void> {
  const { error } = await supabase
    .from('portfolio_asset_class_targets')
    .delete()
    .eq('id', id)
  if (error) throw error
}
