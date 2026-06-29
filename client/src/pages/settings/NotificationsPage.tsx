import { useState } from 'react'
import { getSettings, saveSettings } from '@/lib/appSettings'

interface NotificationSettings {
  emailEnabled: boolean
  emailAddress: string
  alertsEnabled: boolean
  overdueReviewsEnabled: boolean
  overdueActionsEnabled: boolean
  digestFrequency: 'daily' | 'weekly' | 'off'
}

const STORAGE_KEY = 'pm_notification_settings'

const DEFAULTS: NotificationSettings = {
  emailEnabled: false,
  emailAddress: '',
  alertsEnabled: true,
  overdueReviewsEnabled: true,
  overdueActionsEnabled: true,
  digestFrequency: 'weekly',
}

function getNotifSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function Toggle({ checked, onChange, label, desc }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-gray-500">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${
          checked ? 'bg-gray-900' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export function NotificationsPage() {
  const [settings, setSettings] = useState<NotificationSettings>(getNotifSettings)
  const [saved, setSaved] = useState(false)
  const [emailError, setEmailError] = useState('')

  function update<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
    if (key === 'emailAddress') setEmailError('')
  }

  function handleSave() {
    if (settings.emailEnabled && settings.emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.emailAddress)) {
      setEmailError('Enter a valid email address')
      return
    }
    // Also persist the firm name if set
    const appSettings = getSettings()
    if (settings.emailAddress && !appSettings.firmName) {
      // Nothing extra needed
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Notifications</h1>
        <p className="mt-1 text-gray-600">
          Configure how and when you're alerted to overdue reviews, action items, and performance breaches.
        </p>
      </div>

      <div className="mt-8 space-y-10">

        {/* ── Email delivery ─────────────────────────────── */}
        <div className="space-y-5">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-base font-semibold text-gray-900">Email Delivery</h2>
            <p className="mt-1 text-sm text-gray-500">
              Email notifications require a server-side job (e.g. Supabase Edge Function + cron) to be configured separately.
              These settings store your preferences for when that is in place.
            </p>
          </div>

          <Toggle
            checked={settings.emailEnabled}
            onChange={(v) => update('emailEnabled', v)}
            label="Enable email notifications"
            desc="Send digest emails and alert notifications to the address below."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700">Notification Email Address</label>
            <input
              type="email"
              value={settings.emailAddress}
              onChange={(e) => update('emailAddress', e.target.value)}
              disabled={!settings.emailEnabled}
              placeholder="advisor@example.com"
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400 ${
                emailError
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                  : 'border-gray-300 focus:border-gray-500 focus:ring-gray-500'
              }`}
            />
            {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Digest Frequency</label>
            <select
              value={settings.digestFrequency}
              onChange={(e) => update('digestFrequency', e.target.value as NotificationSettings['digestFrequency'])}
              disabled={!settings.emailEnabled}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="daily">Daily summary</option>
              <option value="weekly">Weekly digest (Mondays)</option>
              <option value="off">Off — instant alerts only</option>
            </select>
          </div>
        </div>

        {/* ── Alert types ────────────────────────────────── */}
        <div className="space-y-5">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-base font-semibold text-gray-900">Alert Types</h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose which events create in-app alerts and trigger email notifications.
            </p>
          </div>

          <Toggle
            checked={settings.alertsEnabled}
            onChange={(v) => update('alertsEnabled', v)}
            label="Performance threshold breaches"
            desc="Alert when a security's metric value crosses a configured threshold (e.g. Sharpe ratio below 0.5)."
          />
          <Toggle
            checked={settings.overdueReviewsEnabled}
            onChange={(v) => update('overdueReviewsEnabled', v)}
            label="Overdue reviews"
            desc="Alert when a security's next review date has passed."
          />
          <Toggle
            checked={settings.overdueActionsEnabled}
            onChange={(v) => update('overdueActionsEnabled', v)}
            label="Overdue action items"
            desc="Alert when an open action item has passed its due date."
          />
        </div>
      </div>

      <div className="mt-10 flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
        {saved && <span className="text-sm text-green-600">Saved.</span>}
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Save preferences
        </button>
      </div>
    </div>
  )
}
