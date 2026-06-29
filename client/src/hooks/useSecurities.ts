import { useQuery } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { QUERY_KEYS } from './queryKeys'

export function useSecurities() {
  return useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
  })
}
