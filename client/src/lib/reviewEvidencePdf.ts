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
import { fmtDecimalPct, fmtInt, EMPTY } from './formatters'

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
