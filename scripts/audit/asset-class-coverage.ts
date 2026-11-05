/**
 * asset-class-coverage.ts — which held securities the asset-class map cannot place.
 *
 *   npx vite-node scripts/audit/asset-class-coverage.ts
 *
 * **Gotcha 23 keeps coming back, and it is silent every time.** A
 * `category_name` missing from `ASSET_CLASS_BY_CATEGORY` resolves to `null`,
 * the weight drops out of the allocation rollup, and the only trace is an
 * "unclassified weight" line under one portfolio's table — which reads as a
 * data quirk rather than a mapping gap. Three of the four emerging-market
 * holdings were in that state across six portfolios because Morningstar
 * publishes both `Diversified Emerging Mkts` and `Diversified Emerging
 * Markets` and only the abbreviation was mapped. VMSAX did the same thing with
 * `Multisector Bond` when it entered Foundation Conservative.
 *
 * The pattern is always the same: it looks like one holding in one book, and
 * it is actually a vocabulary the map has never seen. So this asks the
 * question across the WHOLE book at once, rather than waiting for the next
 * portfolio page to show a stray percentage.
 *
 * **It calls the real `resolveAssetClass`**, not a copy of its rules, so
 * overrides, the cash case and the case/whitespace normalisation are all
 * exercised exactly as the app exercises them. A re-implementation here would
 * be a second place for the rules to be wrong.
 *
 * Read-only. It writes nothing and is safe to run any time.
 */
import { createClient } from '@supabase/supabase-js'
import {
  resolveAssetClass, unmappedCategories,
  ASSET_CLASS_BY_CATEGORY, ASSET_CLASS_OVERRIDES,
} from '../../client/src/lib/assetClass'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (they are in .env).')
  process.exit(1)
}
const sb = createClient(url, key)

const [positions, securities] = await Promise.all([
  sb.from('positions').select('portfolio_name, security_id, allocation_pct').is('deleted_at', null),
  sb.from('securities2').select('security_id, category_name'),
])
if (positions.error) throw positions.error
if (securities.error) throw securities.error

const categoryOf = new Map<string, string | null>(
  (securities.data ?? []).map((s) => [s.security_id, s.category_name]),
)

interface Unplaced {
  portfolio: string
  ticker: string
  category: string | null
  weight: number
}

const unplaced: Unplaced[] = []
/** Every category the held book actually uses, and how many rows carry it. */
const inUse = new Map<string, number>()

for (const p of positions.data ?? []) {
  if (!p.security_id) continue
  const category = categoryOf.get(p.security_id) ?? null
  const label = category?.trim() || '(no category on securities2)'
  inUse.set(label, (inUse.get(label) ?? 0) + 1)

  if (resolveAssetClass({ security_id: p.security_id, category_name: category }) === null) {
    unplaced.push({
      portfolio: p.portfolio_name,
      ticker: p.security_id,
      category,
      weight: Number(p.allocation_pct) || 0,
    })
  }
}

const rows = positions.data ?? []
const books = new Set(rows.map((p) => p.portfolio_name)).size
console.log(`${Object.keys(ASSET_CLASS_BY_CATEGORY).length} mapped categories, `
  + `${Object.keys(ASSET_CLASS_OVERRIDES).length} per-ticker override(s)`)
console.log(`${rows.length} held position rows across ${books} portfolios\n`)

console.log(`CATEGORIES IN USE (${inUse.size})`)
for (const [category, n] of [...inUse].sort((a, b) => a[0].localeCompare(b[0]))) {
  // `unmappedCategories` does the probing, so this script cannot drift from
  // what the importer warns about.
  const placed = !category.startsWith('(') && unmappedCategories([category]).length === 0
  console.log(`  ${(placed ? 'ok' : 'UNMAPPED').padEnd(9)} ${category}  (${n} rows)`)
}

if (unplaced.length === 0) {
  console.log('\nEvery held security resolves to an asset class.')
} else {
  console.log(`\nUNPLACED HOLDINGS (${unplaced.length} rows)`)
  const byBook = new Map<string, Unplaced[]>()
  for (const u of unplaced) byBook.set(u.portfolio, [...(byBook.get(u.portfolio) ?? []), u])
  for (const [book, list] of [...byBook].sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = list.reduce((sum, u) => sum + u.weight, 0)
    console.log(`  ${book} — ${total.toFixed(2)}% unclassified`)
    for (const u of list.sort((a, b) => b.weight - a.weight)) {
      console.log(`      ${u.ticker.padEnd(9)} ${u.weight.toFixed(2).padStart(6)}%  `
        + `category=${u.category ?? 'NULL'}`)
    }
  }
  // The same category usually accounts for several books at once — that is the
  // shape of the bug, and the line worth acting on.
  console.log('\nBY CATEGORY (what to add to ASSET_CLASS_BY_CATEGORY)')
  const byCategory = new Map<string, Unplaced[]>()
  for (const u of unplaced) {
    const k = u.category ?? 'NULL (no category stored)'
    byCategory.set(k, [...(byCategory.get(k) ?? []), u])
  }
  for (const [category, list] of [...byCategory].sort((a, b) => b[1].length - a[1].length)) {
    const tickers = [...new Set(list.map((u) => u.ticker))].sort().join(', ')
    const booksHit = new Set(list.map((u) => u.portfolio)).size
    console.log(`  "${category}" — ${tickers} (${booksHit} portfolio${booksHit === 1 ? '' : 's'})`)
  }
}
