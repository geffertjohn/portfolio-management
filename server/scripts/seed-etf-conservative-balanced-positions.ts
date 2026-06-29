/**
 * Seeds positions for ETF Conservative Balanced (portfolio_id 2).
 * Run from repo root: npx tsx server/scripts/seed-etf-conservative-balanced-positions.ts
 * Requires .env with VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const PORTFOLIO_ID = 2

const HOLDINGS: { symbol: string; pct: number; ord: number }[] = [
  { symbol: 'VOO', pct: 10.0, ord: 1 },
  { symbol: 'QLC', pct: 10.0, ord: 2 },
  { symbol: 'PWB', pct: 5.0, ord: 3 },
  { symbol: 'ULVM', pct: 5.0, ord: 4 },
  { symbol: 'FPX', pct: 3.0, ord: 5 },
  { symbol: 'VFMO', pct: 3.0, ord: 6 },
  { symbol: 'VB', pct: 1.0, ord: 7 },
  { symbol: 'XSMO', pct: 1.0, ord: 8 },
  { symbol: 'AVDE', pct: 5.5, ord: 9 },
  { symbol: 'IDEQ', pct: 5.5, ord: 10 },
  { symbol: 'UITB', pct: 14.25, ord: 11 },
  { symbol: 'AVIG', pct: 10.25, ord: 12 },
  { symbol: 'BIV', pct: 10.25, ord: 13 },
  { symbol: 'DFCF', pct: 6.25, ord: 14 },
  { symbol: 'HYDB', pct: 6.0, ord: 15 },
  { symbol: 'IAGG', pct: 3.0, ord: 16 },
]

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const symbols = HOLDINGS.map((h) => h.symbol)
  const { error: upsertErr } = await supabase.from('securities2').upsert(
    symbols.map((symbol) => ({ symbol })),
    { onConflict: 'symbol', ignoreDuplicates: true },
  )
  if (upsertErr) {
    console.error('securities2 upsert:', upsertErr.message)
    process.exit(1)
  }

  const { error: delErr } = await supabase
    .from('positions')
    .delete()
    .eq('portfolio_id', PORTFOLIO_ID)
  if (delErr) {
    console.error('positions delete:', delErr.message)
    process.exit(1)
  }

  const { data: rows, error: selErr } = await supabase
    .from('securities2')
    .select('id, symbol')
    .in('symbol', symbols)
  if (selErr) {
    console.error('securities2 select:', selErr.message)
    process.exit(1)
  }

  const bySymbol = new Map(
    (rows ?? []).map((r) => [String(r.symbol).toUpperCase(), r.id as number]),
  )

  const missing = symbols.filter((s) => !bySymbol.has(s.toUpperCase()))
  if (missing.length > 0) {
    console.error('Missing securities2 after upsert:', missing.join(', '))
    process.exit(1)
  }

  const inserts = HOLDINGS.map((h) => ({
    portfolio_id: PORTFOLIO_ID,
    security_id: bySymbol.get(h.symbol.toUpperCase())!,
    allocation_pct: h.pct,
    sort_order: h.ord,
  }))

  const { error: insErr } = await supabase.from('positions').insert(inserts)
  if (insErr) {
    console.error('positions insert:', insErr.message)
    process.exit(1)
  }

  console.log(`Inserted ${inserts.length} positions for portfolio_id=${PORTFOLIO_ID} (ETF Conservative Balanced).`)
}

main()
