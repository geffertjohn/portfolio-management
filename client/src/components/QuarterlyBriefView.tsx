/**
 * QuarterlyBriefView
 *
 * The quarterly brief on screen. Presentation only: it renders the same
 * `QuarterlyBrief` object the PDF renders, so what you read here is what you
 * hand over. Every decision about what the document contains lives in
 * `lib/quarterlyBrief.ts`.
 */
import type { QuarterlyBrief } from '@/lib/quarterlyBrief'
import {
  SENTIMENT_LABEL, THESIS_STATUS_LABEL, VIEW_STATUS_LABEL,
} from '@/lib/quarterlyBrief'
import type { CallPoint } from '@/lib/earningsCallSummaries'
import { EMPTY, fmtEstimate, fmtSignedPct } from '@/lib/formatters'

const SENTIMENT_CLASS: Record<string, string> = {
  positive: 'text-green-600',
  neutral: 'text-gray-600',
  negative: 'text-red-600',
}

const THESIS_CLASS: Record<string, string> = {
  intact: 'bg-green-100 text-green-800',
  at_risk: 'bg-amber-100 text-amber-800',
  broken: 'bg-red-100 text-red-800',
}

const VIEW_CLASS: Record<string, string> = {
  supported: 'text-green-700',
  mixed: 'text-amber-700',
  undermined: 'text-red-700',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function PointList({ items, positive }: { items: CallPoint[]; positive: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((p, i) => (
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
            <h4 className="text-sm font-semibold text-gray-900">{p.title}</h4>
          </div>
          {p.detail && <p className="mt-1 pl-6 text-sm leading-relaxed text-gray-700">{p.detail}</p>}
        </li>
      ))}
    </ul>
  )
}

export function QuarterlyBriefView({ brief: b }: { brief: QuarterlyBrief }) {
  return (
    <article className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <header className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Q{b.quarter} {b.fiscalYear} Quarterly Brief
        </h2>
        <p className="mt-0.5 text-sm text-gray-600">
          {b.ticker}
          {b.companyName ? ` — ${b.companyName}` : ''}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {b.callDate ? `Earnings call: ${b.callDate}` : 'Earnings call date not recorded'}
          {b.sentiment && (
            <>
              {' · '}Tone of the call:{' '}
              <span className={`font-medium ${SENTIMENT_CLASS[b.sentiment]}`}>
                {SENTIMENT_LABEL[b.sentiment]}
              </span>
            </>
          )}
        </p>
      </header>

      {b.headline && (
        <Section title="The quarter">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{b.headline}</p>
        </Section>
      )}

      {b.results.length > 0 && (
        <Section title="Results against expectations">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-4 text-left font-semibold">Metric</th>
                <th className="px-4 py-1.5 text-right font-semibold">Expected</th>
                {b.hasActuals && <th className="px-4 py-1.5 text-right font-semibold">Actual</th>}
                {b.hasActuals && <th className="pl-4 py-1.5 text-right font-semibold">Surprise</th>}
              </tr>
            </thead>
            <tbody>
              {b.results.map((r) => (
                <tr key={r.label} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-4 font-medium text-gray-900">{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                    {fmtEstimate(r.expected, r.unit)}
                  </td>
                  {b.hasActuals && (
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">
                      {fmtEstimate(r.actual, r.unit)}
                    </td>
                  )}
                  {b.hasActuals && (
                    <td
                      className={`py-2 pl-4 text-right tabular-nums ${
                        r.surprisePct == null
                          ? 'text-gray-400'
                          : r.surprisePct >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                      }`}
                    >
                      {r.surprisePct != null ? fmtSignedPct(r.surprisePct) : EMPTY}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {b.guidance && (
        <Section title="What management guided to">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{b.guidance}</p>
        </Section>
      )}

      {(b.highlights.length > 0 || b.lowlights.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {b.highlights.length > 0 && (
            <Section title={`Highlights (${b.highlights.length})`}>
              <PointList items={b.highlights} positive />
            </Section>
          )}
          {b.lowlights.length > 0 && (
            <Section title={`Lowlights (${b.lowlights.length})`}>
              <PointList items={b.lowlights} positive={false} />
            </Section>
          )}
        </div>
      )}

      {(b.thesisStatus || b.view.length > 0) && (
        <Section title="Our view">
          {b.thesisStatus && (
            <p className="mb-3 text-sm text-gray-700">
              Investment thesis:{' '}
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${THESIS_CLASS[b.thesisStatus]}`}>
                {THESIS_STATUS_LABEL[b.thesisStatus]}
              </span>
            </p>
          )}
          {b.view.length > 0 && (
            <ul className="space-y-3">
              {b.view.map((v, i) => (
                <li key={`${v.title}-${i}`} className="border-l-2 border-gray-200 pl-3">
                  <h4 className="text-sm font-semibold text-gray-900">
                    {v.title}
                    {v.status && v.status !== 'not_addressed' && (
                      <span className={`ml-2 text-xs font-medium ${VIEW_CLASS[v.status]}`}>
                        {VIEW_STATUS_LABEL[v.status]}
                      </span>
                    )}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-gray-700">{v.finding}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {b.sources.length > 0 && (
        <p className="border-t border-gray-100 pt-3 text-xs text-gray-400">
          Drawn from the {b.sources.join(', the ')}.
        </p>
      )}
    </article>
  )
}
