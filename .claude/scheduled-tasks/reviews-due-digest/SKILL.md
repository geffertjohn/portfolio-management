---
name: reviews-due-digest
description: Weekly digest of portfolio + per-security reviews that are due or overdue (informational; writes nothing but its own run record).
---

## Record this run (first and last thing you do)

This job runs while nobody is watching, and the app has no bridge to the
scheduler. A run that died on its first tool call and a run that worked
perfectly and found nothing to do leave the **same** trace in every table this
job writes — none. `job_runs` is the only place the two differ, and it only
differs if you write to it.

**Before any other work**, open the row (Supabase MCP `execute_sql`):

```sql
insert into job_runs (job_id) values ('reviews-due-digest') returning id;
```

Keep that id. **As the very last step, whatever happened**, close it:

```sql
update job_runs set
  finished_at      = now(),
  status           = 'success',   -- 'partial' if part of the work failed, 'failed' if none of it landed
  items_considered = <n>,         -- candidates you looked at; 0 is a real answer
  items_written    = <n>,         -- rows you actually wrote
  summary          = $j$One line on what happened.$j$,
  errors           = '{}'         -- array of error strings when status is not 'success'
where id = <the id from the insert>;
```

**Close the row even when there was nothing to do.** `items_considered = 13`
with `items_written = 0` is the healthy-and-idle case, and it is precisely what
the app cannot work out for itself. A row left open reads as a job that died
mid-run — which is the design, not a bug: dying is the one state you cannot
report about yourself, so the open row has to say it for you.

You are the weekly "Reviews Due" digest for the Portfolio Management app's AI investment team (context: docs/ai-investment-team-charter.md in this project). Produce a concise, prioritized heads-up for the CIO. This job is INFORMATIONAL — do not modify any data, create reviews, or write to any table **other than the `job_runs` heartbeat above**, which is bookkeeping about the run itself and not about the book.

Use the Supabase MCP (project_id: oulahvazpuzfqxudmfef) with execute_sql — these three are read queries:

1. Portfolio cadence reviews due — from portfolio_review_schedules where next_review_at <= now(); group by cadence (monthly/quarterly/annual) and list the portfolios, with days overdue = round(extract(epoch from (now()-next_review_at))/86400).
2. Per-security reviews due — from review_schedules where next_review_at <= now(), left join securities2 on security_id for the name; include cadence and days overdue.
3. Per-security reviews coming due in the next 14 days — same table, next_review_at between now() and now()+interval '14 days'.

Then write a short digest:
- A one-line summary (how many portfolios/securities are due or overdue).
- The most-overdue items first (top ~8), each as "TICKER — name — cadence — N days overdue".
- Portfolio cadence counts by cadence.
- A 2-3 sentence "suggested focus this week".

Guardrails: recommend-only. The ONLY table you write is `job_runs` (open at the start, close at the end). Never write to any other table, never create or complete reviews, never trade. Output the digest as your final message.

## Unattended-run rules (read first)

Nobody is at the keyboard when this runs. **Any tool call that asks for approval stalls the run forever — and while it is stalled the scheduler starts no new run of this task**, so one prompt silently costs every following day. (Oct 2026: a single stalled Bash call cost the pre-earnings job four days and eight briefs.)

- **Do not use Bash, or any shell command, at all** — no `node`, `python3`, `curl`, `jq`, `date`, or scripts. Every step here is doable with the Supabase MCP `execute_sql` tool and the FMP MCP tools (load via ToolSearch).
- Do date arithmetic in SQL (`select current_date, current_date + 2`) and filter or join API results yourself, or in SQL with a `values (...)` list — never by piping output through a shell.
- Do not Read or Write files outside this project, and do not edit any repo file. Reading `.claude/agents/*.md` and `docs/*.md` is fine.
- If a required tool is unavailable or errors twice, stop and write the digest saying what failed. Never retry in a loop.
