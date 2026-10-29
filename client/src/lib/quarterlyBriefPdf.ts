/**
 * quarterlyBriefPdf.ts
 *
 * Renders a `QuarterlyBrief` as a PDF. Presentation only — every editorial
 * decision about WHAT appears (and what is held back as internal) lives in
 * `lib/quarterlyBrief.ts`, which also feeds the on-screen view. Changing what a
 * reader sees belongs there, not here, or the page and the document drift.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { EMPTY, fmtEstimate, fmtSignedPct, toLocalDateInputValue } from './formatters'
import {
  SENTIMENT_LABEL, THESIS_STATUS_LABEL, VIEW_STATUS_LABEL,
  type QuarterlyBrief,
} from './quarterlyBrief'

export interface QuarterlyBriefPdfResult {
  blob: Blob
  filename: string
}

const INK = [17, 24, 39] as const
const BODY = [55, 65, 81] as const
const MUTED = [107, 114, 128] as const

export function buildQuarterlyBriefPdf(b: QuarterlyBrief): QuarterlyBriefPdfResult {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const textW = pageW - marginX * 2

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK)
  doc.text(`Q${b.quarter} ${b.fiscalYear} Quarterly Brief`, marginX, 46)

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(31, 41, 55)
  doc.text(`${b.ticker}${b.companyName ? ` — ${b.companyName}` : ''}`, marginX, 66)

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  const meta = [
    b.callDate ? `Earnings call: ${b.callDate}` : 'Earnings call date not recorded',
    b.sentiment ? `Tone of the call: ${SENTIMENT_LABEL[b.sentiment]}` : null,
  ].filter(Boolean) as string[]
  doc.text(meta, marginX, 82, { lineHeightFactor: 1.35 })
  let y = 82 + meta.length * 11 + 10

  const room = (needed: number) => {
    if (y + needed > pageH - 54) {
      doc.addPage()
      y = 56
    }
  }

  const sectionTitle = (title: string) => {
    room(30)
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(31, 41, 55)
    doc.text(title, marginX, y)
    y += 14
  }

  const prose = (body: string) => {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...BODY)
    for (const line of doc.splitTextToSize(body, textW) as string[]) {
      room(16)
      doc.text(line, marginX, y)
      y += 13
    }
    y += 10
  }

  const afterTable = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  if (b.headline) {
    sectionTitle('The quarter')
    prose(b.headline)
  }

  // ── Results ───────────────────────────────────────────────────────────────
  // Actual/Surprise appear only once something has printed, so a brief written
  // before the numbers land shows a clean expectations table instead of columns
  // of dashes.
  if (b.results.length > 0) {
    sectionTitle('Results against expectations')
    const head = b.hasActuals
      ? [['Metric', 'Expected', 'Actual', 'Surprise']]
      : [['Metric', 'Expected']]
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head,
      body: b.results.map((r) =>
        b.hasActuals
          ? [r.label, fmtEstimate(r.expected, r.unit), fmtEstimate(r.actual, r.unit),
             r.surprisePct != null ? fmtSignedPct(r.surprisePct) : EMPTY]
          : [r.label, fmtEstimate(r.expected, r.unit)],
      ),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 5, textColor: [31, 41, 55] },
      headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold' } },
    })
    y = afterTable() + 16
  }

  if (b.guidance) {
    sectionTitle('What management guided to')
    prose(b.guidance)
  }

  const points = (title: string, items: typeof b.highlights, fill: [number, number, number]) => {
    if (items.length === 0) return
    sectionTitle(title)
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [[title]],
      body: items.map((p) => [`${p.title}\n${p.detail}`]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: { top: 4, bottom: 6, left: 8, right: 4 }, textColor: [55, 65, 81] },
      headStyles: { fillColor: fill, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      didParseCell: (d) => {
        // Bold just the claim; the sentences under it stay regular weight.
        if (d.section === 'body') d.cell.styles.cellPadding = { top: 4, bottom: 6, left: 8, right: 4 }
      },
    })
    y = afterTable() + 14
  }
  points('Highlights', b.highlights, [22, 101, 52])
  points('Lowlights', b.lowlights, [153, 27, 27])

  // ── Our view ──────────────────────────────────────────────────────────────
  if (b.thesisStatus || b.view.length > 0) {
    sectionTitle('Our view')
    if (b.thesisStatus) {
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK)
      doc.text(`Investment thesis: ${THESIS_STATUS_LABEL[b.thesisStatus]}`, marginX, y)
      y += 16
    }
    if (b.view.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['What we watch', 'Read', 'What this quarter showed']],
        body: b.view.map((v) => [
          v.title,
          v.status && v.status !== 'not_addressed' ? VIEW_STATUS_LABEL[v.status] : EMPTY,
          v.finding,
        ]),
        theme: 'striped',
        styles: { fontSize: 8.5, cellPadding: 5, textColor: [31, 41, 55], valign: 'top' },
        headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 130, fontStyle: 'bold' },
          1: { cellWidth: 70 },
          2: { cellWidth: 'auto' },
        },
      })
      y = afterTable() + 10
    }
  }

  // Provenance on every page — this document is a rendering of the record, and
  // a reader should be able to see which parts of the record it drew on.
  const pages = doc.getNumberOfPages()
  const provenance = b.sources.length
    ? `Drawn from the ${b.sources.join(', the ')}.`
    : 'Source documents not recorded.'
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(156, 163, 175)
    doc.text(
      `${b.ticker} Q${b.quarter} ${b.fiscalYear} quarterly brief · ${provenance} · generated ${new Date().toLocaleString('en-US')}`,
      marginX,
      pageH - 28,
      { maxWidth: textW - 60 },
    )
    doc.text(`Page ${p} of ${pages}`, pageW - marginX, pageH - 28, { align: 'right' })
  }

  const blob = doc.output('blob')
  const filename = `${b.ticker}-quarterly-brief-Q${b.quarter}-${b.fiscalYear}-${toLocalDateInputValue(new Date())}.pdf`
  return { blob, filename }
}
