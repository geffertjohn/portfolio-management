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
import type { ThesisPoint, ThesisReason } from './securityTheses'
// Labels come from reviewLog, which already owns these exact vocabularies --
// a thesis rating uses the same buy/add/hold/trim/sell set as a stock review
// recommendation, and the same high/medium/low conviction. Defining a parallel
// set here is how surfaces drift apart.
import { CONVICTION_LABELS } from './reviewLog'
import type { Conviction } from './researchReports'

export interface ThesisPdfInput {
  ticker: string
  securityName: string | null
  version: number
  /** Null on v1 — the original statement of the view, not a change to it. */
  revisionReason: string | null
  thesis: ThesisReason[]
  bullCase: ThesisPoint[]
  bearCase: ThesisPoint[]
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
    thesis, bullCase, bearCase, conviction, authoredAt,
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

  // ── The reasons ───────────────────────────────────────────────────────────
  // These are the thesis. Each is durable; the figures that evidence it follow
  // underneath, so the document stays readable as "why we own it" first.
  sectionTitle('Why we own it')
  y += 8
  if (thesis.length === 0) {
    doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(156, 163, 175)
    doc.text('No reasons recorded.', marginX, y)
    y += 14
  }

  const afterTable = () =>
    ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY)

  thesis.forEach((r, i) => {
    room(60)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(17, 24, 39)
    doc.text(`${i + 1}. ${r.title || EMPTY}`, marginX, y)
    y += 15

    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(55, 65, 81)
    for (const line of doc.splitTextToSize(r.rationale || EMPTY, textW) as string[]) {
      room(16)
      doc.text(line, marginX, y)
      y += 13
    }
    y += 4

    // The metric evidence for THIS reason, indented under it.
    const metrics = bullCase.filter((b) => b.reasonKey === r.key)
    if (metrics.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX + 16, right: marginX },
        head: [['Metric', 'Current', 'Trend', 'Deteriorates if']],
        body: metrics.map((m) => [
          m.label + (m.metric ? `\n(${m.metric})` : ''),
          m.baseline || EMPTY,
          m.trend || EMPTY,
          m.breaksIf || EMPTY,
        ]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 4, textColor: [31, 41, 55], valign: 'top' },
        headStyles: { fillColor: [22, 101, 52], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 110, fontStyle: 'bold' },
          1: { cellWidth: 95 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 110, textColor: [146, 64, 14] },
        },
      })
      y = afterTable() + 14
    } else {
      y += 6
    }
  })

  // A metric block that names no reason still belongs in the record rather than
  // being dropped silently.
  const unattached = bullCase.filter((b) => !b.reasonKey || !thesis.some((r) => r.key === b.reasonKey))

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
      head: [['Risk / headwind', 'Current', 'Trend', 'Worsens if']],
      body: points.map((p) => [
        p.label + (p.metric ? `\n(${p.metric})` : ''),
        p.baseline || EMPTY,
        p.trend || EMPTY,
        p.breaksIf || EMPTY,
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 4, textColor: [31, 41, 55], valign: 'top' },
      headStyles: { fillColor: head, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 110, fontStyle: 'bold' },
        1: { cellWidth: 95 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 110, textColor: [146, 64, 14] },
      },
    })
    y = afterTable() + 10
  }

  if (unattached.length > 0) {
    pointTable('Supporting metrics not yet tied to a reason', unattached, [22, 101, 52])
  }
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
