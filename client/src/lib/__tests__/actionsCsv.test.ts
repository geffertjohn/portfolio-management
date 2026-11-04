import { describe, it, expect } from 'vitest'
import { buildActionsCsv, actionLabel, type UnifiedAction } from '../actions'

/**
 * The CSV export, now that it is out of the page (audit §22).
 *
 * It was untestable inline, and it is the one surface where an action leaves
 * the app — into a spreadsheet someone reads without the screen beside them.
 */

function action(over: Partial<UnifiedAction> = {}): UnifiedAction {
  return {
    key: 'manual:1',
    category: 'portfolio',
    source: 'manual',
    subject: 'Core Growth',
    title: 'Rebalance',
    subtitle: null,
    context: null,
    route: null,
    dueDate: '2026-11-10',
    priority: 'high',
    isManual: true,
    manual: { status: 'open' } as UnifiedAction['manual'],
    ...over,
  }
}

const rows = (csv: string) => csv.split('\n')

describe('buildActionsCsv', () => {
  it('writes a header and one row per action', () => {
    const csv = buildActionsCsv([action(), action({ key: 'manual:2' })])
    expect(rows(csv)).toHaveLength(3)
    expect(rows(csv)[0]).toBe('"Category","Source","Task","Context","Due","Priority","Status"')
  })

  it('names the task the way the screen does', () => {
    // actionLabel exists so the row and the export cannot disagree; this is
    // what makes importing that function the point of the move.
    const a = action()
    expect(rows(buildActionsCsv([a]))[1]).toContain(`"${actionLabel(a)}"`)
  })

  it('survives a title carrying a comma, a quote and a newline', () => {
    // Action titles are free text. An unquoted comma silently shifts every
    // later column, which is the kind of error nobody sees until the
    // spreadsheet is already being read as evidence.
    const csv = buildActionsCsv([action({ subject: null, title: 'Trim AAPL, 7% -> 5% ("overweight")' })])
    expect(rows(csv)[1]).toContain('"Trim AAPL, 7% -> 5% (""overweight"")"')
    expect(rows(csv)).toHaveLength(2)
  })

  it('reports a derived action as active rather than inventing a status', () => {
    // Derived actions are projected read-only from their own tables and are
    // completed in their own workflow — they have no stored status to print.
    const csv = buildActionsCsv([action({
      key: 'review:AAPL', source: 'security_review', isManual: false, manual: undefined,
    })])
    expect(rows(csv)[1].endsWith('"active"')).toBe(true)
  })

  it('writes an empty cell for a missing context or due date, not "null"', () => {
    const csv = buildActionsCsv([action({ context: null, dueDate: null })])
    expect(rows(csv)[1]).not.toContain('null')
    expect(rows(csv)[1]).toContain('"","","high"')
  })

  it('returns just the header when there is nothing to export', () => {
    expect(rows(buildActionsCsv([]))).toHaveLength(1)
  })
})
