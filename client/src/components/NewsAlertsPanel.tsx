/**
 * NewsAlertsPanel
 *
 * Two side-by-side feeds on the stock Overview tab:
 *   - News            — company-specific articles (FMP /news/stock)
 *   - Press Releases  — company-specific releases (FMP /news/press-releases)
 *
 * Both feeds are fetched on-demand per symbol and not persisted. (Alerts lives
 * in its own card under Analysts.)
 */
import { useQuery } from '@tanstack/react-query'
import type { SecurityDetail } from '@/lib/securities'
import { fetchStockNews, fetchPressReleases, type NewsItem } from '@/lib/fmpNews'
import { QUERY_KEYS } from '@/hooks/queryKeys'

function formatDate(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d.replace(' ', 'T'))
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function NewsFeed({ items, isLoading }: { items: NewsItem[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="mt-3 space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-3/4 rounded bg-gray-100" />
            <div className="h-3 w-32 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }
  if (!items || items.length === 0) {
    return <p className="mt-3 text-sm text-gray-400">No items.</p>
  }
  return (
    <ul className="mt-3 divide-y divide-gray-100">
      {items.map((item, i) => (
        <li key={item.url ?? i} className="py-3 first:pt-0">
          <p className="text-xs text-gray-400">
            {[item.publisher, formatDate(item.publishedDate)].filter(Boolean).join(' · ')}
          </p>
          <a
            href={item.url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
          >
            {item.title ?? 'Untitled'}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function NewsAlertsPanel({ security }: { security: SecurityDetail }) {
  const symbol = security.security_id

  const { data: news, isLoading: newsLoading } = useQuery({
    queryKey: QUERY_KEYS.stockNews(symbol),
    queryFn: () => fetchStockNews(symbol, 5),
    staleTime: 1000 * 60 * 30,
    retry: false,
  })

  const { data: pressReleases, isLoading: prLoading } = useQuery({
    queryKey: QUERY_KEYS.pressReleases(symbol),
    queryFn: () => fetchPressReleases(symbol, 5),
    staleTime: 1000 * 60 * 30,
    retry: false,
  })

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">News</h3>
          <NewsFeed items={news} isLoading={newsLoading} />
        </section>

        <section className="md:border-l md:border-gray-100 md:pl-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Press Releases</h3>
          <NewsFeed items={pressReleases} isLoading={prLoading} />
        </section>
      </div>
    </div>
  )
}
