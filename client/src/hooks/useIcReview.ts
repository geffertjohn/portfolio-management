import { useQuery } from '@tanstack/react-query'
import { fetchResearchReportsForAddition } from '@/lib/researchReports'
import { fetchRiskReportsForAddition } from '@/lib/riskReports'
import { fetchIcMemosForAddition } from '@/lib/icMemos'
import { QUERY_KEYS } from './queryKeys'

/**
 * The AI investment committee's deliverables for one new-buy candidate:
 * research reports (analyst + devil's advocate), the risk report, and the IC memo.
 * Read-only — the committee runs in Claude Code and persists here; the app views it.
 */
export function useIcReview(additionId: number, enabled = true) {
  const on = enabled && Number.isFinite(additionId)

  const research = useQuery({
    queryKey: QUERY_KEYS.researchReportsForAddition(additionId),
    queryFn: () => fetchResearchReportsForAddition(additionId),
    enabled: on,
  })
  const risk = useQuery({
    queryKey: QUERY_KEYS.riskReportsForAddition(additionId),
    queryFn: () => fetchRiskReportsForAddition(additionId),
    enabled: on,
  })
  const memos = useQuery({
    queryKey: QUERY_KEYS.icMemosForAddition(additionId),
    queryFn: () => fetchIcMemosForAddition(additionId),
    enabled: on,
  })

  return {
    research: research.data ?? [],
    risk: risk.data ?? [],
    memos: memos.data ?? [],
    isLoading: research.isLoading || risk.isLoading || memos.isLoading,
    isEmpty:
      (research.data?.length ?? 0) === 0 &&
      (risk.data?.length ?? 0) === 0 &&
      (memos.data?.length ?? 0) === 0,
  }
}
