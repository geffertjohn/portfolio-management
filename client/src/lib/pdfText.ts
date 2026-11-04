/**
 * pdfText.ts
 *
 * Text out of a PDF, in the browser.
 *
 * Deliberately the whole of this module's job. Extraction is the only part of
 * reading a document that needs a library and a worker; everything that
 * decides what the text MEANS lives in a pure module beside it
 * (`strategicAllocation.ts`), so the interpretation is testable without a PDF.
 *
 * `pdfjs-dist` is pinned exactly and has **no runtime dependencies** — the one
 * optional package is a native canvas binding that a browser never needs. It
 * is also listed in `optimizeDeps.include`: the Compliance page is `lazy()`,
 * so Vite's first pass cannot see this import, and discovering it later
 * triggers a second optimize pass and a second copy of React (see the
 * `optimizeDeps` note in CLAUDE.md).
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

/**
 * The text of one page, items joined by a space.
 *
 * Joined rather than laid out: `pdfjs` returns a stream of positioned runs, and
 * reconstructing columns from their coordinates would be guessing. Every
 * consumer here normalises whitespace anyway, and the row patterns tolerate a
 * break anywhere between words — including inside a number and its percent
 * sign, which some runs split.
 */
export async function extractPdfPageText(file: File, pageNumber = 1): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  // Hold the loading TASK, not just the document: `destroy()` lives on the
  // task, and it is what releases the worker.
  const task = getDocument({ data })
  const doc = await task.promise
  try {
    if (pageNumber > doc.numPages) {
      throw new Error(`The file has ${doc.numPages} page(s); page ${pageNumber} was asked for.`)
    }
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    return content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
  } finally {
    // Without this the worker holds the document for the life of the tab, and
    // the advisor may preview several files before committing one.
    await task.destroy()
  }
}
