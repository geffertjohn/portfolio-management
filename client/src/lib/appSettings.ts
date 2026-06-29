/**
 * appSettings.ts
 *
 * Simple localStorage-backed application preferences.
 * No server round-trip needed for single-user desktop usage.
 * Import `getSettings` / `saveSettings` anywhere; React components
 * should use the `useAppSettings` hook from @/hooks/useAppSettings.
 */

export type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
export type ReviewCadenceDefault = 'quarterly' | 'semi_annual' | 'annual'
export type StockDueDateType = 'earnings' | 'manual'

export interface AssetAllocationReviewSettings {
  cadence: ReviewCadenceDefault
  /** Auto-flag when equity/fixed-income category drift exceeds this % */
  autoflagCategoryDriftPct: number
  /** Auto-flag when any asset class drift exceeds this % */
  autoflagAssetClassDriftPct: number
}

export interface PortfolioReviewSettings {
  cadence: ReviewCadenceDefault
  /** Auto-flag when portfolio drawdown (peak-to-trough) exceeds this % */
  autoflagDrawdownPct: number
  /** Auto-flag when trailing 1Y return trails benchmark by more than this % */
  autoflagReturnVsBenchmarkPct: number
}

export interface StockReviewSettings {
  cadence: ReviewCadenceDefault
  /**
   * 'earnings' — due date is next_earnings_release + 1 day from securities2.
   * 'manual'   — recurring from manualStartDate at the chosen cadence.
   */
  dueDateType: StockDueDateType
  /** ISO date (YYYY-MM-DD). Used when dueDateType === 'manual'. */
  manualStartDate: string
}

export interface FundReviewSettings {
  cadence: ReviewCadenceDefault
  /**
   * Auto-flag when category rank percentile exceeds this threshold.
   * e.g. 50 = flag anything in the bottom half of category.
   */
  autoflagCategoryRankPct: number
  /**
   * Auto-flag when expense ratio rank percentile exceeds this threshold.
   * e.g. 50 = flag funds whose expense ratio ranks in the bottom half.
   */
  autoflagExpenseRatioRankPct: number
}

export interface SecurityReviewSettings {
  stock: StockReviewSettings
  fund: FundReviewSettings
}

export interface AppSettings {
  firmName: string
  /** @deprecated — kept for backwards compatibility; use per-type cadences */
  defaultReviewCadence: ReviewCadenceDefault
  defaultDriftThreshold: number    // percent, e.g. 5
  dateFormat: DateFormat
  changeLogRetentionDays: number   // 30 | 60 | 90 | 180 | 365
  showWeightWarningBelow: number   // total weight % below which to show amber warning (default 99)
  showWeightWarningAbove: number   // total weight % above which to show amber warning (default 101)
  assetAllocationReview: AssetAllocationReviewSettings
  portfolioReview: PortfolioReviewSettings
  securityReview: SecurityReviewSettings
}

const STORAGE_KEY = 'pm_app_settings'

export const DEFAULT_SETTINGS: AppSettings = {
  firmName: '',
  defaultReviewCadence: 'quarterly',
  defaultDriftThreshold: 5,
  dateFormat: 'MM/DD/YYYY',
  changeLogRetentionDays: 90,
  showWeightWarningBelow: 99,
  showWeightWarningAbove: 101,
  assetAllocationReview: {
    cadence: 'quarterly',
    autoflagCategoryDriftPct: 5,
    autoflagAssetClassDriftPct: 10,
  },
  portfolioReview: {
    cadence: 'quarterly',
    autoflagDrawdownPct: 10,
    autoflagReturnVsBenchmarkPct: 3,
  },
  securityReview: {
    stock: {
      cadence: 'quarterly',
      dueDateType: 'earnings',
      manualStartDate: '',
    },
    fund: {
      cadence: 'quarterly',
      autoflagCategoryRankPct: 50,
      autoflagExpenseRatioRankPct: 50,
    },
  },
}

/** Compute the next recurring review date from a start date and cadence. */
export function nextReviewDate(startDate: string, cadence: ReviewCadenceDefault): string | null {
  if (!startDate) return null
  const start = new Date(startDate)
  if (isNaN(start.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const months = cadence === 'quarterly' ? 3 : cadence === 'semi_annual' ? 6 : 12
  let next = new Date(start)
  while (next <= today) {
    next = new Date(next)
    next.setMonth(next.getMonth() + months)
  }
  return next.toISOString().split('T')[0]
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    // Handle migration from old flat securityReview shape
    const oldFlat = parsed.securityReview
    const isOldShape = oldFlat && 'cadence' in oldFlat && !('stock' in oldFlat)
    const parsedSecurityReview = isOldShape
      ? {
          stock: { ...DEFAULT_SETTINGS.securityReview.stock },
          fund: {
            ...DEFAULT_SETTINGS.securityReview.fund,
            cadence: oldFlat.cadence ?? 'quarterly',
            autoflagCategoryRankPct: oldFlat.autoflagCategoryRankPct ?? 50,
            autoflagExpenseRatioRankPct: oldFlat.autoflagExpenseRatioRankPct ?? 50,
          },
        }
      : {
          stock: { ...DEFAULT_SETTINGS.securityReview.stock, ...oldFlat?.stock },
          fund: { ...DEFAULT_SETTINGS.securityReview.fund, ...oldFlat?.fund },
        }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      assetAllocationReview: { ...DEFAULT_SETTINGS.assetAllocationReview, ...parsed.assetAllocationReview },
      portfolioReview: { ...DEFAULT_SETTINGS.portfolioReview, ...parsed.portfolioReview },
      securityReview: parsedSecurityReview,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
