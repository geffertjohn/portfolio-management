import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  fetchSubstitutionsByAtRisk,
  advanceSubstitutionStatus,
  SUBSTITUTION_STATUS_LABELS,
  SUBSTITUTION_STATUS_ORDER,
  type Substitution,
  type SubstitutionStatus,
} from '@/lib/substitutions'
import { fetchRelatedSecurities } from '@/lib/securities'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ExecuteSwapModal } from '@/components/ExecuteSwapModal'

interface SubstitutionsListProps {
  atRiskId: number
  securityStringId: string
}

const STATUS_COLORS: Record<SubstitutionStatus, string> = {
  proposed:     'bg-gray-100 text-gray-700',
  under_review: 'bg-blue-100 text-blue-700',
  approved:     'bg-green-100 text-green-700',
  swapped:      'bg-purple-100 text-purple-700',
  rejected:     'bg-red-100 text-red-700',
}

function nextStatus(current: SubstitutionStatus): SubstitutionStatus | null {
  const idx = SUBSTITUTION_STATUS_ORDER.indexOf(current)
  if (idx === -1 || idx === SUBSTITUTION_STATUS_ORDER.length - 1) return null
  return SUBSTITUTION_STATUS_ORDER[idx + 1]
}

export function SubstitutionsList({ atRiskId, securityStringId }: SubstitutionsListProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [swapSub, setSwapSub] = useState<Substitution | null>(null)

  const { data: subs = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.substitutions(atRiskId),
    queryFn: () => fetchSubstitutionsByAtRisk(atRiskId),
  })

  const { data: relatedSecurities = [] } = useQuery({
    queryKey: QUERY_KEYS.relatedSecurities(securityStringId),
    queryFn: () => fetchRelatedSecurities(securityStringId),
  })

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: SubstitutionStatus }) =>
      advanceSubstitutionStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.substitutions(atRiskId) }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => advanceSubstitutionStatus(id, 'rejected'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.substitutions(atRiskId) }),
  })

  if (isLoading) return <p className="py-3 text-sm text-gray-500">Loading substitutions…</p>

  const relatedSection = relatedSecurities.length > 0 ? (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-gray-400">Related:</span>
      {relatedSecurities.map((r) =>
        r.related_numeric_id != null ? (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/security/${r.related_numeric_id}`)}
            className="rounded-full bg-white border border-gray-200 px-2.5 py-0.5 font-mono text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            {r.related_id}
          </button>
        ) : (
          <span
            key={r.id}
            className="rounded-full bg-white border border-gray-200 px-2.5 py-0.5 font-mono text-xs font-medium text-gray-500"
          >
            {r.related_id}
          </span>
        )
      )}
    </div>
  ) : null

  if (subs.length === 0) {
    return (
      <>
        {relatedSection}
        <p className="py-1 text-sm text-gray-400 italic">No substitutions proposed yet.</p>
      </>
    )
  }

  return (
    <div className="space-y-3">
      {relatedSection}
      {subs.map((sub) => {
        const next = nextStatus(sub.status)
        const canAdvance = next !== null && sub.status !== 'rejected' && sub.status !== 'swapped'
        const canReject = sub.status !== 'rejected' && sub.status !== 'swapped'
        const isExecuteReady = sub.status === 'approved'

        return (
          <div key={sub.id} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {sub.proposed_symbol ?? `Security #${sub.proposed_security_id}`}
                  </span>
                  {sub.proposed_name && (
                    <span className="text-xs text-gray-500">{sub.proposed_name}</span>
                  )}
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[sub.status]}`}>
                    {SUBSTITUTION_STATUS_LABELS[sub.status]}
                  </span>
                </div>
                {sub.rationale && (
                  <p className="mt-1 text-xs text-gray-600">{sub.rationale}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Proposed {new Date(sub.created_at).toLocaleDateString()}
                  {sub.swapped_at && ` · Swapped ${new Date(sub.swapped_at).toLocaleDateString()}`}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {isExecuteReady && (
                  <button
                    type="button"
                    onClick={() => setSwapSub(sub)}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Execute Swap
                  </button>
                )}
                {canAdvance && !isExecuteReady && (
                  <button
                    type="button"
                    disabled={advanceMutation.isPending}
                    onClick={() => advanceMutation.mutate({ id: sub.id, status: next! })}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    → {SUBSTITUTION_STATUS_LABELS[next!]}
                  </button>
                )}
                {canReject && (
                  <button
                    type="button"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(sub.id)}
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {swapSub && (
        <ExecuteSwapModal
          open={swapSub !== null}
          onClose={() => setSwapSub(null)}
          substitution={swapSub}
          atRiskId={atRiskId}
        />
      )}
    </div>
  )
}
