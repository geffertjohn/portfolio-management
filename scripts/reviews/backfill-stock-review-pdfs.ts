/**
 * backfill-stock-review-pdfs.ts
 *
 * Rebuilds the evidence PDF for stock reviews recorded before the document
 * existed, and links each to the brief it was drafted from.
 *
 *   npx vite-node scripts/reviews/backfill-stock-review-pdfs.ts -- --dry-run
 *   npx vite-node scripts/reviews/backfill-stock-review-pdfs.ts
 *
 * Run through vite-node, NOT plain node: it imports the app's own builders so a
 * rebuilt document is byte-for-byte what the app would have produced. A second
 * implementation here would drift from the one the modal uses, and the whole
 * point of the artifact is that it is the same record.
 *
 * The Express file server must be running (`cd server && npm run dev`) — it
 * holds the service-role key and is the only writer to Storage.
 *
 * Two things make this safe to re-run:
 *   - it only touches rows where `evidence_doc_path` is null, so a document
 *     already saved is never replaced;
 *   - the PDF is stamped "Rebuilt from the recorded review on <date>", because
 *     a reconstruction must not read as a contemporaneous freeze.
 *
 * Where a review's quarter has no post-earnings brief, the document is still
 * written and says so. A review with no brief is still the record of a decision.
 */
import { supabase } from '../../client/src/lib/supabase'
import { buildStockReviewPdf } from '../../client/src/lib/reviewEvidencePdf'
import { fetchReviewQuarterlyBrief } from '../../client/src/lib/reviewBrief'
import { fetchResearchReports, type ResearchReport } from '../../client/src/lib/researchReports'
import { uploadFile, SECURITY_DOCS_BUCKET } from '../../client/src/lib/documents'
import type { Conviction, Recommendation, ReviewMetricsSnapshot } from '../../client/src/lib/reviewLog'

const DRY = process.argv.includes('--dry-run')

interface Row {
  id: number
  security_id: string
  review_date: string | null
  reviewed_at: string
  notes: string | null
  recommendation: Recommendation
  conviction: Conviction | null
  price_at_review: number | null
  metrics_snapshot: ReviewMetricsSnapshot | null
  /** Embedded through review_log's FK to securities2 — a real one, so this is safe. */
  securities2: { security_name: string | null } | null
}

/**
 * The brief a review was drafted from, inferred.
 *
 * These rows predate `source_report_id`, so the link has to be reconstructed:
 * the modal pre-fills from the NEWEST post-earnings brief at the time, so that
 * is the newest one created on or before the review. Inference is why the
 * column now exists — from here on the link is recorded, not guessed.
 */
function briefForReview(reports: ResearchReport[], reviewedAt: string): ResearchReport | null {
  return reports
    .filter((r) => r.report_type === 'post_earnings' && r.created_at <= reviewedAt)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
}

async function main() {
  const { data, error } = await supabase
    .from('review_log')
    .select('id, security_id, review_date, reviewed_at, notes, recommendation, conviction, price_at_review, metrics_snapshot, securities2(security_name)')
    .not('recommendation', 'is', null)
    .is('evidence_doc_path', null)
    .order('reviewed_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as Row[]
  console.log(`${rows.length} stock review(s) without an evidence document${DRY ? ' (dry run)' : ''}\n`)
  if (rows.length === 0) return

  // One fetch per security, not per review — several reviews share a ticker.
  const reportsBySecurity = new Map<string, ResearchReport[]>()
  for (const sym of new Set(rows.map((r) => r.security_id))) {
    reportsBySecurity.set(sym, await fetchResearchReports(sym))
  }

  let written = 0, withBrief = 0, failed = 0
  for (const row of rows) {
    const label = `${row.security_id} ${row.reviewed_at.slice(0, 10)}`
    try {
      const post = briefForReview(reportsBySecurity.get(row.security_id) ?? [], row.reviewed_at)
      const companyName = row.securities2?.security_name ?? null
      const { brief, absentReason, sourceReportId } =
        await fetchReviewQuarterlyBrief(row.security_id, companyName, post)

      const { blob, filename } = buildStockReviewPdf({
        ticker: row.security_id,
        companyName,
        reviewDate: row.review_date ? new Date(row.review_date) : null,
        reviewedAt: new Date(row.reviewed_at),
        // The schedule's next_review_at is today's value, not the one in force
        // at the time, so it is left unstated rather than asserted wrongly.
        nextReviewAt: null,
        recommendation: row.recommendation,
        conviction: row.conviction,
        rationale: row.notes ?? '',
        priceAtReview: row.price_at_review,
        metrics: row.metrics_snapshot,
        brief,
        briefAbsentReason: absentReason,
        reconstructedOn: new Date(),
      })

      if (brief) withBrief++
      if (DRY) {
        console.log(`  would write ${filename}${brief ? ` (+ Q${brief.quarter} ${brief.fiscalYear} brief)` : ' (no brief)'}`)
        written++
        continue
      }

      const file = new File([blob], filename, { type: 'application/pdf' })
      const path = await uploadFile(row.security_id, file, SECURITY_DOCS_BUCKET)
      const { error: upErr } = await supabase
        .from('review_log')
        .update({ evidence_doc_path: path, source_report_id: sourceReportId } as never)
        .eq('id', row.id)
      if (upErr) throw upErr

      console.log(`  ✓ ${label} → ${path}${brief ? ` (+ Q${brief.quarter} ${brief.fiscalYear} brief)` : ' (no brief)'}`)
      written++
    } catch (e) {
      failed++
      console.error(`  ✗ ${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`\n${written} document(s) ${DRY ? 'would be written' : 'written'}, ${withBrief} with a quarterly brief, ${failed} failed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
