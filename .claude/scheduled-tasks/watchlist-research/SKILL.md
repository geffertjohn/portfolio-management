---
name: watchlist-research
description: Rates watchlist ideas that have no research yet — a standalone buy/hold/sell on the company itself, with bear/base/bull price targets and the price at which a hold becomes a buy, from the research analyst and the devil's advocate, drafted to research_reports so the idea's card stops reading "Awaiting committee".
---

## Record this run (first and last thing you do)

This job runs while nobody is watching, and the app has no bridge to the
scheduler. A run that died on its first tool call and a run that worked
perfectly and found nothing to do leave the **same** trace in every table this
job writes — none. `job_runs` is the only place the two differ, and it only
differs if you write to it.

**Before any other work**, open the row (Supabase MCP `execute_sql`):

```sql
select job_run_open('watchlist-research');
```

Keep that id. **As the very last step, whatever happened**, close it:

```sql
select job_run_close(
  <the id from job_run_open>,
  'success',                      -- 'partial' if part of the work failed, 'failed' if none of it landed
  <items_considered>,             -- candidates you looked at; 0 is a real answer
  <items_written>,                -- rows you actually wrote
  $j$One line on what happened.$j$,
  '{}'                            -- array of error strings when status is not 'success'
);
```

`job_run_close` **raises if it updates nothing**, so a heartbeat that fails to
close is an error you will see rather than a row left open for `gradeJob` to
report as a death three hours later.

**Close the row even when there was nothing to do.** `items_considered = 13`
with `items_written = 0` is the healthy-and-idle case, and it is precisely what
the app cannot work out for itself. A row left open reads as a job that died
mid-run — which is the design, not a bug: dying is the one state you cannot
report about yourself, so the open row has to say it for you.

You give a watchlist idea its first read. Recommend-only: **never buy, never write to `positions` or `portfolio_allocations`, never stage a trade.**

This runs in a fresh session in the Portfolio Management project directory. Supabase MCP project_id: oulahvazpuzfqxudmfef. FMP tools load via ToolSearch. Class tickers use the FMP hyphen form (BRK.B -> BRK-B).

## Why this job exists

Adding a ticker to the Watchlist writes a `prospects` row and nothing else — `addProspect` has no queue, no trigger and no outbox. The card's badge is just `research.length === 0`, so before this job existed it described an absence as if something were coming: FCX sat there 23 days with nothing behind it. **You are the thing that was missing.**

## The question you are answering — read this before anything else

**Is this company worth owning, on its own merits?** A buy / hold / sell with a bull and a bear case, the way a sell-side analyst rates a name. Nothing more.

**Do NOT evaluate the idea against a portfolio.** Not its weight, not its correlation to current holdings, not the opportunity cost against the incumbents in its sector, not concentration or factor exposure. Those questions are real and they are asked **later**, in the candidate workflow (`security_additions` + the new-buy committee), where an actual purchase is being decided against an actual book.

The watchlist is a list of companies the advisor is interested in. A ticker may name portfolios, or none, and that is **recorded on the idea, not used here**. Reading them would produce exactly the defect this design removes: a proposed weight against a book nobody has decided to buy into. MRVL came back "watchlist at 0%" under the old design, which is an answer to a question nobody asked.

**So `portfolio_name` is ALWAYS `null` on every row you write.** There is no exception, including when the idea names exactly one portfolio.

## Unattended-run rules (read first)

Nobody is at the keyboard. **Any tool call that asks for approval stalls the run forever — and while it is stalled the scheduler starts no new run of this task.**

- **Do not use Bash, or any shell command.** Supabase MCP `execute_sql`, the Agent tool and the FMP MCP tools are enough.
- Do date arithmetic in SQL, never by shelling out.
- **Warm the connectors with ONE call before any fan-out** — a catch-up run seconds after the machine wakes hits a cold transport, and a burst then fails *every* call rather than one.
- **The run is over only when the research rows are written and the digest is printed.** "Fan out" means issuing several tool calls yourself in one message; dispatching the two role agents is not licence to end the turn. **They return their work to you and write nothing themselves** — a run that stops when the agents return has produced nothing at all. Stay with it: collect what they return, write the rows, print the digest. Nobody is here to ask you to continue.
- If a tool errors twice, stop and write the digest saying what failed.
- **If one of the two roles returns nothing, write neither row for that ticker** and report it as failed in the digest. Half a read is not a rating: a thesis with no bear case against it is the single most misleading thing this job could leave behind.

## Steps

1. **FIND IDEAS WITH NO RESEARCH.**

   ```sql
   select p.id prospect_id, p.security_id, p.created_at::date added,
          s.detailed_security_type, s.peer_group_name
   from prospects p
   left join securities2 s on s.security_id = p.security_id
   where p.removed_at is null
     and not exists (
       select 1 from research_reports r
       where r.security_id = p.security_id and r.deleted_at is null)
     -- STOCKS ONLY. See the fund rule below.
     and coalesce(s.detailed_security_type, '') not in
         ('etf', 'mutual_fund', 'fund', 'open-end fund', 'exchange-traded fund')
     and s.peer_group_name is null
   order by p.created_at;
   ```

   The `not exists` check is what makes this idempotent and self-retrying: an idea already carrying any research — including research written for an earlier candidate record, as HWM has — is left alone. If nothing comes back, write "No watchlist idea is missing research." and STOP.

   Note it does **not** read `prospect_portfolios`. You do not need the portfolios, and fetching them invites using them.

2. **DO NOT RUN THE ROLES ON A FUND OR ETF — AND SQL ALONE CANNOT TELL YOU.**

   The two roles rate a **company**: a business, what must be true for it to work, a fair value, a bull case and an independent bear case. A fund has no business to analyse. What a fund is judged by is its scorecard against the cohort its `category_name` names, which comes from the YCharts workbook and needs no committee at all — so research written here would be an opinion about a thing that is not what the fund is.

   The filter above catches a fund **already in `securities2`**. It does not catch a newly watched one, because `prospects.security_id` has no FK and a fund's row only arrives on the next YCharts refresh — so on the day it is added, a fund looks exactly like a stock to that query.

   **So for every candidate the query returns whose `detailed_security_type` was NULL, ask FMP before dispatching anything:**

   ```
   mcp__…__company / profile  →  isEtf, isFund
   ```

   - `isEtf` or `isFund` true → **skip it**, and name it in the digest as a fund, not as a failure.
   - **No profile at all → ALSO SKIP.** FMP covers US stocks comprehensively but misses a good share of institutional mutual-fund share classes, so an empty profile is far more likely to be a fund than a stock nobody has heard of. Skipping costs a day; running two analysts on a bond fund writes a document that reads like research and is not.
   - A profile that is neither → a stock, proceed.

3. **CAP THE RUN AT FIVE IDEAS**, oldest first. Two agents per name, so five is ten agents and a long run. List the rest as "queued" — they are picked up on the next run.

4. **RUN THE TWO ROLES** for each idea, one ticker at a time:

   ```
   Agent({ subagent_type: 'research-analyst',  prompt: '…' })
   Agent({ subagent_type: 'devils-advocate',   prompt: '…' })
   ```

   - **Use the Agent tool with those subagent types**, which resolve `.claude/agents/research-analyst.md` and `devils-advocate.md`. Do NOT use the `new-buy-ic-review` workflow: it is the candidate committee, it runs PM sizing and a portfolio risk gate, and those are the portfolio-relative questions this stage does not ask.
   - **Name no portfolio in either prompt.** Ask for a standalone read: what the business is, what must be true for it to work, a fair value with its method, a rating and conviction — and from the devil's advocate, the strongest independent case against owning it at today's price.
   - **Ask the research analyst for THREE price targets — bear, base and bull** — each with the probability you assign it and a one-line premise saying what has to happen for that case to land. Probabilities are decimals and must sum to 1. Also give the method in one line: the multiple, the horizon and the discount rate.
   - **Ask it for the price at which the rating would become a buy**, and the required return that price reflects.

     **If the rating is held back by something other than price, say so instead of computing a number.** A hold is not always a valuation call: MRVL was a hold at $200 against a $240 fair value because an unresolved all-stock acquisition of a company worth nearly half its market cap changed what was being bought — no lower price would have made that a buy while the terms were unknown. In that case set `buyBelow` to null, `priceLimited` to false, and put what WOULD change the rating in `buyBelowBasis`. A computed buy-below price on an event-driven hold is worse than none: it tells the reader the name is cheap-but-not-cheap-enough when the real blocker is that nobody knows what they are buying.
   - The two roles are independent. The devil's advocate must **not** be handed the analyst's thesis to react to; an independent bear case is the point, and feeding it the bull case produces a rebuttal instead.
   - Both roles read TipRanks via ToolSearch and are told to **weight analyst opinion by track record, not head count** — a consensus badge counts voices, not accuracy.

5. **PERSIST WHAT THEY RETURN.**

   Write through `committee_insert`, one call per role. It validates the payload
   against the live table before writing and raises on a key the table does not
   have, so this prompt never carries a column list that can go stale.

   ```sql
   select committee_insert('research_reports', jsonb_build_object(
     'security_id','TICKER', 'author_role','research_analyst',
     'report_type','initial', 'status','draft',
     'thesis', $t$…$t$, 'bull_case', $b$…$b$,
     'rating','hold', 'conviction','medium',
     'fair_value', 240, 'current_price', 200,
     'price_targets', $p${…}$p$::jsonb,
     'sources', $s$[…]$s$::jsonb
   ));

   select committee_insert('research_reports', jsonb_build_object(
     'security_id','TICKER', 'author_role','devils_advocate',
     'report_type','initial', 'status','draft',
     'bear_case', $b$…$b$, 'sources', $s$[…]$s$::jsonb
   ));
   ```

   Omit a key rather than passing null — an unmentioned column keeps its
   default. `portfolio_name` is one of those: it is **always** absent here.

   `price_targets` goes on the **research analyst's row only** — it is that role's valuation. Shape (see `client/src/lib/priceTargets.ts`):

   ```json
   {
     "scenarios": [
       {"case": "bear", "value": 130, "probability": 0.25, "premise": "custom socket loss, GM to mid-50s"},
       {"case": "base", "value": 240, "probability": 0.50, "premise": "FY28 ~$17-18B, FY29 EPS ~7% under consensus"},
       {"case": "bull", "value": 365, "probability": 0.25, "premise": "custom + optics beat, 2030 path intact"}
     ],
     "weighted": 244,
     "method": "Scenario-weighted forward P/E on FY29 EPS, discounted ~1.3 years at 11% cost of equity",
     "buyBelow": null,
     "buyBelowBasis": "Not price-limited: resolution of the Lumentum terms, not a lower price, is what changes this rating",
     "priceLimited": false
   }
   ```

   - **`portfolio_name` is `null` on both rows.** See the section above; there is no case where it is not.
   - **`report_type` is `initial`**, and `fiscal_year`/`quarter` stay **null** — this is standing research tied to no earnings call, and a CHECK requires both or neither.
   - **`status` is `draft`.** Nobody has read it yet. The earnings jobs draft too.
   - **Write no `risk_reports` row and no `ic_memos` row.** A memo is a committee recommendation to buy something at a size, and there is no size here. The analyst's rating is the deliverable.

6. **DIGEST.** Per idea: ticker, the analyst rating and conviction, the three targets (bear / base / bull) against the current price, the buy-below price or "not price-limited" with what would change it, the bear case in a line, and the single thing that would change the rating. Then list **queued** ideas (over the five-name cap) and anything that failed, with why.

## Guardrails

Recommend-only, DRAFT-only. Never write to `positions` or `portfolio_allocations`, never place or stage a trade. Never write `ic_memos` or `risk_reports` from this job — a watchlist idea has no portfolio to be sized or risked against, which is the whole point of the split. Never flag At-Risk (that is `at-risk-review`), never write to `security_theses`, and never remove a prospect. If an idea's ticker cannot be priced or researched, leave it and say so.
