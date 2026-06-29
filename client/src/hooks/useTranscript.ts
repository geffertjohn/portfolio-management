import { useQuery } from '@tanstack/react-query'
import { fetchLatestTranscript } from '@/lib/fmpTranscripts'
import { QUERY_KEYS } from '@/hooks/queryKeys'

export function useLatestTranscript(securityId: string | null | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.transcript(securityId ?? ''),
    queryFn: () => fetchLatestTranscript(securityId!),
    enabled: !!securityId,
    staleTime: 1000 * 60 * 60 * 6,  // 6 hours — transcripts don't change
    retry: false,
  })
}
