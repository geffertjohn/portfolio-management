---
name: earnings-call-summary
description: Weekday committee read of each newly-transcribed earnings call for a held stock — sentiment, the guidance given on the call, and highlights/lowlights; drafts to earnings_call_summaries.
---

You write the investment committee's own read of an earnings call: whether the call was positive, neutral or negative and why, what management guided to ON the call, and the highlights and lowlights. Recommend-only, DRAFT-only: never modify positions/allocations, never trade.

This runs in a fresh session in the Portfolio Management project directory. Supabase MCP project_id: oulahvazpuzfqxudmfef. FMP tools load via ToolSearch. Class tickers use the FMP hyphen form (BRK.B -> BRK-B).

## What this job is NOT

It is **not** the post-earnings brief. That job grades the thesis of record against a print and requires a matching pre-earnings brief by CHECK constraint. This one is keyed to the **call** — `(security_id, fiscal_year, quarter)` — and runs for any held stock with a transcript, whether or not it ever had a brief. That is the whole point: MU has no briefs at all and still needs its calls read.

Do not write to `research_reports` here, and do not grade break tests. A thesis test that this call bears on belongs in the post-earnings brief, not in a highlight.

## Unattended-run rules (read first)

Nobody is at the keyboard when this runs. **Any tool call that asks for approval stalls the run forever — and while it is stalled the scheduler starts no new run of this task**, so one prompt silently costs every following day.

- **Do not use Bash, or any shell command, at all** — no `node`, `python3`, `curl`, `jq`, `date`, or scripts. Every step here is doable with the Supabase MCP `execute_sql` tool and the FMP MCP tools (load via ToolSearch).
- Do date arithmetic in SQL (`select current_date - 45`), never by piping output through a shell.
- Do not Read or Write files outside this project, and do not edit any repo file. Reading `.claude/agents/*.md` and `docs/*.md` is fine.
- **Warm the connectors with ONE call before any fan-out.** A scheduled run that fires before the working day often runs as a catch-up seconds after the machine wakes, and the connector transport has not re-established — a parallel burst then fails *every* call at the tool-call hook instead of one. Make the first FMP call on its own and wait for it. Only then fan out, a few at a time.
- If a required tool is unavailable or errors twice, stop and write the digest saying what failed. Never retry in a loop. If several calls fail at once with timeouts, retry ONE on its own first — that distinguishes a dead connector from a cold one.

## Steps

1. **FIND CANDIDATES.** A held stock needs a summary when it has reported recently and the call has no live summary row. One query:

   ```sql
   select s.security_id, s.last_earnings_release::date as last_report
   from securities2 s
   where s.security_id in (select distinct security_id from positions where deleted_at is null)
     and s.security_id <> '$Cash'
     and coalesce(s.detailed_security_type,'') !~* '(etf|mutual|open-end|open end|closed-end)'
     and coalesce(s.peer_group_name,'') = '' and coalesce(s.fund_company_name,'') = ''
     and coalesce(s.fund_family,'') = '' and s.expense_ratio_generic is null
     and s.last_earnings_release is not null
     and s.last_earnings_release::date >= current_date - 45
     and not exists (
       select 1 from earnings_call_summaries e
       where e.security_id = s.security_id
         and e.deleted_at is null
         and e.call_date >= s.last_earnings_release::date)
   order by s.last_earnings_release desc;
   ```

   The 45-day window plus the not-exists check is what makes this job idempotent and self-retrying. If it returns nothing, write "No held stock has an unsummarised call." and STOP (persist nothing).

   `last_earnings_release` is a stored column and goes stale between a report and the app refreshing it, so a name may appear a day or two late. That is acceptable — it will be caught on a later run. Never widen the window past 45 days to chase one.

2. **CAP THE RUN AT FIVE NAMES.** Each summary means reading a full transcript, which is tens of thousands of words. Take the five most recent reporters and list the rest in the digest as "queued" — they are picked up tomorrow. A run that tries to do fifteen will produce five good summaries and ten thin ones.

3. **RESOLVE THE CALL.** For each candidate, `earningsTranscript` -> `transcripts-dates-by-symbol` (symbol). Take the newest entry and record its `fiscalYear`, `quarter` and `date`.
   - Match on the **date**, never the quarter number — fiscal and calendar quarters differ.
   - If the newest transcript predates `last_earnings_release`, the call has not been transcribed yet. SKIP silently; it is tomorrow's work.
   - Re-check `earnings_call_summaries` for that exact `(security_id, fiscal_year, quarter)` before writing — the candidate query keys on date, this keys on the call.

4. **FETCH IT.** `earningsTranscript` -> `search-transcripts` with that symbol, `fiscalYear` and `quarter`.
   - **Check what you actually got.** Some transcripts are the post-earnings *analyst Q&A*, not the prepared-remarks call — they open with an operator handing straight to Q&A and refer to "the main call". That changes what is in them: guidance may appear only as an aside, and the CEO may not speak at all. Say so in `sentiment_summary` when it applies, so a reader is not left wondering why.

5. **Adopt the research-analyst role** — Read `.claude/agents/research-analyst.md` first.

6. **WRITE THE SUMMARY.** Everything below comes from THIS transcript. Do not import figures from the release, the statements or a vendor summary — if it was not said on the call, it does not belong here.

   **`sentiment`** — exactly one of `positive` / `neutral` / `negative`.

   **`sentiment_summary`** — a paragraph saying why it reads that way. The judgement, not a list; the itemised version lives in the highlights and lowlights.

   > **Separate an industry constraint from a company problem.** This is where a mechanical summary goes wrong. For a memory maker in a tight market, "industry DRAM supply growth is decelerating" and "clean room space is the binding constraint" are what *sustain pricing* — they belong on the bull side or nowhere, however negative they sound. What cuts against the company is narrower and specific to it: its own bit growth trailing the industry, its own segment shipments falling, its own cost per bit rising faster than its own volume. Count the second kind, not the first.

   **`guidance`** — prose, what management guided to on this call: the figures, the periods they cover, and the conditions attached. Include the housekeeping asides; they are often the most concrete numbers on the call and are easy to miss because they arrive last. Null only if no forward-looking statement was made.

   **`highlights` / `lowlights`** — `[{title, detail}]` each. **No fixed count** — a call has as many as it has, and forcing symmetry is how a summary starts lying. `title` is a claim in a few words; `detail` is two or three sentences with the figure and what management actually said. Prefer what was *disclosed* over what was *asserted*: a number given under questioning is worth more than an adjective in an opening statement.

7. **PERSIST** as a DRAFT via execute_sql into `earnings_call_summaries`. Dollar-quoted literals (`$s$ … $s$`) for all text/jsonb. Columns: `security_id` (UPPER), `fiscal_year`, `quarter`, `call_date` and `transcript_date` (the transcript's own date), `sentiment`, `sentiment_summary`, `guidance`, `highlights`, `lowlights`, `status = 'draft'`.

   A partial unique index allows only ONE live summary per `(security_id, fiscal_year, quarter)`, so a duplicate insert fails loudly rather than piling up — if that happens the call was already summarised; skip it.

8. **DIGEST.** Per name: TICKER, the call (Q and fiscal year) and its date, the sentiment with a one-line reason, and the highlight/lowlight counts. Then list separately, so it is clear they were considered rather than missed: **"awaiting transcript"** (reported, not yet transcribed) and **"queued"** (over the five-name cap). Say explicitly if any transcript turned out to be analyst Q&A rather than the prepared-remarks call.

## Guardrails

Recommend-only, DRAFT-only. Never write to `positions` or `portfolio_allocations`, never place or stage trades, never flag At-Risk or touch the watchlist, and never write to `security_theses` or `research_reports`. These summaries are decision support for the CIO.
