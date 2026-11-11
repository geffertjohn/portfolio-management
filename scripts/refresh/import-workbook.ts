/**
 * import-workbook.ts — headless import of the refreshed YCharts workbook.
 *
 * Runs on the Mac Studio after the Parallels VM has recalculated and written the file.
 * It reuses the SAME importers the browser card uses, so there is one parsing
 * implementation, not two that drift.
 *
 * Bundled by build.sh (esbuild) into import-workbook.cjs and invoked as:
 *   node import-workbook.cjs <path-to-workbook>
 *
 * Exit codes: 0 = everything landed, 1 = something did not. The wrapper uses
 * that to decide between processed/ and failed/.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import * as XLSX from 'xlsx'

import { uploadYchartBenchmarks } from '@/lib/ychartBenchmarksUpload'
import { bulkUploadFundsFromExcel } from '@/lib/fundBulkUpload'
import { bulkUploadFundHoldings } from '@/lib/fundHoldingsUpload'
import { bulkUploadPortfoliosFromExcel } from '@/lib/portfolioExcelUpload'
import { recordImportRuns, type ImportRunInput } from '@/lib/importRuns'
import { unmappedCategoryWarning } from '@/lib/assetClass'

/** The macro stamps its finish time here. See scripts/refresh/Ycharts.bas. */
const STAMP_SHEET = 'Control'
const STAMP_CELL = 'A1'

/**
 * Column D of the Control sheet, where the macro's `WriteNote` leaves
 * warnings — a fund it could not add to the Securities sheet, a run that hit
 * a guard.
 *
 * **It writes there because the Mac share does not work from inside the
 * guest.** The old `WriteNote` appended to `watchlist-note.txt` under
 * `On Error Resume Next` and was silently dead: no note file was ever
 * observed, proven on 11 Nov 2026 against `StampTimings`, which wrote
 * `Control!A2`/`A3` from the same procedure at the same instant and reached
 * the Mac inside this very workbook. So the warnings now travel the way the
 * data does.
 *
 * Column B is the macro's roster and must not be confused with this.
 */
const NOTE_COL = 'D'
const MAX_NOTES = 50

/** Refuse a workbook whose data is older than this. The job runs daily. */
const MAX_AGE_HOURS = 18

/**
 * A stamp from the future means the guest and host clocks disagree — almost
 * always because the Windows VM is in a different timezone than the Studio. The
 * macro writes LOCAL time and this parses as local, so a mismatch silently
 * shifts every age by the offset. Fail loudly instead of drifting.
 */
const MAX_SKEW_HOURS = 2

/**
 * Floors, not exact counts — the book grows. These exist to catch a workbook
 * that parsed but came back mostly empty, which would otherwise import as a
 * cheerful success that quietly halves the data.
 */
const MIN_BENCHMARK_ROWS = 90
const MIN_FUNDS = 35
const MIN_PORTFOLIOS = 15

function fail(msg: string): never {
  console.error(`✖ ${msg}`)
  process.exit(1)
}

/**
 * Warnings the macro recorded during the run.
 *
 * These are NOT errors: the run succeeded and the data landed. They go to
 * `import_runs.warnings`, which raises an Actions-hub item without touching
 * `status` — the same treatment an unmapped category gets, and for the same
 * reason. A warning that marked the import `partial` would push a false
 * failure into the freshness stamp.
 */
function readMacroNotes(buf: Buffer): string[] {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames.find((n) => n.trim() === STAMP_SHEET) ?? '']
  if (!sheet) return []
  const out: string[] = []
  for (let r = 1; r <= MAX_NOTES; r++) {
    const v = sheet[`${NOTE_COL}${r}`]?.v
    const s = v == null ? '' : String(v).trim()
    if (s !== '') out.push(s)
  }
  return out
}

/**
 * The workbook's own as-of time, which is the only thing that distinguishes a
 * fresh file from yesterday's leftover — YCharts values carry no date.
 */
function readRefreshStamp(buf: Buffer): Date {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames.find((n) => n.trim() === STAMP_SHEET) ?? '']
  if (!sheet) fail(`No "${STAMP_SHEET}" sheet — this workbook was not written by the refresh macro.`)

  const cell = sheet[STAMP_CELL]
  if (cell?.v == null) fail(`${STAMP_SHEET}!${STAMP_CELL} is empty — the macro did not stamp a refresh time.`)

  // The macro writes "yyyy-mm-dd hh:nn:ss" as text; Excel may still hand it back
  // as a Date if the cell format was ever changed.
  const stamped = cell.v instanceof Date ? cell.v : new Date(String(cell.v).replace(' ', 'T'))
  if (Number.isNaN(stamped.getTime())) fail(`Could not parse the refresh stamp: ${String(cell.v)}`)
  return stamped
}

async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) fail('Usage: node import-workbook.cjs <path-to-workbook>')

  const buf = await readFile(path)
  const stamped = readRefreshStamp(buf)
  const ageHours = (Date.now() - stamped.getTime()) / 3_600_000
  if (ageHours < -MAX_SKEW_HOURS) {
    fail(
      `Refresh stamp is ${(-ageHours).toFixed(1)}h in the future (${stamped.toISOString()}). ` +
      `Set the Windows VM to the same timezone as the Studio — otherwise every ` +
      `freshness check is off by the offset.`,
    )
  }
  if (ageHours > MAX_AGE_HOURS) {
    fail(
      `Workbook is ${ageHours.toFixed(1)}h old (refreshed ${stamped.toISOString()}). ` +
      `Refusing to import — the VM step probably did not run.`,
    )
  }
  console.log(`Workbook refreshed ${stamped.toISOString()} (${ageHours.toFixed(1)}h ago)`)

  // The importers take a browser File; Node 20+ provides one. They only touch
  // .name and .arrayBuffer().
  const file = new File([buf], basename(path))

  const runs: ImportRunInput[] = []
  const notes: string[] = []
  let hardFailure = false

  // Each dataset runs independently — a benchmark column mismatch must not stop
  // the funds and portfolios in the same file from loading.
  try {
    const r = await uploadYchartBenchmarks(file)
    if (r.inserted < MIN_BENCHMARK_ROWS) {
      throw new Error(`only ${r.inserted} benchmark rows (floor ${MIN_BENCHMARK_ROWS})`)
    }
    runs.push({
      source: 'ycharts_benchmarks', rows: r.inserted, errors: r.errors, warnings: r.warnings,
    })
    notes.push(`${r.inserted} benchmark rows`)
    // Abandoned rows are not a failed import -- the data landed -- but they stop
    // refreshing silently. The log line is for whoever is reading the morning
    // output; the `warnings` field above is what reaches the Actions hub, since
    // nobody reads a log on a job that ran at 05:30 and succeeded.
    for (const w of r.warnings) console.warn(`WARN  ${w}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    runs.push({ source: 'ycharts_benchmarks', rows: 0, errors: [msg], status: 'failed' })
    notes.push(`benchmarks FAILED: ${msg}`)
    hardFailure = true
  }

  try {
    const r = await bulkUploadFundsFromExcel(file)
    if (r.succeeded < MIN_FUNDS) {
      throw new Error(`only ${r.succeeded} funds (floor ${MIN_FUNDS}); ${r.errors[0] ?? ''}`)
    }
    // THE GAP THIS CLOSES. `unmappedCategories` has been computed on every
    // import since Nov 2026 and read by the browser card alone -- so on the
    // unattended path, which is now the ONLY path a new fund's category
    // arrives by (the watchlist poller adds the ticker overnight), it was
    // computed and dropped on the floor. On 9 Nov three runs took the fund
    // count 88 -> 92 -> 97, introducing `Mid-Cap Value` and `Small Value`,
    // and every one recorded `errors: []` with nothing said anywhere. Four
    // watched funds sat unclassified and the only trace would have been a
    // stray "unclassified weight" line the day one of them was bought.
    const unmapped = unmappedCategoryWarning(r.unmappedCategories)
    // The macro's own warnings ride with the fund run: everything it reports
    // concerns the Securities sheet, which is what this import reads.
    const macroNotes = readMacroNotes(buf)
    runs.push({
      source: 'ycharts_funds',
      rows: r.succeeded,
      errors: r.errors,
      warnings: [...(unmapped ? [unmapped] : []), ...macroNotes],
    })
    notes.push(`${r.succeeded} funds`)
    if (unmapped) console.warn(`WARN  ${unmapped}`)
    for (const n of macroNotes) console.warn(`WARN  macro: ${n}`)
    // A PER-ROW failure above the floor is not a failed import, so it raises no
    // action and prints no count anyone would notice — the run says "47 funds"
    // one day and "46 funds" the next, and the security that dropped out simply
    // stops refreshing. It happened on 2026-11-06: `VVIAX: TypeError: fetch
    // failed`, one transient network error, recorded in import_runs.errors and
    // visible nowhere else. Same reasoning as the benchmark warnings above.
    for (const e of r.errors) console.warn(`WARN  fund row failed: ${e}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    runs.push({ source: 'ycharts_funds', rows: 0, errors: [msg], status: 'failed' })
    notes.push(`funds FAILED: ${msg}`)
    hardFailure = true
  }

  // AFTER the funds, and that ordering is load-bearing: `fund_holdings`
  // has an FK to securities2, so a fund added to the watchlist overnight only
  // satisfies it once the Securities sheet has written its row in the step
  // above. Run first, every new fund's holdings would be rejected on their
  // first morning and silently appear a day late.
  //
  // No floor, unlike the three datasets around it. Holdings are genuinely
  // absent for some funds and a floor would have to be guessed; the warnings
  // below carry what a floor would have caught, without inventing a number.
  try {
    const r = await bulkUploadFundHoldings(file)
    runs.push({
      source: 'ycharts_holdings', rows: r.rows, errors: r.errors, warnings: r.warnings,
    })
    notes.push(`${r.rows} holdings across ${r.funds} funds`)
    // Printed every run, not only when it changes. The column order of the
    // `holdings` array is detected rather than documented — the reference
    // workbook names the three fields and not their order — so the detection
    // has to stay visible, or the day YCharts reorders them every weight
    // lands in a text column and reads as null.
    if (r.layout) console.log(`      holdings column order: ${r.layout}`)
    for (const w of r.warnings) console.warn(`WARN  ${w}`)
    for (const e of r.errors) console.warn(`WARN  holdings row failed: ${e}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    runs.push({ source: 'ycharts_holdings', rows: 0, errors: [msg], status: 'failed' })
    notes.push(`holdings FAILED: ${msg}`)
    // NOT a hard failure. Holdings are an addition to what the committee can
    // read, not something the app depends on — every existing surface worked
    // without them. Failing the whole run would send a workbook whose funds,
    // benchmarks and portfolios all landed to failed/ and raise a refresh
    // action over data that is sitting correctly in the database.
  }

  try {
    const r = await bulkUploadPortfoliosFromExcel(file)
    if (r.succeeded < MIN_PORTFOLIOS) {
      throw new Error(`only ${r.succeeded} portfolios (floor ${MIN_PORTFOLIOS}); ${r.errors[0] ?? ''}`)
    }
    runs.push({ source: 'ycharts_portfolios', rows: r.succeeded, errors: r.errors })
    notes.push(`${r.succeeded} portfolios`)
    for (const e of r.errors) console.warn(`WARN  portfolio row failed: ${e}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    runs.push({ source: 'ycharts_portfolios', rows: 0, errors: [msg], status: 'failed' })
    notes.push(`portfolios FAILED: ${msg}`)
    hardFailure = true
  }

  // Always logged, success or not — a failed run is what raises the in-app
  // action, so it must reach the table.
  await recordImportRuns(runs, file)

  console.log(notes.join(' · '))
  if (hardFailure) fail('One or more datasets did not import.')
  console.log('✔ Import complete.')
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
