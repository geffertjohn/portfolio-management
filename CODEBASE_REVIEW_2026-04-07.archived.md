# Portfolio Management — Codebase Review

_Date: 2026-04-07_

## 1. Tech Stack

**Frontend** (`client/`)
- React 18.3 + TypeScript 5.6 (strict)
- Vite 5.4, Tailwind 3.4, React Router v7
- TanStack Query v5 (server state)
- Supabase JS client v2.45 (direct DB access)
- XLSX 0.18 (Excel import), Recharts 2.15, Zod 3.25

**Backend** (`server/`)
- Express 4.21 + TypeScript, tsx watch mode
- Currently only `/api/health` and `/api/ping` — placeholder

**Database**
- Supabase / Postgres
- Storage bucket for fund fact sheets
- Auth not yet enabled

## 2. Project Structure

```
client/src/
  pages/         5 routes (Home, Portfolio[s], Security[ies])
  components/    Layout, modals, scorecards, metrics tables
  lib/           ~1.4k LOC: supabase, portfolio, positions,
                 securities, scorecards, excel import
  types/         Portfolio, Position interfaces
server/
  src/index.ts   Express app (health checks only)
  scripts/       TS seed scripts per model portfolio
supabase/        48 .sql files: schema, seeds, scorecards
```

## 3. Features

- **Portfolios:** 19 model portfolios (ETF, Hybrid, Foundation, Equity Income/Growth, Fixed Income)
- **Positions:** add securities to portfolios with allocation %
- **Securities:** browse/add by symbol; detail page with tabs (Overview, Thesis, Monitoring, Financials, Estimates, Transcripts — most are placeholders)
- **Thesis scorecards:** distinct metric sets for Equity Income, Core Growth, Fixed Income, Equity funds
- **Excel import:** Morningstar-style sheets → `securities2` with 150+ header mappings, type coercion (dates, K/M/B/T suffixes, percentages)

## 4. Database Schema

- **portfolio_rows** — 19 model portfolios (id, strategy, name, risk profile, benchmark, description)
- **securities2** — extended analytics, ~287 columns: returns (1m–10y + benchmark/peer), risk (alpha/beta/sharpe/sortino/std_dev/tracking_error), allocations, sector/geo weights, bond quality/maturity, top-10 holdings, valuation ratios, thesis text
- **positions** — join table (portfolio_id, security_id, allocation_pct 0–100, sort_order)
- **\*_scorecard** tables — equity, coregrowth, fixedincome, equityincome
- **Triggers:** `set_updated_at()` on securities tables
- **RLS:** commented out everywhere

## 5. API / Data Flow

Server has only health checks. All reads/writes go **client → Supabase** directly:
- `fetchPortfolios`, `fetchPortfolioById`
- `fetchPositionsByPortfolioId` (joins securities2)
- `fetchSecurities`, `fetchSecurityById`
- `createPosition`, `createSecurityBySymbol`, `updateSecurityThesis`
- `uploadSecurities2FromExcel` (multi-row upsert)

## 6. Strengths

- Strict TS config (`noUnusedLocals`, `noUnusedParameters`, `@/` path alias)
- Rich, well-modeled `securities2` schema
- Robust Excel import with vendor header normalization
- Clean component patterns (modals, error states, loading states)
- Mobile-first Tailwind, accessible markup

## 7. Concerns

| # | Issue | Risk |
|---|---|---|
| 1 | **No auth** — RLS disabled, anon key in client; all data world-readable if deployed | High |
| 2 | **No tests** — 717 LOC Excel mapper is untested | High |
| 3 | **Express server is dead weight** — no business logic, no service-role calls | Med |
| 4 | **Legacy `securities` vs `securities2`** — migration ongoing, manual scripts | Med |
| 5 | **No pagination** on securities list | Med |
| 6 | **Incomplete tabs:** Monitoring / Financials / Estimates / Transcripts are placeholders | Low |
| 7 | **Zod imported but unused** in visible code | Low |
| 8 | **No input validation** beyond DB constraints; Excel payload not sanitized | Med |
| 9 | **Many small migration .sql files** — consolidation would help | Low |
| 10 | **README** lacks architecture, deploy, testing sections | Low |

## 8. Recommended Next Steps

1. Enable Supabase Auth + turn on RLS for `portfolio_rows`, `positions`, `securities2`
2. Add Vitest + tests for `securities2ExcelUpload.ts` type coercion
3. Decide: kill the Express server, or move sensitive ops (service role, bulk imports) behind it
4. Consolidate the 48 supabase SQL files into a numbered migration sequence
5. Add pagination / virtualization to securities list
6. Drop legacy `securities` table once `securities2` backfill is complete
