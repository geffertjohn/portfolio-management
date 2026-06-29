/**
 * TranscriptViewer
 *
 * Parses the raw FMP transcript content string into speaker segments and renders
 * a Koyfin-inspired layout: title, date, participants split by role, then
 * structured speaker blocks.
 */
import { useState } from 'react'
import type { EarningsTranscript, KeyExecutive } from '@/lib/fmpTranscripts'

interface Segment {
  speaker: string
  text: string
}

/** Parse "Speaker Name: paragraph text..." into segments. */
function parseSegments(content: string): Segment[] {
  const segments: Segment[] = []
  const lines = content.split('\n')
  const speakerStart = /^([A-Z][a-zA-Z\s\-\.]{1,58}?):\s*(.*)/

  let currentSpeaker = ''
  let currentLines: string[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(speakerStart)
    if (m) {
      if (currentSpeaker) {
        segments.push({ speaker: currentSpeaker, text: currentLines.join(' ').trim() })
      }
      currentSpeaker = m[1].trim()
      currentLines = m[2] ? [m[2]] : []
    } else if (currentSpeaker) {
      currentLines.push(line)
    }
  }
  if (currentSpeaker && currentLines.length) {
    segments.push({ speaker: currentSpeaker, text: currentLines.join(' ').trim() })
  }
  return segments
}

function formatCallDate(dateStr: string): string {
  // FMP may return "2026-04-30 17:00:00" (space separator) or "2026-04-30T17:00:00" or just "2026-04-30".
  // Always use only the date portion to avoid invalid date strings.
  const datePart = dateStr.split(/[\sT]/)[0]
  const d = new Date(datePart + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Fuzzy-match transcript speaker name ("Timothy Cook") against executives list
 * which may include middle initials ("Timothy D. Cook").
 * Matches on first word + last word, case-insensitive.
 */
function lookupTitle(speakerName: string, executives: KeyExecutive[]): string | null {
  const parts = speakerName.trim().toLowerCase().split(/\s+/)
  if (parts.length < 2) return null
  const first = parts[0]
  const last  = parts[parts.length - 1]
  for (const exec of executives) {
    const ep = exec.name.trim().toLowerCase().split(/\s+/)
    if (ep[0] === first && ep[ep.length - 1] === last) return exec.title
  }
  return null
}

function isExecutive(name: string, executives: KeyExecutive[]): boolean {
  return lookupTitle(name, executives) !== null
}

/**
 * For each known analyst name, search the combined Operator text for their
 * last name followed by "with|at|of [Firm]" and record the firm.
 * Searching by analyst name (rather than parsing every Operator line generically)
 * avoids false positives and handles nicknames like "Ben" → "Benjamin".
 */
function extractAnalystFirms(segments: Segment[], analystNames: string[]): Map<string, string> {
  const firms = new Map<string, string>()
  // Combine all Operator turns into one searchable string
  const operatorText = segments
    .filter(s => s.speaker === 'Operator')
    .map(s => s.text)
    .join(' ')

  for (const name of analystNames) {
    const parts = name.toLowerCase().split(/\s+/)
    const last = parts[parts.length - 1]
    // Match last name then anything up to "with|at|of", then capture firm until punctuation
    const re = new RegExp(`\\b${last}\\b[^.]*?\\b(?:with|at|of)\\b\\s+([^,\\.]+)`, 'i')
    const m = re.exec(operatorText)
    if (m) firms.set(name, m[1].trim())
  }

  return firms
}

/** Look up a firm by the canonical speaker name (as stored by extractAnalystFirms). */
function lookupFirm(speakerName: string, firms: Map<string, string>): string | null {
  return firms.get(speakerName) ?? null
}

/**
 * Find the index where Q&A begins: the first Operator segment that introduces
 * a question (contains the word "question"). Everything before is Executive
 * Commentary; from this index onwards is Q&A.
 */
function findQAStartIndex(segments: Segment[]): number {
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].speaker === 'Operator' && /\bquestion\b/i.test(segments[i].text)) {
      return i
    }
  }
  return segments.length // no Q&A detected — all commentary
}

interface Props {
  transcript: EarningsTranscript
  companyName?: string | null
  executives?: KeyExecutive[]
}

/** Shared segment row used in both sections. */
function SegmentRow({
  seg,
  executives,
  analystFirms,
}: {
  seg: Segment
  executives: KeyExecutive[]
  analystFirms: Map<string, string>
}) {
  const title    = lookupTitle(seg.speaker, executives)
  const exec     = isExecutive(seg.speaker, executives)
  const firm     = !exec && seg.speaker !== 'Operator' ? lookupFirm(seg.speaker, analystFirms) : null
  const subtitle = title ?? firm ?? null
  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs font-semibold text-gray-900">{seg.speaker}</span>
        {exec && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
            Executive
          </span>
        )}
        {!exec && seg.speaker !== 'Operator' && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            Analyst
          </span>
        )}
      </div>
      {subtitle && <p className="text-[11px] text-gray-400 mb-1">{subtitle}</p>}
      {!subtitle && <div className="mb-1" />}
      <p className="text-xs leading-relaxed text-gray-600">{seg.text}</p>
    </div>
  )
}

export function TranscriptViewer({ transcript, companyName, executives = [] }: Props) {
  const segments = parseSegments(transcript.content)

  // Unique speakers in order of first appearance
  const speakerOrder: string[] = []
  const seen = new Set<string>()
  for (const seg of segments) {
    if (!seen.has(seg.speaker)) {
      seen.add(seg.speaker)
      speakerOrder.push(seg.speaker)
    }
  }

  // Split participants: Operator is excluded from both lists
  const execParticipants    = speakerOrder.filter(n => n !== 'Operator' && isExecutive(n, executives))
  const analystParticipants = speakerOrder.filter(n => n !== 'Operator' && !isExecutive(n, executives))

  // Build analyst→firm map keyed by canonical speaker name
  const analystFirms = extractAnalystFirms(segments, analystParticipants)

  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [execOpen, setExecOpen] = useState(false)
  const [qaOpen, setQaOpen]     = useState(false)

  const qaStart      = findQAStartIndex(segments)
  const execSegments = segments.slice(0, qaStart)
  const qaSegments   = segments.slice(qaStart)

  const callTitle = companyName
    ? `${companyName} — Q${transcript.quarter} FY${transcript.year} Earnings Call`
    : `Q${transcript.quarter} FY${transcript.year} Earnings Call`

  return (
    <div className="space-y-0">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="pb-4">
        {companyName && <p className="text-xs text-gray-400 mb-0.5">{companyName}</p>}
        <h3 className="text-lg font-semibold text-gray-900 leading-snug">{callTitle}</h3>
        <p className="mt-1 text-xs text-gray-500">{formatCallDate(transcript.date)}</p>
      </div>

      <div className="border-t border-gray-200" />

      {/* ── Participants ─────────────────────────────────────────────────── */}
      {(execParticipants.length > 0 || analystParticipants.length > 0) && (
        <div className="py-4">
          <button
            type="button"
            onClick={() => setParticipantsOpen(o => !o)}
            className="flex w-full items-center justify-between mb-3 group"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-900">Event Participants</span>
            <svg
              className={`h-4 w-4 text-gray-900 transition-transform ${participantsOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {participantsOpen && <div className="grid grid-cols-2 gap-6">
            {/* Executives column */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-semibold text-gray-800">Executives</span>
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                  {execParticipants.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {execParticipants.map((name) => {
                  const title = lookupTitle(name, executives)
                  return (
                    <div key={name}>
                      <p className="text-xs font-medium text-gray-900">{name}</p>
                      {title && <p className="text-[11px] text-gray-400">{title}</p>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Analysts column */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-semibold text-gray-800">Analysts</span>
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                  {analystParticipants.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {analystParticipants.map((name) => {
                  const firm = lookupFirm(name, analystFirms)
                  return (
                    <div key={name}>
                      <p className="text-xs font-medium text-gray-900">{name}</p>
                      {firm && <p className="text-[11px] text-gray-400">{firm}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>}
        </div>
      )}

      {/* ── Executive Commentary ─────────────────────────────────────────── */}
      {execSegments.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => setExecOpen(o => !o)}
            className="flex w-full items-center justify-between mb-3"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-900">
              Executive Commentary
            </span>
            <svg
              className={`h-4 w-4 text-gray-900 transition-transform ${execOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {execOpen && (
            <div className="space-y-5">
              {execSegments.map((seg, i) => (
                <SegmentRow key={i} seg={seg} executives={executives} analystFirms={analystFirms} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Q&A ──────────────────────────────────────────────────────────── */}
      {qaSegments.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <button
            type="button"
            onClick={() => setQaOpen(o => !o)}
            className="flex w-full items-center justify-between mb-3"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-900">
              Q&amp;A
            </span>
            <svg
              className={`h-4 w-4 text-gray-900 transition-transform ${qaOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {qaOpen && (
            <div className="max-h-[560px] overflow-y-auto space-y-5 pr-1">
              {qaSegments.map((seg, i) => (
                <SegmentRow key={i} seg={seg} executives={executives} analystFirms={analystFirms} />
              ))}
            </div>
          )}
        </div>
      )}

      {segments.length === 0 && (
        <p className="mt-4 text-xs text-gray-400">Unable to parse transcript content.</p>
      )}
    </div>
  )
}
