/**
 * EarningsCallSummaryPanel
 *
 * The committee's read of one earnings call, rendered beside the transcript it
 * was written from: sentiment and the guidance given on the call in the left
 * column, highlights/lowlights behind a toggle in the right.
 *
 * The toggle is deliberate rather than two stacked lists. A call usually has
 * more of one than the other — Micron's Q4 2026 ran three highlights to four
 * lowlights — and stacking them makes the longer list look like the verdict.
 * One at a time keeps the balance a judgement (the sentiment line) rather than
 * an artefact of counting.
 */
import { useState } from 'react'
import type { CallPoint, CallSentiment, EarningsCallSummary } from '@/lib/earningsCallSummaries'
import { EMPTY } from '@/lib/formatters'

const SENTIMENT: Record<CallSentiment, { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'text-green-600' },
  neutral: { label: 'Neutral', className: 'text-gray-600' },
  negative: { label: 'Negative', className: 'text-red-600' },
}

function fmtCallDate(iso: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function PointList({ points, positive }: { points: CallPoint[]; positive: boolean }) {
  if (points.length === 0) {
    return (
      <p className="mt-3 text-sm italic text-gray-400">
        None recorded for this call.
      </p>
    )
  }
  return (
    <ul className="mt-3 space-y-4">
      {points.map((p, i) => (
        <li key={`${p.title}-${i}`}>
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                positive ? 'bg-green-500' : 'bg-red-500'
              }`}
            >
              {positive ? '✓' : '✕'}
            </span>
            <h5 className="text-sm font-semibold text-gray-900">{p.title}</h5>
          </div>
          {p.detail && (
            <p className="mt-1 pl-6 text-sm leading-relaxed text-gray-700">{p.detail}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

export function EarningsCallSummaryPanel({ summary }: { summary: EarningsCallSummary }) {
  const [tab, setTab] = useState<'highlights' | 'lowlights'>('highlights')
  const sentiment = SENTIMENT[summary.sentiment]

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-900">
            Q{summary.quarter} {summary.fiscalYear}
          </h4>
          {summary.status === 'draft' && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700">
              Draft
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Earnings call date: <span className="font-medium text-gray-700">{fmtCallDate(summary.callDate)}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
        {/* Left — the read and what management said about the future. */}
        <div className="space-y-4">
          <div>
            <h5 className="text-sm font-semibold text-gray-900">
              Earnings Call Sentiment{' '}
              <span className="text-gray-300">|</span>{' '}
              <span className={sentiment.className}>{sentiment.label}</span>
            </h5>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {summary.sentimentSummary}
            </p>
          </div>

          <div>
            <h5 className="text-sm font-semibold text-gray-900">Company Guidance</h5>
            {summary.guidance ? (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {summary.guidance}
              </p>
            ) : (
              <p className="mt-1 text-sm italic text-gray-400">
                No forward guidance was given on this call.
              </p>
            )}
          </div>
        </div>

        {/* Right — what went well and what did not, one list at a time. */}
        <div>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {(['highlights', 'lowlights'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t} ({t === 'highlights' ? summary.highlights.length : summary.lowlights.length})
              </button>
            ))}
          </div>
          {tab === 'highlights' ? (
            <PointList points={summary.highlights} positive />
          ) : (
            <PointList points={summary.lowlights} positive={false} />
          )}
        </div>
      </div>
    </div>
  )
}
