# AI Investment Team — Charter & Design

**Status:** Phase 4 complete — full seven-role team built; six-role committee run live on 3 tickers (GLW, HWM, CAT) and rendering in-app. Optional monitoring/review-automation flows remain — see §9 roadmap
**Owner / CIO:** John Geffert
**Last updated:** 2026-07-01

---

## 1. Purpose

Turn the Portfolio Management app from a single-operator tool into a documented, multi-perspective **investment process** run by a team of role-scoped AI agents, with the human as CIO.

The value is **not** "AI that picks stocks." It is:

1. **Process documentation & audit defense** — every decision is backed by a structured, timestamped, multi-perspective paper trail (the whole reason this app exists).
2. **Adversarial rigor** — a dedicated bear-case role guards against LLM over-agreeableness.
3. **Separation of duties** — research (should we own it?), construction (how much?), and control (what could hurt us?) are distinct mandates that must agree before capital moves.

### Design decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Deliverable persistence | **New Supabase tables + UI** | Queryable, comparable over time, matches app architecture |
| Autonomy | **Recommend-only** | Real money + compliance; no agent mutates `positions` or trades |
| First build | **New-buy pipeline** (vertical slice) | Proves the multi-role committee end to end |
| Scheduling | **Scheduled + on-demand** | Pre-earnings briefs, weekly risk report, reviews-due digest — all draft-only |

### Guardrails (non-negotiable)

- **No agent executes trades or moves money.** Ever. Approval is a manual CIO action that then uses the app's existing add-to-portfolio path.
- **No agent writes to `positions` / `portfolio_allocations`.** Agents write only to the new deliverable tables (proposals) and existing draft tables.
- Agent-produced "fair value / DCF" is a **documented, defensible estimate**, not a precise figure. The value is the reasoning + the Devil's Advocate rebuttal + CIO sign-off, not the number.

---

## 2. Org structure

```
                 CIO — you (mandate, approve/reject, tie-break)
                        │
             Investment orchestrator (Claude — convenes committee, synthesizes memos)
                        │
  ┌──────────────┬──────────────┬──────────────┬──────────────┐
  Research        Quant          Macro          Devil's Advocate      ← idea generation / challenge
  analyst         analyst        strategist     (red team)
  ┌──────────────┬──────────────┬──────────────┐
  Portfolio       Risk           Compliance /
  manager         manager        IPS suitability                     ← construction / control
```

- **Idea generation (blue):** Research analyst, Quant analyst, Macro strategist
- **Challenge (coral):** Devil's Advocate
- **Construction (teal):** Portfolio manager
- **Risk & control (amber):** Risk manager, Compliance / IPS

**Build order:** the four the new-buy pipeline needs first — Research analyst, Devil's Advocate, Portfolio manager, Risk manager. Quant, Macro, and Compliance follow.

---

## 3. Roles

Each role is a **subagent** (`.claude/agents/*.md`) with a scoped toolset and a system prompt. Tool scoping enforces the guardrails: analysts get read-only research tools; PM/Risk get Supabase read; none get write access to `positions`.

### 3.1 Research Analyst — "should we own it?"

- **Mandate:** fundamental research, financial modeling, valuation, earnings review.
- **Key questions:** Is the business attractive? Is management competent? What is fair value? What could go wrong (bull-side view)?
- **Tools:** FMP MCP (`statements`, `discountedCashFlow`, `earningsTranscript`, `analyst`, `company`, `news`, `ratios`), `WebSearch`, `WebFetch`. Read-only Supabase for existing holdings context.
- **Deliverable:** row in `research_reports` — thesis, bull case, fair value + method, rating, DCF inputs, sources.
- **Maps to:** the "Full Research" stage of `security_additions`.

### 3.2 Devil's Advocate / Red Team — "why is this wrong?"

- **Mandate:** construct the strongest possible bear case. Runs **in parallel with and blind to** the analyst's bull case. Explicitly instructed to default toward "reject" when uncertain.
- **Key questions:** What breaks the thesis? What is the analyst ignoring? What is the downside scenario and its probability?
- **Tools:** same research toolset as the analyst (independent lookup).
- **Deliverable:** `research_reports.bear_case` (or its own row tagged `author_role='devils_advocate'`), plus a kill/keep recommendation with rationale.
- **Why:** single best guard against over-agreeableness; produces "we considered and rejected X" documentation.

### 3.3 Portfolio Manager — capital allocator

- **Mandate:** position sizing, portfolio construction, sector allocation, cash management, performance attribution. **Not** a stock picker — an allocator.
- **Key questions:** How much do we own? What's the risk contribution? How does this fit the rest of the portfolio?
- **Tools:** Supabase read (`positions`, `portfolio_allocations`, `model_portfolio_data`, `portfolio_model_map`), the position-band logic (`lib/positionBands.ts` conventions), FMP for prices.
- **Deliverable:** proposed target weight + sizing rationale (vs effective bands), buy/sell/rebalance proposal. Feeds `ic_memos`.

### 3.4 Risk Manager — "what could hurt us?"

- **Mandate:** monitor exposures, concentration limits, factor analysis, stress tests, mandate compliance.
- **Key questions:** Where are the hidden risks? Does this breach any limit?
- **Tools:** Supabase read (positions/allocations), FMP (beta, correlations, sector data).
- **Deliverable:** `risk_reports` — concentration, factor exposures, mandate checks, and a **verdict** (`pass` / `warn` / `veto`). A `veto` blocks the IC memo from reaching the CIO as "approved-ready."

### 3.5 Later additions

- **Quant analyst** — factor/vol/correlation screens, backtests against `lib/portfolioPerformance.ts`, systematic idea screens. Complements (doesn't duplicate) the fundamental analyst.
- **Macro strategist** — top-down context: rates, economic calendar, sector rotation (FMP `economics`, `marketPerformance`, `indexes`). Sets the "weather."
- **Compliance / IPS-suitability officer** — checks every decision against mandate, concentration limits, and IPS suitability; optional ESG dimension (FMP `ESG`). Produces the compliance paper trail. High relevance given the app's audit-defense framing.

---

## 4. Operating model — decision flows

Every flow ends in a **CIO decision**, and every role emits a **persisted deliverable**.

### 4.1 New buy (the first build)

```
ticker (from Candidates tab) →
  ┌─ Research Analyst   → research_reports (bull, DCF, fair value, rating)
  ├─ Devil's Advocate   → bear case + kill/keep        (parallel, blind to bull)
  └─ Quant Analyst      → factor/valuation screen       (optional in v1)
        │  (barrier: orchestrator synthesizes)
        ▼
  Portfolio Manager     → proposed weight + sizing rationale (vs bands)
        ▼
  Risk + Compliance     → risk_reports (verdict: pass/warn/veto)
        ▼
  Orchestrator          → ic_memos (status='pending_cio')
        ▼
  CIO approves / watchlists / rejects  →  manual add-to-portfolio path
```

Maps onto and extends the existing `security_additions` workflow.

### 4.2 Ongoing monitoring (later)

Earnings-driven (live FMP earnings dates) → analyst re-review → PM/Risk assessment → At-Risk flag. Writes to `review_log` / `holding_reviews` (existing) + a `research_reports` row of type `earnings_review`.

### 4.3 Portfolio review (later)

Cadence-driven, PM leads, Risk + Compliance contribute sections. Uses the existing `portfolio_review_log` workspace; agents draft the sections.

---

## 5. Data model — new tables

Follows app conventions: `security_id` is the **text ticker** (no FK — a candidate may not be in `securities2` yet, mirroring `security_additions`); `portfolio_name` FKs to `portfolio(name)`; jsonb for structured sub-objects; soft deletes via `deleted_at`; RLS on with open policies. **Apply via `apply_migration`, then regenerate `client/src/types/database.types.ts`.**

### 5.1 `research_reports`

```sql
create table public.research_reports (
  id               bigint generated always as identity primary key,
  security_id      text not null,                          -- ticker, UPPER; no FK (candidate may be new)
  portfolio_name   text references public.portfolio(name) on delete cascade,   -- nullable
  addition_id      bigint references public.security_additions(id) on delete set null,
  author_role      text not null,                          -- 'research_analyst' | 'devils_advocate' | ...
  report_type      text not null default 'initial'
                     check (report_type in ('initial','earnings_review','update')),
  thesis           text,
  bull_case        text,
  bear_case        text,
  rating           text check (rating in ('buy','add','hold','trim','sell')),
  conviction       text check (conviction in ('high','medium','low')),
  fair_value       numeric,
  current_price    numeric,
  dcf_inputs       jsonb,                                  -- assumptions behind fair_value
  valuation_summary jsonb,
  sources          jsonb,                                  -- citations / URLs
  status           text not null default 'final' check (status in ('draft','final')),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on public.research_reports (security_id) where deleted_at is null;
create index on public.research_reports (portfolio_name) where deleted_at is null;
alter table public.research_reports enable row level security;
create policy "anon rw"  on public.research_reports for all to anon          using (true) with check (true);
create policy "auth rw"  on public.research_reports for all to authenticated using (true) with check (true);
```

### 5.2 `risk_reports`

```sql
create table public.risk_reports (
  id               bigint generated always as identity primary key,
  portfolio_name   text references public.portfolio(name) on delete cascade,
  security_id      text,                                   -- set when scoped to a candidate
  addition_id      bigint references public.security_additions(id) on delete set null,
  scope            text not null default 'candidate' check (scope in ('candidate','portfolio')),
  concentration    jsonb,                                  -- top holdings, sector weights, breaches
  factor_exposures jsonb,
  mandate_checks   jsonb,                                  -- [{limit, actual, pass}]
  verdict          text not null default 'pass' check (verdict in ('pass','warn','veto')),
  notes            text,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on public.risk_reports (portfolio_name) where deleted_at is null;
alter table public.risk_reports enable row level security;
create policy "anon rw"  on public.risk_reports for all to anon          using (true) with check (true);
create policy "auth rw"  on public.risk_reports for all to authenticated using (true) with check (true);
```

### 5.3 `ic_memos`

The audit-defense artifact — the committee synthesis + CIO decision.

```sql
create table public.ic_memos (
  id                  bigint generated always as identity primary key,
  portfolio_name      text references public.portfolio(name) on delete cascade,
  security_id         text not null,
  addition_id         bigint references public.security_additions(id) on delete set null,
  research_report_id  bigint references public.research_reports(id) on delete set null,
  risk_report_id      bigint references public.risk_reports(id) on delete set null,
  proposed_weight     numeric,                             -- PM's proposed target %
  pm_rationale        text,
  recommendation      text check (recommendation in ('approve','watchlist','reject')),  -- committee's rec
  rationale           text,                                -- orchestrator synthesis
  decision            text check (decision in ('approve','watchlist','reject')),        -- CIO's actual call
  decided_by          text,
  decided_at          timestamptz,
  status              text not null default 'draft'
                        check (status in ('draft','pending_cio','approved','rejected')),
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index on public.ic_memos (portfolio_name) where deleted_at is null;
create index on public.ic_memos (status) where deleted_at is null;
alter table public.ic_memos enable row level security;
create policy "anon rw"  on public.ic_memos for all to anon          using (true) with check (true);
create policy "auth rw"  on public.ic_memos for all to authenticated using (true) with check (true);
```

### 5.4 App wiring (per CLAUDE.md layering)

- `lib/researchReports.ts`, `lib/riskReports.ts`, `lib/icMemos.ts` — pure async Supabase fns (fetch/insert/soft-delete), casting enum columns at the return boundary.
- `hooks/queryKeys.ts` — add `researchReports(securityId)`, `riskReports(portfolioName)`, `icMemos(portfolioName)`, `icMemo(id)`.
- Read-only panels: an **IC Memo view** (renders the memo + linked research/risk reports) on the candidate workspace; a research-report card on the security detail page.

---

## 6. New-buy pipeline — workflow spec

Implemented with the **Workflow** tool. Sketch (not final code):

```js
// meta: name 'new-buy-ic-review', phases Research / Construct / Control / Synthesize
// args: { ticker, portfolioName, additionId }

phase('Research')
const [bull, bear, quant] = await parallel([
  () => agent(ANALYST_PROMPT(args.ticker),        { schema: RESEARCH_SCHEMA, label: 'analyst' }),
  () => agent(DEVILS_ADVOCATE_PROMPT(args.ticker),{ schema: BEAR_SCHEMA,     label: 'red-team' }),
  () => agent(QUANT_PROMPT(args.ticker),          { schema: SCREEN_SCHEMA,   label: 'quant' }),  // optional v1
])

phase('Construct')
const pm = await agent(PM_PROMPT(args, bull, bear), { schema: SIZING_SCHEMA, label: 'pm' })

phase('Control')
const risk = await agent(RISK_PROMPT(args, pm),    { schema: RISK_SCHEMA,   label: 'risk' })

phase('Synthesize')
// orchestrator composes the IC memo; status = 'pending_cio'
return { bull, bear, quant, pm, risk, verdict: risk.verdict }
```

**Notes**
- `parallel()` here is a deliberate barrier — the PM needs the full research set before sizing.
- Devil's Advocate prompt is blind to the analyst output (independent lookup) to keep the bear case genuinely adversarial.
- A `risk.verdict === 'veto'` marks the memo as blocked; it still reaches the CIO, flagged, but never as "approved-ready."
- The workflow **writes rows** to the new tables via the lib fns; the app renders them. No writes to `positions`.

---

## 7. Scheduled jobs (phase 3 — all draft-only)

| Job | Cadence | Output |
|---|---|---|
| Pre-earnings brief | morning of a holding's earnings (live FMP dates) | analyst "what to watch" memo → `research_reports` (type `earnings_review`, `status='draft'`) |
| Weekly risk report | weekly | portfolio-scoped `risk_reports` (concentration + factor drift) |
| Reviews-due digest | daily/weekly | rollup of existing per-security + portfolio-review cadences |

None take state-changing actions — they leave drafts waiting for the CIO.

---

## 8. Role system-prompt drafts

Concise starting prompts for the four first-build roles. (Full versions live in `.claude/agents/*.md`.)

**Research Analyst**
> You are a sector-focused equity research analyst. Given a ticker, determine whether the business should be owned. Produce: (1) a concise investment thesis, (2) a bull case, (3) a fair-value estimate with the method and key assumptions stated explicitly, (4) a rating (buy/add/hold/trim/sell) and conviction. Use FMP fundamentals, filings, transcripts, and web sources; cite them. State what would have to be true for the thesis to work. Your fair value is a documented estimate, not a precise figure — show your assumptions so they can be challenged. Return structured output only.

**Devil's Advocate**
> You are the red team. Your only job is to build the strongest possible case *against* buying this security. Research independently — do not rely on any bull-case summary. Identify what breaks the thesis, what the optimist is ignoring, the downside scenario and its rough probability, and any red flags in the filings/management/valuation. Default toward "reject" when the evidence is ambiguous. End with a kill/keep recommendation and your single most important reason.

**Portfolio Manager**
> You are a portfolio manager — a capital allocator, not a stock picker. Given the research and risk inputs for a candidate and the portfolio's current positions, model, and position bands, propose a target weight and explain the sizing: expected contribution, fit with existing holdings, sector/concentration impact, and funding source. Respect the model's effective bands. You propose; you never execute. Return the proposed weight and rationale as structured output.

**Risk Manager**
> You are the risk manager. Assess what could hurt the portfolio if this candidate is added at the proposed weight. Check concentration (position and sector), factor exposures, and every mandate/limit. Stress the position against a reasonable downside. Return a structured report with a verdict: pass, warn, or veto — and the specific breach or exposure driving a warn/veto.

---

## 9. Build roadmap

1. **Phase 0 — this charter** (review & approve). ✅
2. **Phase 1 — data + lib layer:** create the three tables (`apply_migration`), regenerate types, write `lib/*.ts` + query keys. No UI yet. ✅ *Done 2026-07-01: `research_reports`/`risk_reports`/`ic_memos` migrated; types regenerated; `lib/researchReports.ts`, `lib/riskReports.ts`, `lib/icMemos.ts` + query keys added; typecheck + lint clean.*
3. **Phase 2 — the four subagents + the new-buy workflow:** wire the pipeline, launch it from the Candidates tab, render the IC memo (read-only). This is the demoable slice. ✅ *Done 2026-07-01: subagents `.claude/agents/{research-analyst,devils-advocate,portfolio-manager,risk-manager}.md`; workflow `.claude/workflows/new-buy-ic-review.js` (roles inlined — the workflow agent() registry doesn't resolve custom agent types); read-only viewer `components/ICReviewPanel.tsx` + `hooks/useIcReview.ts` wired as an "IC Review" section in the candidate workspace. Ran the live committee on **GLW / Core Growth** (5 agents, 66 tool calls, ~348k tokens): analyst HOLD (FV ~$130 vs ~$220), red team KILL, PM watchlist/0%, risk PASS-at-0%/conditional-VETO → memo WATCHLIST; persisted to the three tables (ic_memo id 3) and verified rendering in the app. Architecture note: the committee runs in Claude Code, not the browser; a UI-triggered "Run committee" button would need an Express/Anthropic-API bridge (future).*
4. **Phase 3 — scheduled jobs** (pre-earnings brief, weekly risk report, reviews-due digest). ✅ *Shipped 2026-07-01 as `create_scheduled_task` routines (self-contained prompts in `~/.claude/scheduled-tasks/`, each adopts a role from `.claude/agents/`, all draft/read-only): `pre-earnings-brief` (weekdays 6:55am → draft research_reports, report_type=earnings_review), `weekly-risk-report` (Mon 7:18am → risk_reports, scope=portfolio), `reviews-due-digest` (Mon 7:42am → informational, read-only). Verified the reviews-due query live (18 portfolios due; MU quarterly 7d overdue). **Note:** click "Run now" once per job to pre-approve its Supabase/FMP MCP tools so future runs don't pause on permission prompts. Runtime caveat: these run in Claude Code while the app is open (or on next launch if missed) — production-grade scheduling would move to the Express/Anthropic-API runner.*
5. **Phase 4 — output viewers, decision action, remaining roles.** 🟡 *In progress (2026-07-01): shared cards extracted to `components/icReviewCards.tsx`; `SecurityResearchPanel` on the security **Monitor** tab (renders `research_reports` by security — analyst reports + pre-earnings briefs) and `PortfolioRiskPanel` on the portfolio **Reviews** tab (portfolio-scope `risk_reports`); the **CIO decision action** (approve/watchlist/reject → `recordIcDecision`) now lives on `MemoCard` in the candidate IC Review. Verified in preview (GLW research populated, decision recorded to DB then reset, risk panel wired). Added the remaining three roles — `.claude/agents/{quant-analyst,macro-strategist,compliance-ips}.md` — completing the seven-role roster. Wired **Quant** (Research phase) and **Compliance/IPS** (Control phase) into `new-buy-ic-review.js` as a **6-role committee**, flag-gated (`args.lean:true` runs the original 4-role version); a risk `veto` OR a compliance `unsuitable` now forces the committee recommendation to `reject`. Quant persists as a `research_reports` row (author_role='quant_analyst', already rendered by ResearchCard); Compliance folds into the memo rationale. **Macro** is a standing/on-demand role (not a per-name gate) — a natural weekly scheduled brief if wanted. Ran the full 6-role committee live on the two Equity Income candidates — **HWM** (unanimous REJECT: risk VETO + compliance UNSUITABLE; compliance caught the model "Aggressive Growth" objective vs "Equity Income" name inconsistency) and **CAT** (REJECT: 0.6% yield + AI-narrative re-rating + Michael Burry short) — persisted (ic_memos 4 & 5, quant research_reports 8 & 11) and verified all cards incl. the new Quant Analyst card render in the candidate IC Review. Generic persist script at `scratchpad/persist_committee.py`. **Remaining:** optional monitoring/review-automation flows; a dedicated compliance table/column (compliance currently folds into the memo rationale).*

Each phase honors the CLAUDE.md definition-of-done: `npm run typecheck` + `npm run lint` clean on touched files; schema-typed client kept in sync.

---

## 10. Open items / future

- **Idea generation:** the pipeline reacts to candidates *you* enter. Systematic screening (Quant → auto-candidates) is a natural follow-on but should wait until the committee is proven.
- **Semi-autonomy:** recommend-only is the starting posture. Letting agents auto-stage low-stakes actions (At-Risk flags, watchlist adds) is a deliberate later decision, not a default.
- **Memo → action linkage:** on CIO approval, decide how tightly the memo links to the actual position add (manual for now).
- **Cost/latency:** a full committee run fans out 4–5 agents; fine on-demand, worth watching if scheduled jobs multiply.
