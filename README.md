# Portfolio Management

Application for investment advisors to record, track, and document investment decisions across model portfolios — focused on **process documentation, regulatory audit defense, and strategic asset allocation management**.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query v5, React Router v7
- **Backend:** Supabase (PostgreSQL, Storage) — Express.js server for health/ping only
- **Data Visualization:** Recharts
- **Excel Integration:** XLSX library for bulk import/export

## Setup

1. **Environment**

   Copy the example env and fill in your Supabase credentials:

   ```bash
   cp .env.example .env
   ```

   Required variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

2. **Install and run (from repo root)**

   ```bash
   npm install
   npm run dev
   ```

   Starts both client and server via npm workspaces:
   - **App:** http://localhost:5173
   - **API:** http://localhost:3001 — `GET /api/health`, `GET /api/ping`

   Run individually: `npm run dev:client` or `npm run dev:server`

## Project Layout

```
package.json          # Root workspace
client/               # Vite + React app
  src/
    pages/            # Route-level page components
    components/       # Shared UI components
    hooks/            # Custom React hooks + query key factory
    lib/              # Data access layer (Supabase queries, business logic)
    types/            # TypeScript interfaces
server/               # Express API (minimal)
supabase/             # SQL migrations and seed scripts
.env                  # Local env (create from .env.example)
```

## Application Structure

### Pages

| Route | Page | Description |
|---|---|---|
| `/` | HomePage | Dashboard with overdue actions and review summary |
| `/portfolio` | PortfolioPage | Portfolio list across all strategies |
| `/portfolio/:id` | PortfolioDetailPage | Portfolio detail: metrics, allocations, positions, compliance, reviews |
| `/securities` | SecuritiesPage | Securities universe browser |
| `/security/:id` | SecurityDetailPage | Security analysis: returns, valuation, scorecard, watchlist |
| `/watchlist` | WatchlistPage | Watchlist with alert rules and substitution proposals |
| `/reviews` | ReviewCalendarPage | Portfolio review calendar and scheduling |
| `/actions` | ActionItemsPage | Action items tracking and timeline |
| `/clients` | ClientsPage | Client list |
| `/clients/:id` | ClientDetailPage | Client detail: portfolios, IPS, communication log |
| `/audit` | AuditLogPage | System-wide audit log |
| `/settings/model-portfolios` | ModelPortfoliosPage | Define and edit strategic model portfolios |
| `/settings/benchmarks` | BenchmarksPage | Benchmark data management and upload |
| `/settings/import-export` | ImportExportPage | Bulk CSV/Excel import and export |
| `/settings/compliance` | CompliancePage | Firm-wide compliance rule management |
| `/settings/documents` | DocumentsPage | Document storage |
| `/settings/notifications` | NotificationsPage | Notification preferences |

### Key Components

- **PortfolioOverview** — Asset class allocation pie chart, allocation table vs. model targets, total returns vs. benchmark
- **RebalancingPanel** — Drift analysis and rebalancing recommendations against model
- **CompliancePanel** — Position-level compliance checking against rules
- **EquityMonitoringPanel / FixedIncomeMonitoringPanel** — Strategy-specific monitoring views
- **BenchmarkPickerModal** — Interactive benchmark selector for return comparison
- **HoldingsChangeLog / TradeSuitabilityLog / PortfolioReviewLog** — Audit trail components

## Data Model

### Core Tables (Supabase/PostgreSQL)

| Table | Purpose |
|---|---|
| `portfolio` | Portfolio records with returns, risk metrics, strategy, and objective |
| `positions` | Portfolio holdings linked to `securities2` |
| `securities2` | Security master: ETFs, mutual funds, stocks, bonds |
| `model_portfolio_data` | Strategic allocation targets (lower/target/upper) per asset class |
| `portfolio_model_map` | Explicit `security_id → model_portfolio_id` mapping (single source of truth for all portfolio types) |
| `benchmarks` | Benchmark performance data with total returns and risk metrics |
| `clients` | Client records |
| `client_portfolios` | Client ↔ portfolio associations |
| `compliance_rules` | Portfolio-level compliance rules |
| `firm_compliance_rules` | Firm-wide compliance rules |
| `holdings_change_log` | Append-only holdings change history |
| `trade_suitability` | Trade suitability documentation |
| `portfolio_review_log` | Portfolio review records |
| `review_schedules` | Review calendar configuration |
| `action_items` | Action item tracking |
| `action_item_events` | Action item event timeline |
| `communication_log` | Client communication records |
| `audit_log` | System-wide audit trail |
| `watchlist` | Securities under active monitoring |
| `alert_rules` | Alert thresholds per watchlist item |
| `substitutions` | Proposed security substitutions |
| `rebalance_log` | Rebalancing event log |
| `investment_policy_statements` | IPS records per client |

### Portfolio Strategies

| `portfolio_strategy` | Model Portfolio Source | Investment Objective |
|---|---|---|
| `ETF` | `portfolio_model_map` → one of ids 1–5 | Editable dropdown (ids 1–5) |
| `Foundation` | `portfolio_model_map` → one of ids 1–5 | Editable dropdown (ids 1–5) |
| `Hybrid` | `portfolio_model_map` → one of ids 1–5 | Editable dropdown (ids 1–5) |
| `Equity` | `portfolio_model_map` → portfolio-specific model | Read-only ("Aggressive Growth") |
| `Fixed Income` | `portfolio_model_map` → portfolio-specific model | Read-only |

### Model Portfolios (ids 1–5: strategic, ids 10+: portfolio-specific)

| ID | Investment Objective | Benchmark |
|---|---|---|
| 1 | Income with Capital Preservation | Conservative |
| 2 | Income with Moderate Growth | Conservative Balanced |
| 3 | Growth with Income | Balanced |
| 4 | Growth | Balanced with Growth |
| 5 | Aggressive Growth | Growth |
| 10 | Core Growth | — |
| 11 | Equity Income | — |
| 12 | Fixed Income Total Return | — |

### Model Portfolio Resolution

All portfolios resolve their model portfolio through a single lookup:

```
security_id → portfolio_model_map → model_portfolio_id → model_portfolio_data
```

The `portfolio_model_map` table is the authoritative mapping for all portfolio types. Portfolios not yet mapped fall back to matching on `portfolio.investment_objective`.

## Data Import

Excel upload templates are included in the repo root:

- **`Portfolio Upload Template.xlsx`** — Bulk update portfolio metrics and returns
- **`ETF & Mutual Fund Upload Template.xlsx`** — Securities data upload
- **`Stock Upload Template.xlsx`** — Stock securities upload
- **`Model Weights.xlsx`** — Model portfolio weights import

Uploads are handled by the `lib/*ExcelUpload.ts` modules which validate columns against a whitelist before writing to Supabase.

## Asset Class Structure

The application tracks 14 standardized asset classes across all model portfolios:

**Equity:** Large Cap Blend, Large Cap Value, Large Cap Growth, US Mid Cap, US Small Cap, Non-US Developed, Emerging Market

**Fixed Income:** IG Intermediate Maturity, Non-Investment Grade, IG Short Maturity, Non-US Fixed Income, Multi-Sector Fixed Income

**Other:** Alternative Investments, Cash & Cash Alternatives

Each asset class stores `lower_limit`, `target`, and `upper_limit` for drift-based compliance monitoring.

## Development Notes

- All Supabase queries go through the singleton client in `lib/supabase.ts`
- Server state is managed exclusively through TanStack Query; cache keys are centralized in `hooks/queryKeys.ts`
- The `lib/` directory contains one module per domain — no business logic in components
- Excel column validation uses a `VALID_COLS` whitelist set to silently skip unrecognized columns on upload
