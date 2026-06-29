import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SecurityDetail } from '@/lib/securities'
import { StockScorecardPanels } from '@/components/StockScorecardPanels'
import { StockReturnTable } from '@/components/StockReturnTable'
import { AnalystSummaryCards } from '@/components/AnalystSummaryCards'
import { NewsAlertsPanel } from '@/components/NewsAlertsPanel'
import { FinancialsSection } from '@/components/FinancialsSection'
import { TranscriptViewer } from '@/components/TranscriptViewer'
import { useLatestTranscript } from '@/hooks/useTranscript'
import { fetchKeyExecutives } from '@/lib/fmpTranscripts'
import { fetchEarningsDates, fetchProfile } from '@/lib/fmpMarket'
import { fetchAnalystData } from '@/lib/fmpAnalyst'
import { QUERY_KEYS } from '@/hooks/queryKeys'

/**
 * Builds a minimal SecurityDetail-shaped object from a ticker symbol so the
 * existing stock-detail components (Scorecard, Total Performance, Analysts,
 * News, Financials) can be reused on the Research page. Those components fetch
 * everything on-demand from FMP keyed on `security_id`; the only other fields
 * they read are `id` (used to gate Supabase benchmark saves — kept 0 here so
 * nothing persists) and the `preferred_benchmark*_id` defaults. The double
 * cast is the sanctioned escape hatch for this synthetic, non-persisted row.
 */
function buildResearchSecurity(symbol: string, name: string | null): SecurityDetail {
  return {
    id: 0,
    security_id: symbol,
    security_name: name,
    preferred_benchmark1_id: null,
    preferred_benchmark2_id: null,
  } as unknown as SecurityDetail
}

export function ResearchPage() {
  const [draft, setDraft] = useState('')
  const [symbol, setSymbol] = useState<string | null>(null)
  const [financialsOpen, setFinancialsOpen] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = draft.trim().toUpperCase()
    setSymbol(t || null)
  }

  // ── Identity / header — live from FMP, never persisted ──────────────────────
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.profile(symbol ?? ''),
    queryFn: () => fetchProfile(symbol!),
    enabled: !!symbol,
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
  })
  const { data: earningsDates } = useQuery({
    queryKey: QUERY_KEYS.earningsDates(symbol ?? ''),
    queryFn: () => fetchEarningsDates(symbol!),
    enabled: !!symbol,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const { data: analystData } = useQuery({
    queryKey: QUERY_KEYS.analystData(symbol ?? ''),
    queryFn: () => fetchAnalystData(symbol!),
    enabled: !!symbol,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const { data: executives } = useQuery({
    queryKey: QUERY_KEYS.keyExecutives(symbol ?? ''),
    queryFn: () => fetchKeyExecutives(symbol!),
    enabled: !!symbol,
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
  })
  const { data: transcript, isLoading: transcriptLoading } = useLatestTranscript(symbol)

  const companyName = profile?.companyName ?? null
  const description = profile?.description ?? null
  const sector = profile?.sector ?? null
  const industry = profile?.industry ?? null
  const nextEarnings = earningsDates?.nextEarnings ?? null
  const consensusLabel = analystData?.grades?.consensus ?? null

  // Stable synthetic security for the reused stock components.
  const security = useMemo(
    () => (symbol ? buildResearchSecurity(symbol, companyName) : null),
    [symbol, companyName],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Research</h1>
        <p className="mt-1 text-sm text-gray-600">
          Research any stock on-demand from FMP — nothing is saved.
        </p>
      </div>

      {/* ── Ticker search ──────────────────────────────────────────────────── */}
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter a ticker (e.g. AAPL)…"
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm uppercase text-gray-900 shadow-sm placeholder:normal-case placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <button
          type="submit"
          className="rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Research
        </button>
      </form>

      {!security ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-500">
          Enter a ticker symbol above to begin researching.
        </div>
      ) : (
        <>
          {/* ── Header card ──────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                {security.security_id}
              </h2>
              {companyName && <p className="text-base text-gray-600">{companyName}</p>}
            </div>

            {description && <p className="mt-2 text-sm text-gray-700">{description}</p>}

            <dl className="mt-5">
              <div className="-mx-1 overflow-x-auto px-1">
                <div className="grid min-w-[32rem] grid-cols-4 gap-4 sm:min-w-0 sm:w-full">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Sector
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{sector ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Industry
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{industry ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Next Earnings
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {nextEarnings
                        ? new Date(nextEarnings + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Consensus
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{consensusLabel ?? '—'}</dd>
                  </div>
                </div>
              </div>
            </dl>
          </div>

          {/* ── Analysts ─────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Analysts</h2>
            <div className="mt-6">
              <AnalystSummaryCards security={security} />
            </div>
          </div>

          {/* ── Scorecard ────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Scorecard</h2>
            <div className="mt-6">
              <StockScorecardPanels security={security} />
            </div>
          </div>

          {/* ── Total Returns ────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <StockReturnTable security={security} />
          </div>

          {/* ── News ─────────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">News</h2>
            <NewsAlertsPanel security={security} />
          </div>

          {/* ── Transcripts | Financials (moved from Research tab) ────────── */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-900">Transcripts</h2>

              {transcriptLoading && <p className="text-sm text-gray-400">Loading transcript…</p>}

              {!transcriptLoading && !transcript && (
                <p className="text-sm text-gray-400">No transcript available.</p>
              )}

              {!transcriptLoading && transcript && (
                <TranscriptViewer
                  transcript={transcript}
                  companyName={companyName}
                  executives={executives ?? []}
                />
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <button
                type="button"
                onClick={() => setFinancialsOpen((o) => !o)}
                className="flex w-full items-center justify-between"
              >
                <h2 className="text-base font-semibold text-gray-900">Financials</h2>
                <svg
                  className={`h-4 w-4 text-gray-900 transition-transform ${financialsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {financialsOpen && (
                <div className="mt-6">
                  <FinancialsSection security={security} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
