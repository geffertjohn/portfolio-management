/**
 * processSections — turning an authored process document into citable clauses.
 *
 * PURE. No React, no Supabase. The data access lives in `processDocuments.ts`.
 *
 * The firm's portfolio construction & monitoring process is authored as prose,
 * but the committee has to be able to say WHICH clause a book departs from.
 * That is what `key` is for: a stable anchor a memo can cite, so a finding
 * recorded in March still resolves when the heading is reworded in June.
 *
 * **The key is derived from the heading ONCE, at import, and then carried.**
 * Re-deriving it on every save would mean a typo fix silently re-keys the
 * clause and every memo citing it stops resolving — the same class of failure
 * as a benchmark rename re-pointing a model at a different row. `reconcile()`
 * is the one place that decides whether an edited section keeps its key.
 */

export interface ProcessSection {
  /**
   * Stable kebab-case anchor. Derived from the heading at import, then carried.
   *
   * **Internal — it is deliberately NOT rendered anywhere in the app.** It is
   * machinery for keeping a committee citation resolvable across a rewording,
   * not something the advisor reads, and a column of grey slugs under every
   * clause was noise on a page meant to be read as a document. The committee
   * prompt therefore names the HEADING in its prose and carries the key
   * alongside it, so a finding is both readable and still anchored.
   */
  key: string
  heading: string
  body: string
}

/** A heading that produced no usable key, reported rather than dropped. */
export interface SectionWarning {
  heading: string
  reason: 'empty-key' | 'duplicate-key' | 'empty-body'
}

export interface ParsedDocument {
  title: string | null
  sections: ProcessSection[]
  warnings: SectionWarning[]
}

const MAX_KEY_LEN = 60

/**
 * Heading → kebab-case key.
 *
 * Deliberately lossy and deliberately NOT unique on its own: `keyFor` answers
 * "what would this heading be called", and `parseMarkdown` owns making the
 * result unique within a document. Splitting those two jobs is what lets a
 * renamed section keep its old key during reconcile.
 */
export function keyFor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_KEY_LEN)
    .replace(/-+$/g, '')
}

/**
 * Strip a leading outline number: "3.1 Overview" → "Overview", "1. Intro" →
 * "Intro". The numbering is a word-processor artifact; it carries no meaning
 * once the document is a list of sections, and it makes every key noisier
 * (`3-1-overview`) and every heading harder to read in isolation.
 *
 * An appendix letter is NOT numbering — "APPENDIX B: Scorecards" keeps its
 * label, because that is how the document refers to itself in its own prose.
 */
export function stripNumbering(heading: string): string {
  const stripped = heading.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, '')
  return stripped.trim() || heading.trim()
}

/**
 * Parse a markdown document into ordered sections.
 *
 * Splits on ATX headings (`#` … `######`). The FIRST heading becomes the title
 * only when it is a level-1 heading AND something follows it — a document whose
 * only heading is its title has one section, not zero.
 *
 * **A HEADING WITH NO TEXT OF ITS OWN, FOLLOWED BY DEEPER HEADINGS, IS A GROUP
 * — not a section.** A document written in a word processor is full of them:
 * "3. Asset Allocation" exists only to hold "3.1 Overview" and its siblings.
 * Carrying it through as a section produced an empty box the advisor could not
 * fill and the committee could not test, so the group's name is folded into its
 * children instead ("Asset Allocation — Overview"). The result is a flat list
 * where **every section has content**, which is the shape the rest of this
 * module already assumes. We are not reproducing the source document's
 * hierarchy; we are extracting its clauses.
 *
 * A heading that has BOTH text and sub-headings stays a section in its own
 * right and does not prefix anything — it is a clause that happens to be
 * followed by others, and folding it would duplicate its text.
 *
 * **Text before the first heading is kept as a `preamble` section, never
 * dropped.** A process document that opens with a paragraph of scope before its
 * first heading is completely ordinary, and silently losing it would remove
 * exactly the sentence that says what the document governs.
 */
export function parseMarkdown(src: string): ParsedDocument {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const warnings: SectionWarning[] = []
  const raw: { heading: string; level: number; body: string[] }[] = []

  let title: string | null = null
  let current: { heading: string; level: number; body: string[] } | null = null
  let sawHeading = false

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m) {
      const level = m[1].length
      const text = m[2].trim().replace(/\s*#+\s*$/, '')
      // A level-1 heading before any other heading is the document title.
      if (!sawHeading && level === 1 && title === null) {
        title = text
        sawHeading = true
        continue
      }
      sawHeading = true
      if (current) raw.push(current)
      current = { heading: text, level, body: [] }
      continue
    }
    if (current) {
      current.body.push(line)
    } else if (line.trim() !== '') {
      // Prose before the first heading. Level 1 so nothing folds into it.
      current = { heading: 'Preamble', level: 1, body: [line] }
    }
  }
  if (current) raw.push(current)

  // Fold away the structural headings: no text of its own, and followed by at
  // least one DEEPER heading. Its name prefixes those descendants instead.
  const flattened: { heading: string; body: string }[] = []
  const prefixes: { level: number; text: string }[] = []

  for (let i = 0; i < raw.length; i += 1) {
    const r = raw[i]
    const body = r.body.join('\n').trim()
    while (prefixes.length > 0 && prefixes[prefixes.length - 1].level >= r.level) {
      prefixes.pop()
    }
    const name = stripNumbering(r.heading)
    const next = raw[i + 1]
    if (!body && next && next.level > r.level) {
      prefixes.push({ level: r.level, text: name })
      continue
    }
    const heading = [...prefixes.map((p) => p.text), name].join(' — ')
    flattened.push({ heading, body })
  }

  const sections: ProcessSection[] = []
  const used = new Set<string>()

  for (const r of flattened) {
    const body = r.body
    let key = keyFor(r.heading)

    if (!key) {
      warnings.push({ heading: r.heading, reason: 'empty-key' })
      key = `section-${sections.length + 1}`
    }
    if (used.has(key)) {
      warnings.push({ heading: r.heading, reason: 'duplicate-key' })
      let n = 2
      while (used.has(`${key}-${n}`)) n += 1
      key = `${key}-${n}`
    }
    if (!body) warnings.push({ heading: r.heading, reason: 'empty-body' })

    used.add(key)
    sections.push({ key, heading: r.heading, body })
  }

  return { title, sections, warnings }
}

/**
 * Re-parse an edited document while PRESERVING the keys of sections that
 * survived.
 *
 * Matching is by POSITION first and heading second, in that order, because a
 * rewording in place is the common edit and a reorder is the rare one. Matching
 * on heading alone would re-key every section the advisor rephrases — which is
 * precisely the case the key exists to survive.
 *
 * A section the previous version did not have gets a fresh key; one that
 * disappears simply stops being carried. Neither is reported: adding and
 * removing clauses is what editing a process document IS, and a warning on it
 * would fire on every save.
 */
export function reconcile(previous: ProcessSection[], next: ProcessSection[]): ProcessSection[] {
  const byHeading = new Map<string, string>()
  for (const p of previous) {
    if (!byHeading.has(p.heading)) byHeading.set(p.heading, p.key)
  }

  const used = new Set<string>()
  const out: ProcessSection[] = []

  for (let i = 0; i < next.length; i += 1) {
    const n = next[i]
    const positional = previous[i]
    let key: string | null = null

    // Same slot, and neither the heading nor the slot has been taken already.
    if (positional && !used.has(positional.key) && positional.heading === n.heading) {
      key = positional.key
    } else {
      const byName = byHeading.get(n.heading)
      if (byName && !used.has(byName)) key = byName
      else if (positional && !used.has(positional.key) && !byHeading.has(n.heading)) {
        // Reworded in place: the heading is new, so carry the slot's key.
        key = positional.key
      }
    }

    if (!key || used.has(key)) {
      let candidate = n.key || keyFor(n.heading) || `section-${i + 1}`
      if (used.has(candidate)) {
        let c = 2
        while (used.has(`${candidate}-${c}`)) c += 1
        candidate = `${candidate}-${c}`
      }
      key = candidate
    }

    used.add(key)
    out.push({ key, heading: n.heading, body: n.body })
  }

  return out
}

/** Render sections back to markdown, for export and for the committee's reader. */
export function toMarkdown(title: string, sections: ProcessSection[]): string {
  const parts = [`# ${title}`]
  for (const s of sections) {
    parts.push(`## ${s.heading}`)
    if (s.body.trim()) parts.push(s.body.trim())
  }
  return parts.join('\n\n') + '\n'
}

/**
 * What would make this document impossible to use — the hard floor.
 *
 * The DB enforces the same floor (`process_documents_published_is_complete`),
 * deliberately: the CHECK is what stops a bad write whatever the caller does,
 * and this is what lets the UI say WHY before the advisor clicks.
 *
 * **An EMPTY SECTION is deliberately not here.** It was, and the first real
 * document proved that wrong: a numbered heading whose content is entirely in
 * its subsections ("3. Asset Allocation" above "3.1 Overview") is completely
 * ordinary, and four of the twenty-four sections were that shape. Refusing to
 * adopt a correct document because it has structural headings would have made
 * the advisor flatten their own numbering to satisfy the tool. It is a
 * CAUTION instead — see `adoptionCautions`.
 */
export function adoptionBlockers(title: string, sections: ProcessSection[]): string[] {
  const out: string[] = []
  if (!title.trim()) out.push('The document needs a title.')
  if (sections.length === 0) out.push('The document has no sections.')
  const keys = new Set<string>()
  for (const s of sections) {
    if (keys.has(s.key)) {
      out.push(`Two sections share the key "${s.key}" — a memo citing it could not resolve.`)
      break
    }
    keys.add(s.key)
  }
  return out
}

/**
 * Worth seeing before adopting, but not a reason to refuse.
 *
 * An empty section is usually a structural parent heading and sometimes an
 * unfinished clause. Only the advisor can tell which, so the panel names them
 * and adopts anyway — the committee simply has nothing to test against a
 * section with no text, which is the honest outcome either way.
 */
export function adoptionCautions(sections: ProcessSection[]): string[] {
  const empty = sections.filter((s) => !s.body.trim())
  if (empty.length === 0) return []
  return [
    empty.length === 1
      ? `One section has no content and the committee will have nothing to test against it: "${empty[0].heading}".`
      : `${empty.length} sections have no content and the committee will have nothing to test against them: ${empty.map((s) => `"${s.heading}"`).join(', ')}.`,
  ]
}
