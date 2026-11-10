import { describe, expect, it } from 'vitest'
import {
  latestImportWarnings,
  YCHARTS_DATA_SOURCES,
  type ImportRun,
  type ImportSource,
} from '../importRuns'

/**
 * `import_runs.warnings` is the durable home for a finding from an import that
 * SUCCEEDED — an unmapped vendor `category_name`, an abandoned benchmark row.
 *
 * It exists because the finding used to be computed and then thrown away. The
 * browser card's post-upload banner was the only reader, and the unattended
 * 05:30 refresh renders no banner — so once the watchlist poller started
 * adding fund tickers overnight, the ONLY path a new category arrives by was
 * the one path that said nothing. Three imports on 9 Nov 2026 took the fund
 * count 88 → 92 → 97, introduced `Mid-Cap Value` and `Small Value`, and each
 * recorded `errors: []`.
 *
 * These cases are the rules that keep that honest, not the plumbing.
 */

function run(over: Partial<ImportRun> & { source: ImportSource }): ImportRun {
  return {
    id: 1,
    file_name: 'Ycharts.xlsm',
    imported_at: '2026-11-10T05:33:00Z',
    rows_written: 97,
    errors: [],
    warnings: [],
    status: 'success',
    ...over,
  }
}

const map = (...runs: ImportRun[]) => new Map(runs.map((r) => [r.source, r]))

describe('what the latest run found', () => {
  it('reports a warning with the source that raised it', () => {
    const got = latestImportWarnings(map(
      run({ source: 'ycharts_funds', warnings: ['2 unmapped categories — …'] }),
    ))
    expect(got).toEqual([{ source: 'ycharts_funds', message: '2 unmapped categories — …' }])
  })

  it('reports nothing for a clean import', () => {
    expect(latestImportWarnings(map(run({ source: 'ycharts_funds' })))).toEqual([])
  })

  // Several findings are several pieces of work, so they stay separate rather
  // than being counted — the Actions hub raises one action each.
  it('keeps every finding, across sources', () => {
    const got = latestImportWarnings(map(
      run({ source: 'ycharts_benchmarks', warnings: ['^RLGTR abandoned'] }),
      run({ source: 'ycharts_funds', warnings: ['Mid-Cap Value', 'Small Value'] }),
    ))
    expect(got.map((w) => w.message)).toEqual(['^RLGTR abandoned', 'Mid-Cap Value', 'Small Value'])
  })

  // Source order follows YCHARTS_DATA_SOURCES, not Map insertion order, so the
  // hub lists two findings the same way on every load.
  it('orders by source, not by whichever run was recorded first', () => {
    const got = latestImportWarnings(map(
      run({ source: 'ycharts_portfolios', warnings: ['p'] }),
      run({ source: 'ycharts_benchmarks', warnings: ['b'] }),
    ))
    expect(got.map((w) => w.source)).toEqual(['ycharts_benchmarks', 'ycharts_portfolios'])
    expect(YCHARTS_DATA_SOURCES.indexOf('ycharts_benchmarks'))
      .toBeLessThan(YCHARTS_DATA_SOURCES.indexOf('ycharts_portfolios'))
  })
})

describe('a warning is a finding about data that LANDED', () => {
  /**
   * The whole point of the column being separate from `errors`: a warning must
   * not touch `status`. A run carrying one is still `success`, so the
   * "refresh needs attention" action stays quiet and the freshness stamp still
   * counts the run — folding warnings into `errors` would have marked a clean
   * import `partial` and pushed a false failure into both.
   */
  it('does not change a successful run into a failed one', () => {
    const r = run({ source: 'ycharts_funds', warnings: ['unmapped'] })
    expect(r.status).toBe('success')
    expect(latestImportWarnings(map(r))).toHaveLength(1)
  })

  // Nothing was written, so there is no data to make a claim about — and the
  // failure itself is already an action. Reporting both would say the same
  // broken run twice in two voices.
  it('ignores the warnings of a run that wrote nothing', () => {
    expect(latestImportWarnings(map(
      run({ source: 'ycharts_funds', status: 'failed', rows_written: 0, warnings: ['stale'] }),
    ))).toEqual([])
  })

  // A partial run DID write rows, so a finding about them is real.
  it('keeps the warnings of a partial run', () => {
    expect(latestImportWarnings(map(
      run({ source: 'ycharts_funds', status: 'partial', errors: ['VVIAX: fetch failed'], warnings: ['unmapped'] }),
    ))).toHaveLength(1)
  })
})

describe('it is derived from the newest run, never accumulated', () => {
  /**
   * There is no stored "resolved" flag, which is what makes it safe to raise an
   * action from: a warning persists for exactly as long as its cause does. The
   * morning after somebody edits `ASSET_CLASS_BY_CATEGORY`, the next import
   * simply does not repeat it and the action is gone — the same
   * derived-not-stored rule as the portfolio Change Log and `committeeStage`.
   */
  it('clears when the newest run stops reporting it', () => {
    const before = latestImportWarnings(map(
      run({ source: 'ycharts_funds', warnings: ['1 unmapped category — "Small Value"'] }),
    ))
    expect(before).toHaveLength(1)

    const after = latestImportWarnings(map(
      run({ source: 'ycharts_funds', id: 2, imported_at: '2026-11-11T05:33:00Z' }),
    ))
    expect(after).toEqual([])
  })

  it('says nothing about a source that has never been imported', () => {
    expect(latestImportWarnings(new Map())).toEqual([])
  })

  // The card passes the sources it actually loads, so the allocations card
  // cannot report a finding from the workbook import sitting beside it.
  it('only reads the sources it is asked about', () => {
    const runs = map(run({ source: 'ycharts_funds', warnings: ['unmapped'] }))
    expect(latestImportWarnings(runs, ['ycharts_allocations'])).toEqual([])
    expect(latestImportWarnings(runs, ['ycharts_funds'])).toHaveLength(1)
  })
})
