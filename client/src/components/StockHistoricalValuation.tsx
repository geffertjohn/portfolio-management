/**
 * StockHistoricalValuation — removed.
 *
 * The PE-method and PS-method fair-value calculation depended on
 * pe_5, ps_ratio_3y_mean, and revenue_per_share_ttm columns that
 * were removed from the securities2 table. This component has been
 * disabled until those data sources are restored.
 */

import type { SecurityDetail } from '@/lib/securities'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function StockHistoricalValuation(_props: { security: SecurityDetail }) {
  return null
}
