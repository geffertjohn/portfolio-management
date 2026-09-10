/**
 * import-workbook.ts — headless import of the refreshed YCharts workbook.
 *
 * Runs on the mini after the Parallels VM has recalculated and written the file.
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
import { bulkUploadPortfoliosFromExcel } from '@/lib/portfolioExcelUpload'
import { recordImportRuns, type ImportRunInput } from '@/lib/importRuns'

/** The macro stamps its finish time here. See scripts/refresh/Ycharts.bas. */
const STAMP_SHEET = 'Control'
const STAMP_CELL = 'A1'

/** Refuse a workbook whose data is older than this. The job runs daily. */
const MAX_AGE_HOURS = 18

/**
 * A stamp from the future means the guest and host clocks disagree — almost
 * always because the Windows VM is in a different timezone than the mini. The
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
      `Set the Windows VM to the same timezone as the mini — otherwise every ` +
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
    runs.push({ source: 'ycharts_benchmarks', rows: r.inserted, errors: r.errors })
    notes.push(`${r.inserted} benchmark rows`)
    // Abandoned rows are not a failed import -- the data landed -- but they stop
    // refreshing silently, so say so where the daily log will show it.
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
    runs.push({ source: 'ycharts_funds', rows: r.succeeded, errors: r.errors })
    notes.push(`${r.succeeded} funds`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    runs.push({ source: 'ycharts_funds', rows: 0, errors: [msg], status: 'failed' })
    notes.push(`funds FAILED: ${msg}`)
    hardFailure = true
  }

  try {
    const r = await bulkUploadPortfoliosFromExcel(file)
    if (r.succeeded < MIN_PORTFOLIOS) {
      throw new Error(`only ${r.succeeded} portfolios (floor ${MIN_PORTFOLIOS}); ${r.errors[0] ?? ''}`)
    }
    runs.push({ source: 'ycharts_portfolios', rows: r.succeeded, errors: r.errors })
    notes.push(`${r.succeeded} portfolios`)
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
