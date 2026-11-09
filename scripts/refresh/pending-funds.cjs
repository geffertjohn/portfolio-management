#!/usr/bin/env node
/**
 * pending-funds.cjs — should a refresh run right now for a newly watched fund?
 *
 * A fund added to the Watchlist populates nothing until the YCharts workbook
 * has carried it through a refresh: no category, no cohort, no scorecard — every
 * measure a fund is judged by. The 05:30 run closes that within a day, which is
 * the right answer for a fund added at 17:00 and the wrong one for a fund added
 * at 09:00 that the advisor wants to look at this morning.
 *
 * So this is the decision half of the poller: it asks whether anything is
 * waiting that a refresh has NOT ALREADY TRIED, and says so on stdout. It
 * starts nothing itself.
 *
 *   exit 0  — run a refresh; stdout names the tickers
 *   exit 10 — nothing to do; stdout says why
 *   exit 1  — could not decide (network, env); stdout says why
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE RUNAWAY THIS AVOIDS, WHICH IS THE WHOLE DESIGN
 *
 * The obvious rule — "a watched fund has no category, so refresh" — never stops
 * being true for a ticker YCharts does not recognise. The poller would wake the
 * VM and run a six-minute Excel session every cycle, for ever, and nothing on
 * screen would say why. An attempt counter in a state file would work and is a
 * second source of truth to corrupt.
 *
 * Instead the condition is **`date_added` NEWER THAN THE LAST SUCCESSFUL
 * IMPORT**: a fund nobody has tried yet. `import_runs` already records every
 * import, so a refresh that runs and fails to resolve the ticker advances that
 * stamp past `date_added` and the fund stops asking by construction. Exactly
 * one extra refresh per batch of additions, no counter, no give-up rule, and
 * the daily 05:30 run keeps trying in case YCharts adds coverage later.
 *
 * A HELD fund is not considered. The roster carries holdings so a bought fund
 * is never released from the sheet, but a holding has been through a refresh by
 * definition; only the watchlist can introduce something the workbook has never
 * seen.
 *
 * STOCKS ARE NOT CONSIDERED EITHER, and getting that wrong is what the runaway
 * would have looked like in practice: the `Securities` sheet is funds-only, so
 * a watched stock NEVER gets a securities2 row and would qualify as "pending"
 * on every single poll. The classifier is imported from `watchlist-tickers.cjs`
 * rather than restated — including its rule that an empty FMP profile means
 * mutual fund — because two classifiers with opposite defaults is exactly how
 * RSIYX was filed on the watchlist as a stock.
 */
const { assetType, sb } = require('./watchlist-tickers.cjs')

/**
 * How recently an import must have run for "nothing new since" to be trusted.
 *
 * Bounds the one case the date comparison cannot: if a triggered refresh FAILS
 * it writes no `import_runs` row, so the stamp stays old and every poll would
 * see the same fund as untried. That retry is wanted — a VM that was asleep
 * should be tried again — but not every cycle, so the shell wrapper also keeps
 * a trigger stamp and this reports the age for it to apply.
 */
const SOURCE = 'ycharts_funds'

function say(code, message, tickers = []) {
  console.log(message)
  if (tickers.length) console.log(tickers.join(' '))
  process.exit(code)
}

async function main() {
  const [prospects, securities, runs] = await Promise.all([
    sb('prospects?removed_at=is.null&select=security_id,date_added,created_at'),
    sb('securities2?select=security_id,detailed_security_type,category_name'),
    sb(`import_runs?source=eq.${SOURCE}&select=imported_at&order=imported_at.desc&limit=1`),
  ])

  const lastImport = runs[0]?.imported_at ? new Date(runs[0].imported_at) : null
  const known = new Map(securities.map((s) => [s.security_id, s.detailed_security_type || '']))
  const categoryOf = new Map(securities.map((s) => [s.security_id, s.category_name]))

  // Oldest entry per ticker: re-adding a watched ticker merges onto the open
  // idea, so the date that matters is when it was FIRST asked for.
  const addedAt = new Map()
  for (const p of prospects) {
    if (!p.security_id) continue
    const when = new Date(p.date_added || p.created_at || 0)
    const prev = addedAt.get(p.security_id)
    if (!prev || when < prev) addedAt.set(p.security_id, when)
  }

  const pending = []
  const alreadyTried = []
  for (const [ticker, when] of addedAt) {
    if ((categoryOf.get(ticker) || '').trim()) continue       // the workbook has it
    const type = await assetType(ticker, known)
    if (type !== 'etf' && type !== 'fund') continue           // the sheet is funds-only
    if (lastImport && when <= lastImport) { alreadyTried.push(ticker); continue }
    pending.push(ticker)
  }

  if (pending.length === 0) {
    const tail = alreadyTried.length
      ? ` (${alreadyTried.length} still unresolved after a refresh: ${alreadyTried.join(', ')} — the daily run keeps trying)`
      : ''
    say(10, `nothing waiting${tail}`)
  }

  const since = lastImport ? lastImport.toISOString() : 'never'
  say(0, `${pending.length} fund(s) added since the last import (${since})`, pending)
}

main().catch((err) => {
  console.log(`could not decide: ${err.message}`)
  process.exit(1)
})
