# Portfolio Management — Claude Guidelines

Investment advisor tool for process documentation, regulatory audit defense, and strategic asset allocation management.

## Stack

- **Frontend:** React 18, TypeScript (strict), Vite, Tailwind CSS, TanStack Query v5, React Router v7
- **Data layer:** Supabase (PostgreSQL) via `@supabase/supabase-js`
- **Charts:** Recharts
- **Excel import/export:** `xlsx` library
- **Backend:** Express.js (health/ping only — no business logic lives here)

---

## Project Layout

```
client/src/
  pages/         Route-level page components
  components/    Shared UI components (no data fetching)
  hooks/         Custom React hooks + query key factory
  lib/           Data access layer — pure async Supabase functions, one file per domain
  types/         Shared TypeScript interfaces
supabase/        Historical SQL (archive/) + README + generated schema reference; live DB is authoritative (see DDL note)
```

The lib → hooks → components → pages layering is strict:
- **lib files** are pure async functions that call Supabase. No React, no hooks.
- **hooks** wrap lib functions in `useQuery` / `useMutation`. No JSX.
- **components** receive data via props or hooks. No direct Supabase calls.
- **pages** compose components, own routing params and top-level queries.

---

## Data Model — Critical Conventions

### `securities2` is the canonical securities table

The legacy `securities` table is retired. Always use `securities2`.

### Classifying a security (stock vs ETF vs fund)

`classifySecurity()` in `lib/securities.ts` is the **single source of truth** for stock vs ETF vs mutual fund. `getSecurityDisplayType()` (badge text) and `isFundOrEtfSecurity()` (fund-specific UI branches) both derive from it, so they can't disagree. Never re-implement the detection inline — call one of those two helpers. `detailed_security_type` wins when present; otherwise fund-only signals (peer group, fund company/family, expense ratio) classify ambiguous rows.

### Two identifiers — use the right one for the right purpose

| Field | Type | Purpose |
|---|---|---|
| `securities2.security_id` | `TEXT` (primary key) | Ticker symbol — `"AAPL"`, `"VFIAX"`. FK target for most child tables. |
| `securities2.id` | `BIGINT` (surrogate) | Integer row id. Used only for URL routing and loading the security detail record itself. |

**URL routing uses the numeric `id`:** `/security/:securityId` where the param is parsed as an integer via `parseInt`. The `useSecurityDetail(id: number)` hook takes this integer.

**All FK columns in child tables use the text `security_id`:**

| Table | Column | Type |
|---|---|---|
| `at_risk` | `security_id` | `TEXT → securities2.security_id` (held securities flagged for replacement) |
| `prospects` | `security_id` | `TEXT → securities2.security_id` (buy-candidate watchlist) |
| `review_schedules` | `security_id` | `TEXT → securities2.security_id` |
| `review_log` | `security_id` | `TEXT → securities2.security_id` |
| `action_items` | `security_id` | `TEXT → securities2.security_id` (nullable) |
| `alert_rules` | `security_id` | `TEXT → securities2.security_id` (nullable) |
| `alert_events` | `security_id` | `TEXT → securities2.security_id` |
| `communication_log` | `security_id` | `TEXT → securities2.security_id` (nullable) |
| `substitutions` | `incumbent_security_id`, `proposed_security_id` | `TEXT → securities2.security_id` |
| `positions` | `security_id` | `TEXT → securities2.security_id` (current target allocation) |
| `portfolio_allocations` | `security_id` | `TEXT` — **no DB FK** (stages import symbols not yet in securities2); dated allocation snapshots |
| `holdings_change_log` | `security_id` | `TEXT → securities2.security_id` (legacy; not used for performance) |
| `security_related_securities` | `security_id` | `TEXT → securities2.security_id` |
| `fund_alternatives` | `parent_security_id` | `TEXT → securities2.security_id` (related funds live here, NOT in securities2) |

When querying any of these tables by security, pass `security.security_id` (the text ticker), not `security.id`.

### Model portfolio resolution

All portfolios resolve their model through a single lookup chain:

```
security_id → portfolio_model_map → model_portfolio_id → model_portfolio_data
```

`portfolio_model_map` is the authoritative mapping for all portfolio types. Never bypass it with hardcoded portfolio IDs.

### Soft deletes

Records in `action_items` (and several other tables) use soft deletes — `deleted_at` timestamp, never hard `DELETE`. Always filter `is('deleted_at', null)` when querying. Similarly `removed_at` on `at_risk` and `prospects`.

### At-Risk vs Watchlist — two distinct lists

These are different features and **must not be conflated**:

- **At-Risk** (`at_risk` table, `lib/atRisk.ts`, `/at-risk`, nav "At-Risk") — **held** securities flagged for monitoring and possible **replacement**: deteriorated scorecard metrics (`metrics[]`), an auto-expiry sell timer (`removal_date`), and proposed `substitutions` (incumbent→replacement swaps). This is the *renamed* original "watchlist" — the table, the `substitutions.at_risk_id` FK (was `watchlist_id`), the audit trigger, and all code identifiers (`fetchActiveAtRisk`, `addToAtRisk`, `QUERY_KEYS.atRisk`) were renamed. Funds reach it via the review modal's "At-Risk" outcome (stored `review_log.outcome = 'placed_on_watchlist'`, kept as-is; label is "Flagged At-Risk").
- **Watchlist** (`prospects` table, `lib/prospects.ts`, `/watchlist`, nav "Watchlist") — securities being **considered for purchase** (not held): `target_portfolio`, `target_price`, `conviction`, `thesis`. No metrics, no sell timer, no substitutions. Added from the security detail header ("+ Watchlist", `AddProspectModal`) or the page.

`substitutions.at_risk_id` is a `BIGINT → at_risk.id` FK (not a `security_id`).

---

## Supabase Patterns

### All queries go through the singleton

```ts
import { supabase } from '@/lib/supabase'
```

Never instantiate a new client.

### The client is schema-typed

`supabase.ts` uses `createClient<Database>` with `Database` generated from the live
schema in `client/src/types/database.types.ts`. This means **column/table names in
`.select()` / `.eq()` / `.insert()` are type-checked** — a select naming a dropped or
mistyped column (incl. inside an embed) now fails `tsc`/CI instead of 400ing at
runtime. Regenerate the types after any schema change (Supabase MCP
`generate_typescript_types`, or `supabase gen types typescript --project-id … >
client/src/types/database.types.ts`).

DB text columns surface as `string`, so where a domain type narrows to a union/enum
(e.g. `priority`, `cadence`, `outcome`) the lib fn casts the *result* at the return
boundary (`as DomainType[]`) — the column names stay checked. Genuinely dynamic table
names (the benchmark/ychart bulk uploaders) opt out locally via `supabase as
SupabaseClient`; don't spread that pattern to static-table code.

### Always destructure and handle the error

```ts
const { data, error } = await supabase.from('at_risk').select('*')
if (error) throw error
return data ?? []
```

Never silently swallow or ignore `error`.

### `maybeSingle()` vs `single()`

- `maybeSingle()` — returns `null` when no row found. Use for lookups that might not exist.
- `single()` — throws when no row found. Use only when absence is a bug.

### TanStack Query exclusively for server state

No raw Supabase calls in components or pages. All queries go through `useQuery` / `useMutation` with query functions in `lib/`.

### Cache keys are centralized

All query keys live in `hooks/queryKeys.ts`. Add new keys there, never inline. To bust stale cached data after a schema change, add a version suffix: `['benchmarks', 'v3']`.

### Invalidate related keys after mutations

```ts
const queryClient = useQueryClient()
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk })
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRiskBySecurity(security.security_id) })
}
```

### DDL vs DML via Supabase MCP

- Schema changes (CREATE, ALTER, DROP): use `apply_migration` — runs in a transaction and is tracked.
- Read queries: use `execute_sql`.
- Never use `execute_sql` for DDL.
- **The live DB is the source of truth, tracked by the remote MCP migration history — NOT the `supabase/` directory.** The checked-in `.sql` files are historical reference only: dead scripts were deleted and the rest moved to `supabase/archive/`. See `supabase/README.md` for the migration list and regeneration. After any schema change, regenerate `client/src/types/database.types.ts` (see "The client is schema-typed").

### RLS is enabled

Row Level Security is on for all tables with open `USING (true)` policies for `anon` and `authenticated`. Auth is not yet wired — this is infrastructure-ready. Do not disable RLS.

---

## TypeScript Conventions

### Dynamic key access on typed objects

When you need to access a typed object with a dynamic string key (e.g., model portfolio asset class fields), use the double cast to make the intent explicit:

```ts
// ✅ correct — makes unsafe access intentional
const mp = modelPortfolio as unknown as Record<string, unknown>
const target = mp[`${key}_target`] as number | null

// ❌ wrong — TypeScript rejects the direct cast
const mp = modelPortfolio as Record<string, unknown>
```

### Display formatting

Use helpers from `lib/formatters` — never format inline:

```ts
import { fmtDecimalPct, fmtNum, fmtInt, fmtUsd, fmtSignedPct, EMPTY } from '@/lib/formatters'

fmtDecimalPct(value)   // 0.0831 → "8.31%"
fmtNum(value)          // 1.234 → "1.23"
fmtInt(value)          // 42.7 → "43"
fmtUsd(value)          // 1234.5 → "$1,234.50"
fmtSignedPct(value)    // 0.0123 → "+1.23%"  (decimal-stored, always signed)
EMPTY                  // '—' — use for null/missing display values
```

`lib/formatters` also exports `stripTotalReturn(name)` and **`consensusColor(label)`** — the single source of truth for analyst-consensus text colors (used by both `AnalystCoveragePanel` and `AnalystSummaryCards`; don't re-implement it inline). Other cross-cutting shared helpers: **`mapSecurityJoin(row)`** in `lib/securityJoin.ts` (flattens an embedded `securities2(id, security_id, security_name)` join onto a row — used by the action-items / alerts / comm-log / review-schedule fetchers); shared UI primitives **`DetailPageState`** (loading/error/not-found scaffold for detail pages) and **`RangeBar`** (analyst range bar) in `components/`.

### No `any`

Use `unknown` with type guards or explicit casts. `any` bypasses all type checking and hides real bugs.

### Null guards before navigation

When navigating with a potentially-null value, always guard:

```ts
// ✅
onClick={() => { if (id != null) navigate(`/security/${id}`) }}

// ❌ navigates to "/security/null"
onClick={() => navigate(`/security/${id}`)}
```

---

## Code Quality Gates — run before every change

**A green browser preview is NOT proof a change is correct.** The Vite dev server (esbuild) **strips types without checking them**, and there is no CI or pre-commit hook. So a change can render perfectly in the browser while introducing type errors, unused-variable errors, or `any` violations that stay invisible until `npm run build` (which runs `tsc -b`) fails. These accumulate silently — the repo has reached a backlog precisely because "it worked in the browser" was treated as done.

`tsconfig.json` is strict: `strict`, `noUnusedLocals`, `noUnusedParameters` are all on — so a leftover import or unused variable is a hard **compile error** (not a warning) that breaks the production build. Refactors are the usual culprit: remove the last use of something and you must remove its import/declaration too.

### Definition of done for ANY code change — agents included

Before declaring a task complete, run both and reach **zero new problems in the files you touched**:

```bash
npm run typecheck   # tsc --noEmit — type errors + unused locals/params
npm run lint        # eslint .    — no-explicit-any, unused vars, hook deps, fast-refresh
```

- **Agents must run these explicitly.** You cannot rely on the preview (esbuild skips type errors) or on a human catching it later. Verifying behavior in the running app and verifying type/lint cleanliness are *two separate steps* — do both.
- **Never add to the error count.** Pre-existing errors elsewhere are not yours to fix in passing, but your diff must not introduce a single new `error TS…` or ESLint error. Grep the output for the files you changed to confirm.
- **No `any`** — it's lint-enforced; use `unknown` + a type guard or an explicit cast (see "No `any`" above).
- **Clean up as you go** — if a refactor orphans an import/variable, delete it in the same change; `typecheck` will flag it if you forget.

### Automated gates — now in place

The manual definition-of-done above is still the per-change discipline, but two automated gates now enforce it (the backlog was driven to zero first, so they hold from a clean baseline):

- **Pre-commit hook** — `.githooks/pre-commit` runs client `typecheck` + `lint` whenever staged files include `client/src/**/*.{ts,tsx}`. Dependency-free (no husky); activated by the root `package.json` `prepare` script (`git config core.hooksPath .githooks` on `npm install`). Bypass with `git commit --no-verify`.
- **CI** — `.github/workflows/ci.yml` runs on push to `main` and every PR: `npm ci`, `npm run lint --workspace=client`, and `npm run build` (client `tsc -b && vite build` + server `tsc`). Build/lint failures should block merge.
- **Keep the baseline at zero.** Treat any real type mismatch (e.g. a property that doesn't exist on a type) as a latent runtime bug, not just noise — fix the code or the type, don't silence it. If CI's `npm ci` ever fails on a lockfile mismatch, run `npm install` and commit the updated `package-lock.json`.

---

## Component Patterns

### MetricCard

The primary display primitive for numeric metrics. Use `benchmarkValue`, `rawValue`, `neutral`, and `scale` to drive color coding:

```tsx
<MetricCard
  title="Sharpe 3Y"
  subtitle="vs category benchmark"
  displayValue={fundSharpe !== null ? fmtNum(fundSharpe) : EMPTY}
  rawValue={fundSharpe}
  neutral={bmkSharpe ?? 0}
  scale={2}
  higherIsBetter={true}
  benchmarkValue={bmkSharpe}
  components={bmkSharpe !== null ? [{ label: 'Benchmark', value: fmtNum(bmkSharpe) }] : []}
/>
```

- **Color coding with two benchmarks:** when both `benchmarkValue` (b1) and `benchmark2Value` (b2) are passed, the value is green if it beats both, red if it beats neither, yellow if it beats one. Used to compare a metric against benchmark + peer (or against its own prior years).
- **`title` accepts `ReactNode`**, not just a string — pass JSX for inline emphasis, e.g. `title={<>Operating Margin <span className="font-bold text-gray-700">TTM</span></>}`.
- **`subtitle` only renders when non-empty.** Pass `subtitle=""` to omit it; the value stays vertically centered between the header and the component-row separator.

### StockScorecardPanels

The stock Scorecard cards (Operating Margin, FCF Margin, Revenue/EPS Growth TTM, Revenue/EPS Growth 3Y) live in `StockScorecardPanels.tsx` and pull derived metrics from `lib/fmpRatios.ts`. When showing a TTM headline plus prior fiscal-year rows, use `priorFullYears()` to drop the latest annual year if it equals the TTM (a fiscal year that just closed is fully captured by the TTM window — otherwise the first row duplicates the headline). Benchmark/peer comparison rows strip the "Total Return" suffix via `stripTotalReturn()` from `lib/formatters`.

### Benchmark data

There are **four** benchmark tables: `category_benchmarks`, `sector_benchmarks`, `peer_group_benchmarks`, `model_portfolio_benchmarks`. The legacy standalone `benchmarks` table was **dropped** (Jun 2026) — it was unused; do not reference it.

- `category_benchmarks` — broad asset-class benchmarks; column is `category_ticker` (not `ticker`), renamed to `ticker` in the fetch layer. **One ticker can serve multiple categories** — the unique key is the composite `(category_ticker, category)`, not ticker alone.
- `sector_benchmarks` — sector ETF benchmarks; column is `ticker` (unique).
- Benchmark **data access lives in `lib/benchmarks.ts`** (`fetchBenchmarkOptions`, `fetchSectorBenchmarkOptions`, `fetchBenchmarkByName`, `fetchBenchmarkAll`, `fetchCategoryBenchmark`, `fetchPeerGroupBenchmark`, `fetchBenchmarkTable`, plus the `BenchmarkOption` type and SELECT column lists). `BenchmarkPickerModal` is now just the picker UI and imports the fetchers from there (it no longer exports data fns). When adding a benchmark column, add it to the SELECT strings **and** the `BenchmarkOption` interface in `lib/benchmarks.ts`.
- Growth columns are YCharts **annualized** figures: `sales_growth_1_yr_generic`, `eps_growth_1_yr_generic`, `sales_growth_3_yr_generic`, `eps_growth_3_yr_generic` (the 3-yr ones are annualized CAGRs, comparable to derived stock 3Y CAGRs).

### LocalStorage persistence for UI state

Benchmark selections in return tables are persisted to localStorage with key `fund_benchmarks_${securityId}`. Changes dispatch a `benchmark-changed` CustomEvent so sibling components stay in sync.

---

## FMP Financial Metrics

Financial figures are fetched on-demand from Financial Modeling Prep (stable API) in `lib/fmpFinancials.ts` (income statements, estimates, earnings) and `lib/fmpRatios.ts` (margins, growth, CAGR). They are **not** persisted to Supabase — only derived aggregates land on `securities2` via `fmpSync.ts`.

**Shared FMP plumbing lives in `lib/fmpClient.ts`** — `FMP_STABLE`/`FMP_V3`, the guarded `apiKey()`, `num()`/`str()`/`asArray()`/`firstItem()`, `fmpFetch()`, and `fmpSymbol()`. All `fmp*.ts` modules import from it instead of redefining the boilerplate. `fetchScorecardMetrics` fetches each distinct endpoint at most once (ratios-ttm, cash-flow-ttm, income-statement-ttm, annual income limit=4) and derives all six scorecard metrics from the shared rows — 4 calls, not 7. The standalone exported fetchers (`fetchFcfMargins`/`fetchTtmGrowth`/`fetchCagr3y`/`fetchRatiosTTM`, used by `StockScorecardPanels`) are unchanged.

### Stock detail page reads FMP on-demand, not `securities2`

For **stocks** (not funds), the detail page pulls these live via `useQuery` rather than reading synced `securities2` columns:

| UI | Source | securities2 column it replaced |
|---|---|---|
| Header identity — company name, description, sector, industry | `lib/fmpMarket.ts` (`fetchProfile`, `/stable/profile`) | `security_name`, `long_description`, `morningstar_sector`, `morningstar_industry` |
| Scorecard margins/growth/CAGR | `lib/fmpRatios.ts` | — |
| Analyst panel (targets, grades, consensus) | `lib/fmpAnalyst.ts` (`fetchAnalystData`) | `consensus_recommendation_label` |
| Price + 52-week range | `lib/fmpMarket.ts` (`fetchQuote`) | `close_price`, `year_high`, `year_low` |
| Header next-earnings + review-modal dates | `lib/fmpMarket.ts` (`fetchEarningsDates`) | `last_earnings_release`, `next_earnings_release` |
| Total Performance — security row | `lib/fmpMarket.ts` (`fetchStockReturns`, dividend-adjusted EOD prices) | `*_total_return_nav` |

- **There is no "Sync from FMP" button on the stock page** — it was removed. All stock-page data is on-demand `useQuery` (gated on `isStock`); identity/returns/price/earnings/consensus/scorecard all refresh on load (≤ `staleTime`) with no manual sync.
- Identity uses `(isStock ? profile.x : null) ?? security.x` — live FMP for stocks (so new positions aren't blank), stored `securities2` value as fallback and for funds. **Excel can no longer write these four** (mapped to `null` / in the `SKIP` set in `securities2ExcelUpload.ts`).
- The **benchmark return rows** (Total Performance on Overview *and* the Monitor Alternatives "Trailing Returns" table) are now **live FMP total return via a representative ETF**, not the YCharts return columns. FMP serves none of the TR index symbols (`^SPXTR`, `^RLGTR`, the `^SP15…STR` sector indices — all confirmed *not found*), so `BENCHMARK_ETF_PROXY` / `benchmarkEtfProxy(ticker)` in `lib/benchmarks.ts` maps each benchmark `ticker` to its ETF (S&P 500→IVV, Russell style→IW{F,D,P,R,O,M}, S&P sectors→SPDR XL{K,F,V,Y,C,I,P,U,E,RE}); the ETF's dividend-adjusted returns come from the same `fetchStockReturns` used by the security row, so all periods (incl. 5D) populate. Unmapped benchmarks fall back to the stored YCharts columns. The Total Performance benchmark label shows a `· <ETF>` proxy tag. (Stocks only — funds keep their stored comparison.)
- **`fmpSync.ts` was slimmed (Jun 2026 Phase 1).** 41 write-only stock-analytic columns (price snapshot, margins, growth, valuation, analyst counts, price targets, `dividend_yield`, `enhanced_market_beta_60_month`) were **dropped from `securities2`** (267 → 229 cols) — nothing read them; they were removed from the `SecurityDetail` type too. `syncStockFromFMP` now fetches only 4 endpoints (profile, two price-history, earnings) and writes only identity, earnings dates, `*_total_return_nav` returns, and risk metrics. It runs from Settings → Import/Export (bulk), not the stock page. `securities2ExcelUpload.ts` strips the dropped columns via `RETIRED_SECURITIES2_COLS`. Header **Consensus** = `grades-consensus` `consensus` string (on-demand).
  - **Stale selects on dropped columns** — now caught at compile time. A PostgREST `select` (top-level or embedded `securities2(...)`) naming a dropped column 400s the *entire* query at runtime. This bit `lib/positions.ts`, which embedded `securities2(..., dividend_yield)` after the slim-down and silently failed every portfolio's positions load. Since the client is schema-typed (see "The client is schema-typed"), such a select now fails `tsc`/CI instead — but keep `client/src/types/database.types.ts` regenerated after schema changes, or the check goes stale.
  - **`securities2.thesis`** is an advisor-authored thesis column (added Jun 2026), distinct from the vendor-sourced `long_description`. The detail-page thesis editor reads it via `getThesisText` and writes it via `updateSecurityThesis`. (The dead `lib/securityFields.ts` field-registry, which mapped to retired columns, was deleted — do not resurrect a `securities2` select from a column registry without schema-checking it.)
- `fetchEarningsDates` derives last = most recent release ≤ today, next = soonest release > today, from `/stable/earnings` (which lists past + scheduled releases).

### Stock detail tab layout

Tabs are **Overview · Monitor · Documents** (no Alternatives tab; the Research tab was removed and its blocks redistributed).
- **Overview:** Scorecard cards · Total Performance · (Analysts | News) side by side (Alerts card under Analysts) · the **Investment Thesis card** (Thesis · Risks · Exit Criteria · Review Schedule · Review History).
- **Monitor:** Scorecard cards (with Review button) · the two **Alternatives comparison tables** · **Transcripts** · **Financials**.

### Alternatives comparison tables (`AlternativesPanel.tsx`)

Rendered on the **Monitor tab** below the scorecard: two tables (Scorecard metrics + Trailing returns), columns **Position · Ticker · …metrics**, one row per security: **Security · Alt 1 · Alt 2 · Alt 3 · Benchmark 1 · Benchmark 2**.

- The three Alt slots are **editable ticker inputs (in the Ticker column) persisted to `securities2.alt_1/alt_2/alt_3`** (via `saveAlternatives`, saved on blur, uppercased, blank → null). The Position column shows the company name (from FMP `/profile` for alt rows via `fetchProfile`).
- **The stock detail header "Related:" tags are these `alt_1/2/3` tickers** (plain pills, not links), so they stay in sync with the Monitor tab. On blur, `saveAlternatives` invalidates `QUERY_KEYS.security(id)` so the header refreshes live. **Funds** keep sourcing the header "Related" tags from the Excel-uploaded `security_related_securities` table; the `SecurityDetailPage` relatedSecurities query is gated `enabled: !isStock`. (`security_related_securities` is otherwise left alone — it's only the *display source* that differs by asset type.)
- Alt/security metrics are fetched **on-demand and not persisted**: `fetchScorecardMetrics` (one call → all six scorecard values) and `fetchStockReturns`, keyed per symbol so rows dedup with the rest of the page.
- The shared table is rendered via a **plain inline function, not a JSX component** — defining it as a `<Component/>` would remount the subtree each render and the Alt `<input>` would lose focus on every keystroke.
- The state-reset `useEffect` depends on **`[security.id]` only** — NOT the alt columns. Including query-backed fields would let `refetchOnWindowFocus` (fires when the user tabs back from looking up a ticker) clobber in-progress edits.
- Benchmark scorecard cells: growth columns map to the YCharts `*_generic` fields (1-yr generic for the TTM columns, 3-yr for 3Y); margin columns show `—` (benchmarks have no margin data). Returns map to the benchmark return columns.

### Fund alternatives (`FundComparisonPanel.tsx`)

Funds get the same "alternatives" idea, but the data model is different because **funds have no on-demand source** (FMP is stocks-only). The comparison funds' metrics are **stored**, sourced from the YCharts fund template's **"Related" sheet**.

- **Dedicated `fund_alternatives` table** — `securities2` is reserved for model-portfolio securities, so comparison funds do **NOT** go there. Each row is one `(parent_security_id → securities2, related_security_id, sort_order)` link with the related fund's comparison metrics inline (`security_name`, expense ratio, Sharpe/Sortino/StdDev/MaxDrawdown 3Y, the six `*_total_return_nav`). Unique on `(parent_security_id, related_security_id)`; `ON DELETE CASCADE` from the parent. (This replaced an earlier approach that put comparison funds in `securities2` behind an `is_comparison_only` flag — that flag and its filters are gone.)
- **Upload:** `fundBulkUpload.ts` parses the "Related" sheet — Col A non-empty marks a parent's `security_id`; rows below are its related funds (Col B = ticker, Col C+ = same metrics as the Securities sheet, so it reuses the Securities `colNames`). `pickComparisonMetrics()` selects the stored subset; each parent's alternatives are delete+insert (a re-upload refreshes cleanly).
- **UI:** `FundComparisonPanel` (fund detail page, below Total Performance) renders two tables (Risk & Ratios + Trailing Returns) via `fetchFundComparison` — row [0] is the parent fund (from `securities2`), the rest from `fund_alternatives`. Renders nothing when the fund has no alternatives. (Contrast stocks: `AlternativesPanel`, user-typed `alt_1/2/3`, on-demand FMP.)

### News & Alerts (`NewsAlertsPanel.tsx` + `lib/fmpNews.ts`)

On the Overview tab. News and Press Releases are company-specific feeds, side by side, 5 each.

- Use `/stable/news/stock?symbols=` and `/stable/news/press-releases?symbols=` — **NOT** the `*-latest` endpoints, which return a GLOBAL feed and ignore the symbol filter. Results come back newest-first; no client-side sorting.
- Each item shows publisher · date above the title (title links out); no domain/url text, no snippet.
- "Alerts" is a separate placeholder card under Analysts (not part of `NewsAlertsPanel`).
- **Alert-rules management was removed as dead code.** The `alert_rules` table still exists, but the rule CRUD UI (`AlertRulesSection`) and the firing engine (`fireAlertIfBreached`) were never wired up and are deleted. `lib/alertRules.ts` keeps only the live path: `fetchUnacknowledgedAlerts` + `acknowledgeAlert` (the HomePage "Performance Alerts" list reads/acks `alert_events`). Rebuild the rule/fire side deliberately if alerts are wanted — don't assume it exists.

### At-Risk criteria mirror the scorecard

`AT_RISK_METRICS_BY_ASSET_CLASS.stock` in `lib/atRisk.ts` lists the same six metrics as the stock Scorecard cards (Operating Margin TTM, FCF Margin TTM, Revenue/EPS Growth TTM, Revenue/EPS Growth 3Y). Keep them in sync when the scorecard changes. Funds use the `equity` / `fixed income` sets.

### Field-name conventions (stable vs v3)

- The `stable` endpoints use **`epsDiluted`** (capital D) and **`fiscalYear`**; the legacy v3 endpoints use **`epsdiluted`** (lowercase) and **`calendarYear`**. Always read `epsDiluted ?? epsdiluted`. **Use diluted EPS** for all EPS metrics, never basic `eps`.
- Annual income statements use the stable endpoint (`period=annual`). **Do not** overwrite annual revenue/EPS with values from the `/earnings` endpoint — that endpoint is quarterly, so matching it to an annual period substitutes the Q4 figure for the full year. (The quarterly fetch legitimately does use `/earnings` values.)

### FMP has no native CAGR / TTM-growth / FCF-margin fields — derive them

- **FCF margin** = `freeCashFlow / revenue` (cash-flow + income statements). `operatingCashFlowSalesRatio` is OCF margin, not FCF.
- **TTM growth** (`fetchTtmGrowth`): `income-statement-ttm` returns rolling TTM snapshots, newest first — `row[0]` is current TTM, `row[4]` is the TTM one year (4 quarters) ago. Growth = `row[0] / row[4] - 1`.
- **3-year CAGR** (`fetchCagr3y`): annual basis — latest FY vs FY three years prior, `(latest / base)^(1/3) - 1`. (A TTM basis using `row[0]` vs `row[12]` is possible but anchors on a single trailing window and can distort off a one-time-charge trough.)
- **Suppress growth/CAGR when the base is ≤ 0** — a ratio across a zero/negative base (common for EPS) is meaningless; return `null`.
- These are GAAP figures; they won't match YCharts "Normalized" metrics, which exclude one-time items.

---

## Real-Time Quote Streaming (WebSocket)

Live last-trade prices come from FMP's stocks WebSocket, **not** REST. This is the one place the app uses a push (not pull) data source, so it lives **outside** TanStack Query.

### Architecture — two cooperating systems

- **`lib/quoteStream.ts`** — a pure, React-free **singleton** WS client. One shared connection for the whole app, opened lazily on the first subscription and closed when the last subscriber leaves. Ref-counted per-symbol subscriptions (a symbol shown in two places opens one upstream sub). Ticks are coalesced into a 200ms flush window. Reconnect with exponential backoff; the symbol registry is replayed on every (re)connect; the socket drops while the tab is hidden and reopens on return.
- **`hooks/useLiveQuote.ts`** — `useSyncExternalStore` binding. `useLiveQuote(symbol)` re-renders **only** when that symbol ticks; `useQuoteConnectionState()` exposes `'idle' | 'connecting' | 'open' | 'reconnecting'`. Built on React 18's `useSyncExternalStore` — **no new state-management dependency**.

**Do NOT route ticks through TanStack Query.** It's pull/cache-based; pushing high-frequency ticks through `setQueryData` re-renders every observer and fights `staleTime`. The seam: **TanStack owns the REST baseline** (prev close, constituents, 52-week range); **quoteStream owns the live last-price leg**; components merge them (`live?.price ?? restValue`). When the socket is down/unconfigured, `useLiveQuote` returns `null` and the REST value stands in unchanged — graceful degradation, zero behavior change.

Endpoint defaults to `wss://websockets.financialmodelingprep.com`, overridable via `VITE_FMP_WS_URL`. Live data is **never persisted** (consistent with the on-demand-FMP convention).

### FMP WebSocket protocol — three hard constraints (each caused a real bug)

1. **Wait for the `login:200` ack before sending `subscribe`.** A subscribe that races ahead of auth gets `401 "Unauthorized"` — you authenticate but receive **zero** ticks, silently masked by the REST fallback. `quoteStream` flushes the subscription registry only on the login ack.
2. **Only ONE connection per API key, and ≤100 subscribed symbols.** A newer connection kicks the older with `{event:'login',status:401,message:'Connected from another location'}`. Two tabs/instances — **or the FMP website's own "Quote Feed Connector"** — will fight over the single slot. `quoteStream` supersedes gracefully (no auto-reconnect after a kick; the active tab reclaims on visibility). When debugging "no live data," check for a competing holder first. Separately, a `subscribe` with **>100 tickers is rejected wholesale** (`{event:'subscribe',status:401,message:'...limit of subscriptions...100 symbols'}`) — *no* symbols stream, not just the overflow. Surfaces that can exceed 100 (e.g. the Index Movers board) must use REST polling, not the stream.
3. **Tick `t` is epoch nanoseconds**, not ms — divide by 1e6. Read `lp` (last price) for the current price; it's present on both trade (`type:'T'`) and quote (`type:'Q'`) frames. Symbols come back lowercase; the store keys them UPPER to match `security_id`.

### Consumers

- **Stock-detail price** (`AnalystCoveragePanel`) — live overlays the REST `fetchQuote`, with a "Live" indicator.
- **At-Risk** (`AtRiskPage`) and **Watchlist** (`WatchlistPage`, prospects) — live price per card, gated to non-mutual-fund types via a `streamable` prop (FMP streams stocks/ETFs, not mutual funds).
- **Index Movers board** (`/index-movers`, `pages/IndexMoversPage.tsx`) — top-20 gainers/losers for **S&P 500 / Nasdaq 100 / Dow Jones** (the only indices with FMP constituent endpoints; Russell has index quotes but no constituent list). **This board does NOT use the websocket** — FMP caps websocket subscriptions at **100 symbols per API key**, so a 500-name (even a 101-name) board can't stream; a >100 subscribe is rejected wholesale with a 401 and *nothing* ticks. Instead the baselines query is **polled** (`refetchInterval`, 5s; pauses while the tab is hidden) and `hooks/useIndexMovers.ts` is a pure `useMemo` that re-sorts the latest prices. `lib/fmpIndexMovers.ts` fetches constituents (`/stable/{sp500,nasdaq,dowjones}-constituent`, cached 24h) and baselines (`/stable/batch-quote-short`, chunked ≤100/call, prevClose = `price − change`). **`%` change = `(price − prevClose) / prevClose`.** Do **not** use `/biggest-gainers` or `/biggest-losers` — they are a GLOBAL, micro-cap-dominated feed that ignores index membership. Rows whose ticker is in `securities2` (the tracked universe — looked up via `fetchSecurities`, UPPER `security_id` → numeric `id`) render the symbol as an indigo link to `/security/:id` with a leading dot; untracked rows are plain text.

## Review Schedules (stocks)

Stock reviews are earnings-driven, not cadence-driven (cadence is set by the model portfolio and is hidden from the review UI). The `MarkReviewedModal` shows three dates:

- **Review Date** = `last_earnings_release + 1 day` — the system-scheduled due date (read-only).
- **Date Reviewed** = today, when the button is clicked (read-only) → `review_log.reviewed_at` + `review_schedules.last_reviewed_at`.
- **Next Review Date** = `next_earnings_release + 1 day` → `review_schedules.next_review_at`.

`review_log.review_date` persists the scheduled due date alongside `reviewed_at`. `markReviewed()` takes an options object with explicit `reviewDate` / `nextReviewAt`; when omitted (funds), it falls back to cadence-based scheduling. Funds keep the legacy editable-date + cadence flow. `review_schedules.cadence` is NOT NULL, so always write a cadence value even when it's UI-hidden.

For stocks, `last_earnings_release` / `next_earnings_release` driving these dates come **live from FMP** (`fetchEarningsDates`), passed into `MarkReviewedModal` — not from the YCharts Excel upload. (`fmpSync` also writes the same `securities2` columns for funds/list views.)

### Stock review captures an investment recommendation (not a process outcome)

A **stock** review records a buy/sell/hold decision with a documented rationale and a frozen evidence snapshot (for audit defense). The stock path of `MarkReviewedModal` shows: a **Recommendation** (`buy` / `add` / `hold` / `trim` / `sell`, required), **conviction** (`high` / `medium` / `low`, optional), and a **required Rationale** (stored in `review_log.notes`). It has **no "Reviewed by" or "IPS suitable"** fields (single-user). Types + labels live in `lib/reviewLog.ts` (`Recommendation`, `Conviction`, `RECOMMENDATION_*`, `CONVICTION_*`).

- `review_log` columns: `recommendation`, `conviction`, `price_at_review` (numeric), `metrics_snapshot` (`jsonb`, shape = `ReviewMetricsSnapshot`). All nullable; **funds leave them null** and keep the `outcome` enum (Maintain/Propose/At-Risk → `no_issues`/`flagged_for_action`/`placed_on_watchlist`). Stocks leave `outcome` null.
- The **evidence snapshot is frozen at submit time** from on-demand FMP (`fetchScorecardMetrics` + `fetchAnalystData` + `fetchQuote`, deduped with the page's queries) so a review stays reconstructable later even though stock metrics are never persisted. `ReviewLogSection` shows the recommendation badge, conviction, rationale, and the frozen metrics.
- `markReviewed()` takes `recommendation` / `conviction` / `priceAtReview` / `metricsSnapshot`; pass them for stocks, null for funds.

## Portfolio Reviews (cadence-driven)

Portfolio-level reviews are **separate from per-security reviews** (above) and from the per-security `review_schedules`/`review_log` tables. Each portfolio carries **three independent cadence timers** — monthly, quarterly, annual — that advance separately. Data layer is `lib/portfolioReviews.ts`. The Reviews tab on `PortfolioDetailPage` renders `PortfolioReviewsPanel` (the three cadence status cards + completed-review history); **"Start Review" navigates to a dedicated workspace page** (`PortfolioReviewWorkspace`, route `/portfolio/:portfolioId/review/:cadence`) — there is no longer a review modal. The workspace is the right container for the data volume (a 29-holding grid + per-holding scorecards + watchlist), and the annual review will have more sections still.

### Two tables

- **`portfolio_review_schedules`** — one row per `(portfolio_name, cadence)` (unique constraint on that pair; FK `portfolio_name → portfolio.name ON DELETE CASCADE`). Columns: `cadence` (`monthly`/`quarterly`/`annual`), `last_reviewed_at`, `next_review_at`. **Every portfolio has all three rows** (`next_review_at = now()`): existing portfolios were back-filled by the seed migration, and new portfolios get theirs automatically via an `AFTER INSERT` trigger on `portfolio` (`seed_portfolio_review_schedules()`, idempotent `ON CONFLICT DO NOTHING`). The rows cascade-delete with the portfolio. Cross-portfolio "due" queries (`fetchPortfolioReviewSchedules`) drive the HomePage **"Portfolio Reviews Due"** card.
- **`portfolio_review_log`** — the review record (draft *or* completed). `status` (`draft`/`completed`, default `completed`); a **partial unique index `(portfolio_name, cadence) WHERE status='draft'`** enforces at most one open draft per cadence (resuming reuses it). Other columns: `cadence`, `review_date` (the due date it addressed), `reviewed_at`, `completed_at`, `next_review_at`, `notes` (summary), and **`checklist` `jsonb`** = `ReviewChecklistItem[]` (each `{key, label, done, notes}`, one per section). History (`fetchPortfolioReviews`) filters `status='completed'`. The legacy `outcome`/`period`/`reviewed_by` columns are nullable and unused.

### Checklists are the documented process

`PORTFOLIO_REVIEW_TASKS` in `lib/portfolioReviews.ts` defines the fixed task list per cadence (monthly: performance attribution · position sizing; quarterly: full monitoring review · update thesis scorecards · update watchlist status · check valuation changes; annual: deep review of every holding · rebuild conviction rankings · reassess portfolio construction · check valuation changes). These are hard-coded, not per-portfolio editable — change them here and the workspace sections + history follow. **In the workspace each task is a section** (left nav); a section = its special content (below) + a "Mark reviewed" toggle (the `done` flag) + section notes.

### Workspace draft lifecycle

`PortfolioReviewWorkspace` opens a **draft** via `startOrResumeDraft(portfolioName, cadence, dueDate)` (resumes the open draft for that cadence, else creates one with a seeded checklist). Edits live in local state and **autosave on a 1.5s debounce** (plus an explicit "Save draft") via `saveReviewDraft` (checklist/notes/dates) + `saveHoldingReviews` (per-holding, delete-then-insert). **"Complete review"** calls `completeReview(...)` — stamps `status='completed'` + `completed_at`, sets `reviewed_at`/`next_review_at`, and advances ONLY that cadence's `portfolio_review_schedules` row (`onConflict: 'portfolio_name,cadence'`) — then navigates back. `next_review_at` defaults to the cadence interval (+1mo/+3mo/+1yr). The workspace init query uses **`gcTime: 0`** and `completeReview`'s `onSuccess` **must not invalidate** `['review_workspace', …]` — otherwise a mid-session refetch resurrects a fresh draft. `isOverdue`/`isDueSoon` are re-exported from `reviewSchedules.ts`. After completing, invalidate `portfolioReviews(name)`, `portfolioReviewSchedules`(+`For`), `holdingReviews(name)`. The resolved `modelPortfolio` (for sizing bands) comes from the shared `useResolvedModelPortfolio` hook (`hooks/usePortfolio.ts`).

### Section content

- **`performance_attribution`** (monthly) → `AttributionMovers` — top-5/bottom-5 holdings by trailing 30-day total return (`fetchPortfolioMovers`, FMP dividend-adjusted closes; cash/unpriceable dropped).
- **`position_sizing`** (monthly) → `PositionSizingCheck` — **allocations file upload** (YCharts export: col A ticker, col B weight %; `.xls/.xlsx/.csv`). `parseActualAllocations` + `compareSizing` (`lib/positionSizingCompare.ts`) compare each holding's actual weight to its effective band and surface **only breaches**. Display-only. Bands from `computePositionBands` (`lib/positionBands.ts`) — explicit limits win, else `roundToHalf(target × (1 ± drift%/100))`; cash uses model cash limits. Keep in sync with the same logic inlined in `PortfolioDetailPage`.
- **`full_monitoring`** (quarterly) → `HoldingMonitorGrid` — five review *areas* as guidance, then a per-holding grid of five categorical assignments: **Thesis Status** (intact/at_risk/broken), **Business Trend** (improving/stable/deteriorating), **Valuation** (attractive/fair/expensive), **Conviction** (high/medium/low), **Action** (add/hold/trim/exit/watchlist).
- **`thesis_scorecards`** (quarterly) → `ThesisScorecardSection` — collapsible per-holding cards with five text fields (original thesis, what changed this quarter, evidence for, evidence against, current conclusion). "Evidence behind the ownership decision," not a thesis rewrite.
- **`watchlist_status`** (quarterly) → `WatchlistStatusSection` — trigger reference + a per-holding flag; when flagged, a trigger select (6 enum tokens) + reason / required improvement / review deadline / exit trigger.
- **`deep_review`** (annual) → `DeepReviewSection` — the "build from scratch today?" purpose + 7 guidance areas (business quality · competitive position · management · financial strength · growth runway · valuation · alternatives), then a per-holding **decision** (keep/increase/reduce/replace/exit) + optional rationale.
- **`conviction_rankings`** (annual) → `ConvictionRankingSection` — tier reference (Tier 1–4 → meaning + target band), then a per-holding **tier** select with current weight, the tier's target band, an **amber out-of-band flag** when the weight doesn't fit the tier, and a prior-conviction hint (most recent quarterly `conviction` from history). The **target bands are editable per model portfolio** — `model_portfolio_data.tier{1..4}_{lower,upper}` (defaults 5–7/3–5/1–3/0–1, set in the Edit Model Portfolio modal's "Conviction Tiers" table); `resolveTierInfo(modelPortfolio)` in `lib/holdingReviews.ts` reads them (falling back to the framework defaults) and the workspace passes the result as `tierInfo`.
- **`portfolio_construction`** (annual) → `PortfolioConstructionSection` — whole-portfolio (not per-holding): quick stats (# holdings, cash %), the 8 check areas, and the key annual question; the advisor's assessment goes in the section notes.

### Per-holding data → `holding_reviews`

All per-holding facets (quarterly #1 monitoring / #2 thesis scorecard / #3 watchlist; annual deep-review decision+notes + conviction tier) live on one **`holding_reviews`** row per `(review_log_id, security_id)` (unique; FKs to `portfolio_review_log` + `portfolio`, both `ON DELETE CASCADE`; CHECK constraints on the enum columns — incl. `annual_decision`, `conviction_tier` 1–4). A given cadence uses its own subset of columns; others stay null. Stored separately from the review's checklist jsonb so they're **queryable across reviews over time** (the annual conviction-ranking section reads prior quarterly conviction this way). Types/labels/options + `saveHoldingReviews` (delete-then-insert, skips empty), `fetchHoldingReviewsForLog` (resume), and `fetchHoldingReviewsByPortfolio` (history) live in `lib/holdingReviews.ts` (DB stores lowercase tokens). Manual-entry, **recorded-only** (no At-Risk/Watchlist side effects yet). `PortfolioReviewLog` shows a per-review summary (action breakdown + thesis at-risk/broken count). Query key: `holdingReviews(name)`.

## New-Security Workflow (candidates)

A guided "add a new **stock** to a portfolio" workflow, mirroring the review workspace (dedicated page, left section-nav, draft autosave + Complete). Launched from the portfolio detail page's **Candidates tab** (`CandidatesPanel`): enter a ticker → `createCandidate` inserts a draft row → navigates to the workspace (`SecurityAdditionWorkspace`, route `/portfolio/:portfolioId/candidate/:additionId`). Data layer is `lib/securityAdditions.ts`.

- **`security_additions` table** — one row per candidate: `portfolio_name` (FK `portfolio` ON DELETE CASCADE), `security_id` (ticker, UPPER, no securities2 FK — candidate may not be held yet), `status` (`draft`/`completed`), `decision` (`approve`/`watchlist`/`reject`, derived from `content.decision`), **`content` jsonb** (all section field values keyed by field), **`checklist` jsonb** (`[{key,label,done,notes}]` per stage). Partial unique index `(portfolio_name, security_id) WHERE status='draft'` (one open draft per ticker). Unlike the review workspace, the row is created explicitly (no create-or-resume on mount), so the workspace just fetches by id — no stray-draft gymnastics.
- **Stages** = the documented buy process 3–8 (1–2 idea-generation/screening are non-actionable, omitted): **Full Research** (business overview · thesis · risks · financial review · valuation · portfolio fit) · **Portfolio Fit Review** (strategy/sector/factor/existing-holdings) · **Approval Decision** (thesis strength · expected return · downside risk · fit · decision · rationale) · **Position Sizing** (conviction → 4–5/2–4/1–2% reference · initial/max weight · reason) · **Purchase** (date · price · allocation · funding · rationale) · **Monitoring Setup** (success criteria · watchlist triggers · exit triggers). `ADDITION_STAGES` in `lib/securityAdditions.ts` defines the stages + fields (rendered generically by `type`: textarea/text/number/date/select); change them there and the workspace + summary follow.
- **Recorded-only** — no side effects into Watchlist/positions/At-Risk yet (a `watchlist`/`approve` decision is captured but doesn't create a prospects/position row). Query keys: `securityAdditions(name)` (list) + `securityAddition(id)`.

## Documents (Express file store)

Files live in the Express server's file store (`server/`, `/api/files|upload|folders|files/signed-url`), organized into **named folders**. The client lives in **`lib/documents.ts`** (`fetchAllFiles`, `uploadFile`, `deleteFile`, `getSignedUrl`, `createFolder`, `deleteFolder`, `formatBytes`, `StoredFile`) — shared by **Settings → Documents** (`DocumentsPage`, all folders) and the **per-portfolio Documents tab** (`PortfolioDocumentsPanel`, on `PortfolioDetailPage`). A portfolio's documents use a **folder named after the portfolio** (`file.folder === portfolioName`); uploads go to that folder. Both surfaces share the `documentsFiles` query key, so an upload in one reflects in the other. When the server is down the panel shows a graceful "Express server not reachable" banner (`cd server && npm run dev`).

## Portfolio Allocations & Performance

### `portfolio_allocations` is the dated-allocation source of truth

A portfolio's allocation **history** lives in `portfolio_allocations` — one row per `(portfolio_name, effective_date, security_id, weight)`, where each `effective_date` is a full target weight vector (weights are **percent points**, e.g. `6.50` = 6.5%). This is the normalized form of the YCharts "dynamic" grid (dates as columns). It **replaced `holdings_change_log`** as the source of truth for both allocation history and performance — the Change Log tab still reads the old delta log but nothing uses it for performance. `lib/portfolioAllocations.ts` owns the data layer (`fetchAllocationGrid`, `fetchAllocationSnapshots`, cell upsert, add/delete date, bulk import); `positions` still holds the *current* target allocation separately.

- **No DB FK to securities2** — the table intentionally stages arbitrary import symbols (incl. tickers not yet in `securities2`), so PostgREST **cannot embed** `securities2(...)`. Resolve names with a **separate `securities2` lookup** keyed by the distinct symbols, never an embed (an embed 400s — "no relationship found").
- **UI:** the **Allocation → History** sub-tab (`AllocationHistoryPanel`) is the editable grid (dates as columns, securities as rows, per-date totals, add/delete date, add ticker). Production-editable.
- **Allocation → Comparison** (`AllocationComparison`) compares the portfolio to its model benchmark across Asset Allocation · Statistical Analysis · Equity Style · **Fixed Income Style** · Equity Sector · Regional sections. The **Fixed Income Style Analysis section is hidden for all-equity portfolios** (`portfolio_strategy === 'Equity'` — Core Growth, Equity Income, Equity Income & Core Growth; zero bonds), since it's meaningless there.
- **Importer:** the YCharts dynamic **source file is the LONG format** — columns `Date · Symbol · Target Weight`, one row per holding per date, weights in **decimal** (0.075 = 7.5%). `parseYchartsDynamic` pivots it to dated snapshots; `$:CASH` normalizes to `$Cash`. (Not the wide grid shown in the YCharts editor.)

### Performance engine (`lib/portfolioPerformance.ts`)

**Buy-and-hold drift, rebalancing only at the snapshot dates** — nothing else feeds it (no model data, no change log, no benchmarks). Consecutive snapshot dates are episode boundaries; within an episode shares are held fixed and weights drift, then rebalance to the next snapshot's targets (NAV preserved across the boundary).

- **Stocks** are priced from FMP **dividend-adjusted** daily closes (`fetchDailyAdjustedSeries`). **`$Cash` and anything FMP can't price** (money-market funds like FISXX, unknown tickers) are **held flat** at 0% with weight preserved — so every episode stays 100% invested, no renormalization. Returns are **gross, time-weighted** (no fees/taxes/slippage). Funds/ETFs are out of scope for now.
- **Class tickers map to FMP's hyphen form** (`BRK.B` → `BRK-B`) via `fmpSymbol = s.replace(/\./g, '-')`, in both this engine and `fmpSync.syncStockFromFMP`. The DB row keeps the original `security_id`; only the FMP fetch uses the mapped symbol.
- `computePortfolioPerformance(name, start, end)` returns the daily NAV series + episodes. `computePortfolioPeriodReturns(name)` builds **one** inception→today series and derives all standard periods (1D, 5D, 1Mo, 3Mo, YTD, 1Yr, 3Yr, 5Yr, 10Yr, All Time) as ratios off it. Periods ≤ 1 year are cumulative; **3Y/5Y/10Y and All Time are annualized**; periods reaching before inception show `—`. `PortfolioPerformancePanel` renders this as a Total-Returns-style table on the Overview tab (no benchmark row, auto-computed, cached).
- **Base-date convention:** the first episode anchors NAV on the close **on/before the window start** (fetch is buffered ~10 days earlier so the prior close exists) — so "From Jan 1" measures from the Dec 31 close (YTD convention), not the first in-window day. **Since-inception is measured from the inception-date close** (returns start at the stated inception). This undershoots YCharts when a portfolio launched on a big up-day (Core Growth's 2025-04-09 inception coincided with the +10% tariff-pause rally → its All-Time reads low vs YCharts, which credits the launch-day return). Every period **not** straddling the inception day matches YCharts to ~0.2%; the residual elsewhere is FMP-adjusted-price vs YCharts-total-return-index methodology (mine is gross).
- These two portfolios (Core Growth, Equity Income) are **all-stock + ~1% cash**; the seed values + bad `holdings_change_log` (single-date, phantom funds) are obsolete — the YCharts dynamic files are the real history.

## Excel Import

Upload handlers live in `lib/*ExcelUpload.ts`. `securities2ExcelUpload.ts` validates columns against a `VALID_COLS` whitelist — unrecognized columns are silently skipped. Do not accept or write columns not in the whitelist without adding them explicitly.

Identity fields (`security_name`, `long_description`, `morningstar_sector`, `morningstar_industry`) are **deliberately not writable from Excel** — their friendly headers map to `null` and the DB columns are in the `SKIP` set. They are sourced from FMP `/profile` only (see "Stock detail page reads FMP on-demand").

Removed columns (`pe_5`, `ps_ratio_3y_mean`, `revenue_per_share_ttm`) are explicitly listed in the skip list in `securities2ExcelUpload.ts` and silently dropped.

**Benchmark uploads (`ychartBenchmarksUpload.ts`) have NO whitelist** — every Excel header is mapped directly to a DB column (with a few renames). So a column present in the spreadsheet but **missing from the DB table fails the entire upsert batch** (`column does not exist`). Before adding a column to the benchmark workbook, `ALTER TABLE` to add it. `category_benchmarks` / `peer_group_benchmarks` use upsert (not delete+insert), so rows absent from the new file are preserved.

**Fund bulk upload (`fundBulkUpload.ts`)** reads the New Fund Template: sheet 0 ("Securities") row 1 = DB column names, rows 2+ = one fund each → `securities2`. The optional **"Related" sheet** loads each fund's alternative funds (see "Fund alternatives"): Col A non-empty = a parent `security_id`, rows below = its related funds sharing the Securities-sheet schema, so the same `colNames` parse both. Related funds are written to the dedicated **`fund_alternatives`** table (not `securities2`), delete+insert per parent.

---

## Common Gotchas

1. **`security.id` vs `security.security_id`** — `id` is the integer for URL routing; `security_id` is the text ticker for all FK queries. Mixing these up causes silent query failures (wrong type match → zero rows returned, no error).

2. **`category_benchmarks.category_ticker`** — The column is `category_ticker`, not `ticker`. PostgREST returns a 400 if you select a non-existent column, causing `fetchBenchmarkOptions` to return `[]` and the picker to show "Failed to load benchmarks".

3. **Cache version busting** — If a query returns stale/wrong shape data after a schema change, bump the version in `queryKeys.ts` (e.g., `['benchmarks', 'v3']` → `['benchmarks', 'v4']`).

4. **Unique constraints vs indexes** — To drop a unique constraint in PostgreSQL, use `ALTER TABLE t DROP CONSTRAINT name`, not `DROP INDEX`. `DROP INDEX` will fail if a constraint depends on the index.

5. **`apply_migration` wraps in a transaction** — If any statement in a migration fails, the whole migration rolls back. Test each step independently when uncertain.

6. **Annual financials silently showing one quarter** — In `fetchAnnualFinancialsData`, never substitute `/earnings` (quarterly) `revenueActual`/`epsActual` into annual rows; date-matching pulls the Q4 release and shows it as the full year. Use the annual income statement's own `revenue` / `epsDiluted`.

7. **Adding a benchmark Excel column without the DB column** — `ychartBenchmarksUpload.ts` has no whitelist, so an unknown header fails the whole upsert batch. Add the column to the table first (see Excel Import).

8. **`upsert(..., { onConflict: 'col' })` needs a matching UNIQUE constraint** — PostgREST returns a 400 if `col` has no unique/exclusion constraint (a primary key or FK on it is not enough). This bit `review_schedules` (upsert on `security_id` with only a PK on `id`) and `category_benchmarks` (the composite `(category_ticker, category)` key). Add the constraint before relying on the conflict target.

9. **State-reset `useEffect` deps + `refetchOnWindowFocus`** — TanStack refetches on window focus by default. A `useEffect` that re-seeds local edit state from a query-backed prop must depend on a stable identity (e.g. `[security.id]`), NOT the editable fields — otherwise a background refetch (e.g. when the user tabs back) overwrites in-progress edits. This caused Alt rows to vanish in `AlternativesPanel`.

10. **WebSocket `subscribe` before `login` ack** — FMP returns `401 "Unauthorized"` on a subscribe that arrives before the `login:200` ack; you authenticate but get **zero** ticks, and the REST fallback hides it so it looks "just not live." Always gate subscriptions on the login ack (see Real-Time Quote Streaming).

11. **FMP one WebSocket per API key** — a second connection (another tab, another dev server on a different port, or the FMP site's own "Quote Feed Connector") kicks the first with `401 "Connected from another location"`. Don't auto-reconnect into a tug-of-war. When live data is missing, first check whether something else holds the single slot.

12. **WebSocket tick `t` is epoch nanoseconds**, not ms — divide by 1e6. And `getSnapshot` for `useSyncExternalStore` must return a **referentially stable** value when unchanged (the store keeps the same `LiveQuote` object until the next tick), or React re-renders in a loop.

13. **`/biggest-gainers` & `/biggest-losers` are a GLOBAL feed** — micro-cap/leveraged-ETF dominated, and they ignore any index/symbol filter. They cannot scope to S&P/Nasdaq/Dow constituents. The Index Movers board builds its lists from constituents + quotes instead. (Same trap as the `*-latest` news endpoints.)

14. **PostgREST embed needs a real FK** — `portfolio_allocations` has **no FK** to `securities2` (it stages import symbols), so `select('..., securities2(...)')` 400s with "could not find a relationship." Resolve names/fields with a separate `.in('security_id', syms)` lookup, not an embed. (Only embed across tables with a declared FK.)

15. **FMP class tickers use hyphens** — `BRK.B` (our `security_id` / YCharts symbol) is `BRK-B` on FMP. `fmpSymbol()` (`.`→`-`) now lives in **`lib/fmpClient.ts`** and is applied in **every** symbol-keyed FMP fetch (on-demand reads included), keeping the original `security_id` for the DB. Earlier only `portfolioPerformance`/`fmpSync` mapped it, so class-ticker stocks silently returned blank profile/quote/scorecard/analyst/news/financials/transcripts — fixed by routing all fetches through `fmpSymbol`. Any new FMP-by-symbol call must use it.

16. **Performance vs YCharts won't be bit-identical** — `lib/portfolioPerformance.ts` recomputes from FMP dividend-adjusted prices; the stored `portfolio.*_total_return` are YCharts' own model figures. They agree to ~0.2% except (a) **All-Time** when the portfolio launched on a big move day (since-inception is measured from the inception *close*; YCharts credits the launch day) and (b) base-date sensitivity near volatile dates. Don't "fix" the engine to chase an exact match — verify the convention first (see Portfolio Allocations & Performance).
