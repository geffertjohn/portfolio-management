import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { NavGroupLink } from './navLinks'

/**
 * One desktop nav dropdown — the trigger, the panel, and the click-outside
 * that closes it.
 *
 * Holdings and Settings were two copies of this (audit §22): identical markup,
 * identical chevron, and **two identical `useEffect` click-outside listeners**
 * differing only in which ref and which state they closed. The open state and
 * the ref belong to the dropdown, not to the page, so they live here and
 * `Layout` no longer carries either.
 *
 * `align` is the one real difference: Holdings opens left under a left-hand
 * trigger, Settings right under the last item in the bar.
 */
export function NavDropdown({
  label,
  links,
  align,
  isActive,
}: {
  label: string
  links: NavGroupLink[]
  align: 'left' | 'right'
  /** The page's route matcher — `exact` matters for `/settings`, which is a prefix of every settings route. */
  isActive: (to: string, exact?: boolean) => boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  // Close on route change. `Layout` used to do this for both dropdowns at
  // once; it closes a panel left open when navigation happens some other way
  // (browser back, a link elsewhere on the page).
  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // `/settings` itself is a prefix of every settings route, so only it needs an
  // exact match; everything else is correctly active on its whole subtree.
  const activeFor = (to: string) => isActive(to, to === '/settings')
  const groupIsActive = links.some((l) => activeFor(l.to))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 text-sm font-medium sm:text-base ${
          groupIsActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg`}>
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 ${
                activeFor(item.to) ? 'bg-gray-50' : ''
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${activeFor(item.to) ? 'text-gray-900' : 'text-gray-400'}`}>
                {item.icon}
              </span>
              <div>
                <p className={`text-sm font-medium ${activeFor(item.to) ? 'text-gray-900' : 'text-gray-700'}`}>
                  {item.label}
                </p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The same group in the mobile sheet, as an accordion rather than a dropdown.
 *
 * A separate component rather than a mode on `NavDropdown`: the two differ in
 * nearly every class and in how they close (a dropdown closes on outside
 * click, an accordion row closes the whole sheet), and collapsing them behind
 * a flag would mean a component where no branch is ever both.
 */
export function MobileNavGroup({
  label,
  links,
  isActive,
  onNavigate,
}: {
  label: string
  links: NavGroupLink[]
  isActive: (to: string, exact?: boolean) => boolean
  /** Closes the mobile sheet — a tap inside it is still a navigation. */
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname])

  const activeFor = (to: string) => isActive(to, to === '/settings')
  const groupIsActive = links.some((l) => activeFor(l.to))

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium ${
          groupIsActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="ml-3 mt-1 flex flex-col gap-1 border-l-2 border-gray-100 pl-3">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                activeFor(item.to) ? 'font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-gray-400">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
