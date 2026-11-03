import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BENCHMARK_CHANGED_EVENT, announceBenchmarkChange, isRelevantChange, onBenchmarkChange,
} from '../benchmarkSelection'

/**
 * The contract that was dead for three weeks. The dispatch and the database
 * write both sat behind `if (security.id)`, and the only component that could
 * dispatch renders on a page whose synthetic security has `id: 0` — so the
 * listener never fired once. These lock the split: announcing is not saving.
 */

// `environment: 'node'` has no window; the module only needs the event target.
const listeners = new Map<string, Set<EventListener>>()
const win = {
  addEventListener: (t: string, l: EventListener) => {
    if (!listeners.has(t)) listeners.set(t, new Set())
    listeners.get(t)!.add(l)
  },
  removeEventListener: (t: string, l: EventListener) => listeners.get(t)?.delete(l),
  dispatchEvent: (e: Event) => {
    listeners.get(e.type)?.forEach((l) => l(e))
    return true
  },
}
vi.stubGlobal('window', win)
vi.stubGlobal('CustomEvent', class <T> extends Event {
  detail: T
  constructor(type: string, init?: { detail: T }) { super(type); this.detail = init!.detail }
})

afterEach(() => listeners.clear())

describe('announce / subscribe', () => {
  it('delivers a selection to every subscriber', () => {
    const a = vi.fn(); const b = vi.fn()
    onBenchmarkChange(a); onBenchmarkChange(b)
    announceBenchmarkChange({ securityId: 52, bench1Id: 288, bench2Id: 82 })
    expect(a).toHaveBeenCalledWith({ securityId: 52, bench1Id: 288, bench2Id: 82 })
    expect(b).toHaveBeenCalledTimes(1)
  })

  /**
   * The whole point of the split. The Research page saves nothing by design,
   * but its two panels still have to agree with each other — so a selection on
   * the synthetic `id: 0` security must still be announced.
   */
  it('announces for the synthetic security too', () => {
    const seen = vi.fn()
    onBenchmarkChange(seen)
    announceBenchmarkChange({ securityId: 0, bench1Id: 290, bench2Id: null })
    expect(seen).toHaveBeenCalledWith({ securityId: 0, bench1Id: 290, bench2Id: null })
  })

  it('carries a cleared slot as null, not as absent', () => {
    const seen = vi.fn()
    onBenchmarkChange(seen)
    announceBenchmarkChange({ securityId: 52, bench1Id: null, bench2Id: null })
    expect(seen.mock.calls[0][0]).toEqual({ securityId: 52, bench1Id: null, bench2Id: null })
  })

  it('stops delivering once unsubscribed', () => {
    const seen = vi.fn()
    onBenchmarkChange(seen)()
    announceBenchmarkChange({ securityId: 52, bench1Id: 1, bench2Id: 2 })
    expect(seen).not.toHaveBeenCalled()
  })

  it('names the event once, so the two halves cannot drift apart', () => {
    expect(BENCHMARK_CHANGED_EVENT).toBe('benchmark-changed')
  })
})

describe('isRelevantChange', () => {
  const cur = { bench1Id: 288, bench2Id: 82 }

  it('ignores a selection for a different security', () => {
    expect(isRelevantChange({ securityId: 99, bench1Id: 1, bench2Id: 2 }, 52, cur)).toBe(false)
  })

  it('ignores an echo of what is already selected', () => {
    // A view announcing its own change hears it back; re-setting identical
    // state would re-render for nothing.
    expect(isRelevantChange({ securityId: 52, ...cur }, 52, cur)).toBe(false)
  })

  it('accepts a change to either slot', () => {
    expect(isRelevantChange({ securityId: 52, bench1Id: 290, bench2Id: 82 }, 52, cur)).toBe(true)
    expect(isRelevantChange({ securityId: 52, bench1Id: 288, bench2Id: 86 }, 52, cur)).toBe(true)
  })

  it('treats clearing a slot as a change', () => {
    expect(isRelevantChange({ securityId: 52, bench1Id: null, bench2Id: 82 }, 52, cur)).toBe(true)
  })
})
