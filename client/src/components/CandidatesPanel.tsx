import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCandidates, createCandidate, ADDITION_STAGES,
  DECISION_LABELS, DECISION_BADGE,
} from '@/lib/securityAdditions'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'

export function CandidatesPanel({ portfolioId }: { portfolioId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [ticker, setTicker] = useState('')

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.securityAdditions(portfolioId),
    queryFn: () => fetchCandidates(portfolioId),
  })

  const startMut = useMutation({
    mutationFn: () => createCandidate(portfolioId, ticker),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securityAdditions(portfolioId) })
      setTicker('')
      navigate(`/portfolio/${encodeURIComponent(portfolioId)}/candidate/${id}`)
    },
  })

  const open = (id: number) => navigate(`/portfolio/${encodeURIComponent(portfolioId)}/candidate/${id}`)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">New Security Candidate</h2>
        <p className="mt-1 text-xs text-gray-400">
          Research → portfolio fit → approval → sizing → purchase → monitoring. Stocks only.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (ticker.trim()) startMut.mutate() }}
          className="mt-4 flex items-center gap-2"
        >
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker (e.g. NVDA)"
            className="w-44 rounded-md border border-gray-300 px-3 py-2 text-sm uppercase placeholder:normal-case placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <button
            type="submit"
            disabled={!ticker.trim() || startMut.isPending}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {startMut.isPending ? 'Starting…' : 'Start research'}
          </button>
        </form>
        {startMut.isError && (
          <p className="mt-2 text-sm text-red-600">
            {startMut.error instanceof Error ? startMut.error.message : 'Failed to start'}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Candidates</h2>
        <div className="mt-4">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : candidates.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-500">No candidates yet.</p>
              <p className="mt-1 text-xs text-gray-400">Enter a ticker above to start the research workflow.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
              {candidates.map((c) => {
                const done = (c.checklist ?? []).filter((it) => it.done).length
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => open(c.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">{c.security_id}</span>
                        {c.status === 'draft'
                          ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Draft</span>
                          : <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Completed</span>}
                        {c.decision && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DECISION_BADGE[c.decision]}`}>{DECISION_LABELS[c.decision]}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{done}/{ADDITION_STAGES.length} stages</span>
                        <span>{formatDate(c.updated_at)}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
