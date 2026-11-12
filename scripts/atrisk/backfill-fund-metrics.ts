/**
 * backfill-fund-metrics.ts — give a fund At-Risk entry the readings it never got.
 *
 *   npx vite-node scripts/atrisk/backfill-fund-metrics.ts            # dry run
 *   npx vite-node scripts/atrisk/backfill-fund-metrics.ts --apply
 *
 * **The gap.** A fund reaches the At-Risk list through the review modal's
 * At-Risk outcome, which called `addToAtRisk(securityId, [], …)` — an EMPTY
 * metrics array. `lib/fundAtRisk.ts` closed that for new flags; the entries
 * raised BEFORE it are still empty, and the consequences are not cosmetic:
 *
 *   - **It can never raise a breach alert.** The `at-risk-review` job fires on
 *     "any metric still red"; over an empty array that is false for ever, so
 *     the entry sits flagged indefinitely and `alert_events` never hears about
 *     it even after the timer expires.
 *   - **It is not re-measurable.** "Has this improved since we flagged it" has
 *     nothing to compare against — the one question the timer promises to
 *     answer.
 *
 * **It calls the app's own helpers** (`designatedCohort`, `buildFundScorecard`,
 * `atRiskMetricsFromScorecard`), so a backfilled entry is exactly what a flag
 * raised today would have recorded. Re-deriving the tier rules here would be a
 * second place for them to be wrong.
 *
 * **THE READINGS ARE TODAY'S, NOT THE FLAG DAY'S, and the note says so.** The
 * scorecard is built from whatever `securities2` currently holds; nobody kept
 * the figures from the day the entry was raised. Writing them silently would
 * assert the fund was flagged on these numbers, which is a false record in a
 * tool whose job is audit defence — so every backfilled entry gets a dated note
 * naming the cohort and the readings, the same way the 29 Oct 2026 sell-timer
 * re-anchor recorded each original date in its notes.
 *
 * **IT DOES NOT TOUCH THE SELL TIMER.** `removal_date` is set once and never
 * recalculated — re-deriving on new readings would let a name improving from 3
 * reds to 2 push its own deadline further out. The timer on these entries WAS
 * sized on a count of zero and is therefore on the longest rung; the script
 * reports what the count now implies so the advisor can decide, and changes
 * nothing.
 */
import { createClient } from '@supabase/supabase-js'
import { buildFundScorecard } from '../../client/src/lib/fundScorecard'
import {
  designatedCohort, atRiskMetricsFromScorecard, failingScorecardRows,
} from '../../client/src/lib/fundAtRisk'
import { calcRemovalDate, reportsToRecover } from '../../client/src/lib/atRisk'
import { isFundOrEtfSecurity } from '../../client/src/lib/securities'
import type { SecurityDetail } from '../../client/src/lib/securities'

const APPLY = process.argv.includes('--apply')
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (they are in .env).')
  process.exit(1)
}
const sb = createClient(url, key)

const { data: entries, error: entErr } = await sb
  .from('at_risk')
  .select('id, security_id, metrics, metrics_detail, notes, removal_date')
  .is('removed_at', null)
if (entErr) throw entErr

const empty = (entries ?? []).filter(
  (e) => !Array.isArray(e.metrics) || e.metrics.length === 0,
)
console.log(`${(entries ?? []).length} live at-risk entries, ${empty.length} with no metrics\n`)
if (empty.length === 0) { console.log('nothing to do.'); process.exit(0) }

const { data: secs, error: secErr } = await sb
  .from('securities2')
  .select('*')
  .in('security_id', empty.map((e) => e.security_id))
if (secErr) throw secErr
const byId = new Map((secs ?? []).map((s) => [s.security_id, s as unknown as SecurityDetail]))

let written = 0
for (const entry of empty) {
  const sec = byId.get(entry.security_id)
  console.log(`── ${entry.security_id} (at_risk id ${entry.id})`)
  if (!sec) { console.log('   no securities2 row — skipped\n'); continue }
  // A stock with no metrics is a different defect; its scorecard is FMP-derived
  // and this script has no business guessing at it.
  if (!isFundOrEtfSecurity(sec)) { console.log('   not a fund/ETF — skipped\n'); continue }

  const cohort = designatedCohort(sec)
  const scorecard = buildFundScorecard(sec, cohort)
  if (!scorecard?.hasData) { console.log(`   cohort=${cohort}: scorecard has no data — skipped\n`); continue }

  const failing = failingScorecardRows(scorecard.rows)
  const metrics = atRiskMetricsFromScorecard(scorecard.rows, cohort)
  console.log(`   cohort=${cohort}  score=${scorecard.total.toFixed(1)}  bottom-tier readings=${failing.length}`)
  for (const m of metrics) {
    console.log(`     • ${m.label}: ${m.flaggedValue} (tier3 ${m.flaggedBenchmark}, tier2 ${m.flaggedBenchmark2})`)
  }
  if (metrics.length === 0) {
    // Same reasoning as assessFundFlag's blockedNoReadings: a low total with
    // nothing in the bottom tier means cohort columns are MISSING, and writing
    // an empty array again would change nothing.
    console.log('   no bottom-tier readings to record — left as is\n')
    continue
  }

  const implied = calcRemovalDate(metrics.length, null).slice(0, 10)
  console.log(`   sell timer: stored ${String(entry.removal_date).slice(0, 10)}, `
    + `${metrics.length} reds now implies ${reportsToRecover(metrics.length)} report(s) `
    + `(~${implied} on the day table) — NOT changed by this script`)

  const stamp = new Date().toISOString().slice(0, 10)
  const note = `Metrics backfilled ${stamp} from the ${cohort === 'category' ? 'category' : 'peer group'} `
    + `scorecard (score ${scorecard.total.toFixed(1)}): ${failing.map((r) => `${r.label} ${r.displayVal}`).join(', ')}. `
    + `These are the readings as at ${stamp}, NOT as at the date the entry was raised — the entry was recorded `
    + `with an empty metrics array and the original figures were never captured. The sell timer is unchanged.`
  const notes = entry.notes ? `${entry.notes}\n\n${note}` : note

  if (!APPLY) { console.log('   DRY RUN — would write the above\n'); continue }

  const { error } = await sb
    .from('at_risk')
    .update({ metrics: metrics.map((m) => m.key), metrics_detail: metrics, notes })
    .eq('id', entry.id)
  if (error) { console.log(`   WRITE FAILED: ${error.message}\n`); continue }
  console.log('   written\n')
  written++
}

console.log(APPLY ? `done — ${written} entr(ies) updated.` : 'DRY RUN — re-run with --apply.')
