/**
 * currentAllocation.ts
 *
 * Reads a portfolio's *actual* current allocation from the most recent monthly
 * allocation file the advisor uploads to the portfolio's Documents folder
 * (Portfolio Documents bucket, folder = portfolio name). The file is the YCharts
 * current-allocation export (`Security Ticker/CUSIP,Target`, weights in percent
 * points). Nothing is persisted; the file store is the source of truth.
 *
 * **That folder also carries the REBALANCE-UPLOAD TEMPLATE, which has the same
 * two leading columns and means the opposite thing** — a specification of what
 * the book should hold rather than a record of what it does. `readAllocationFile`
 * tells them apart by their headers and a target file is skipped here; see its
 * comment for the three live states this was costing. Three of the seven
 * portfolio folders held one on 17 Nov 2026.
 */
import { fetchAllFiles, getSignedUrl, PORTFOLIO_DOCS_BUCKET } from './documents'
import type { StoredFile } from './documents'
import { readAllocationFile } from './positionSizingCompare'

export interface CurrentAllocation {
  /** Uploaded-file timestamp (ISO) — the "as of" for the actual weights. */
  asOf: string
  fileName: string
  /** ticker (UPPER) → actual weight in percent points. */
  weights: Map<string, number>
  /**
   * Set only for a blended portfolio: the source portfolios these weights were
   * derived from. Null means the weights came from this portfolio's own file.
   */
  derivedFrom: string[] | null
}

/**
 * Portfolios that hold no lineup of their own and therefore receive no
 * allocation file — their actual weights are a weighted blend of other
 * portfolios' files, the same way their positions and history are derived.
 *
 * Equity Income & Core Growth is a 50/50 of its two parents: every holding is
 * half its parent weight, and a name held in both sleeves takes the sum of its
 * two halves. Uploading a file for it would be wrong by construction, so
 * without this the Current column simply would not render.
 */
export const DERIVED_ACTUAL_BLENDS: Record<string, { source: string; weight: number }[]> = {
  'Equity Income & Core Growth': [
    { source: 'Core Growth', weight: 0.5 },
    { source: 'Equity Income', weight: 0.5 },
  ],
}

/**
 * A PER-REQUEST memo of in-flight file reads, keyed by portfolio name.
 *
 * Reading one portfolio's allocation is a signed-URL round trip, a download and
 * a CSV parse, and the Actions hub asks for the same ones repeatedly: the drift
 * adapter and the allocation-band adapter each resolve every portfolio, and a
 * derived blend re-reads the legs its parents already read. Measured on the
 * live book (Nov 2026): **6 distinct files fetched 16 times** — four of them
 * twice, and Core Growth and Equity Income four times each, being both
 * portfolios in their own right and the two legs of Equity Income & Core
 * Growth.
 *
 * **It holds PROMISES, not results, and that is the whole point.** The two
 * adapters run inside one `Promise.all`, so they are concurrent: by the time
 * either finished, a resolved-value cache would already have missed and both
 * would have fetched. Memoising the in-flight promise is what makes the second
 * caller wait for the first instead of racing it.
 *
 * **A memo, not a cache.** It is created by the caller for one request and
 * discarded when that request returns, so it cannot outlive an upload — the
 * same reasoning that made the bucket listing a parameter rather than a cached
 * value in `lib/actions.ts`. Never hoist one to module scope.
 */
export type AllocationMemo = Map<string, Promise<OwnAllocation | null>>

/** One memo for one request. See `AllocationMemo`. */
export function newAllocationMemo(): AllocationMemo {
  return new Map()
}

/** A portfolio's own file, before any blending. */
type OwnAllocation = Omit<CurrentAllocation, 'derivedFrom'>

/**
 * Latest actual allocation for a portfolio, or `null` when no allocation file has
 * been uploaded to its Documents folder. Throws if the Express file store is
 * unreachable or the download fails (callers can surface a graceful banner via
 * `isServerUnreachable`).
 */
export async function fetchLatestActualAllocation(
  portfolioName: string,
  /**
   * The bucket listing, when the caller already has one.
   *
   * Without this each call re-listed the whole bucket. The Actions page does
   * that once per portfolio inside a loop, on top of two more listings of its
   * own — SEVEN identical requests, each of which took 5.9 seconds before the
   * route was rewritten. Passing the list down is explicit and, unlike a cache,
   * cannot go stale behind an upload.
   */
  knownFiles?: StoredFile[],
  /**
   * Shared read memo for one request. Omit it and every call does its own
   * download — correct, just wasteful when the caller asks repeatedly. See
   * `AllocationMemo`.
   */
  memo?: AllocationMemo,
): Promise<CurrentAllocation | null> {
  const files = knownFiles ?? (await fetchAllFiles(PORTFOLIO_DOCS_BUCKET)).files

  const own = await latestFileFor(files, portfolioName, memo)
  if (own) return { ...own, derivedFrom: null }

  const blend = DERIVED_ACTUAL_BLENDS[portfolioName]
  if (!blend) return null

  // The legs go through the same memo, so a blend costs nothing when its
  // parents have already been read — which on this book is always.
  const legs = await Promise.all(blend.map((b) => latestFileFor(files, b.source, memo)))
  // All or nothing: half a blend is not a 100% book, and a Current column that
  // silently covers only one sleeve is worse than no column at all.
  if (legs.some((l) => l == null)) return null

  const weights = new Map<string, number>()
  legs.forEach((leg, i) => {
    for (const [symbol, w] of leg!.weights) {
      weights.set(symbol, (weights.get(symbol) ?? 0) + w * blend[i].weight)
    }
  })

  return {
    // The OLDEST leg, not the newest: a blend is only as current as its stalest
    // source, the same rule the import stamps follow.
    asOf: legs.map((l) => l!.asOf).sort()[0],
    fileName: blend.map((b) => `${b.source} (${b.weight * 100}%)`).join(' + '),
    weights,
    derivedFrom: blend.map((b) => b.source),
  }
}

/**
 * Every portfolio that can produce an actual allocation, given the folders that
 * exist in the bucket: those with a file of their own, plus any derived blend
 * whose every source has one.
 *
 * Callers that iterate portfolios (the Actions adapters) must use this rather
 * than the folder list — a blended portfolio owns no folder, so a bare
 * `folders.has(name)` check silently falls back to position targets and reports
 * "vs position targets" while the portfolio page shows actual holdings.
 */
export function portfoliosWithActualAllocation(folders: Set<string>): Set<string> {
  const out = new Set(folders)
  for (const [name, legs] of Object.entries(DERIVED_ACTUAL_BLENDS)) {
    if (legs.every((l) => folders.has(l.source))) out.add(name)
  }
  return out
}

/** Newest uploaded allocation file for one portfolio folder, parsed. */
function latestFileFor(
  files: StoredFile[],
  portfolioName: string,
  memo?: AllocationMemo,
): Promise<OwnAllocation | null> {
  if (!memo) return readLatestFileFor(files, portfolioName)
  // Keyed on the portfolio alone: `files` is one listing for the whole request
  // by construction, so it cannot vary between two hits on the same memo.
  const hit = memo.get(portfolioName)
  if (hit) return hit
  const pending = readLatestFileFor(files, portfolioName)
  memo.set(portfolioName, pending)
  return pending
}

async function readLatestFileFor(
  files: StoredFile[],
  portfolioName: string,
): Promise<OwnAllocation | null> {
  const mine = files
    .filter((f) => f.folder === portfolioName && isSpreadsheet(f.name))
    // Most recent upload first.
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  if (mine.length === 0) return null

  // Walk newest-first until one actually PARSES as an allocation.
  //
  // This folder is a general document store — review-evidence PDFs, fact
  // sheets, and the dated long-format history file all live here — and taking
  // the newest file whatever it was meant any of them silently became "the
  // actual allocation". A dated history file is the sharp case: its first
  // column is the date, not a ticker, so every row is skipped and it parses to
  // an EMPTY map. The Positions tab then read "Current allocation as of
  // Nov 3, 2026" with every cell blank and a 0.0% total — asserting a date
  // while showing nothing, which is worse than showing nothing at all.
  for (const f of mine) {
    const url = await getSignedUrl(f.fullPath, PORTFOLIO_DOCS_BUCKET)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download allocation file (${res.status})`)
    const { kind, weights } = readAllocationFile(await res.arrayBuffer())
    // A TARGET FILE IS NOT AN ACTUAL ALLOCATION, and reading one as though it
    // were produced a measurement of the book against itself. See
    // `readAllocationFile` for the three live states and why the header rather
    // than the weights is the test. Keep WALKING: an older holdings export is
    // still what the book actually held, stale but real, and `asOf` then
    // reports that older date honestly.
    if (kind === 'targets') continue
    if (weights.size > 0) return { asOf: f.createdAt, fileName: f.name, weights }
  }
  // Falling through leaves the caller with no actual allocation, which is the
  // correct state: every consumer then measures against position targets and
  // SAYS it is doing so. That is the honest answer for a book whose folder
  // holds only target files — unlike the silent substitution it replaces.
  return null
}

/**
 * Could this file be an allocation export at all?
 *
 * A cheap first gate so a PDF is never downloaded and parsed. It is NOT
 * sufficient on its own — the shape check above is what actually decides —
 * because the dated history file is a perfectly good .xlsx that is simply not
 * this kind of sheet.
 */
function isSpreadsheet(name: string): boolean {
  return /\.(csv|xls|xlsx|xlsm)$/i.test(name.trim())
}
