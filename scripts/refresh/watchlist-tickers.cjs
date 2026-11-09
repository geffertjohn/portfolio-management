#!/usr/bin/env node
/**
 * watchlist-tickers.cjs — tell the workbook which funds to track.
 *
 * Writes `inbox/WATCHLIST.txt`, one YCharts symbol per line, which the macro
 * reads on open (see `SyncWatchlistTickers` in Ycharts.bas) and reconciles
 * against column B of the `Securities` sheet.
 *
 * WHY THIS EXISTS. Adding a fund to the Watchlist used to populate nothing:
 * the fund columns come from the YCharts workbook, so the ticker had to be
 * typed into the sheet by hand and the refresh waited for. Nothing reminded
 * anyone, so an idea could sit for weeks with no category, no cohort and no
 * scorecard — ungradeable by the one measure that matters for a fund.
 *
 * THE SET IS HELD UNION WATCHED, NOT WATCHED ALONE, and that is the whole of
 * the removal logic. The macro only ever clears a row it added itself, so the
 * 46 hand-entered holdings are never at risk. But a fund that is watched, then
 * bought, then dropped from the watchlist IS a row the macro added — and
 * clearing it would stop a HELD fund refreshing, silently. Including holdings
 * here keeps it in the desired set for as long as it is owned, so a row is
 * only released once the fund is neither held nor watched.
 *
 * BENCHMARK PROXIES ARE INCLUDED, which is why the set is held ∪ watched ∪
 * proxied. A benchmark is an index and YCharts computes no composition for one;
 * the ETF that tracks it is the only way to show an index line beside a fund on
 * the same axes. They are not held and not watched, so `fetchSecurities` hides
 * them from the Securities list and the Add-to-watchlist picker.
 *
 * STOCKS ARE EXCLUDED. The `Securities` sheet is funds-only — its 83 columns
 * are fund fields — and `fundBulkUpload` writes them to `securities2`. A stock
 * ticker here would produce a row of errors, not a security.
 *
 * SYMBOLOGY: YCharts prefixes mutual funds `M:` and leaves ETFs bare (the sheet
 * carries `M:APDFX` beside `AVDE`), and `fundBulkUpload.stripYChartsPrefix`
 * removes it on the way back in. Asset type comes from FMP `/profile`
 * (`isEtf` / `isFund`). FMP serves every ETF the book holds but only 16 of its
 * 27 mutual funds, so NO PROFILE MEANS MUTUAL FUND rather than unknown: FMP
 * covers US stocks comprehensively, and the eleven it misses here — VMSAX,
 * BIMIX, EICOX and the rest — are all institutional share classes.
 *
 * Read-only against Supabase. Writes exactly one file, and prints what it did.
 */

const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const FMP_KEY = process.env.VITE_FMP_API_KEY
const OUT = process.argv[2]
  || path.join(process.env.HOME, 'portfolio-refresh', 'inbox', 'WATCHLIST.txt')

/*
  Checked when a request is actually made, not at module load.

  It used to `process.exit(1)` at the top level, which is right for a script
  and fatal for a module: `pending-funds.cjs` requires this file for its
  classifier, and a bare require would have killed the poller before it could
  log why.
*/
function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set')
  }
}

async function sb(pathAndQuery) {
  requireEnv()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`supabase ${pathAndQuery} -> ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * ETF, mutual fund, or stock.
 *
 * `securities2` is asked first and FMP only for what it cannot answer: a ticker
 * already carrying `detailed_security_type` has been classified by the vendor
 * that owns fund data, and spending an FMP call to second-guess it would let a
 * price feed overrule YCharts on exactly the question YCharts is authoritative
 * for.
 */
async function assetType(ticker, known) {
  const stored = (known.get(ticker) || '').toLowerCase()
  if (stored.includes('etf')) return 'etf'
  if (stored.includes('fund')) return 'fund'
  if (stored) return 'stock'

  if (!FMP_KEY) return 'unknown'
  const sym = ticker.replace(/\./g, '-')
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(sym)}&apikey=${FMP_KEY}`)
    if (!res.ok) return 'fund'
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) return 'fund'  // see SYMBOLOGY above
    if (rows[0].isEtf) return 'etf'
    if (rows[0].isFund) return 'fund'
    return 'stock'
  } catch {
    // A network blip must not silently shrink the roster: dropping a ticker
    // here would make the macro RELEASE its row and lose the fund's history.
    return 'unknown'
  }
}

async function main() {
  const [prospects, positions, securities, catProxies, secProxies] = await Promise.all([
    sb('prospects?removed_at=is.null&select=security_id'),
    sb('positions?deleted_at=is.null&select=security_id'),
    sb('securities2?select=security_id,detailed_security_type'),
    sb('category_benchmarks?select=etf_proxy'),
    sb('sector_benchmarks?select=etf_proxy'),
  ])

  const known = new Map(securities.map((s) => [s.security_id, s.detailed_security_type || '']))
  const watched = [...new Set(prospects.map((p) => p.security_id).filter(Boolean))]
  const held = [...new Set(positions.map((p) => p.security_id).filter(Boolean))]

  /*
    BENCHMARK PROXIES TOO, and they are the reason this set is a union of three
    things rather than two.
    
    A category benchmark is a total-return INDEX — ^SPXTR, ^RLGTR — and YCharts
    holds a price series for one, not a portfolio: every composition metric
    returns `ERR: INVALID CALC`, measured on all 42 rows. So a benchmark cannot
    carry duration, sector weights or credit quality itself, and the only way to
    put an index line beside a fund is through the ETF that tracks it, which
    every benchmark row already names.
  */
  const proxies = [...(catProxies ?? []), ...(secProxies ?? [])]
    .map((r) => r.etf_proxy).filter(Boolean)

  const wanted = [...new Set([...held, ...watched, ...proxies])]
    .filter((t) => t && t !== '$Cash')
    .sort()

  const lines = []
  const skipped = []
  for (const ticker of wanted) {
    const type = await assetType(ticker, known)
    if (type === 'etf') lines.push(ticker)
    else if (type === 'fund') lines.push(`M:${ticker}`)
    else skipped.push(`${ticker} (${type})`)
  }

  // Write via a temp file and rename, so the guest — which polls this directory
  // — can never read a half-written roster and release every row it names.
  const tmp = `${OUT}.tmp`
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(tmp, lines.join('\r\n') + '\r\n', 'utf8')
  fs.renameSync(tmp, OUT)

  console.log(`watchlist roster: ${lines.length} fund/ETF symbols `
    + `(${held.length} held, ${watched.length} watched, `
    + `${new Set(proxies).size} benchmark proxies) -> ${OUT}`)
  if (skipped.length) console.log(`  not funds, excluded: ${skipped.join(', ')}`)
}

/*
  Exported so the POLLER classifies a ticker exactly the way the roster does.

  `pending-funds.cjs` has to answer "is this watchlist entry a fund that should
  have a securities2 row?", which is the same question `assetType` answers here
  — including the rule that an empty FMP profile means MUTUAL FUND, not stock.
  A second copy of that would be the two-classifiers-with-opposite-defaults
  failure that filed RSIYX on the watchlist as a stock: both were documented as
  deliberate, written hours apart on the same day, and one of them was wrong.

  Guarded by `require.main`, so running this file still writes the roster and
  requiring it does not.
*/
module.exports = { assetType, sb }

if (require.main === module) {
  main().catch((err) => {
    console.error(`watchlist: ${err.message}`)
    process.exit(1)
  })
}
