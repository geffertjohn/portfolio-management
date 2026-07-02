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
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const resize = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [value])

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
