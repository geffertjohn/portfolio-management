import { useQuery } from '@tanstack/react-query'
import { fetchSecurityById } from '@/lib/securities'
import { isValidId } from '@/lib/utils'
import { QUERY_KEYS } from './queryKeys'

export function useSecurityDetail(id: number) {
  return useQuery({
    queryKey: QUERY_KEYS.security(id),
    queryFn: () => fetchSecurityById(id),
    enabled: isValidId(id),
    staleTime: 1000 * 30, // 30 s — security metrics should stay fresh
  })
}
