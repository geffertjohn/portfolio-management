/**
 * reviewEvidencePdf.ts
 *
 * Builds the fund/ETF review-evidence PDF — a frozen snapshot of the Category and
 * Peer group scorecard/metrics as of the review date, uploaded to the Security
 * Documents bucket as audit evidence. Scorecard numbers come from the shared
 * `buildFundScorecard` so the PDF matches the on-page tables exactly.
 *
 * There is deliberately NO separate "Headline metrics" block. Alpha 3Y /
 * Information Ratio 3Y / Sharpe 3Y / Expense Ratio were dropped from the fund UI
 * and from here, so the document matches the screen it was captured from. They
 * are not lost: all four remain scored rows in the scorecard tables below (57 of
 * its 100 points), with their ranks and tiers. Only the standalone value block
 * is gone.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SecurityDetail } from './securities'
import { buildFundScorecard, fmtScorecardValue } from './fundScorecard'
import { fmtDecimalPct, fmtInt, fmtUsd, EMPTY } from './formatters'
import { RECOMMENDATION_LABELS, CONVICTION_LABELS, type ReviewMetricsSnapshot, type Recommendation, type Conviction } from './reviewLog'
import { drawQuarterlyBrief, quarterlyBriefProvenance } from './quarterlyBriefPdf'
import type { QuarterlyBrief } from './quarterlyBrief'

function num(s: SecurityDetail, key: keyof SecurityDetail): number | null {
  const v = s[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const TRAILING_PERIODS = [
  { label: '1M',  ret: 'one_month_total_return_nav',            catRank: 'one_month_total_return_rank_nav',            catSize: 'one_month_total_return_rank_category_size_nav',   pgRank: 'one_month_total_return_peer_group_rank_nav',   pgSize: 'one_month_total_return_peer_group_size_nav' },
  { label: '3M',  ret: 'three_month_total_return_nav',          catRank: 'three_month_total_return_rank_nav',          catSize: 'three_month_total_return_rank_category_size_nav', pgRank: 'three_month_total_return_peer_group_rank_nav', pgSize: 'three_month_total_return_peer_group_size_nav' },
  { label: 'YTD', ret: 'ytd_total_return_nav',                  catRank: 'ytd_total_return_rank_nav',                  catSize: 'ytd_total_return_rank_category_size_nav',         pgRank: 'ytd_total_return_peer_group_rank_nav',         pgSize: 'ytd_total_return_peer_group_size_nav' },
  { label: '1Y',  ret: 'one_year_total_return_nav',             catRank: 'one_year_total_return_rank_nav',             catSize: 'one_year_total_return_rank_category_size_nav',    pgRank: 'one_year_total_return_peer_group_rank_nav',    pgSize: 'one_year_total_return_peer_group_size_nav' },
  { label: '3Y',  ret: 'annualized_three_year_total_return_nav', catRank: 'three_year_total_return_rank_nav',           catSize: 'three_year_total_return_rank_category_size_nav',  pgRank: 'three_year_total_return_peer_group_rank_nav',  pgSize: 'three_year_total_return_peer_group_size_nav' },
  { label: '5Y',  ret: 'annualized_five_year_total_return_nav',  catRank: 'five_year_total_return_rank_nav',            catSize: 'five_year_total_return_rank_category_size_nav',   pgRank: 'five_year_total_return_peer_group_rank_nav',   pgSize: 'five_year_total_return_peer_group_size_nav' },
] as const

export interface FundReviewPdfInput {
  security: SecurityDetail
  ticker: string
  fundName: string | null
  /** Date the review addresses (drives the filename + header). */
  reviewDate: Date
  outcomeLabel: string
  notes: string | null
  /** Category benchmark index name (resolved via fetchCategoryBenchmark). */
  categoryBenchmark?: string | null
  /** Peer group benchmark index name (resolved via fetchPeerGroupBenchmark). */
  peerGroupBenchmark?: string | null
}

export interface FundReviewPdfResult {
  blob: Blob
  filename: string
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Build the review-evidence PDF. Returns the blob and a deterministic filename. */
export function buildFundReviewPdf(input: FundReviewPdfInput): FundReviewPdfResult {
  const { security, ticker, fundName, reviewDate, outcomeLabel, notes, categoryBenchmark, peerGroupBenchmark } = input
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40
  const pageW = doc.internal.pageSize.getWidth()

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(17, 24, 39)
  doc.text('Fund / ETF Review — Evidence Snapshot', marginX, 46)

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(31, 41, 55)
  doc.text(`${ticker}${fundName ? ` — ${fundName}` : ''}`, marginX, 66)

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(107, 114, 128)
  const meta = [
    `Review date: ${reviewDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Generated: ${new Date().toLocaleString('en-US')}`,
    `Asset class: ${security.broad_asset_class ?? EMPTY}`,
    `Category: ${security.ycharts_benchmark_category ?? security.category_name ?? EMPTY}${categoryBenchmark ? ` · ${categoryBenchmark}` : ''}`,
    `Peer group: ${security.peer_group_name ?? EMPTY}${peerGroupBenchmark ? ` · ${peerGroupBenchmark}` : ''}`,
    `Outcome: ${outcomeLabel}`,
  ]
  doc.text(meta, marginX, 82, { lineHeightFactor: 1.35 })
  let cursorY = 82 + meta.length * 11 + 8

  if (notes && notes.trim()) {
    doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(75, 85, 99)
    const wrapped = doc.splitTextToSize(`Notes: ${notes.trim()}`, pageW - marginX * 2)
    doc.text(wrapped, marginX, cursorY, { lineHeightFactor: 1.3 })
    cursorY += wrapped.length * 11 + 6
  }

  const afterTable = () =>
    ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY)

  const sectionTitle = (title: string, y: number) => {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(31, 41, 55)
    doc.text(title, marginX, y)
    return y + 6
  }

  // ── Trailing returns & ranks ───────────────────────────────────────────────
  cursorY = sectionTitle('Trailing returns & rank', cursorY + 8)
  const periodCols = TRAILING_PERIODS.map((p) => p.label)
  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [['', ...periodCols]],
    body: [
      ['Total return (NAV)', ...TRAILING_PERIODS.map((p) => fmtDecimalPct(num(security, p.ret as keyof SecurityDetail)))],
      ['Category rank',      ...TRAILING_PERIODS.map((p) => fmtInt(num(security, p.catRank as keyof SecurityDetail)))],
      ['Category size',      ...TRAILING_PERIODS.map((p) => fmtInt(num(security, p.catSize as keyof SecurityDetail)))],
      ['Peer group rank',    ...TRAILING_PERIODS.map((p) => fmtInt(num(security, p.pgRank as keyof SecurityDetail)))],
      ['Peer group size',    ...TRAILING_PERIODS.map((p) => fmtInt(num(security, p.pgSize as keyof SecurityDetail)))],
    ],
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3, textColor: [31, 41, 55], halign: 'right' },
    headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold', halign: 'right' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', textColor: [75, 85, 99] } },
  })
  cursorY = afterTable()

  // ── Scorecards ─────────────────────────────────────────────────────────────
  for (const [cohort, title] of [['category', 'Category Scorecard'], ['peer', 'Peer Group Scorecard']] as const) {
    const sc = buildFundScorecard(security, cohort)
    cursorY = sectionTitle(
      `${title}   —   Total ${sc.hasData ? sc.total.toFixed(1) : EMPTY} / 100`,
      cursorY + 16,
    )
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [['Metric', 'Weight', 'Rank / Value', 'Size', 'Tier', 'Score']],
      body: sc.rows.map((r) => [
        r.label,
        `${Math.round(r.weight * 100)}%`,
        fmtScorecardValue(r.displayVal, r.valueType),
        r.size != null ? Math.round(r.size).toString() : EMPTY,
        r.tier != null ? String(r.tier) : EMPTY,
        r.score != null ? r.score.toFixed(1) : EMPTY,
      ]),
      foot: [['Total Score', '', '', '', '', sc.hasData ? sc.total.toFixed(1) : EMPTY]],
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3, textColor: [31, 41, 55] },
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
      footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'center' }, 5: { halign: 'right' },
      },
    })
    cursorY = afterTable()
  }

  const blob = doc.output('blob')
  const filename = `${ticker}-review-${isoDay(reviewDate)}.pdf`
  return { blob, filename }
}


// ─── Stock review ───────────────────────────────────────────────────────────

export interface StockReviewPdfInput {
  ticker: string
  companyName: string | null
  /** Scheduled date the review addressed (earnings date + 1). */
  reviewDate: Date | null
  /** Date the decision was actually recorded — drives the filename. */
  reviewedAt: Date
  nextReviewAt: Date | null
  recommendation: Recommendation
  conviction: Conviction | null
  rationale: string
  priceAtReview: number | null
  metrics: ReviewMetricsSnapshot | null
  /**
   * The quarter's brief, stapled on as the second half of the document.
   *
   * Null is a REAL state, not a failure: most quarters carry no post-earnings
   * brief and no call summary, and `canBuildQuarterlyBrief` refuses to build
   * one from expectations alone. The document says so rather than omitting the
   * section silently — a reader has to be able to tell "nothing was written
   * about that quarter" from "we left it out".
   */
  brief: QuarterlyBrief | null
  /** Why no brief, when there is none — e.g. the period had no post-brief. */
  briefAbsentReason?: string | null
  /**
   * Set when the document is rebuilt from the stored row rather than frozen at
   * submit time. It is stamped on every page: a reader has to be able to tell a
   * contemporaneous record from one reconstructed later, even though both are
   * built from the same frozen snapshot.
   */
  reconstructedOn?: Date | null
}

export interface StockReviewPdfResult {
  blob: Blob
  filename: string
}

const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

/**
 * The review decision and the evidence behind it, followed by that quarter's
 * brief, as ONE document.
 *
 * **This document is internal.** The quarterly brief alone is shaped to be
 * handed to a client — it holds back the allocation recommendations, the open
 * questions, conviction and the thesis break tests. The review half carries all
 * of those by design, so the combination must not leave the firm. The brief is
 * embedded through `drawQuarterlyBrief`, the same renderer the standalone
 * client-facing PDF uses, so the two can never disagree about that quarter.
 */
export function buildStockReviewPdf(input: StockReviewPdfInput): StockReviewPdfResult {
  const {
    ticker, companyName, reviewDate, reviewedAt, nextReviewAt,
    recommendation, conviction, rationale, priceAtReview, metrics, brief, briefAbsentReason,
    reconstructedOn,
  } = input

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const textW = pageW - marginX * 2

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(17, 24, 39)
  doc.text('Stock Review — Decision & Evidence', marginX, 46)

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(31, 41, 55)
  doc.text(`${ticker}${companyName ? ` — ${companyName}` : ''}`, marginX, 66)

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(107, 114, 128)
  const meta = [
    reviewDate ? `Review due: ${longDate(reviewDate)}` : 'Review due date not recorded',
    `Reviewed: ${longDate(reviewedAt)}`,
    nextReviewAt ? `Next review: ${longDate(nextReviewAt)}` : 'Next review not scheduled',
    `Recommendation: ${RECOMMENDATION_LABELS[recommendation]}${conviction ? ` · ${CONVICTION_LABELS[conviction]}` : ''}`,
  ]
  doc.text(meta, marginX, 82, { lineHeightFactor: 1.35 })
  let y = 82 + meta.length * 11 + 12

  const afterTable = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  const sectionTitle = (title: string) => {
    if (y + 30 > pageH - 54) { doc.addPage(); y = 56 }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(31, 41, 55)
    doc.text(title, marginX, y)
    y += 14
  }

  // ── Evidence frozen at submit ─────────────────────────────────────────────
  // Stock metrics are never persisted to securities2, so this snapshot is the
  // only record of what the decision was actually taken against.
  if (metrics) {
    sectionTitle('Evidence at review')
    const sc = metrics.scorecard
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      body: [
        ['Price', priceAtReview != null ? fmtUsd(priceAtReview) : fmtUsd(metrics.price),
         'Analyst consensus', metrics.analyst.consensus ?? EMPTY],
        ['Op. margin TTM', fmtDecimalPct(sc.operatingMargin), 'FCF margin TTM', fmtDecimalPct(sc.fcfMargin)],
        ['Rev growth TTM', fmtDecimalPct(sc.revGrowthTtm), 'EPS growth TTM', fmtDecimalPct(sc.epsGrowthTtm)],
        ['Rev CAGR 3Y', fmtDecimalPct(sc.revCagr3y), 'EPS CAGR 3Y', fmtDecimalPct(sc.epsCagr3y)],
        // No "covering analysts" cell: FMP returns null for every count field
        // on price-target-consensus (gotcha 17), so it could only ever print a
        // dash. The street table below carries the real head-count.
        ['Price target', metrics.analyst.targetConsensus != null ? fmtUsd(metrics.analyst.targetConsensus) : EMPTY, '', ''],
      ],
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4, textColor: [31, 41, 55] },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [75, 85, 99] }, 1: { halign: 'right' },
        2: { fontStyle: 'bold', textColor: [75, 85, 99] }, 3: { halign: 'right' },
      },
    })
    y = afterTable() + 16

    const tr = metrics.tipranks
    if (tr) {
      sectionTitle('The street at review')
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Analysts', 'Buy', 'Hold', 'Sell', 'Recommendations']],
        body: [[fmtInt(tr.distinctAnalysts), fmtInt(tr.buy), fmtInt(tr.hold), fmtInt(tr.sell),
                fmtInt(tr.totalRecommendations)]],
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 4, textColor: [31, 41, 55], halign: 'right' },
        headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold', halign: 'right' },
      })
      y = afterTable() + 16
    }
  } else {
    sectionTitle('Evidence at review')
    doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(120, 113, 108)
    doc.text('No metrics snapshot was captured with this review.', marginX, y)
    y += 20
  }

  // ── Rationale ─────────────────────────────────────────────────────────────
  // Required at submit, so it is always present and is the heart of the record.
  sectionTitle('Rationale')
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(55, 65, 81)
  for (const line of doc.splitTextToSize(rationale.trim() || '—', textW) as string[]) {
    if (y + 16 > pageH - 54) { doc.addPage(); y = 56 }
    doc.text(line, marginX, y)
    y += 13
  }

  // ── The quarter's brief ───────────────────────────────────────────────────
  const reviewPages = doc.getNumberOfPages()
  if (brief) {
    doc.addPage()
    drawQuarterlyBrief(doc, brief, 56)
  } else {
    doc.addPage()
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(17, 24, 39)
    doc.text('Quarterly Brief', marginX, 56)
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(120, 113, 108)
    const why = briefAbsentReason?.trim() ||
      'No post-earnings brief or call summary was recorded for this quarter, so no brief could be built.'
    doc.text(doc.splitTextToSize(why, textW) as string[], marginX, 80, { lineHeightFactor: 1.35 })
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  // Marked internal on every page: the brief half is the client-safe document,
  // the review half is not, and the combination travels as one file.
  const pages = doc.getNumberOfPages()
  const provenance = brief ? quarterlyBriefProvenance(brief) : 'No quarterly brief for this period.'
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(156, 163, 175)
    doc.text(
      `${ticker} review of ${longDate(reviewedAt)} · INTERNAL — not for client distribution · ${
        reconstructedOn ? `Rebuilt from the recorded review on ${longDate(reconstructedOn)} · ` : ''}${
        p > reviewPages ? provenance : `Recommendation: ${RECOMMENDATION_LABELS[recommendation]}`}`,
      marginX, pageH - 28, { maxWidth: textW - 60 },
    )
    doc.text(`Page ${p} of ${pages}`, pageW - marginX, pageH - 28, { align: 'right' })
  }

  const blob = doc.output('blob')
  const filename = `${ticker}-review-${isoDay(reviewedAt)}.pdf`
  return { blob, filename }
}
