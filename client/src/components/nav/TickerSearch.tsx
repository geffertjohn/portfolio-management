import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchSecurities, type SecuritySearchResult } from '@/lib/securities'
import { QUERY_KEYS } from '@/hooks/queryKeys'

export function TickerSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const trimmed = query.trim()

  // Prefix search on security_id — TanStack handles staleness/cancellation
  const { data: results = [] } = useQuery({
    queryKey: QUERY_KEYS.securitySearch(trimmed.toUpperCase()),
    queryFn: () => searchSecurities(trimmed),
    enabled: !!trimmed,
  })

  // Open the dropdown whenever there are results for the current query
  useEffect(() => {
    setOpen(results.length > 0)
  }, [results])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Close and clear on navigation
  useEffect(() => { setQuery(''); setOpen(false) }, [location.pathname])

  function select(r: SecuritySearchResult) {
    setQuery('')
    setOpen(false)
    navigate(`/security/${r.id}`)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors ${
        focused ? 'border-gray-400 bg-white' : 'border-gray-200 bg-gray-50'
      }`}>
        <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) select(results[0])
            if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur() }
          }}
          placeholder="Search ticker…"
          className="w-32 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 top-full z-[100] mt-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); select(r) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              <span className="w-20 shrink-0 text-sm font-semibold text-gray-900">{r.security_id}</span>
              {r.security_name && (
                <span className="truncate text-sm text-gray-500">{r.security_name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
