---
name: portfolio-committee-review
description: Answers fund-portfolio annual reviews that have been handed to the investment committee — portfolio manager, risk manager and macro strategist read the advisor's proposals and the book, and write back one memo to portfolio_review_memos so the review's committee step stops reading "Awaiting committee".
---

## Record this run (first and last thing you do)

This job runs while nobody is watching, and the app has no bridge to the
scheduler. A run that died on its first tool call and a run that worked
perfectly and found an empty queue leave the **same** trace in every table this
job writes — none. `job_runs` is the only place the two differ, and it only
differs if you write to it.

**Before any other work**, open the row (Supabase MCP `execute_sql`):

```sql
select job_run_open('portfolio-committee-review');
```

Keep that id. **As the very last step, whatever happened**, close it:

```sql
select job_run_close(
  <the id from job_run_open>,
  'success',                      -- 'partial' if some reviews failed, 'failed' if none landed
  <items_considered>,             -- queued reviews you looked at; 0 is a real answer
  <items_written>,                -- memos you actually wrote
  $j$One line on what happened.$j$,
  '{}'                            -- array of error strings when status is not 'success'
);
```

`job_run_close` **raises if it updates nothing**, so a heartbeat that fails to
close is an error you will see rather than a row left open for `gradeJob` to
report as a death three hours later.

**Close the row even when there was nothing to do.** An empty queue is the
normal case — annual reviews happen a handful of times a year — and
`items_considered = 0` is precisely what the app cannot work out for itself.

This runs in a fresh session in the Portfolio Management project directory.
Supabase MCP project_id: `oulahvazpuzfqxudmfef`.

## Unattended-run rules (read first)

Nobody is at the keyboard. **Any tool call that asks for approval stalls the
run forever — and while it is stalled the scheduler starts no new run.**

- **Do not use Bash, or any shell command.** Supabase MCP `execute_sql`, the
  Agent tool and the FMP MCP tools are enough.
- Do date arithmetic in SQL, never by shelling out.
- **Warm the connectors with ONE call before any fan-out.**
- **The run is over only when the memo rows are written and the digest is
  printed.** Dispatching the role agents is not licence to end the turn: they
  return their work to you and **write nothing themselves**. A run that stops
  when the agents return has produced nothing at all.
- If a tool errors twice, stop and write the digest saying what failed.

## What you are answering

**Is this book still the right book?** A fund portfolio's annual review, from
three portfolio-level angles. The advisor has already recorded what they are
inclined to do; you answer the portfolio on its own terms and they decide after
you. **Recommend-only: never write to `positions` or `portfolio_allocations`,
never stage a trade.**

You are NOT re-rating each fund as a security — the advisor has just done the
scorecard step, and those readings are in front of you. Your question is about
the book: construction, risk, and the regime it is being run into.

## Steps

1. **FIND THE QUEUE.**

   ```sql
   select l.id review_log_id, l.portfolio_name, l.review_date::date due,
          l.committee_requested_at, l.considerations,
          p.portfolio_strategy
   from portfolio_review_log l
   join portfolio p on p.name = l.portfolio_name
   where l.cadence = 'annual'
     and l.status = 'draft'
     and l.committee_requested_at is not null
     and not exists (
       select 1 from portfolio_review_memos m
       where m.review_log_id = l.id and m.deleted_at is null)
   order by l.committee_requested_at;
   ```

   The `not exists` is what makes this idempotent and self-retrying: a review
   already carrying a memo is left alone. If nothing comes back, write
   "No annual review is awaiting the committee." and STOP (after closing the
   heartbeat).

2. **CAP THE RUN AT TWO REVIEWS**, oldest handoff first. Three agents per
   review and a whole book to read; list the rest as "queued" for the next run.

3. **READ THE BOOK AND WHAT THE ADVISOR SAID.** For each review:

   ```sql
   -- current targets
   select security_id, allocation_pct, lower_limit, upper_limit
   from positions
   where portfolio_name = :portfolio and deleted_at is null
   order by allocation_pct desc;

   -- the advisor's proposals, recorded BEFORE you looked
   select security_id, proposed_decision, proposed_weight, proposed_rationale
   from holding_reviews
   where review_log_id = :review_log_id and proposed_decision is not null;

   -- the model the book is run against
   select * from model_portfolio_data m
   join portfolio_model_map pm on pm.model_portfolio_id = m.id
   where pm.security_id = :portfolio;
   ```

   Also read the fund scorecard columns on `securities2` for each holding —
   the rank and ratio columns the app's scorecard uses. The advisor has just
   worked through them; you are reading the same evidence, not new evidence.

4. **DISPATCH THE THREE ROLES** via the Agent tool, in one message so they run
   together. These resolve from `.claude/agents/*.md`, so there is no inlined
   copy to keep in sync.

   - **`portfolio-manager`** — construction. Does the mix still implement the
     model's asset-class targets? Where is the book over or under its bands?
     Is any sleeve carrying a fund that no longer earns its place relative to
     the alternatives? Respond to the advisor's proposals explicitly: say where
     you agree, where you do not, and why.
   - **`risk-manager`** — concentration, factor exposure, and **verification
     against every active rule in the Compliance Rules hub**
     (`firm_compliance_rules` plus `compliance_rules` matching the portfolio OR
     its strategy — match on both or you silently miss every strategy-scoped
     rule). Measure against the ACTUAL book where an allocation file exists,
     and say so when you fall back to targets.
   - **`macro-strategist`** — the regime this book is being run into, and what
     it means for duration, credit and equity-style tilts at these weights.
     Context, not a stock call.

   **Hand each role the advisor's considerations and proposals.** They are
   answering a portfolio the advisor has already formed a view on, and a
   committee that cannot see that view produces a memo that talks past it.

5. **SYNTHESISE ONE MEMO.** Not three. The advisor reads one document and
   decides; three unreconciled opinions make that their job rather than yours.
   Where the roles disagree, say so in the summary — a disagreement between the
   PM and the risk manager is information, not a defect to smooth over.

   Per-holding recommendations use the SAME vocabulary as the advisor's
   proposal — `keep` / `increase` / `reduce` / `replace` / `exit` — so the final
   step can put the two side by side. Give a `targetWeight` only for a size
   change; on `keep` or `exit` it is noise or a contradiction.

   **Recommend a change only where you have something to say.** A memo that
   lists every holding with "keep" teaches the reader to skim it.

6. **WRITE THE RISK REPORT**, portfolio-scoped, through the committee API:

   ```sql
   select committee_insert('risk_reports', $j$ {
     "portfolio_name": "...", "scope": "portfolio",
     "concentration": {...}, "factor_exposures": {...},
     "mandate_checks": [{"limit": "...", "actual": "...", "pass": true}],
     "verdict": "pass", "notes": "..."
   } $j$::jsonb);
   ```

   Keep the returned id for the memo.

7. **WRITE THE MEMO**, one per review, through the same API:

   ```sql
   select committee_insert('portfolio_review_memos', $j$ {
     "review_log_id": 123,
     "portfolio_name": "...",
     "pm_assessment": "...",
     "risk_assessment": "...",
     "macro_context": "...",
     "recommendations": [
       {"securityId": "VBILX", "recommendation": "reduce",
        "targetWeight": 28, "rationale": "..."}
     ],
     "summary": "...",
     "risk_report_id": 456
   } $j$::jsonb);
   ```

   A **partial unique index allows one live memo per review**, so a second
   insert for the same `review_log_id` raises rather than leaving the final
   step unable to say which read it is deciding against. If it raises, the
   review already has a memo — treat that as success, not failure, and move on.

8. **DO NOT TOUCH THE REVIEW ITSELF.** `portfolio_review_log` is not on the
   committee write allowlist, deliberately: the advisor owns the review and
   completes it. Your memo appearing is what moves the review forward.

## How to write the prose fields

Every sentence must stand on its own. Name the measure and the threshold
rather than referring to one of our documents as a bare noun — "the book runs
68% fixed income against a model target of 68%, inside its 60–76% band" is
readable a year later; "fixed income is on target" is not. This is a
correctness rule before it is a style one: a finding unreadable without a
second document open fails at the audit job the record exists for.

Say what would change your mind. A recommendation with no stated condition for
reversing it is an opinion, not an analysis.

## Digest

Finish by printing, to the run log:

- which reviews you answered, and which you left queued
- the headline of each memo, in one line
- anything you could not read, and what you did instead
