/**
 * scorecard-cohort-coverage.ts — which funds are missing a scorecard cohort.
 *
 *   npx vite-node scripts/audit/scorecard-cohort-coverage.ts
 *
 * `securities2.scorecard_cohort` decides which population a fund is graded
 * against, and a null one is invisible until a review needs it: the per-security
 * modal and the fund annual review's scorecard step both fall back to
 * `category` for grading (`designatedCohort`), so a fund with no cohort looks
 * graded while nobody has said what it is graded against. The Watchlist card
 * shows an amber badge, but only for a WATCHED fund — a held one says nothing.
 *
 * Since Nov 2026 a tracked fund is seeded to `category` automatically, by the
 * workbook import and by the watchlist add. This answers the question the
 * seeding is supposed to make boring: is anything still waiting?
 *
 * **It calls the real `needsDefaultCohort`**, not a copy of its rules, so the
 * stock guard, the proxy guard and the "workbook has not reached it yet" case
 * are exercised exactly as the app exercises them. A re-implementation here
 * would be a second place for the rules to be wrong — the same reason
 * `asset-class-coverage.ts` calls `resolveAssetClass`.
 *
 * Read-only. It writes nothing and is safe to run any time.
 */
import { createClient } from '@supabase/supabase-js'
import { needsDefaultCohort, type CohortSeedInput } from '../../client/src/lib/securities'
import { isCashTicker } from '../../client/src/lib/positionBands'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (they are in .env).')
  process.exit(1)
}
const sb = createClient(url, key)

const [securities, positions, prospects] = await Promise.all([
  sb.from('securities2').select(
    'security_id, security_name, scorecard_cohort, category_name, is_benchmark_proxy, detailed_security_type, peer_group_name, fund_company_name, fund_family, expense_ratio_generic',
  ),
  sb.from('positions').select('security_id').is('deleted_at', null),
  sb.from('prospects').select('security_id').is('removed_at', null),
])
if (securities.error) throw securities.error
if (positions.error) throw positions.error
if (prospects.error) throw prospects.error

const held = new Set((positions.data ?? []).map((r) => r.security_id))
const watched = new Set((prospects.data ?? []).map((r) => r.security_id))
const rows = securities.data ?? []

/** Where a row sits on the roster — a fund off it is not reviewed by anyone. */
function roster(id: string): string {
  if (held.has(id) && watched.has(id)) return 'held + watched'
  if (held.has(id)) return 'held'
  if (watched.has(id)) return 'watched'
  return 'neither'
}

const pending = rows.filter((r) => needsDefaultCohort(r as CohortSeedInput))

const counts = new Map<string, number>()
for (const r of rows) {
  const k = r.scorecard_cohort ?? '(none)'
  counts.set(k, (counts.get(k) ?? 0) + 1)
}

console.log(`\n${rows.length} rows in securities2\n`)
console.log('  cohort        rows')
for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)}  ${String(n).padStart(4)}`)
}

if (pending.length === 0) {
  console.log('\n✓ No fund is waiting for a cohort.')
  console.log('  Every row with no cohort is one that should not have one — a stock, a')
  console.log('  benchmark proxy, or a fund whose category the workbook has not filled.\n')
} else {
  console.log(`\n⚠ ${pending.length} fund(s) would be seeded to 'category':\n`)
  for (const r of pending.sort((a, b) => a.security_id.localeCompare(b.security_id))) {
    console.log(
      `  ${r.security_id.padEnd(8)} ${roster(r.security_id).padEnd(14)} ` +
        `${(r.category_name ?? '').padEnd(28)} ${r.security_name ?? ''}`,
    )
  }
  console.log('\n  The next workbook import seeds these. A watchlist add seeds one on the')
  console.log('  spot when its securities2 row already exists.\n')
}

/**
 * The funds that are NOT seedable and are on the roster anyway — the real gap,
 * because these are reviewed and still have nothing saying against what. A
 * missing `category_name` is the expected cause and resolves on the next
 * refresh; anything else is worth a look.
 *
 * **Cash is excluded via the canonical `isCashTicker`, not a test of its own.**
 * `$Cash` is a held row with no type and no category, so it lands here on
 * every run — and a report that always carries one finding teaches its reader
 * to skip the section, which is what `never_run` already cost once.
 */
const trackedWithoutCohort = rows.filter(
  (r) =>
    !r.scorecard_cohort &&
    !needsDefaultCohort(r as CohortSeedInput) &&
    (held.has(r.security_id) || watched.has(r.security_id)) &&
    !r.is_benchmark_proxy &&
    !isCashTicker(r.security_id) &&
    (r.detailed_security_type ?? '').toLowerCase() !== 'stock',
)
if (trackedWithoutCohort.length > 0) {
  console.log(`⚠ ${trackedWithoutCohort.length} tracked non-stock row(s) the seeding cannot reach:\n`)
  for (const r of trackedWithoutCohort) {
    console.log(
      `  ${r.security_id.padEnd(8)} ${roster(r.security_id).padEnd(14)} ` +
        `category=${r.category_name ?? 'NULL'}  type=${r.detailed_security_type ?? 'NULL'}`,
    )
  }
  console.log('')
}
