---
name: watchlist-research
description: Runs the lean new-buy Investment Committee over watchlist ideas that have no research yet, and persists the analyst/bear/risk reports and the IC memo so the idea's card stops reading "AI research pending".
---

You give a watchlist idea its first committee read. Recommend-only: **never buy, never write to `positions` or `portfolio_allocations`, never stage a trade, and never set the CIO decision on a memo.** A memo lands as `pending_cio`; the advisor decides.

This runs in a fresh session in the Portfolio Management project directory. Supabase MCP project_id: oulahvazpuzfqxudmfef. FMP tools load via ToolSearch. Class tickers use the FMP hyphen form (BRK.B -> BRK-B).

## Why this job exists

Adding a ticker to the Watchlist writes a `prospects` row and nothing else — `addProspect` has no queue, no trigger and no outbox. The card's "AI research pending" badge is just `research.length === 0`, so before this job existed it was describing an absence as if something were coming: FCX sat there for 23 days with nothing behind it. **You are the thing that was missing.**

## Unattended-run rules (read first)

Nobody is at the keyboard. **Any tool call that asks for approval stalls the run forever — and while it is stalled the scheduler starts no new run of this task.**

- **Do not use Bash, or any shell command.** Supabase MCP `execute_sql` plus the Workflow tool and FMP MCP tools are enough.
- Do date arithmetic in SQL, never by shelling out.
- **Warm the connectors with ONE call before any fan-out** — a catch-up run seconds after the machine wakes hits a cold transport, and a burst then fails *every* call rather than one.
- If a tool errors twice, stop and write the digest saying what failed.

## Steps

1. **FIND IDEAS WITH NO RESEARCH.**

   ```sql
   select p.id prospect_id, p.security_id, p.created_at::date added,
          coalesce(array_agg(pp.portfolio_name order by pp.portfolio_name)
                   filter (where pp.portfolio_name is not null), '{}') portfolios
   from prospects p
   left join prospect_portfolios pp on pp.prospect_id = p.id
   where p.removed_at is null
     and not exists (
       select 1 from research_reports r
       where r.security_id = p.security_id and r.deleted_at is null)
   group by p.id, p.security_id, p.created_at
   order by p.created_at;
   ```

   The `not exists` check is what makes this idempotent and self-retrying: an idea already carrying any research — including research written for an earlier candidate record, as HWM has — is left alone. If nothing comes back, write "No watchlist idea is missing research." and STOP.

2. **CAP THE RUN AT THREE IDEAS**, oldest first. A lean committee is four agents plus a memo, so three is already a dozen agents and a long run. List the rest as "queued" — they are picked up on the next run.

3. **RUN THE LEAN COMMITTEE** for each, one at a time rather than in parallel (each one is itself a fan-out):

   ```
   Workflow({ scriptPath: '.claude/workflows/new-buy-ic-review.js',
              args: { ticker: 'LRCX', portfolioName: 'Core Growth', lean: true } })
   ```

   - **`lean: true` always.** This is an idea list, not a buy decision: the four roles answer "is this ownable", and the quant screen and compliance gate belong to the candidate workflow where an actual purchase is decided.
   - **`portfolioName`:** pass it only when the idea names **exactly one** portfolio — it gives the PM a book to size against at no extra cost. When the idea names several, or none, **omit it**. Sizing for a particular book is the candidate workflow's question, and picking one of three portfolios arbitrarily would put a number against a book nobody chose.
   - **No `additionId`** — a watchlist idea has no `security_additions` row. Leave it null.
   - Run via `scriptPath`, not `name`, and note `args` may arrive as a JSON string inside the workflow (it parses it).

4. **PERSIST WHAT IT RETURNS.** The workflow writes nothing itself — that is deliberate, and you are the orchestrator. For each run, with `<P>` the portfolio you passed or SQL `null`:

   ```sql
   insert into research_reports
     (security_id, portfolio_name, author_role, report_type, status,
      thesis, bull_case, bear_case, rating, conviction, fair_value, current_price, sources)
   values ('TICKER', <P>, 'research_analyst', 'initial', 'draft', …),
          ('TICKER', <P>, 'devils_advocate',  'initial', 'draft', …);

   insert into risk_reports
     (security_id, portfolio_name, scope, verdict, concentration, factor_exposures, mandate_checks, notes)
   values ('TICKER', <P>, 'security', '<pass|warn|veto>', …);

   insert into ic_memos
     (security_id, portfolio_name, research_report_id, risk_report_id,
      proposed_weight, pm_rationale, recommendation, rationale, status)
   values ('TICKER', <P>, <analyst id>, <risk id>, …, 'pending_cio');
   ```

   - **`report_type` is `initial`**, and `fiscal_year`/`quarter` stay **null** — this is standing research tied to no earnings call, and a CHECK requires both or neither.
   - **`status` is `draft`.** Nobody has read it yet. The earnings jobs draft too.
   - **A risk `veto` forces the memo recommendation to `reject`** — the workflow already applies this; carry its value through rather than recomputing.
   - Keep `portfolio_name` consistent across all four rows of one run. The Watchlist card filters research to the portfolios the idea names **plus any unscoped report**, so a mismatch makes the work invisible on the card that asked for it.

5. **DIGEST.** Per idea: ticker, the portfolio scope used (or "unscoped, names N portfolios"), the analyst rating and conviction, the bear case in a line, the risk verdict, and the committee recommendation. Then list **queued** ideas (over the three-name cap) and anything that failed, with why. Say explicitly if a run was unscoped and why, so a reader is not left wondering where the sizing went.

## Guardrails

Recommend-only, DRAFT-only. Never write to `positions` or `portfolio_allocations`, never place or stage a trade, never set `ic_memos.decision` / `decided_by` / `decided_at` — the CIO decision is the advisor's act and the memo exists to inform it. Never flag At-Risk (that is `at-risk-review`), never write to `security_theses`, and never remove a prospect. If an idea's ticker cannot be priced or researched, leave it and say so.
