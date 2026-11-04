import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { NAV_LINKS, HOLDINGS_LINKS, SETTINGS_LINKS } from './nav/navLinks'
import { NavDropdown, MobileNavGroup } from './nav/NavDropdown'
import { TickerSearch } from './nav/TickerSearch'

export function Layout() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  function isActive(to: string, exact = false) {
    if (exact) return location.pathname === to
    return location.pathname.startsWith(to)
  }


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

            <NavDropdown label="Holdings" links={HOLDINGS_LINKS} align="left" isActive={isActive} />

            {/* Research link */}
            <Link
              to="/research"
              className={`shrink-0 text-sm font-medium sm:text-base ${
                isActive('/research') ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Research
            </Link>

            <NavDropdown label="Settings" links={SETTINGS_LINKS} align="right" isActive={isActive} />
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

              <MobileNavGroup label="Holdings" links={HOLDINGS_LINKS} isActive={isActive}
                onNavigate={() => setMobileOpen(false)} />

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

              <MobileNavGroup label="Settings" links={SETTINGS_LINKS} isActive={isActive}
                onNavigate={() => setMobileOpen(false)} />
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
