import React from 'react'
import { fmtDecimalPct } from '@/lib/formatters'
import { formatDate } from '@/lib/fundFormat'
import type { SecurityDetail } from '@/lib/securities'

// ── SVG Pie Chart ─────────────────────────────────────────────────────────────

type PieSlice = { label: string; value: number; color: string }

function PieChart({ slices }: { slices: PieSlice[] }) {
  const SIZE = 160
  const cx = SIZE / 2
  const cy = SIZE / 2
  const r = 68
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  if (total === 0) return null

  let angle = -Math.PI / 2
  const paths = slices
    .filter((sl) => sl.value > 0)
    .map((sl) => {
      const sweep = (sl.value / total) * 2 * Math.PI
      const x1 = cx + r * Math.cos(angle)
      const y1 = cy + r * Math.sin(angle)
      angle += sweep
      const x2 = cx + r * Math.cos(angle)
      const y2 = cy + r * Math.sin(angle)
      const largeArc = sweep > Math.PI ? 1 : 0
      return {
        d: `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
        color: sl.color,
        label: sl.label,
      }
    })

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-shrink-0">
      {paths.map((p) => (
        <path key={p.label} d={p.d} fill={p.color} />
      ))}
    </svg>
  )
}

// ── Stacked Vertical Bar ──────────────────────────────────────────────────────

type BarSegment = { label: string; value: number; color: string }

function StackedBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  return (
    <div className="flex h-52 w-10 flex-shrink-0 flex-col overflow-hidden rounded">
      {segments
        .filter((seg) => seg.value > 0)
        .map((seg) => (
          <div
            key={seg.label}
            style={{
              height: `${(seg.value / total) * 100}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}
    </div>
  )
}

// ── Horizontal Bar ────────────────────────────────────────────────────────────

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-4 w-full overflow-hidden rounded-sm bg-gray-100">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

// ── Bond Sector Exposure ──────────────────────────────────────────────────────

const SECTOR_ROWS = [
  { label: 'Government',  key: 'government_fixed_income_exposure_generic'   as const, color: '#6366f1' },
  { label: 'Corporate',   key: 'corporate_fixed_income_exposure_generic'    as const, color: '#fb923c' },
  { label: 'Securitized', key: 'securitized_fixed_income_exposure_generic'  as const, color: '#60a5fa' },
  { label: 'Municipal',   key: 'municipal_fixed_income_exposure_generic'    as const, color: '#86efac' },
  { label: 'Other',       key: 'other_fixed_income_exposure_generic'        as const, color: '#f472b6' },
]

function BondSectorExposure({ security }: { security: SecurityDetail }) {
  const slices = SECTOR_ROWS.map((r) => ({
    label: r.label,
    value: security[r.key] ?? 0,
    color: r.color,
  }))
  if (slices.every((s) => s.value === 0)) return null

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        Bond Sector Exposure
      </h3>
      <div className="flex flex-wrap items-center gap-8">
        <PieChart slices={slices} />
        <div className="min-w-[220px] flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Type
                </th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  % Net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SECTOR_ROWS.map((row) => (
                <tr key={row.label}>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="text-gray-700">{row.label}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-900">
                    {fmtDecimalPct(security[row.key] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Bond Credit Quality Exposure ──────────────────────────────────────────────

const QUALITY_ROWS = [
  { label: 'AAA',     key: 'aaa_bond_exposure_generic'    as const, color: '#4f46e5' },
  { label: 'AA',      key: 'aa_bond_exposure_generic'     as const, color: '#818cf8' },
  { label: 'A',       key: 'a_bond_exposure_generic'      as const, color: '#c7d2fe' },
  { label: 'BBB',     key: 'bbb_bond_exposure_generic'    as const, color: '#f97316' },
  { label: 'BB',      key: 'bb_bond_exposure_generic'     as const, color: '#fb923c' },
  { label: 'B',       key: 'b_bond_exposure_generic'      as const, color: '#fdba74' },
  { label: 'Below B', key: 'below_b_bond_exposure_generic' as const, color: '#60a5fa' },
]

function BondCreditQualityExposure({ security }: { security: SecurityDetail }) {
  const segments = QUALITY_ROWS.map((r) => ({
    label: r.label,
    value: security[r.key] ?? 0,
    color: r.color,
  }))
  if (segments.every((s) => s.value === 0)) return null

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        Bond Credit Quality Exposure
      </h3>
      <div className="flex flex-wrap items-start gap-8">
        <StackedBar segments={segments} />
        <div className="min-w-[220px] flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" />
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  % Net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {QUALITY_ROWS.map((row) => (
                <tr key={row.label}>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="text-gray-700">{row.label}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-900">
                    {fmtDecimalPct(security[row.key] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Bond Maturity Exposure ────────────────────────────────────────────────────

const MATURITY_GROUPS = [
  {
    label: 'Short Term',
    color: '#6366f1',
    items: [
      { label: 'Less than 1 Year', key: 'maturity_less_than_1_year_generic'       as const },
    ],
  },
  {
    label: 'Intermediate',
    color: '#fb923c',
    items: [
      { label: '1 to 3 Years',  key: '1_to_3_years_maturity_bond_exposure'  as const },
      { label: '3 to 5 Years',  key: '3_to_5_years_maturity_bond_exposure'  as const },
      { label: '5 to 10 Years', key: 'maturity_5_to_10_years_generic'        as const },
    ],
  },
  {
    label: 'Long Term',
    color: '#60a5fa',
    items: [
      { label: '10 to 20 Years', key: 'maturity_10_to_20_years_generic'       as const },
      { label: '20 to 30 Years', key: 'maturity_20_to_30_years_generic'       as const },
      { label: 'Over 30 Years',  key: 'over_30_years_maturity_bond_exposure'  as const },
    ],
  },
]

function BondMaturityExposure({ security }: { security: SecurityDetail }) {
  const groups = MATURITY_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((item) => ({
      ...item,
      value: security[item.key] ?? 0,
    })),
    total: g.items.reduce((s, item) => s + (security[item.key] ?? 0), 0),
  }))

  const allValues = groups.flatMap((g) => g.items.map((i) => i.value))
  const maxValue = Math.max(...allValues, 0)

  if (allValues.every((v) => v === 0)) return null

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        Bond Maturity Exposure
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Maturity
            </th>
            <th className="pb-2" />
            <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              % Net
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {groups.map((group) => (
            <React.Fragment key={group.label}>
              {/* Group header row */}
              <tr>
                <td className="w-32 py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="font-semibold text-gray-800">{group.label}</span>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <HBar value={group.total} max={maxValue} color={group.color} />
                </td>
                <td className="w-14 py-2 text-right tabular-nums font-semibold text-gray-900">
                  {fmtDecimalPct(group.total)}
                </td>
              </tr>
              {/* Sub-item rows */}
              {group.items.map((item) => (
                <tr key={item.key}>
                  <td className="py-1.5 pl-5 pr-2 text-gray-500">{item.label}</td>
                  <td className="py-1.5 pr-3">
                    <HBar value={item.value} max={maxValue} color={group.color} />
                  </td>
                  <td className="w-14 py-1.5 text-right tabular-nums text-gray-700">
                    {fmtDecimalPct(item.value)}
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────

export function SecurityBondExposure({ security }: { security: SecurityDetail }) {
  const hasSector = SECTOR_ROWS.some((r) => (security[r.key] ?? 0) > 0)
  const hasQuality = QUALITY_ROWS.some((r) => (security[r.key] ?? 0) > 0)
  const hasMaturity = MATURITY_GROUPS.some((g) =>
    g.items.some((i) => (security[i.key] ?? 0) > 0),
  )

  if (!hasSector && !hasQuality && !hasMaturity) return null

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
        Bond Exposure
      </h2>
      <div className="mt-3">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {hasSector && <BondSectorExposure security={security} />}
          {hasQuality && <BondCreditQualityExposure security={security} />}
          {hasMaturity && <BondMaturityExposure security={security} />}
        </div>
        {security.as_of_date && (
          <p className="mt-4 text-xs text-gray-400">
            As of {formatDate(security.as_of_date)}
          </p>
        )}
      </div>
    </section>
  )
}
