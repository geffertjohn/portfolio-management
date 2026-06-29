import { useEffect, useRef, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const NAV_LINKS = [
  { to: '/', label: 'Home', exact: true },
  { to: '/actions', label: 'Actions', exact: false },
  { to: '/clients', label: 'Clients', exact: false },
]

const HOLDINGS_LINKS = [
  {
    to: '/portfolio',
    label: 'Portfolios',
    desc: 'View and manage model portfolios',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
      </svg>
    ),
  },
  {
    to: '/securities',
    label: 'Securities',
    desc: 'Browse and search securities',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    to: '/watchlist',
    label: 'Watchlist',
    desc: 'Buy candidates under consideration',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    ),
  },
  {
    to: '/at-risk',
    label: 'At-Risk',
    desc: 'Held securities flagged for replacement',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    to: '/index-movers',
    label: 'Index Movers',
    desc: 'Live gainers & losers by index',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" />
      </svg>
    ),
  },
  {
    to: '/reviews',
    label: 'Reviews',
    desc: 'Portfolio review calendar',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
]

const SETTINGS_LINKS = [
  {
    to: '/settings',
    label: 'Settings',
    desc: 'Defaults, preferences & firm info',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/settings/documents',
    label: 'Documents',
    desc: 'File & document library',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/settings/import-export',
    label: 'Import / Export',
    desc: 'Bulk CSV data operations',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
  {
    to: '/settings/compliance',
    label: 'Compliance',
    desc: 'Manage rules across all portfolios',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 10c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    to: '/settings/model-portfolios',
    label: 'Model Portfolios',
    desc: 'Asset class targets & allocations',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    to: '/settings/benchmarks',
    label: 'Benchmarks',
    desc: 'Manage benchmark definitions',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    to: '/settings/notifications',
    label: 'Notifications',
    desc: 'Alert delivery & email preferences',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    to: '/audit',
    label: 'Audit Log',
    desc: 'Change history across all records',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
]

interface SearchResult {
  id: number
  security_id: string
  security_name: string | null
}

function TickerSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Prefix search on security_id — cancel stale requests
  useEffect(() => {
    const q = query.trim().toUpperCase()
    if (!q) { setResults([]); setOpen(false); return }
    let cancelled = false
    supabase
      .from('securities2')
      .select('id, security_id, security_name')
      .ilike('security_id', `${q}%`)
      .order('security_id')
      .limit(10)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setResults([]); setOpen(false); return }
        const rows = (data ?? []) as SearchResult[]
        setResults(rows)
        setOpen(rows.length > 0)
      })
    return () => { cancelled = true }
  }, [query])

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

  function select(r: SearchResult) {
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

export function Layout() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [holdingsOpen, setHoldingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileHoldingsOpen, setMobileHoldingsOpen] = useState(false)
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false)
  const holdingsRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  function isActive(to: string, exact = false) {
    if (exact) return location.pathname === to
    return location.pathname.startsWith(to)
  }

  const holdingsIsActive = HOLDINGS_LINKS.some((l) => isActive(l.to))
  const settingsIsActive = SETTINGS_LINKS.some((l) => isActive(l.to))

  // Close dropdowns on outside click
  useEffect(() => {
    if (!holdingsOpen) return
    function handleClick(e: MouseEvent) {
      if (holdingsRef.current && !holdingsRef.current.contains(e.target as Node)) {
        setHoldingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [holdingsOpen])

  useEffect(() => {
    if (!settingsOpen) return
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [settingsOpen])

  // Close dropdowns on route change
  useEffect(() => { setHoldingsOpen(false); setSettingsOpen(false) }, [location.pathname])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="shrink-0 text-lg font-semibold text-gray-900 sm:text-xl">
            Portfolio Management
          </Link>

          {/* ── Desktop nav ─────────────────────────────── */}
          <nav className="hidden items-center gap-5 sm:flex">
            <TickerSearch />
            {NAV_LINKS.map(({ to, label, exact }) => (
              <Link
                key={to}
                to={to}
                className={`shrink-0 text-sm font-medium sm:text-base ${
                  isActive(to, exact) ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </Link>
            ))}

            {/* Holdings dropdown trigger */}
            <div ref={holdingsRef} className="relative">
              <button
                type="button"
                onClick={() => setHoldingsOpen((o) => !o)}
                className={`flex items-center gap-1 text-sm font-medium sm:text-base ${
                  holdingsIsActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Holdings
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${holdingsOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                </svg>
              </button>

              {holdingsOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {HOLDINGS_LINKS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 ${
                        isActive(item.to) ? 'bg-gray-50' : ''
                      }`}
                    >
                      <span className={`mt-0.5 shrink-0 ${isActive(item.to) ? 'text-gray-900' : 'text-gray-400'}`}>
                        {item.icon}
                      </span>
                      <div>
                        <p className={`text-sm font-medium ${isActive(item.to) ? 'text-gray-900' : 'text-gray-700'}`}>
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-400">{item.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Research link */}
            <Link
              to="/research"
              className={`shrink-0 text-sm font-medium sm:text-base ${
                isActive('/research') ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Research
            </Link>

            {/* Settings dropdown trigger */}
            <div ref={settingsRef} className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                className={`flex items-center gap-1 text-sm font-medium sm:text-base ${
                  settingsIsActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Settings
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                </svg>
              </button>

              {settingsOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {SETTINGS_LINKS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 ${
                        isActive(item.to, item.to === '/settings') ? 'bg-gray-50' : ''
                      }`}
                    >
                      <span className={`mt-0.5 shrink-0 ${
                        isActive(item.to, item.to === '/settings') ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        {item.icon}
                      </span>
                      <div>
                        <p className={`text-sm font-medium ${
                          isActive(item.to, item.to === '/settings') ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-400">{item.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* ── Mobile hamburger ────────────────────────── */}
          <button
            type="button"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 sm:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* ── Mobile drawer ───────────────────────────────── */}
        {mobileOpen && (
          <nav className="border-t border-gray-100 bg-white px-4 pb-4 pt-2 sm:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map(({ to, label, exact }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium ${
                    isActive(to, exact)
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {label}
                </Link>
              ))}

              {/* Holdings group in mobile */}
              <div>
                <button
                  type="button"
                  onClick={() => setMobileHoldingsOpen((o) => !o)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium ${
                    holdingsIsActive
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  Holdings
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${mobileHoldingsOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                  </svg>
                </button>
                {mobileHoldingsOpen && (
                  <div className="ml-3 mt-1 flex flex-col gap-1 border-l-2 border-gray-100 pl-3">
                    {HOLDINGS_LINKS.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                          isActive(item.to) ? 'font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className="text-gray-400">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Research link in mobile */}
              <Link
                to="/research"
                onClick={() => setMobileOpen(false)}
                className={`rounded-md px-3 py-2.5 text-sm font-medium ${
                  isActive('/research')
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                Research
              </Link>

              {/* Settings group in mobile */}
              <div>
                <button
                  type="button"
                  onClick={() => setMobileSettingsOpen((o) => !o)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium ${
                    settingsIsActive
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  Settings
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${mobileSettingsOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                  </svg>
                </button>
                {mobileSettingsOpen && (
                  <div className="ml-3 mt-1 flex flex-col gap-1 border-l-2 border-gray-100 pl-3">
                    {SETTINGS_LINKS.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                          isActive(item.to, item.to === '/settings')
                            ? 'font-medium text-gray-900'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className="text-gray-400">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
