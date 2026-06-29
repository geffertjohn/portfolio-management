import React from 'react'
import { fmtDecimalPct } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'

// ── Shared primitives ─────────────────────────────────────────────────────────

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-4 w-full overflow-hidden rounded-sm bg-gray-100">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

function ExposureTable({
  title,
  rows,
}: {
  title: string
  rows: { label: string; value: number; color: string }[]
}) {
  const max = Math.max(...rows.map((r) => r.value), 0)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {title}
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Type
            </th>
            <th className="pb-2" />
            <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              % Net
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="w-36 py-2 pr-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="text-gray-700">{row.label}</span>
                </div>
              </td>
              <td className="py-2 pr-3">
                <HBar value={row.value} max={max} color={row.color} />
              </td>
              <td className="w-14 py-2 text-right tabular-nums text-gray-900">
                {fmtDecimalPct(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Sector Exposure ───────────────────────────────────────────────────────────

const SECTOR_DEFS: { label: string; key: keyof SecurityDetail; color: string }[] = [
  { label: 'Technology',           key: 'technology_exposure_generic',             color: '#6366f1' },
  { label: 'Financial Services',   key: 'financial_services_exposure_generic',     color: '#10b981' },
  { label: 'Healthcare',           key: 'healthcare_exposure_generic',             color: '#06b6d4' },
  { label: 'Industrials',          key: 'industrials_exposure_generic',            color: '#f59e0b' },
  { label: 'Consumer Cyclical',    key: 'consumer_cyclical_exposure_generic',      color: '#f97316' },
  { label: 'Consumer Defensive',   key: 'consumer_defensive_exposure_generic',     color: '#22c55e' },
  { label: 'Communication Svcs',   key: 'communication_services_exposure_generic', color: '#3b82f6' },
  { label: 'Basic Materials',      key: 'basic_materials_exposure_generic',        color: '#a78bfa' },
  { label: 'Real Estate',          key: 'real_estate_exposure_generic',            color: '#f472b6' },
  { label: 'Energy',               key: 'energy_exposure_generic',                 color: '#fbbf24' },
  { label: 'Utilities',            key: 'utilities_exposure_generic',              color: '#84cc16' },
]

function SectorExposureCard({ security }: { security: SecurityDetail }) {
  const rows = SECTOR_DEFS
    .map((d) => ({ label: d.label, value: (security[d.key] as number | null) ?? 0, color: d.color }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  if (rows.length === 0) return null
  return <ExposureTable title="Sector Exposure" rows={rows} />
}

// ── Market Cap Exposure ───────────────────────────────────────────────────────

const MARKET_CAP_GROUPS: {
  label: string
  color: string
  items: { label: string; key: keyof SecurityDetail }[]
}[] = [
  {
    label: 'Large Cap',
    color: '#6366f1',
    items: [
      { label: 'Value',  key: 'equity_stylebox_large_cap_value_exposure' },
      { label: 'Blend',  key: 'equity_stylebox_large_cap_blend_exposure' },
      { label: 'Growth', key: 'equity_stylebox_large_cap_growth_exposure' },
    ],
  },
  {
    label: 'Mid Cap',
    color: '#fb923c',
    items: [
      { label: 'Value',  key: 'equity_stylebox_mid_cap_value_exposure' },
      { label: 'Blend',  key: 'equity_stylebox_mid_cap_blend_exposure' },
      { label: 'Growth', key: 'equity_stylebox_mid_cap_growth_exposure' },
    ],
  },
  {
    label: 'Small Cap',
    color: '#60a5fa',
    items: [
      { label: 'Value',  key: 'equity_stylebox_small_cap_value_exposure' },
      { label: 'Blend',  key: 'equity_stylebox_small_cap_blend_exposure' },
      { label: 'Growth', key: 'equity_stylebox_small_cap_growth_exposure' },
    ],
  },
]

function MarketCapExposureCard({ security }: { security: SecurityDetail }) {
  const groups = MARKET_CAP_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((item) => ({
      ...item,
      value: (security[item.key] as number | null) ?? 0,
    })),
    total: g.items.reduce((sum, item) => sum + ((security[item.key] as number | null) ?? 0), 0),
  }))

  const allValues = groups.flatMap((g) => g.items.map((i) => i.value))
  const maxValue = Math.max(...allValues, 0)

  if (groups.every((g) => g.total === 0)) return null

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        Market Cap Exposure
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Type
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
              {/* Group total row */}
              <tr key={group.label}>
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
                item.value > 0 && (
                  <tr key={String(item.key)}>
                    <td className="py-1.5 pl-5 pr-2 text-gray-500">{item.label}</td>
                    <td className="py-1.5 pr-3">
                      <HBar value={item.value} max={maxValue} color={group.color} />
                    </td>
                    <td className="w-14 py-1.5 text-right tabular-nums text-gray-700">
                      {fmtDecimalPct(item.value)}
                    </td>
                  </tr>
                )
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Country / Region Exposure ─────────────────────────────────────────────────

const COUNTRY_DEFS: { label: string; key: keyof SecurityDetail; color: string }[] = [
  { label: 'North America',        key: 'north_america_total_exposure_generic',    color: '#6366f1' },
  { label: 'Europe Developed',     key: 'europe_developed_total_exposure_generic', color: '#3b82f6' },
  { label: 'Asia Developed',       key: 'asia_developed_total_exposure_generic',   color: '#10b981' },
  { label: 'United Kingdom',       key: 'united_kingdom_total_exposure_generic',   color: '#f59e0b' },
  { label: 'Asia EM',              key: 'asia_emerging_total_exposure',            color: '#22c55e' },
  { label: 'Latin America',        key: 'latin_america_total_exposure_generic',    color: '#f97316' },
  { label: 'Europe EM',            key: 'europe_emerging_total_exposure',          color: '#a78bfa' },
  { label: 'Africa & Middle East', key: 'africa_middle_east_total_exposure',       color: '#f472b6' },
]

function CountryExposureCard({ security }: { security: SecurityDetail }) {
  const rows = COUNTRY_DEFS
    .map((d) => ({ label: d.label, value: (security[d.key] as number | null) ?? 0, color: d.color }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  if (rows.length === 0) return null
  return <ExposureTable title="Country Exposure" rows={rows} />
}

// ── Public export ─────────────────────────────────────────────────────────────

export function EquityExposureCards({ security }: { security: SecurityDetail }) {
  const hasSector = SECTOR_DEFS.some((d) => (security[d.key] as number | null ?? 0) > 0)
  const hasMarketCap = MARKET_CAP_GROUPS.some((g) =>
    g.items.some((item) => (security[item.key] as number | null ?? 0) > 0),
  )
  const hasCountry = COUNTRY_DEFS.some((d) => (security[d.key] as number | null ?? 0) > 0)

  if (!hasSector && !hasMarketCap && !hasCountry) return null

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
        Equity Exposure
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {hasSector && <SectorExposureCard security={security} />}
        {hasMarketCap && <MarketCapExposureCard security={security} />}
        {hasCountry && <CountryExposureCard security={security} />}
      </div>
    </section>
  )
}
