import { useState } from 'react'
import {
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  nextReviewDate,
  type AppSettings,
  type DateFormat,
  type ReviewCadenceDefault,
  type StockDueDateType,
  type AssetAllocationReviewSettings,
  type PortfolioReviewSettings,
  type StockReviewSettings,
  type FundReviewSettings,
} from '@/lib/appSettings'

function SectionHeading({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border-b border-gray-200 pb-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{desc}</p>
    </div>
  )
}

function ReviewTypeCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  )
}

function CadenceSelect({ value, onChange }: { value: ReviewCadenceDefault; onChange: (v: ReviewCadenceDefault) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">Default cadence</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as ReviewCadenceDefault)}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      >
        <option value="quarterly">Quarterly (every 3 months)</option>
        <option value="semi_annual">Semi-Annual (every 6 months)</option>
        <option value="annual">Annual (every 12 months)</option>
      </select>
    </div>
  )
}

function PctInput({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={0.1}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="block w-28 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <span className="text-sm text-gray-500">%</span>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings)
  const [saved, setSaved] = useState(false)

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function updateAAR<K extends keyof AssetAllocationReviewSettings>(key: K, value: AssetAllocationReviewSettings[K]) {
    setSettings(prev => ({ ...prev, assetAllocationReview: { ...prev.assetAllocationReview, [key]: value } }))
    setSaved(false)
  }

  function updatePR<K extends keyof PortfolioReviewSettings>(key: K, value: PortfolioReviewSettings[K]) {
    setSettings(prev => ({ ...prev, portfolioReview: { ...prev.portfolioReview, [key]: value } }))
    setSaved(false)
  }

  function updateStockReview<K extends keyof StockReviewSettings>(key: K, value: StockReviewSettings[K]) {
    setSettings(prev => ({
      ...prev,
      securityReview: { ...prev.securityReview, stock: { ...prev.securityReview.stock, [key]: value } },
    }))
    setSaved(false)
  }

  function updateFundReview<K extends keyof FundReviewSettings>(key: K, value: FundReviewSettings[K]) {
    setSettings(prev => ({
      ...prev,
      securityReview: { ...prev.securityReview, fund: { ...prev.securityReview.fund, [key]: value } },
    }))
    setSaved(false)
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    if (!confirm('Reset all settings to defaults?')) return
    setSettings({ ...DEFAULT_SETTINGS })
    saveSettings({ ...DEFAULT_SETTINGS })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  const { assetAllocationReview: aar, portfolioReview: pr, securityReview } = settings
  const { stock: sr, fund: fr } = securityReview

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Settings</h1>
          <p className="mt-1 text-gray-600">Application defaults and display preferences.</p>
        </div>
      </div>

      <div className="mt-8 space-y-10">

        {/* ── Firm ───────────────────────────────────────── */}
        <div className="space-y-5">
          <SectionHeading title="Firm" desc="Basic firm information shown in reports and exports." />
          <div>
            <label className="block text-sm font-medium text-gray-700">Firm / Organization Name</label>
            <input
              type="text"
              value={settings.firmName}
              onChange={e => update('firmName', e.target.value)}
              placeholder="e.g. Acme Wealth Management"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>
        </div>

        {/* ── Reviews ────────────────────────────────────── */}
        <div className="space-y-5">
          <SectionHeading
            title="Reviews"
            desc="Default cadences and auto-flag thresholds for each review type. Individual schedules can override these defaults."
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Asset Allocation Review */}
            <ReviewTypeCard
              title="Asset Allocation Review"
              desc="Triggered when portfolio drift against the assigned model portfolio exceeds thresholds."
            >
              <CadenceSelect value={aar.cadence} onChange={v => updateAAR('cadence', v)} />
              <div className="grid grid-cols-2 gap-4">
                <PctInput
                  label="Auto-flag: category drift"
                  hint="Flag when equity or fixed-income allocation drifts beyond this %"
                  value={aar.autoflagCategoryDriftPct}
                  onChange={v => updateAAR('autoflagCategoryDriftPct', v)}
                />
                <PctInput
                  label="Auto-flag: asset class drift"
                  hint="Flag when any individual asset class drifts beyond this %"
                  value={aar.autoflagAssetClassDriftPct}
                  onChange={v => updateAAR('autoflagAssetClassDriftPct', v)}
                />
              </div>
            </ReviewTypeCard>

            {/* Portfolio Review */}
            <ReviewTypeCard
              title="Portfolio Review"
              desc="Periodic review of overall portfolio performance, drawdown, and benchmark comparison."
            >
              <CadenceSelect value={pr.cadence} onChange={v => updatePR('cadence', v)} />
              <div className="grid grid-cols-2 gap-4">
                <PctInput
                  label="Auto-flag: max drawdown"
                  hint="Flag when peak-to-trough drawdown exceeds this %"
                  value={pr.autoflagDrawdownPct}
                  onChange={v => updatePR('autoflagDrawdownPct', v)}
                />
                <PctInput
                  label="Auto-flag: return vs benchmark"
                  hint="Flag when 1Y return trails benchmark by more than this %"
                  value={pr.autoflagReturnVsBenchmarkPct}
                  onChange={v => updatePR('autoflagReturnVsBenchmarkPct', v)}
                />
              </div>
            </ReviewTypeCard>

            {/* Security Review — Stocks */}
            <ReviewTypeCard
              title="Security Review — Stocks"
              desc="Per-stock review cadence and due date logic."
            >
              <CadenceSelect value={sr.cadence} onChange={v => updateStockReview('cadence', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700">Default due date</label>
                <div className="mt-2 flex gap-6">
                  {(['earnings', 'manual'] as StockDueDateType[]).map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="stockDueDateType"
                        value={opt}
                        checked={sr.dueDateType === opt}
                        onChange={() => updateStockReview('dueDateType', opt)}
                        className="h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-500"
                      />
                      <span className="text-sm text-gray-700">
                        {opt === 'earnings' ? 'Earnings (next earnings + 1 day)' : 'Manual'}
                      </span>
                    </label>
                  ))}
                </div>
                {sr.dueDateType === 'earnings' && (
                  <p className="mt-2 text-xs text-gray-400">
                    Due date will be set to <span className="font-medium">next_earnings_release + 1 day</span> from the security record when a review is created.
                  </p>
                )}
                {sr.dueDateType === 'manual' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Start date</label>
                      <p className="mt-0.5 text-xs text-gray-400">
                        First review date. Subsequent reviews repeat at the chosen cadence.
                      </p>
                      <input
                        type="date"
                        value={sr.manualStartDate}
                        onChange={e => updateStockReview('manualStartDate', e.target.value)}
                        className="mt-1 block w-44 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                      />
                    </div>
                    {sr.manualStartDate && (
                      <p className="text-xs text-gray-500">
                        Next review due:{' '}
                        <span className="font-medium text-gray-700">
                          {nextReviewDate(sr.manualStartDate, sr.cadence) ?? '—'}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </ReviewTypeCard>

            {/* Security Review — Funds */}
            <ReviewTypeCard
              title="Security Review — Funds (ETF & Mutual)"
              desc="Per-fund review cadence and auto-flag thresholds."
            >
              <CadenceSelect value={fr.cadence} onChange={v => updateFundReview('cadence', v)} />
              <div className="grid grid-cols-2 gap-4">
                <PctInput
                  label="Auto-flag: category rank"
                  hint="Flag when rank percentile within category exceeds this threshold (e.g. 50 = bottom half)"
                  value={fr.autoflagCategoryRankPct}
                  onChange={v => updateFundReview('autoflagCategoryRankPct', v)}
                />
                <PctInput
                  label="Auto-flag: expense ratio rank"
                  hint="Flag when expense ratio rank percentile exceeds this threshold"
                  value={fr.autoflagExpenseRatioRankPct}
                  onChange={v => updateFundReview('autoflagExpenseRatioRankPct', v)}
                />
              </div>
            </ReviewTypeCard>
          </div>
        </div>

        {/* ── Portfolios ─────────────────────────────────── */}
        <div className="space-y-5">
          <SectionHeading title="Portfolios" desc="Thresholds and display options for portfolio management." />
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Default Drift Alert Threshold (%)</label>
              <p className="mt-0.5 text-xs text-gray-400">
                Positions whose weight drifts beyond this % from target will be flagged in the Rebalancing panel.
              </p>
              <input
                type="number"
                min={0.1}
                max={50}
                step={0.1}
                value={settings.defaultDriftThreshold}
                onChange={e => update('defaultDriftThreshold', parseFloat(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Warn when total weight below (%)</label>
              <input
                type="number"
                min={80}
                max={100}
                step={0.1}
                value={settings.showWeightWarningBelow}
                onChange={e => update('showWeightWarningBelow', parseFloat(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Warn when total weight above (%)</label>
              <input
                type="number"
                min={100}
                max={120}
                step={0.1}
                value={settings.showWeightWarningAbove}
                onChange={e => update('showWeightWarningAbove', parseFloat(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>
        </div>

        {/* ── Display ────────────────────────────────────── */}
        <div className="space-y-5">
          <SectionHeading title="Display" desc="Date format and data retention preferences." />
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Date Format</label>
              <select
                value={settings.dateFormat}
                onChange={e => update('dateFormat', e.target.value as DateFormat)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (EU)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Holdings Change Log Retention</label>
              <p className="mt-0.5 text-xs text-gray-400">
                How far back the Change Log tab will display position history.
              </p>
              <select
                value={settings.changeLogRetentionDays}
                onChange={e => update('changeLogRetentionDays', Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Save / Reset */}
      <div className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-gray-400 underline hover:text-gray-600"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Saved.</span>}
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  )
}
