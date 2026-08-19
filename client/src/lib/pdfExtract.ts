/**
 * pdfExtract.ts
 *
 * Browser glue between pdfjs and the pure research parsers. Its only job is to
 * turn a `File` into positioned text items (`PdfPageItems`) — all interpretation
 * lives in `lib/researchPdfParse.ts`, which stays pdfjs-free so it can be tested
 * outside a browser.
 *
 * pdfjs runs its own worker; the URL is resolved by Vite via the `?url` import
 * so the worker is bundled instead of fetched from a CDN (the app ships no
 * external script sources).
 */
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PdfPageItems, PdfTextItem } from './researchPdfParse'

GlobalWorkerOptions.workerSrc = workerUrl

/** Rotated glyphs are page furniture (the per-recipient watermark), never content. */
function isUpright(transform: number[]): boolean {
  return Math.abs(transform[1]) < 0.01 && Math.abs(transform[2]) < 0.01
}

/**
 * Extract positioned text from the first `maxPages` pages of a PDF.
 * Research covers carry everything we parse on page 1, so the default is 1.
 */
export async function extractPdfPages(file: File, maxPages = 1): Promise<PdfPageItems[]> {
  const buffer = await file.arrayBuffer()
  const doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
  try {
    const pages: PdfPageItems[] = []
    const count = Math.min(maxPages, doc.numPages)
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        if (!item.str || !isUpright(item.transform)) continue
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width })
      }
      pages.push({ width: viewport.width, items })
      page.cleanup()
    }
    return pages
  } finally {
    await doc.destroy()
  }
}
