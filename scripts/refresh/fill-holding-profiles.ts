/**
 * One-off / on-demand fill of `holding_profiles`.
 *
 * The daily import calls `refreshHoldingProfiles` itself; this exists for the
 * FIRST fill, which asks FMP about every distinct holding symbol in the book
 * at once, and for re-running after a normalisation change. Safe to repeat —
 * it only asks about symbols it does not already know.
 *
 *   npx esbuild scripts/refresh/fill-holding-profiles.ts --bundle --platform=node \
 *     --format=cjs --target=node20 --alias:@=./client/src \
 *     --external:@supabase/supabase-js --outfile=/tmp/fill.cjs && node /tmp/fill.cjs
 */
import { refreshHoldingProfiles } from '@/lib/holdingProfiles'

refreshHoldingProfiles()
  .then((r) => {
    console.log(
      `asked ${r.asked} · resolved ${r.resolved} · not in FMP ${r.unresolved} · ` +
      `failed ${r.failed} · skipped ${r.skipped} (CUSIPs and cash)`,
    )
  })
  .catch((e) => {
    console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
