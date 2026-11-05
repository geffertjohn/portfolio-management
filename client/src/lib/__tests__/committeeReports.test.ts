import { describe, it, expect } from 'vitest'
import {
  sortCommitteeDocs, countByGroup, docHref, producedSince,
  GROUP_OF, DOC_KIND_LABELS, type CommitteeDoc, type CommitteeDocKind,
} from '../committeeReports'

/**
 * The committee's five output tables had no firm-wide reader at all until this
 * existed — every one was scoped to a single security, portfolio or candidate.
 * These cover the shaping decisions that list makes.
 */

const doc = (over: Partial<CommitteeDoc> = {}): CommitteeDoc => ({
  id: 'research:1',
  kind: 'post_earnings',
  writtenAt: '2026-11-05T12:00:00Z',
  subject: 'DUK',
  subjectKind: 'security',
  securityNumericId: 42,
  period: 'Q3 FY2026',
  signal: 'Thesis intact',
  tone: 'good',
  excerpt: null,
  ...over,
})

describe('the feed', () => {
  it('orders newest first', () => {
    const sorted = sortCommitteeDocs([
      doc({ id: 'a', writtenAt: '2026-10-19T09:00:00Z' }),
      doc({ id: 'b', writtenAt: '2026-11-05T09:00:00Z' }),
      doc({ id: 'c', writtenAt: '2026-11-02T09:00:00Z' }),
    ])
    expect(sorted.map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate its input', () => {
    const input = [doc({ id: 'a', writtenAt: '2026-10-19T09:00:00Z' }), doc({ id: 'b' })]
    sortCommitteeDocs(input)
    expect(input.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('counts by the group the advisor filters on, not by table', () => {
    // Pre- and post-earnings briefs are two report types in one table and ONE
    // thing to the reader; a risk report and an IC memo are separate tables.
    const counts = countByGroup([
      doc({ kind: 'pre_earnings' }), doc({ kind: 'post_earnings' }),
      doc({ kind: 'initial' }), doc({ kind: 'call_summary' }),
      doc({ kind: 'risk_report' }), doc({ kind: 'ic_memo' }),
      doc({ kind: 'portfolio_memo' }),
    ])
    expect(counts).toEqual({ briefs: 2, research: 1, calls: 1, risk: 1, memos: 2 })
  })

  it('gives every kind a group and a label', () => {
    // A kind added later without either would render blank and group nowhere.
    const kinds: CommitteeDocKind[] = [
      'pre_earnings', 'post_earnings', 'initial', 'update',
      'call_summary', 'risk_report', 'ic_memo', 'portfolio_memo',
    ]
    for (const k of kinds) {
      expect(GROUP_OF[k], `group for ${k}`).toBeTruthy()
      expect(DOC_KIND_LABELS[k], `label for ${k}`).toBeTruthy()
    }
  })

  it('counts what was written since a day, inclusive', () => {
    const docs = [
      doc({ writtenAt: '2026-11-05T08:00:00Z' }),
      doc({ writtenAt: '2026-11-03T08:00:00Z' }),
      doc({ writtenAt: '2026-10-20T08:00:00Z' }),
    ]
    expect(producedSince(docs, '2026-11-03')).toBe(2)
    expect(producedSince(docs, '2026-11-06')).toBe(0)
  })
})

describe('where a document opens', () => {
  it('sends a held security to its detail page', () => {
    // Which is where the Commentary tab renders every brief and summary.
    expect(docHref(doc({ securityNumericId: 42 }))).toBe('/security/42')
  })

  it('sends an UNHELD ticker to the on-demand research page', () => {
    // `research_reports.security_id` has no FK precisely so a watchlist idea
    // can carry research. There is no held-security page to open for one, and
    // linking to /security/null is the documented navigation bug.
    expect(docHref(doc({ subject: 'FCX', securityNumericId: null })))
      .toBe('/research/FCX')
  })

  it('sends a portfolio document to its portfolio', () => {
    expect(docHref(doc({ subjectKind: 'portfolio', subject: 'Core Growth', securityNumericId: null })))
      .toBe('/portfolio/Core%20Growth')
  })

  it('encodes a portfolio name with an ampersand', () => {
    // "Equity Income & Core Growth" is a real book, and a bare & truncates the path.
    expect(docHref(doc({
      subjectKind: 'portfolio', subject: 'Equity Income & Core Growth', securityNumericId: null,
    }))).toBe('/portfolio/Equity%20Income%20%26%20Core%20Growth')
  })
})
