import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ASSET_CLASS_ROWS } from '@/lib/modelPortfolios'
import {
  fetchStrategicVintages, diffVintages, findLastChange,
  bandTotal, STRATEGIC_PROFILES, PROFILE_LABELS, EQUITY_KEYS, FIXED_INCOME_KEYS,
  type StrategicVintage, type WeightChange, type LastChange,
} from '@/lib/strategicAllocation'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fmtUtcLongDate } from '@/lib/formatters'
import { UploadStrategicAllocationModal } from './UploadStrategicAllocationModal'

/**
 * The firm's published Strategic Asset Allocation Models.
 *
 * Two things on one card: the published table for the selected vintage, and
 * what moved since the vintage before it.
 *
 * It carried a third — a read-only report of where `model_portfolio_data` no
 * longer matched the newest document — which was removed on request in Nov
 * 2026, along with the comparison that fed it. Nothing here has ever written a
 * model target, and that has not changed; the record is now simply a record.
 */
export function StrategicAllocationSection() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: vintages = [], isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEYS.strategicAllocationVintages,
    queryFn: fetchStrategicVintages,
  })
  // Newest BY PRINTED MONTH — fetchStrategicVintages orders on that, not on
  // upload time, so an older document uploaded later cannot become "current".
  const selected: StrategicVintage | null =
    vintages.find((v) => v.id === selectedId) ?? vintages[0] ?? null
  const selectedIndex = selected ? vintages.findIndex((v) => v.id === selected.id) : -1
  const previous = selectedIndex >= 0 ? vintages[selectedIndex + 1] ?? null : null
  const isNewest = selectedIndex === 0

  const changes = useMemo(
    () => (selected ? diffVintages(previous?.weights ?? null, selected.weights) : []),
    [selected, previous],
  )

  // Looking back FROM the selected vintage, not from the newest — viewing an
  // older document should not report a change that had not happened yet.
  const lastChange = useMemo(
    () => (selectedIndex >= 0 ? findLastChange(vintages, selectedIndex) : null),
    [vintages, selectedIndex],
  )

  return (
    <section>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Strategic Asset Allocation</h2>
          <p className="mt-1 text-sm text-gray-500">
            The firm&rsquo;s published model allocations. Upload each new document; the table
            and the change notes follow it, and the model portfolios are checked against it.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="shrink-0 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Upload PDF
        </button>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load the published allocations — {(error as Error)?.message ?? 'unknown error'}
        </div>
      )}

      {!isLoading && !isError && vintages.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
          No allocation document uploaded yet. Click &ldquo;Upload PDF&rdquo; to add one.
        </div>
      )}

      {selected && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Vintage selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Published
              </label>
              <select
                value={selected.id}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                {vintages.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    {v.label}{i === 0 ? ' — current' : ''}
                  </option>
                ))}
              </select>
              {!isNewest && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Superseded
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Uploaded {fmtUtcLongDate(selected.uploadedAt)}
              {selected.sourceFileName ? ` · ${selected.sourceFileName}` : ''}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="px-4 py-2 text-left font-semibold">Current Positioning</th>
                  {STRATEGIC_PROFILES.map((p) => (
                    <th key={p} className="px-3 py-2 text-right font-semibold">
                      {PROFILE_LABELS[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <BandRow label="EQUITY" tone="equity" values={STRATEGIC_PROFILES.map((p) => bandTotal(selected.weights, p, 'equity'))} />
                {ASSET_CLASS_ROWS.filter((r) => EQUITY_KEYS.includes(r.key)).map((row) => (
                  <LeafRow key={row.key} label={row.label} values={STRATEGIC_PROFILES.map((p) => selected.weights[p]?.[row.key] ?? null)} />
                ))}

                <BandRow label="FIXED INCOME" tone="fixed" values={STRATEGIC_PROFILES.map((p) => bandTotal(selected.weights, p, 'fixed_income'))} />
                {ASSET_CLASS_ROWS.filter((r) => FIXED_INCOME_KEYS.includes(r.key)).map((row) => (
                  <LeafRow key={row.key} label={row.label} values={STRATEGIC_PROFILES.map((p) => selected.weights[p]?.[row.key] ?? null)} />
                ))}

                {/* Banded in the document, but leaf rows carrying their own figure. */}
                <BandRow label="ALTERNATIVE INVESTMENTS / MANAGED FUTURES" tone="alts" values={STRATEGIC_PROFILES.map((p) => selected.weights[p]?.alternatives ?? null)} />
                <BandRow label="CASH & CASH ALTERNATIVES" tone="cash" values={STRATEGIC_PROFILES.map((p) => selected.weights[p]?.cash ?? null)} />
              </tbody>
            </table>
          </div>

          <ChangeNotes
            changes={changes}
            previousLabel={previous?.label ?? null}
            selectedLabel={selected.label}
            lastChange={lastChange}
          />
        </div>
      )}

      {uploadOpen && (
        <UploadStrategicAllocationModal
          existing={vintages}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </section>
  )
}

// ── Table rows ───────────────────────────────────────────────────────────────

const BAND_TONE: Record<string, string> = {
  equity: 'bg-[#4e7fa3] text-white',
  fixed:  'bg-[#6fb3ae] text-white',
  alts:   'bg-[#8f86b8] text-white',
  cash:   'bg-[#3f7a74] text-white',
}

function BandRow({ label, tone, values }: { label: string; tone: string; values: (number | null)[] }) {
  return (
    <tr className={BAND_TONE[tone]}>
      <th scope="row" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">
        {label}
      </th>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-2 text-right font-semibold tabular-nums">{pct(v)}</td>
      ))}
    </tr>
  )
}

function LeafRow({ label, values }: { label: string; values: (number | null)[] }) {
  return (
    <tr className="border-b border-gray-100 last:border-0 odd:bg-gray-50/60">
      <th scope="row" className="px-4 py-1.5 text-left font-normal text-gray-700">{label}</th>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-1.5 text-right tabular-nums text-gray-900">{pct(v)}</td>
      ))}
    </tr>
  )
}

/** A published 0% is a real figure; only a missing row shows an em-dash. */
function pct(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`
}

// ── Change notes ─────────────────────────────────────────────────────────────

/**
 * What moved at one vintage, grouped by profile.
 *
 * Grouped that way because it is how a reader asks the question — "what changed
 * in Growth?" — not "what happened to large-cap blend everywhere?". Shared by
 * the current-vintage notes and the Last changed disclosure so the two cannot
 * render the same facts differently.
 */
function ChangeList({ changes }: { changes: WeightChange[] }) {
  const byProfile = STRATEGIC_PROFILES
    .map((p) => ({ profile: p, rows: changes.filter((c) => c.profile === p) }))
    .filter((g) => g.rows.length > 0)

  return (
    <div className="space-y-2">
      {byProfile.map(({ profile, rows }) => (
        <div key={profile} className="text-sm">
          <p className="text-xs font-medium text-gray-700">{PROFILE_LABELS[profile]}</p>
          <ul className="mt-0.5 space-y-0.5">
            {rows.map((c) => (
              <li key={`${profile}-${c.label}`} className="flex items-baseline gap-2 text-xs text-gray-600">
                <span className="text-gray-500">{c.label}</span>
                <span className="tabular-nums">
                  {pct(c.from)} <span className="text-gray-400">&rarr;</span>{' '}
                  {/* Not green/red: an allocation moving up is not "good". */}
                  <span className="font-medium text-gray-900">{pct(c.to)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ChangeNotes({
  changes, previousLabel, selectedLabel, lastChange,
}: {
  changes: WeightChange[]
  previousLabel: string | null
  selectedLabel: string
  /**
   * The most recent vintage AT OR BEFORE this one where anything moved. Null
   * when nothing ever has.
   */
  lastChange: LastChange | null
}) {
  const [showLast, setShowLast] = useState(false)

  const headline = !previousLabel ? (
    <p className="px-4 py-3 text-xs text-gray-500">
      {selectedLabel} is the earliest document on file, so there is nothing to compare it against.
    </p>
  ) : changes.length === 0 ? (
    <p className="px-4 py-3 text-xs text-gray-500">
      <span className="font-medium text-gray-700">No changes</span> from {previousLabel}.
      Every published weight is unchanged.
    </p>
  ) : (
    <div className="px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Changes from {previousLabel} &middot; {changes.length} {changes.length === 1 ? 'weight' : 'weights'}
      </p>
      <div className="mt-2"><ChangeList changes={changes} /></div>
    </div>
  )

  /**
   * The disclosure is for the common case: these models go months without
   * moving, so "no changes from the last document" is usually the answer and
   * on its own says nothing about when they last did.
   *
   * Suppressed when the selected vintage IS the last change — the list above
   * is already that answer, and repeating it behind a toggle is noise.
   */
  const showDisclosure = lastChange !== null && lastChange.label !== selectedLabel

  return (
    <div className="border-t border-gray-100">
      {headline}
      {showDisclosure && (
        <div className="border-t border-gray-100">
          <button
            type="button"
            onClick={() => setShowLast((o) => !o)}
            aria-expanded={showLast}
            className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-gray-50"
          >
            <svg
              className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${showLast ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 5l5 5-5 5" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Last changed
            </span>
            <span className="text-xs font-medium text-gray-900">{lastChange.label}</span>
            <span className="text-xs text-gray-400">
              &middot; {lastChange.changes.length} {lastChange.changes.length === 1 ? 'weight' : 'weights'} from {lastChange.previousLabel}
            </span>
          </button>
          {showLast && (
            <div className="px-4 pb-3 pl-9">
              <ChangeList changes={lastChange.changes} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

