import { fmtNum } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'

// ── Shared grid renderer ──────────────────────────────────────────────────────

function StyleGrid({
  cells,
}: {
  cells: (number | null)[][]
}) {
  return (
    <div className="inline-block">
      <div className="overflow-hidden rounded border border-gray-300">
        {cells.map((row, ri) => (
          <div
            key={ri}
            className={`flex ${ri > 0 ? 'border-t border-gray-300' : ''}`}
          >
            {row.map((v, ci) => (
              <div
                key={ci}
                className={[
                  'flex h-[52px] w-[52px] items-center justify-center bg-white',
                  ci > 0 ? 'border-l border-gray-300' : '',
                ].join(' ')}
              >
                {v !== null ? (
                  <span className="text-[10px] font-medium tabular-nums text-gray-500">
                    {v.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-200">—</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Equity Style Box ──────────────────────────────────────────────────────────

const EQ_KEYS: (keyof SecurityDetail)[][] = [
  ['equity_stylebox_large_cap_value_exposure', 'equity_stylebox_large_cap_blend_exposure', 'equity_stylebox_large_cap_growth_exposure'],
  ['equity_stylebox_mid_cap_value_exposure',   'equity_stylebox_mid_cap_blend_exposure',   'equity_stylebox_mid_cap_growth_exposure'  ],
  ['equity_stylebox_small_cap_value_exposure', 'equity_stylebox_small_cap_blend_exposure', 'equity_stylebox_small_cap_growth_exposure'],
]

export function EquityStyleBox({ security }: { security: SecurityDetail }) {
  const cells = EQ_KEYS.map((row) =>
    row.map((key) => {
      const v = security[key]
      return typeof v === 'number' && Number.isFinite(v) ? v * 100 : null
    }),
  )

  const hasData = cells.flat().some((v) => v !== null)
  if (!hasData) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
        Equity style box
      </p>
      <StyleGrid cells={cells} />
    </div>
  )
}

// ── Fixed Income Style Box ────────────────────────────────────────────────────

/** Duration thresholds (years) matching Morningstar's Ltd / Mod / Ext buckets. */
const DUR_BREAKPOINTS = [3.5, 6] as const

function durationCol(years: number | null): number {
  if (years === null) return -1
  if (years < DUR_BREAKPOINTS[0]) return 0
  if (years < DUR_BREAKPOINTS[1]) return 1
  return 2
}

export function FixedIncomeStyleBox({ security }: { security: SecurityDetail }) {
  const high =
    ((security.aaa_bond_exposure_generic ?? 0) + (security.aa_bond_exposure_generic ?? 0)) * 100
  const medium =
    ((security.a_bond_exposure_generic ?? 0) + (security.bbb_bond_exposure_generic ?? 0)) * 100
  const low =
    ((security.bb_bond_exposure_generic ?? 0) +
    (security.b_bond_exposure_generic ?? 0) +
    (security.below_b_bond_exposure_generic ?? 0)) * 100

  const hasQuality =
    security.aaa_bond_exposure_generic !== null ||
    security.aa_bond_exposure_generic !== null ||
    security.a_bond_exposure_generic !== null ||
    security.bbb_bond_exposure_generic !== null ||
    security.bb_bond_exposure_generic !== null ||
    security.b_bond_exposure_generic !== null ||
    security.below_b_bond_exposure_generic !== null

  const col = durationCol(security.effective_duration)
  const hasPosition = hasQuality && col !== -1

  if (!hasQuality && col === -1) return null

  // Populate the duration column with High / Medium / Low quality percentages
  const cells: (number | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null))
  if (hasPosition) {
    cells[0][col] = high
    cells[1][col] = medium
    cells[2][col] = low
  }

  const qualityRows: { label: string; pct: number }[] = [
    { label: 'High (AAA/AA)', pct: high },
    { label: 'Medium (A/BBB)', pct: medium },
    { label: 'Low (BB and below)', pct: low },
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
        Fixed income style box
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {hasPosition ? (
          <StyleGrid cells={cells} />
        ) : (
          <div className="flex flex-col gap-1 text-xs text-gray-400">
            {!hasQuality && <p>No credit quality data</p>}
            {col === -1 && <p>No duration data</p>}
          </div>
        )}

        {/* Quality breakdown */}
        {hasQuality && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Credit quality
            </p>
            {qualityRows.map(({ label, pct }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-24 text-[11px] text-gray-500">{label}</div>
                <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gray-400"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[11px] tabular-nums text-gray-600">
                  {pct.toFixed(1)}%
                </span>
              </div>
            ))}
            {security.effective_duration !== null && (
              <p className="pt-1 text-[11px] text-gray-400">
                Eff. duration:{' '}
                <span className="font-medium text-gray-600">
                  {fmtNum(security.effective_duration)} yrs
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
