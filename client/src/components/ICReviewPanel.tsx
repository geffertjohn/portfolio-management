import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useIcReview } from '@/hooks/useIcReview'
import { recordIcDecision, type IcDecision } from '@/lib/icMemos'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { MemoCard, ResearchCard, RiskCard } from '@/components/icReviewCards'

/**
 * Read-only view of the AI investment committee's deliverables for a new-buy
 * candidate — the IC memo, the analyst + devil's-advocate research reports, and the
 * risk report. The committee runs in Claude Code (see docs/ai-investment-team-charter.md)
 * and persists here. The one mutating action is the CIO's decision on a pending memo —
 * which records the call in ic_memos and never touches positions.
 */
export function ICReviewPanel({ additionId, ticker }: { additionId: number; ticker: string }) {
  const { research, risk, memos, isLoading, isEmpty } = useIcReview(additionId)
  const queryClient = useQueryClient()

  const decideMut = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: IcDecision }) =>
      recordIcDecision(id, decision, 'CIO'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.icMemosForAddition(additionId) })
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">IC Review · AI committee</h2>
        <p className="mt-1 text-xs text-gray-400">
          The Investment Committee (research analyst · devil's advocate · portfolio manager · risk manager)
          runs in Claude Code and persists its memo here. The CIO makes the final call below.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : isEmpty ? (
        <div className="rounded-md border border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">No committee output yet for {ticker}.</p>
          <p className="mt-1 text-xs text-gray-400">
            Run the new-buy Investment Committee (workflow <code className="rounded bg-gray-100 px-1">new-buy-ic-review</code>)
            to generate the research, risk, and IC memo for this candidate.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {memos.map((m) => (
            <MemoCard
              key={m.id}
              memo={m}
              deciding={decideMut.isPending}
              onDecision={(decision) => decideMut.mutate({ id: m.id, decision })}
            />
          ))}
          {research.map((r) => <ResearchCard key={r.id} r={r} />)}
          {risk.map((r) => <RiskCard key={r.id} r={r} />)}
          {decideMut.isError && (
            <p className="text-sm text-red-600">
              {decideMut.error instanceof Error ? decideMut.error.message : 'Failed to record decision'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
