import { useState } from 'react'

/**
 * The portfolio's strategy narrative on the detail header: a concise Description and
 * Objective always visible, and the long Investment Philosophy as a collapsed
 * disclosure (so it doesn't bury the metrics/allocation/tabs below). The philosophy
 * text is parsed into real structure — ALL-CAPS lines become section headers, "•"
 * lines become proper bullet lists — instead of a flat pre-wrapped wall of text.
 */

type Block =
  | { type: 'header'; text: string }
  | { type: 'para'; text: string }
  | { type: 'bullets'; items: string[] }

function parsePhilosophy(text: string): Block[] {
  const blocks: Block[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) { blocks.push({ type: 'bullets', items: bullets }); bullets = [] }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('•')) { bullets.push(line.replace(/^•\s*/, '')); continue }
    flush()
    // Short ALL-CAPS line (no lowercase) → section header
    if (line.length <= 40 && /^[A-Z0-9][A-Z0-9 &/()-]+$/.test(line)) blocks.push({ type: 'header', text: line })
    else blocks.push({ type: 'para', text: line })
  }
  flush()
  return blocks
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-2 text-gray-700">{children}</div>
    </div>
  )
}

export function PortfolioNarrative({
  description, objective, philosophy,
}: {
  description: string | null
  objective: string | null
  philosophy: string | null
}) {
  const [open, setOpen] = useState(false)
  const blocks = philosophy ? parsePhilosophy(philosophy) : []

  return (
    <>
      {description && <Section label="Description">{description}</Section>}
      {objective && <Section label="Objective">{objective}</Section>}

      {philosophy && (
        <div className="mt-6 border-t border-gray-200 pt-6">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={open}
          >
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Investment Philosophy
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              {open ? 'Hide' : 'Show'}
              <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>

          {open && (
            <div className="mt-4 space-y-1">
              {blocks.map((b, i) => {
                if (b.type === 'header') {
                  return (
                    <h4 key={i} className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-800 first:mt-0">
                      {b.text}
                    </h4>
                  )
                }
                if (b.type === 'bullets') {
                  return (
                    <ul key={i} className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600 marker:text-gray-400">
                      {b.items.map((it, j) => <li key={j}>{it}</li>)}
                    </ul>
                  )
                }
                return <p key={i} className="mt-2 text-sm text-gray-600 first:mt-0">{b.text}</p>
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
