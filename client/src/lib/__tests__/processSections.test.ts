import { describe, it, expect } from 'vitest'
import {
  keyFor,
  stripNumbering,
  parseMarkdown,
  reconcile,
  toMarkdown,
  adoptionBlockers,
  adoptionCautions,
  type ProcessSection,
} from '../processSections'

/**
 * The rule these tests defend: a committee memo cites a clause by KEY, so a key
 * must survive ordinary editing of the document it belongs to. Everything else
 * here is in service of that.
 */

describe('keyFor', () => {
  it('kebab-cases a heading', () => {
    expect(keyFor('Position Sizing')).toBe('position-sizing')
    expect(keyFor('Sell Discipline & Replacement')).toBe('sell-discipline-replacement')
  })

  it('returns empty for a heading with nothing to key on', () => {
    // Reported by parseMarkdown rather than silently producing '-'.
    expect(keyFor('—')).toBe('')
    expect(keyFor('   ')).toBe('')
  })

  it('never ends in a hyphen, even when truncated mid-word', () => {
    // A trailing hyphen would make two near-identical headings collide on a
    // boundary that depends on where the 60th character happens to fall.
    const k = keyFor('A'.repeat(55) + ' bb')
    expect(k.endsWith('-')).toBe(false)
  })
})

describe('parseMarkdown', () => {
  it('takes a leading h1 as the title, not as a section', () => {
    const d = parseMarkdown('# Our Process\n\n## Scope\n\nEverything.\n')
    expect(d.title).toBe('Our Process')
    expect(d.sections.map((s) => s.heading)).toEqual(['Scope'])
  })

  it('keeps prose that appears before the first heading', () => {
    // A document opening with its scope paragraph is ordinary, and dropping it
    // would lose exactly the sentence saying what the document governs.
    const d = parseMarkdown('This governs all discretionary books.\n\n## Scope\n\nText.\n')
    expect(d.sections[0].heading).toBe('Preamble')
    expect(d.sections[0].body).toContain('all discretionary books')
    expect(d.sections).toHaveLength(2)
  })

  it('keeps the body of a document whose only heading is its title', () => {
    // The h1 is the title, so the text beneath it sits before any section
    // heading and is carried as the preamble. One section, not zero — losing it
    // would empty a short document entirely.
    const d = parseMarkdown('# Monitoring\n\nReview quarterly.\n')
    expect(d.title).toBe('Monitoring')
    expect(d.sections).toHaveLength(1)
    expect(d.sections[0].body).toBe('Review quarterly.')
  })

  it('disambiguates duplicate headings and reports them', () => {
    const d = parseMarkdown('## Review\n\nA\n\n## Review\n\nB\n')
    expect(d.sections.map((s) => s.key)).toEqual(['review', 'review-2'])
    expect(d.warnings).toEqual([{ heading: 'Review', reason: 'duplicate-key' }])
  })

  it('reports an empty section rather than dropping it', () => {
    // A heading with no text under it is usually an unfinished clause. Dropping
    // it would hide the fact that the advisor meant to write something.
    const d = parseMarkdown('## Scope\n\nText.\n\n## Sell Discipline\n')
    expect(d.sections).toHaveLength(2)
    expect(d.warnings).toEqual([{ heading: 'Sell Discipline', reason: 'empty-body' }])
  })

  it('handles CRLF input', () => {
    // Pasting out of Word is the expected import path.
    const d = parseMarkdown('# T\r\n\r\n## Scope\r\n\r\nBody.\r\n')
    expect(d.title).toBe('T')
    expect(d.sections[0].body).toBe('Body.')
  })

  it('gives a keyless heading a positional key instead of failing', () => {
    const d = parseMarkdown('## ???\n\nBody.\n')
    expect(d.sections[0].key).toBe('section-1')
    expect(d.warnings[0].reason).toBe('empty-key')
  })
})

describe('a word-processor outline becomes a flat list of clauses', () => {
  /**
   * The rule the advisor's real document forced. Its sections 3-6 are numbered
   * parents that hold nothing but subsections, so carrying them through made
   * four empty boxes nobody could fill and the committee could not test. We
   * extract clauses; we do not reproduce the source document's hierarchy.
   */

  it('folds a structural heading into its children', () => {
    const d = parseMarkdown(
      '# Doc\n\n## 3. Asset Allocation\n\n### 3.1 Overview\n\nA\n\n### 3.2 Models\n\nB\n',
    )
    expect(d.sections.map((s) => s.heading)).toEqual([
      'Asset Allocation — Overview',
      'Asset Allocation — Models',
    ])
    expect(d.sections.every((s) => s.body !== '')).toBe(true)
    expect(d.warnings).toEqual([])
  })

  it('leaves a heading that has BOTH text and sub-headings as its own section', () => {
    // It is a clause that happens to be followed by others. Folding it would
    // duplicate its text into every child.
    const d = parseMarkdown('# Doc\n\n## Scope\n\nIntro text.\n\n### Detail\n\nMore.\n')
    expect(d.sections.map((s) => s.heading)).toEqual(['Scope', 'Detail'])
  })

  it('folds through two levels', () => {
    const d = parseMarkdown('# D\n\n## A\n\n### B\n\n#### C\n\nbody\n')
    expect(d.sections.map((s) => s.heading)).toEqual(['A — B — C'])
  })

  it('does not fold a heading whose next sibling is at the SAME level', () => {
    // Empty and followed by a peer: a genuinely unfinished clause, not a group.
    const d = parseMarkdown('# D\n\n## Empty\n\n## Next\n\nbody\n')
    expect(d.sections.map((s) => s.heading)).toEqual(['Empty', 'Next'])
    expect(d.warnings).toEqual([{ heading: 'Empty', reason: 'empty-body' }])
  })

  it('stops prefixing once the outline comes back up a level', () => {
    const d = parseMarkdown('# D\n\n## A\n\n### A1\n\nx\n\n## B\n\n### B1\n\ny\n')
    expect(d.sections.map((s) => s.heading)).toEqual(['A — A1', 'B — B1'])
  })
})

describe('stripNumbering', () => {
  it('removes an outline number', () => {
    expect(stripNumbering('3.1 Overview')).toBe('Overview')
    expect(stripNumbering('1. Introduction')).toBe('Introduction')
    expect(stripNumbering('6 Ongoing Monitoring Process')).toBe('Ongoing Monitoring Process')
  })

  it('keeps an appendix label — the document cites itself by it', () => {
    expect(stripNumbering('APPENDIX B: Scorecards')).toBe('APPENDIX B: Scorecards')
  })

  it('never strips a heading down to nothing', () => {
    // "4.2" alone is a bad heading, but an empty one is worse: it would key to
    // a positional anchor and lose the only identifier it had.
    expect(stripNumbering('4.2')).toBe('4.2')
  })
})

describe('reconcile', () => {
  const prev: ProcessSection[] = [
    { key: 'scope', heading: 'Scope', body: 'a' },
    { key: 'sizing', heading: 'Position Sizing', body: 'b' },
    { key: 'sell', heading: 'Sell Discipline', body: 'c' },
  ]

  it('carries the key through a body edit', () => {
    const next = prev.map((s) => ({ ...s, body: s.body + ' revised' }))
    expect(reconcile(prev, next).map((s) => s.key)).toEqual(['scope', 'sizing', 'sell'])
  })

  it('carries the key through a HEADING rewording in place', () => {
    // The case the key exists for. Re-deriving from the heading would re-key
    // this clause and break every memo citing it.
    const next = [
      { key: 'scope', heading: 'Scope', body: 'a' },
      { key: 'position-sizing-and-limits', heading: 'Position Sizing and Limits', body: 'b' },
      { key: 'sell', heading: 'Sell Discipline', body: 'c' },
    ]
    expect(reconcile(prev, next)[1].key).toBe('sizing')
  })

  it('follows a section that MOVED rather than keying it by its new slot', () => {
    const next = [prev[2], prev[0], prev[1]]
    expect(reconcile(prev, next).map((s) => s.key)).toEqual(['sell', 'scope', 'sizing'])
  })

  it('gives a genuinely new section a fresh key', () => {
    const next = [...prev, { key: '', heading: 'Cash Policy', body: 'd' }]
    const out = reconcile(prev, next)
    expect(out[3].key).toBe('cash-policy')
    expect(new Set(out.map((s) => s.key)).size).toBe(4)
  })

  it('drops the key of a removed section without reusing it', () => {
    const next = [prev[0], prev[2]]
    expect(reconcile(prev, next).map((s) => s.key)).toEqual(['scope', 'sell'])
  })

  it('never emits a duplicate key, even when two sections are renamed alike', () => {
    const next = [
      { key: '', heading: 'Review', body: 'a' },
      { key: '', heading: 'Review', body: 'b' },
    ]
    const out = reconcile(prev, next)
    expect(new Set(out.map((s) => s.key)).size).toBe(2)
  })
})

describe('toMarkdown', () => {
  it('round-trips through parseMarkdown', () => {
    const sections: ProcessSection[] = [
      { key: 'scope', heading: 'Scope', body: 'All discretionary books.' },
      { key: 'sizing', heading: 'Position Sizing', body: 'Tiered by conviction.' },
    ]
    const back = parseMarkdown(toMarkdown('Our Process', sections))
    expect(back.title).toBe('Our Process')
    expect(back.sections.map((s) => [s.heading, s.body])).toEqual(
      sections.map((s) => [s.heading, s.body]),
    )
  })
})

describe('adoptionBlockers', () => {
  const ok: ProcessSection[] = [{ key: 'scope', heading: 'Scope', body: 'Text.' }]

  it('passes a complete document', () => {
    expect(adoptionBlockers('Process', ok)).toEqual([])
  })

  it('blocks an empty document and a missing title', () => {
    // Mirrors process_documents_published_is_complete. The CHECK is what stops
    // a bad write; this is what says why before the advisor clicks.
    expect(adoptionBlockers('Process', [])).toHaveLength(1)
    expect(adoptionBlockers('  ', ok)).toHaveLength(1)
  })

  it('does NOT block a section with no body', () => {
    // The real document proved this: four of its twenty-four headings are
    // numbered parents whose content lives in their subsections ("3. Asset
    // Allocation" above "3.1 Overview"). Refusing to adopt over that would
    // make the advisor flatten their own numbering to satisfy the tool.
    expect(adoptionBlockers('Process', [{ key: 'a', heading: 'A', body: '  ' }])).toEqual([])
  })

  it('cautions about an empty section and names it', () => {
    const c = adoptionCautions([
      { key: 'a', heading: 'Alpha', body: '' },
      { key: 'b', heading: 'Beta', body: '' },
      { key: 'c', heading: 'Gamma', body: 'Text.' },
    ])
    expect(c).toHaveLength(1)
    expect(c[0]).toContain('Alpha')
    expect(c[0]).toContain('Beta')
    expect(c[0]).not.toContain('Gamma')
  })

  it('has nothing to caution about when every section has content', () => {
    expect(adoptionCautions(ok)).toEqual([])
  })

  it('blocks a duplicate key — a memo citing it could not resolve', () => {
    const dupe: ProcessSection[] = [
      { key: 'scope', heading: 'Scope', body: 'a' },
      { key: 'scope', heading: 'Scope Again', body: 'b' },
    ]
    expect(adoptionBlockers('Process', dupe).some((b) => b.includes('share the key'))).toBe(true)
  })
})
