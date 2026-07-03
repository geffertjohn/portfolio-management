import { useLayoutEffect, useRef } from 'react'

/**
 * A textarea that grows to fit its content — so long text is fully visible instead of
 * clipped inside a fixed-height box with an inner scrollbar. A CSS `min-h-*` on the
 * passed className sets the empty-state floor. Re-measures on value change + window resize.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  maxHeightPx,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  /** Cap the grown height; content beyond it scrolls instead of expanding. */
  maxHeightPx?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const resize = () => {
      el.style.height = 'auto'
      const full = el.scrollHeight
      const capped = maxHeightPx != null ? Math.min(full, maxHeightPx) : full
      el.style.height = `${capped}px`
      el.style.overflowY = maxHeightPx != null && full > maxHeightPx ? 'auto' : 'hidden'
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [value, maxHeightPx])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={className}
    />
  )
}
