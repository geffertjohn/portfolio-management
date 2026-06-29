/**
 * fmpNews.ts
 *
 * On-demand company-specific news + press releases from FMP.
 *
 * Note: the `/news/stock-latest` and `/news/press-releases-latest` endpoints
 * return a GLOBAL feed and ignore a `symbols` filter. For company-specific
 * results use `/news/stock` and `/news/press-releases` with `symbols=`.
 */

import { FMP_STABLE, apiKey, fmpFetch, fmpSymbol, str } from './fmpClient'

export interface NewsItem {
  title: string | null
  text: string | null
  url: string | null
  publisher: string | null
  publishedDate: string | null
  image: string | null
  symbol: string | null
}

function mapItem(r: Record<string, unknown>): NewsItem {
  return {
    title: str(r.title),
    text: str(r.text),
    url: str(r.url),
    publisher: str(r.publisher) ?? str(r.site),
    publishedDate: str(r.publishedDate),
    image: str(r.image),
    symbol: str(r.symbol),
  }
}

async function fetchNewsFeed(path: string, symbol: string, limit: number): Promise<NewsItem[]> {
  const raw = await fmpFetch(`${FMP_STABLE}/${path}?symbols=${fmpSymbol(symbol)}&limit=${limit}&apikey=${apiKey()}`)
  return Array.isArray(raw)
    ? raw.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object').map(mapItem)
    : []
}

/** Company-specific news articles, newest first. */
export function fetchStockNews(symbol: string, limit = 12): Promise<NewsItem[]> {
  return fetchNewsFeed('news/stock', symbol, limit)
}

/** Company-specific press releases, newest first. */
export function fetchPressReleases(symbol: string, limit = 12): Promise<NewsItem[]> {
  return fetchNewsFeed('news/press-releases', symbol, limit)
}
