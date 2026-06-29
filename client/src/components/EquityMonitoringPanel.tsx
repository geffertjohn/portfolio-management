import { useState } from 'react'
import { fmtNum, fmtDecimalPct, fmtInt, EMPTY } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { MetricCard } from './MonitoringPanelShared'
import { ReturnRanksTable } from './ReturnRanksTable'
import { CategoryScorecardTable, PeerGroupScorecardTable, categoryScorecardScore, peerGroupScorecardScore } from './FundScorecard'

export function EquityMonitoringPanel({ security }: { security: SecurityDetail }) {
  const [rankMode, setRankMode] = useState<'pg' | 'cat'>('pg')

  const {
    market_alpha_3y_vs_pg,
    alpha_3y_vs_category,
    alpha_rank,
    alpha_peer_group_rank,
    information_ratio_3y_vs_pg,
    information_ratio_3y_vs_category,
    information_ratio_rank,
    information_ratio_peer_group_rank,
    historical_sharpe_3y,
    sharpe_rank,
    sharpe_peer_group_rank,
    expense_ratio_generic,
    expense_ratio_rank,
    expense_ratio_peer_group_rank,
  } = security
  const pgSize = security.three_year_total_return_peer_group_size_nav
  const catSize = security.three_year_total_return_rank_category_size_nav

  const isPg = rankMode === 'pg'

  const alphaValue = isPg ? market_alpha_3y_vs_pg : alpha_3y_vs_category
  const alphaRank  = isPg ? alpha_peer_group_rank  : alpha_rank
  const alphaSize  = isPg ? pgSize                 : catSize
  const alphaRankLabel = isPg ? 'Rank in peer group' : 'Rank in category'
  const alphaSizeLabel = isPg ? 'Peer group size'    : 'Category size'

  const irValue = isPg ? information_ratio_3y_vs_pg : information_ratio_3y_vs_category
  const irRank  = isPg ? information_ratio_peer_group_rank : information_ratio_rank
  const irSize  = isPg ? pgSize  : catSize
  const irRankLabel = isPg ? 'Rank in peer group' : 'Rank in category'
  const irSizeLabel = isPg ? 'Peer group size'    : 'Category size'

  const sharpeRank  = isPg ? sharpe_peer_group_rank : sharpe_rank
  const sharpeSize  = isPg ? pgSize : catSize
  const sharpeRankLabel = isPg ? 'Rank in peer group' : 'Rank in category'
  const sharpeSizeLabel = isPg ? 'Peer group size'    : 'Category size'

  const erRank  = isPg ? expense_ratio_peer_group_rank : expense_ratio_rank
  const erSize  = isPg ? pgSize : catSize
  const erRankLabel = isPg ? 'Rank in peer group' : 'Rank in category'
  const erSizeLabel = isPg ? 'Peer group size'    : 'Category size'

  const catScore = categoryScorecardScore(security)
  const pgScore  = peerGroupScorecardScore(security)

  function dotClass(score: number | null) {
    if (score == null) return null
    if (score >= 70) return 'bg-green-500'
    if (score >= 60) return 'bg-yellow-400'
    return 'bg-red-500'
  }

  return (
    <section className="space-y-4">

      <div className="flex items-center">
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5 text-xs font-medium">
          <button
            onClick={() => setRankMode('cat')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 transition-colors ${!isPg ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Category
            {dotClass(catScore) && (
              <span className={`inline-block h-2 w-2 rounded-full ${dotClass(catScore)}`} title={`Score: ${catScore!.toFixed(1)} / 100`} />
            )}
          </button>
          <button
            onClick={() => setRankMode('pg')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 transition-colors ${isPg ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Peer group
            {dotClass(pgScore) && (
              <span className={`inline-block h-2 w-2 rounded-full ${dotClass(pgScore)}`} title={`Score: ${pgScore!.toFixed(1)} / 100`} />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Alpha 3Y"
          subtitle={isPg ? 'vs peer group' : 'vs category'}
          displayValue={alphaValue !== null ? fmtNum(alphaValue) : EMPTY}
          rawValue={alphaValue}
          neutral={0}
          scale={15}
          higherIsBetter={true}
          rankPct={alphaRank != null && alphaSize ? alphaRank / alphaSize : null}
          components={[
            { label: alphaRankLabel, value: alphaRank !== null ? fmtInt(alphaRank) : EMPTY },
            { label: alphaSizeLabel, value: alphaSize !== null ? fmtInt(alphaSize) : EMPTY },
          ]}
        />

        <MetricCard
          title="Information ratio 3Y"
          subtitle={isPg ? 'vs peer group' : 'vs category'}
          displayValue={irValue !== null ? fmtNum(irValue) : EMPTY}
          rawValue={irValue}
          neutral={0}
          scale={3}
          higherIsBetter={true}
          rankPct={irRank != null && irSize ? irRank / irSize : null}
          components={[
            { label: irRankLabel, value: irRank !== null ? fmtInt(irRank) : EMPTY },
            { label: irSizeLabel, value: irSize !== null ? fmtInt(irSize) : EMPTY },
          ]}
        />

        <MetricCard
          title="Sharpe ratio 3Y"
          subtitle={isPg ? 'vs peer group' : 'vs category'}
          displayValue={historical_sharpe_3y !== null ? fmtNum(historical_sharpe_3y) : EMPTY}
          rawValue={historical_sharpe_3y}
          neutral={0}
          scale={2}
          higherIsBetter={true}
          rankPct={sharpeRank != null && sharpeSize ? sharpeRank / sharpeSize : null}
          components={[
            { label: sharpeRankLabel, value: sharpeRank !== null ? fmtInt(sharpeRank) : EMPTY },
            { label: sharpeSizeLabel, value: sharpeSize !== null ? fmtInt(sharpeSize) : EMPTY },
          ]}
        />

        <MetricCard
          title="Expense ratio 1Y"
          subtitle={isPg ? 'vs peer group' : 'vs category'}
          displayValue={expense_ratio_generic !== null ? fmtDecimalPct(expense_ratio_generic) : EMPTY}
          rawValue={expense_ratio_generic}
          neutral={0}
          scale={0.02}
          higherIsBetter={false}
          rankPct={erRank != null && erSize ? erRank / erSize : null}
          components={[
            { label: erRankLabel, value: erRank !== null ? fmtInt(erRank) : EMPTY },
            { label: erSizeLabel, value: erSize !== null ? fmtInt(erSize) : EMPTY },
          ]}
        />

      </div>

      <ReturnRanksTable security={security} mode={rankMode} />
      {isPg ? <PeerGroupScorecardTable security={security} /> : <CategoryScorecardTable security={security} />}
    </section>
  )
}
