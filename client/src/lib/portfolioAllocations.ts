/**
 * portfolioAllocations.ts
 *
 * Dated allocation snapshots — the YCharts dynamic grid, normalized into the
 * `portfolio_allocations` table. Each `effective_date` holds a full target
 * weight vector. This is the single source of truth for allocation history AND
 * for performance (see portfolioPerformance.ts) — it replaces holdings_change_log.
 *
 * Weights are stored as percent points (e.g. 6.50 = 6.5%).
 */
import { supabase } from './supabase'

export interface AllocationSnapshot {
  effective_date: string // YYYY-MM-DD
  weights: Map<string, number> // security_id → percent points
}

export interface AllocationGridRow {
  security_id: string
  name: string | null
  /** date → weight (percent points); missing = 0. */
  weights: Record<string, number>
}

export interface AllocationGrid {
  dates: string[] // ascending
  rows: AllocationGridRow[] // $Cash first, then alphabetical
}

interface RawRow {
  security_id: string
  effective_date: string
  weight: number
}

const CASH = '$Cash'

/** Normalize an inbound symbol (e.g. YCharts "$:CASH") to the app's convention. */
export function normalizeSymbol(raw: string): string {
  const s = raw.trim().toUpperCase()
  if (s === '$:CASH' || s === '$CASH' || s === 'CASH') return CASH
  return s
}

export async function fetchAllocationGrid(portfolioName: string): Promise<AllocationGrid> {
  // No FK to securities2 (the table stages arbitrary import symbols), so names are
  // resolved with a separate lookup rather than a PostgREST embed.
  const { data, error } = await supabase
    .from('portfolio_allocations')
    .select('security_id, effective_date, weight')
    .eq('portfolio_name', portfolioName)
  if (error) throw error
  const rows = (data ?? []) as unknown as RawRow[]

  const dateSet = new Set<string>()
  const bySym = new Map<string, AllocationGridRow>()
  for (const r of rows) {
    dateSet.add(r.effective_date)
    let g = bySym.get(r.security_id)
    if (!g) { g = { security_id: r.security_id, name: null, weights: {} }; bySym.set(r.security_id, g) }
    g.weights[r.effective_date] = Number(r.weight)
  }

  // Resolve display names from securities2 in one lookup.
  const syms = [...bySym.keys()]
  if (syms.length > 0) {
    const { data: secs } = await supabase
      .from('securities2').select('security_id, security_name').in('security_id', syms)
    for (const s of (secs ?? []) as Array<{ security_id: string; security_name: string | null }>) {
      const g = bySym.get(s.security_id)
      if (g) g.name = s.security_name
    }
  }

  const dates = [...dateSet].sort()
  const ordered = [...bySym.values()].sort((a, b) => {
    if (a.security_id === CASH) return -1
    if (b.security_id === CASH) return 1
    return a.security_id < b.security_id ? -1 : a.security_id > b.security_id ? 1 : 0
  })
  return { dates, rows: ordered }
}

/** Snapshots for the performance engine, ascending by date. */
export async function fetchAllocationSnapshots(portfolioName: string): Promise<AllocationSnapshot[]> {
  const { data, error } = await supabase
    .from('portfolio_allocations')
    .select('security_id, effective_date, weight')
    .eq('portfolio_name', portfolioName)
    .order('effective_date', { ascending: true })
  if (error) throw error
  const byDate = new Map<string, Map<string, number>>()
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const d = r.effective_date as string
    let m = byDate.get(d)
    if (!m) { m = new Map(); byDate.set(d, m) }
    m.set(r.security_id as string, Number(r.weight))
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([effective_date, weights]) => ({ effective_date, weights }))
}

/** Upsert a single cell (one security's weight on one date). */
export async function upsertAllocation(
  portfolioName: string, effective_date: string, security_id: string, weight: number,
): Promise<void> {
  const { error } = await supabase
    .from('portfolio_allocations')
    .upsert(
      { portfolio_name: portfolioName, effective_date, security_id, weight },
      { onConflict: 'portfolio_name,effective_date,security_id' },
    )
  if (error) throw error
}

/** Add a new dated snapshot, optionally cloning the weights of an existing date. */
export async function addSnapshotDate(
  portfolioName: string, effective_date: string, cloneFrom?: string,
): Promise<void> {
  let rows: Array<{ portfolio_name: string; effective_date: string; security_id: string; weight: number }> = []
  if (cloneFrom) {
    const { data, error } = await supabase
      .from('portfolio_allocations')
      .select('security_id, weight')
      .eq('portfolio_name', portfolioName)
      .eq('effective_date', cloneFrom)
    if (error) throw error
    rows = (data ?? []).map((r: Record<string, unknown>) => ({
      portfolio_name: portfolioName, effective_date, security_id: r.security_id as string, weight: Number(r.weight),
    }))
  }
  if (rows.length === 0) {
    rows = [{ portfolio_name: portfolioName, effective_date, security_id: CASH, weight: 0 }]
  }
  const { error } = await supabase
    .from('portfolio_allocations')
    .upsert(rows, { onConflict: 'portfolio_name,effective_date,security_id' })
  if (error) throw error
}

export async function deleteSnapshotDate(portfolioName: string, effective_date: string): Promise<void> {
  const { error } = await supabase
    .from('portfolio_allocations')
    .delete()
    .eq('portfolio_name', portfolioName)
    .eq('effective_date', effective_date)
  if (error) throw error
}

export interface ParsedDynamicAllocations {
  dates: string[] // YYYY-MM-DD, one per snapshot column
  rows: { security_id: string; weights: (number | null)[] }[] // weights aligned to dates
}

/**
 * Bulk-load parsed YCharts dynamic data. When `replace`, the portfolio's existing
 * snapshots are cleared first (a clean re-import). Zero/blank weights are skipped.
 */
export async function importAllocationSnapshots(
  portfolioName: string, parsed: ParsedDynamicAllocations, replace = true,
): Promise<{ inserted: number; dates: number }> {
  if (replace) {
    const { error: delErr } = await supabase
      .from('portfolio_allocations').delete().eq('portfolio_name', portfolioName)
    if (delErr) throw delErr
  }
  const inserts: Array<{ portfolio_name: string; effective_date: string; security_id: string; weight: number }> = []
  for (const r of parsed.rows) {
    const sym = normalizeSymbol(r.security_id)
    r.weights.forEach((w, i) => {
      if (w != null && w !== 0) {
        inserts.push({ portfolio_name: portfolioName, effective_date: parsed.dates[i], security_id: sym, weight: w })
      }
    })
  }
  // chunked upsert
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await supabase
      .from('portfolio_allocations')
      .upsert(inserts.slice(i, i + 500), { onConflict: 'portfolio_name,effective_date,security_id' })
    if (error) throw error
  }
  return { inserted: inserts.length, dates: parsed.dates.length }
}

/**
 * Parse a YCharts dynamic source file. The export is the **long** format —
 * columns `Date · Symbol · Target Weight`, one row per holding per date (weights
 * in decimal, e.g. 0.075). Multiple rows share a date; we pivot to dated snapshots.
 */
export function parseYchartsDynamic(rows: unknown[][]): ParsedDynamicAllocations {
  const asDate = (v: unknown): string | null => {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return `${m[1]}-${m[2]}-${m[3]}`
    }
    return null
  }
  const looksTicker = (v: unknown) => typeof v === 'string' && /^[$:A-Za-z][A-Za-z0-9.:-]{0,9}$/.test(v.trim())
  const cellEq = (v: unknown, re: RegExp) => typeof v === 'string' && re.test(v.trim())

  // Header row: contains a "Symbol" cell and a "...Weight" cell.
  let h = -1, dateCol = 0, symCol = -1, wCol = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? []
    const sc = r.findIndex((c) => cellEq(c, /^symbol$/i))
    if (sc < 0) continue
    const wc = r.findIndex((c, ci) => ci > sc && cellEq(c, /weight/i))
    if (wc < 0) continue
    const dc = r.findIndex((c) => cellEq(c, /^date$/i))
    h = i; symCol = sc; wCol = wc; dateCol = dc >= 0 ? dc : 0
    break
  }
  if (h < 0) throw new Error('Could not find a header row with Date / Symbol / Weight columns.')

  const pct = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').trim())
    if (!Number.isFinite(n)) return null
    return Math.abs(n) <= 1 ? n * 100 : n // 0.075 → 7.5, or accept already-percent
  }

  // Collect (date, symbol) → weight.
  const dateSet = new Set<string>()
  const bySym = new Map<string, Map<string, number>>()
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const d = asDate(row[dateCol])
    const sym = row[symCol]
    const w = pct(row[wCol])
    if (!d || !looksTicker(sym) || w == null) continue
    dateSet.add(d)
    const key = normalizeSymbol(String(sym))
    let m = bySym.get(key); if (!m) { m = new Map(); bySym.set(key, m) }
    m.set(d, w)
  }
  if (dateSet.size === 0 || bySym.size === 0) throw new Error('No dated holding rows parsed from the file.')

  const dates = [...dateSet].sort()
  const outRows = [...bySym.entries()].map(([security_id, m]) => ({
    security_id,
    weights: dates.map((d) => (m.has(d) ? m.get(d)! : null)),
  }))
  return { dates, rows: outRows }
}
