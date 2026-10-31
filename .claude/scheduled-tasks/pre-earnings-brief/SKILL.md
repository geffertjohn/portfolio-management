---
name: pre-earnings-brief
description: Weekday pre-earnings briefs for held stocks reporting in the next ~4 days, in two sections — The Street (estimates + questions) and Thesis Evaluation (our own reasons and risks, carried from security_theses); drafts to research_reports.
---

## Record this run (first and last thing you do)

This job runs while nobody is watching, and the app has no bridge to the
scheduler. A run that died on its first tool call and a run that worked
perfectly and found nothing to do leave the **same** trace in every table this
job writes — none. `job_runs` is the only place the two differ, and it only
differs if you write to it.

**Before any other work**, open the row (Supabase MCP `execute_sql`):

```sql
insert into job_runs (job_id) values ('pre-earnings-brief') returning id;
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

You are the pre-earnings brief generator for the Portfolio Management app's AI investment team (context: docs/ai-investment-team-charter.md). For every STOCK currently held that reports earnings within the next ~4 calendar days, draft a brief in TWO SECTIONS and save it as a DRAFT research report. Recommend-only, DRAFT-only: never modify positions/allocations, never trade.

This runs in a fresh session in the Portfolio Management project directory. Supabase MCP project_id: oulahvazpuzfqxudmfef. FMP tools load via ToolSearch. Class tickers use the FMP hyphen form (BRK.B -> BRK-B).

## Unattended-run rules (read first)

Nobody is at the keyboard when this runs. **Any tool call that asks for approval stalls the run forever — and while it is stalled the scheduler starts no new run of this task**, so one prompt silently costs every following day. (Oct 2026: a single stalled Bash call cost the pre-earnings job four days and eight briefs.)

- **Do not use Bash, or any shell command, at all** — no `node`, `python3`, `curl`, `jq`, `date`, or scripts. Every step here is doable with the Supabase MCP `execute_sql` tool and the FMP MCP tools (load via ToolSearch).
- Do date arithmetic in SQL (`select current_date, current_date + 4`) and filter or join API results yourself, or in SQL with a `values (...)` list — never by piping output through a shell.
- Do not Read or Write files outside this project, and do not edit any repo file. Reading `.claude/agents/*.md` and `docs/*.md` is fine.
- If a required tool is unavailable or errors twice, stop and write the digest saying what failed. Never retry in a loop.

## The shape

The brief has two sections, and each field below is filled from BOTH ends: you state the expectation, and the `post-earnings-brief` job copies your fields forward UNCHANGED and appends the outcome. Write every field so it can be graded later by someone who was not here.

**SECTION 1 — THE STREET.** What the market expects and what it wants settled.
**SECTION 2 — THESIS EVALUATION.** Our own reasons for owning it and our own bear case, carried from the security's thesis of record.

## Steps

1. **Held universe.** execute_sql: `select distinct security_id from positions`.

2. **Upcoming earnings.** Via the FMP earnings calendar, keep only tickers reporting within **~4 calendar days** of today. If none, write "No held stocks report in the next 4 days." and STOP (persist nothing).

   **Why 4 and not 2:** a post-earnings brief cannot exist without its pre-brief — a CHECK constraint enforces the pairing — and the review that reads it falls due the day after the print. So a day this job does not run (the app was closed) silently costs that holding its brief, its recommendation, and the aid for a review that will not come round again for a quarter. A wider window gives each print several chances to be caught instead of exactly one.

   **Do not write a second brief for a print you have already covered.** Before writing, check for an existing `pre_earnings` row for that ticker created within the last 7 days and skip it if one exists:

   ```sql
   select security_id, created_at from research_reports
   where report_type = 'pre_earnings' and deleted_at is null
     and created_at >= now() - interval '7 days';
   ```

   **Resolve the fiscal period you are briefing**, because the brief is stored
   against the CALL, not against the day you wrote it. `earningsTranscript` →
   `transcripts-dates-by-symbol` (symbol), take the newest entry and increment
   it: `Q1→Q2`, `Q2→Q3`, `Q3→Q4`, and `Q4` rolls to `Q1` of `fiscalYear + 1`.
   That is the call about to be held.

   Use the FISCAL labels the transcript list gives, never the calendar quarter —
   TJX's August call is its Q2 **2027**, and dating it 2026 would file the brief
   under a quarter that already happened. If a symbol has no transcript history
   at all, leave the period null rather than guessing; the post-earnings job
   fills it in once the call is transcribed.

3. **Load the thesis of record** for each qualifying ticker — this is what Section 2 grades:

   ```sql
   select id, version, status, thesis, bull_case, bear_case
   from security_theses
   where security_id = 'TICKER'
   order by case status when 'current' then 0 when 'draft' then 1 else 2 end, version desc
   limit 1;
   ```

   `thesis` is `[{key,title,rationale}]` (the reasons). `bull_case` is the supporting metrics, each `{key, reasonKey, label, metric, baseline, trend, breaksIf, context}`. `bear_case` is the risks, same shape, where `breaksIf` holds the "worsens if". Record the row's `id` — you will write it to `thesis_id`.

   If the security has NO thesis row, say so in the commentary, leave `thesis_checks`/`risk_checks` null, and still write Section 1. Do not invent a thesis.

4. **Adopt the research-analyst role** — Read `.claude/agents/research-analyst.md` first.

5. **SECTION 1 — `estimates`.** Build the four rows from FMP `analyst-estimates` (quarterly), which serves `epsAvg`, `revenueAvg`, `ebitdaAvg` with low/high and `numAnalystsEps`/`numAnalystsRevenue`. EBITDA margin is derived (`ebitdaAvg / revenueAvg`).

   ```json
   [
     {"key":"eps","label":"EPS","unit":"usd","estimate":3.60,"low":3.50,"high":3.72,"analysts":24,"source":"FMP consensus"},
     {"key":"revenue","label":"Revenue","unit":"usd_large","estimate":16780000000,"low":null,"high":null,"analysts":21,"source":"FMP consensus"},
     {"key":"ebitda","label":"EBITDA","unit":"usd_large","estimate":7900000000,"source":"FMP consensus"},
     {"key":"ebitda_margin","label":"EBITDA margin","unit":"pct","estimate":0.4708,"source":"Derived: EBITDA / revenue"}
   ]
   ```

   - `unit` drives rendering: `usd` (plain dollars), `usd_large` (abbreviated, $16.78B), `pct` (**decimal** — 0.4708, not 47.08).
   - **Where the company's own guide differs from consensus, the guide is the real bar** — add it as a `note` on the row and say so in the commentary. A stale consensus against a fresh company guide is a trap.
   - If a metric genuinely has no estimate, set `estimate: null` and say why in `source`. Do not fabricate one.
   - **Keep `source` and `note` SHORT — a caption, not a paragraph.** Anything over roughly 110 characters is moved out of the table into a numbered note below it, so long text is preserved but stops being scannable inline. Put the one-line basis in `source` (e.g. "FMP consensus, USD") and any real caveat — a currency basis, a conversion rate, a low-confidence row — in `note`.

6. **SECTION 1 — commentary (the `thesis` column).** Narrative prose, ~5-8 sentences: the setup, positioning, beat/miss cadence, what is already priced in, where expectations sit relative to the company's own guide. This is the analyst's read, NOT a list — the gradeable items live in `street_questions` and Section 2. **Do not include a timing caveat about whether results have posted yet**; the post-earnings job gates on actuals, so that concern is handled structurally.

7. **SECTION 1 — `street_questions`.** 2-4 questions the street actually wants answered on this call. These are the market's questions, not ours.

   ```json
   [{"key":"fy_guide_raise","question":"Does the FY guide get raised a second time?",
     "why":"The FY guides ($21.6B / $10.2B) were lifted with Q1. A second raise is what the multiple is discounting; an unchanged guide reads as a stall."}]
   ```
   `why` must say what turns on the answer, with a number wherever one exists.

8. **SECTION 2 — `thesis_checks` (what we're looking for).** Take 2-3 entries from the thesis's `bull_case` whose break test THIS print can bear on. Carry the thesis's own words:

   ```json
   [{"key":"<the bull_case entry's key>",
     "title":"<the parent reason's title from thesis[], matched on reasonKey>",
     "metric":"<the entry's metric, verbatim>",
     "test":"<the entry's breaksIf, VERBATIM — do not paraphrase>",
     "watchFor":"What in this specific print bears on that test."}]
   ```

9. **SECTION 2 — `risk_checks` (risks we're watching).** Same shape, 2-3 entries from the thesis's `bear_case`, where `test` is that point's `breaksIf` (its "worsens if"), verbatim.

   For both: choose the entries this quarter can actually speak to. A break test about a multi-year regulatory docket does not belong in a brief about one print — say so by leaving it out, not by stretching `watchFor`.

10. **`bull_case` / `bear_case` columns.** Always populate both as their own columns — the bull and bear watch-items for this print in prose. Earlier briefs left these null on more than half the rows, which made them impossible to compare after the fact.

11. **Persist** as a DRAFT via execute_sql into `research_reports`. Use PostgreSQL dollar-quoted literals (`$brief$ … $brief$`) for all text/jsonb to avoid escaping issues. Columns: `security_id` (UPPER), `author_role = 'research_analyst'`, `report_type = 'pre_earnings'`, `status = 'draft'`, **`fiscal_year` and `quarter` (the upcoming call, from step 2 — both or neither; a CHECK enforces the pair)**, `thesis_id` (from step 3), `estimates`, `street_questions`, `thesis_checks`, `risk_checks`, `thesis` (the commentary), `bull_case`, `bear_case`, `current_price`, `sources`. Leave `portfolio_name`, `addition_id`, `parent_report_id`, `thesis_status` and `watch_items` null — `thesis_status` belongs to the post-earnings brief, and `watch_items` is the superseded pre-Oct-2026 shape.

12. **Digest.** Per name: TICKER, earnings date, whether a thesis was found, and a one-line takeaway.

## Data cautions

- **FMP's `ebitda` is derived from its `operatingIncome`, which disagrees with the filing on roughly one name in three** (BSX FY2020: +$601M reported against a filed −$80M operating LOSS). For the ESTIMATE that is unavoidable — consensus EBITDA is a consensus. But flag in `source` that it is vendor-derived, and never present it as an as-filed figure.
- **Check the reporting currency.** FMP serves `analyst-estimates` and the financial statements in the company's own reporting currency (`reportedCurrency`), while `/stable/earnings` is USD per ADS for foreign filers. The two bases can disagree by more than the surprise you are trying to measure, and FMP converts USD actuals at a rate it does not disclose. State the basis per row and say which figure is the clean one to grade against.
- Ground every figure with its period.
- Say when a number is unavailable rather than estimating one.

## Guardrails

Recommend-only, DRAFT-only. Never write to `positions` or `portfolio_allocations`, never place or stage trades. The briefs are decision support for the CIO. `report_type` is `'pre_earnings'` — it was `'earnings_review'` before Oct 2026 and that value no longer passes the CHECK constraint.