/**
 * thesisPdf.ts
 *
 * Renders one VERSION of a security's investment thesis as a frozen PDF, the
 * document half of the evidence pair (the other half being the immutable row in
 * `security_theses`). Uploaded to Security Documents/<ticker> at publish time;
 * the row cannot be published without it.
 *
 * Each version gets its own file. A revision never overwrites its predecessor —
 * the whole point is that someone can read what was believed, and when.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toLocalDateInputValue, EMPTY } from './formatters'
import type { ThesisPoint } from './securityTheses'
// Labels come from reviewLog, which already owns these exact vocabularies --
// a thesis rating uses the same buy/add/hold/trim/sell set as a stock review
// recommendation, and the same high/medium/low conviction. Defining a parallel
// set here is how surfaces drift apart.
import { RECOMMENDATION_LABELS, CONVICTION_LABELS } from './reviewLog'
import type { Rating, Conviction } from './researchReports'

export interface ThesisPdfInput {
  ticker: string
  securityName: string | null
  version: number
  /** Null on v1 — the original statement of the view, not a change to it. */
  revisionReason: string | null
  thesis: string | null
  bullCase: ThesisPoint[]
  bearCase: ThesisPoint[]
  rating: Rating | null
  conviction: Conviction | null
  /** When the version is being published. */
  authoredAt: Date
}

export interface ThesisPdfResult {
  blob: Blob
  filename: string
}

export function buildThesisPdf(input: ThesisPdfInput): ThesisPdfResult {
  const {
    ticker, securityName, version, revisionReason,
    thesis, bullCase, bearCase, rating, conviction, authoredAt,
  } = input

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const textW = pageW - marginX * 2

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(17, 24, 39)
  doc.text('Investment Thesis', marginX, 46)

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(31, 41, 55)
  doc.text(`${ticker}${securityName ? ` — ${securityName}` : ''}`, marginX, 66)

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(107, 114, 128)
  const meta = [
    `Version: ${version}${version === 1 ? ' (original)' : ''}`,
    `Adopted: ${authoredAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Rating: ${rating ? RECOMMENDATION_LABELS[rating] : EMPTY}`,
    `Conviction: ${conviction ? CONVICTION_LABELS[conviction] : EMPTY}`,
  ]
  doc.text(meta, marginX, 82, { lineHeightFactor: 1.35 })
  let y = 82 + meta.length * 11 + 8

  // Page-break guard: every block checks it has room before drawing.
  const room = (needed: number) => {
    if (y + needed > pageH - 54) {
      doc.addPage()
      y = 56
    }
  }

  const sectionTitle = (title: string) => {
    room(28)
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(31, 41, 55)
    doc.text(title, marginX, y)
    y += 6
  }

  if (revisionReason?.trim()) {
    room(40)
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(146, 64, 14)
    doc.text('Reason for this revision', marginX, y)
    y += 12
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(75, 85, 99)
    const wrapped = doc.splitTextToSize(revisionReason.trim(), textW)
    doc.text(wrapped, marginX, y, { lineHeightFactor: 1.35 })
    y += wrapped.length * 11 + 10
  }

  sectionTitle('Thesis')
  y += 8
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(31, 41, 55)
  const body = doc.splitTextToSize(thesis?.trim() || EMPTY, textW)
  // Long prose can outrun a page on its own — draw it a line at a time.
  for (const line of body as string[]) {
    room(16)
    doc.text(line, marginX, y)
    y += 13
  }
  y += 6

  const afterTable = () =>
    ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY)

  const pointTable = (title: string, points: ThesisPoint[], head: [number, number, number]) => {
    sectionTitle(title)
    if (points.length === 0) {
      y += 14
      doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(156, 163, 175)
      doc.text('None recorded.', marginX, y)
      y += 14
      return
    }
    autoTable(doc, {
      startY: y + 8,
      margin: { left: marginX, right: marginX },
      head: [['#', 'Reason', 'Context']],
      body: points.map((p, i) => [String(i + 1), p.reason || EMPTY, p.context || EMPTY]),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4, textColor: [31, 41, 55], valign: 'top' },
      headStyles: { fillColor: head, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 20, halign: 'right', textColor: [107, 114, 128] },
        1: { cellWidth: 150, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
      },
    })
    y = afterTable() + 10
  }

  pointTable('Bull case — why we own it', bullCase, [22, 101, 52])
  pointTable('Bear case — risks and headwinds', bearCase, [153, 27, 27])

  // Provenance footer on every page.
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(156, 163, 175)
    doc.text(
      `${ticker} investment thesis v${version} · adopted ${toLocalDateInputValue(authoredAt)} · generated ${new Date().toLocaleString('en-US')}`,
      marginX,
      pageH - 28,
    )
    doc.text(`Page ${p} of ${pages}`, pageW - marginX, pageH - 28, { align: 'right' })
  }

  const blob = doc.output('blob')
  const filename = `${ticker}-thesis-v${version}-${toLocalDateInputValue(authoredAt)}.pdf`
  return { blob, filename }
}
