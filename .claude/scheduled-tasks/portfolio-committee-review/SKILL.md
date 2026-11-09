---
name: portfolio-committee-review
description: Answers fund-portfolio annual reviews that have been handed to the investment committee — portfolio manager, risk manager and macro strategist read the book, its scorecard readings and the watchlist ideas competing in each holding's category, and write back one memo to portfolio_review_memos so the review's committee step stops reading "Awaiting committee".
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
three portfolio-level angles.

**The advisor has named the comparison, not made the call.** Their handoff sets
out every holding, the category it is judged in, and the watchlist ideas
recorded in that same category — the candidates the firm has already written
down. They have deliberately not said what to do with any of it; that is the
question you answer, and they decide after you. **Recommend-only: never write
to `positions` or `portfolio_allocations`, never stage a trade.**

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

2. **SKIP A HANDOFF WITH NO BOOK — and do NOT skip one with no note.**

   This gate used to read "zero `holding_reviews.proposed_decision` rows AND no
   `considerations` → skip". **That test is now true of every handoff and must
   not be used.** The Considerations step dropped its per-holding Proposal,
   Target % and Rationale columns in Nov 2026 — nothing writes
   `proposed_decision` any more — and the free-text note beside the table is
   explicitly optional. The old gate would therefore skip every review an
   advisor hands over without typing a note, which is the normal case: review
   36 (Hybrid Balanced) was in exactly that shape on 9 Nov 2026 — 16 holdings
   and no note.

   **What a handoff carries now is the book**, and none of it is typed: the
   holdings, the `category_name` each is judged in, and the watchlist ideas
   competing in that category. That is the whole point of the redesign — the
   advisor cannot leave it blank. What can still be missing is a book to
   review.

   ```sql
   -- Qualify `p.security_id`: securities2 carries a column of the same name,
   -- so the bare reference is ambiguous and the query errors outright.
   select
     count(*) filter (where upper(coalesce(p.security_id, '')) not like '%CASH%') as holdings,
     count(*) filter (where upper(coalesce(p.security_id, '')) not like '%CASH%'
                        and nullif(trim(coalesce(s.category_name, '')), '') is null) as uncategorised
   from positions p
   left join securities2 s on s.security_id = p.security_id
   where p.portfolio_name = :portfolio and p.deleted_at is null;
   ```

   **Zero holdings → write nothing for that review.** Leave
   `committee_requested_at` standing — withdrawing it is the advisor's call,
   not yours — and name the review in the summary.

   **A holding with no `category_name` is NOT a reason to skip.** It is one row
   you cannot name alternatives for, and it belongs in the memo rather than in
   the skip list: that same null drops the holding out of the allocation
   rollup as unclassified weight, so the risk manager is measuring the book
   with a hole in it and should be told which row.

   **The order is still the control**, for a reason the redesign did not
   change: the advisor's note is written and the section frozen BEFORE you
   look, so a memo written first cannot be shown to be independent of it. Only
   one live memo is allowed per review, so a premature one is in the way.

3. **CAP THE RUN AT TWO REVIEWS**, oldest handoff first. Three agents per
   review and a whole book to read; list the rest as "queued" for the next run.

4. **READ THE BOOK AND THE COMPARISON THE ADVISOR SET OUT.** For each review:

   ```sql
   -- current targets
   select security_id, allocation_pct, lower_limit, upper_limit
   from positions
   where portfolio_name = :portfolio and deleted_at is null
   order by allocation_pct desc;

   -- WHAT EACH HOLDING IS TO BE WEIGHED AGAINST: the live watchlist ideas
   -- recorded in the same securities2.category_name. This is the same table
   -- the advisor's Considerations step renders -- `watchlistAlternativesByCategory`
   -- + `alternativesFor` in `client/src/lib/prospects.ts`. REPRODUCE IT. Do not
   -- assemble a comparison set of your own: a name you introduce has had no
   -- research run on it, and the memo would recommend against a candidate the
   -- advisor never recorded.
   with holding as (
     select p.security_id, p.allocation_pct, s.category_name,
            lower(regexp_replace(trim(coalesce(s.category_name, '')), '\s+', ' ', 'g')) as ckey
     from positions p
     left join securities2 s on s.security_id = p.security_id
     where p.portfolio_name = :portfolio and p.deleted_at is null
       and upper(coalesce(p.security_id, '')) not like '%CASH%'
   ), idea as (
     -- held HERE and held ELSEWHERE are different findings, so they are
     -- marked separately rather than as one "held" flag.
     select s.security_id,
            lower(regexp_replace(trim(coalesce(s.category_name, '')), '\s+', ' ', 'g')) as ckey,
            exists (select 1 from positions h
                    where h.security_id = s.security_id and h.deleted_at is null
                      and h.portfolio_name = :portfolio) as held_here,
            exists (select 1 from positions h
                    where h.security_id = s.security_id and h.deleted_at is null
                      and h.portfolio_name <> :portfolio) as held_elsewhere
     from prospects pr
     join securities2 s on s.security_id = pr.security_id
     where pr.removed_at is null
   )
   select h.security_id as holding, h.allocation_pct as weight, h.category_name as category,
          coalesce(string_agg(i.security_id ||
                    case when i.held_here then ' (held here)'
                         when i.held_elsewhere then ' (held elsewhere)'
                         else '' end, ', ' order by i.security_id), '(none)') as alternatives
   from holding h
   left join idea i on i.ckey = h.ckey and i.security_id <> h.security_id
   group by 1, 2, 3
   order by h.allocation_pct desc;

   -- the advisor's standing note, if they left one. Optional by design --
   -- an empty one says nothing about whether the handoff is substantive.
   select nullif(trim(coalesce(considerations, '')), '') as considerations
   from portfolio_review_log where id = :review_log_id;

   -- the model the book is run against.
   -- portfolio_model_map keys on the portfolio's OWN security_id -- a YCharts
   -- id like 'P:2371412' -- NOT on its name, so joining the map on :portfolio
   -- matches nothing and hands the PM a construction question with no targets
   -- to answer it against. Go through `portfolio` the way the app does.
   select m.* from model_portfolio_data m
   join portfolio_model_map pm on pm.model_portfolio_id = m.id
   join portfolio p on p.security_id = pm.security_id
   where p.name = :portfolio;
   ```

   **If that returns no row, say so in the memo and stop** rather than
   assessing construction against nothing. An unmapped portfolio falls back to
   `investment_objective` in the app, but an objective is not unique, so a
   guess here would be a construction verdict measured against the wrong
   model -- worse than reporting that the mapping is missing.

   Also read the fund scorecard columns on `securities2` for each holding —
   the rank and ratio columns the app's scorecard uses. The advisor has just
   worked through them; you are reading the same evidence, not new evidence.

   **Read them for every ALTERNATIVE too, not just the holdings.** "Does VOO
   still earn its place against FELC" cannot be answered from VOO's row alone,
   and an alternative is in `securities2` by construction — the query above
   joins to it, and a watched fund now reaches the YCharts workbook on its own,
   so its columns are populated rather than pending.

   **AND READ THE COMPOSITION COLUMNS, for holdings and alternatives alike.
   `select *`; do not pick a subset.**
   `securities2` carries far more than the scorecard, and the scorecard ranks a
   fund WITHIN its cohort — it can never tell you whether two funds in a
   category are the same thing. That gap cost this job real work: the Nov 2026
   Foundation Conservative memo answered the consolidation question on 60% vs
   52% government and 0% vs 21% securitized, and the ballast question on a
   5.213% yield against 5.81 years of duration, and **every one of those numbers
   was fetched from the fund provider because the app held none of them.** It
   holds all of them now.

   - **Fixed income:** `effective_duration`, `sec_yield_generic`,
     `average_credit_quality_score`, `investment_grade_bond_allocation_generic`,
     `aaa_`/`bbb_bond_exposure_generic`.
   - **The bond sector breakdown:** `government_`, `corporate_`, `securitized_`,
     `municipal_` and `other_fixed_income_exposure*`. **Those five sum to 100%
     of the bond sleeve** — measured on 28 of the 29 funds that report one.
     **`cash_fixed_income_exposure` and `derivative_fixed_income_exposure` sit
     OUTSIDE that 100%**; adding them holds for only 14 and reaches 120%.
   - **The eleven Morningstar sectors**, plus size and region.
   - **Risk the scorecard does not grade:** `max_drawdown_3y`/`_5y`,
     `monthly_standard_deviation_annualized_3y`.
   - **Fund health:** `turnover_ratio_generic`, `total_assets_under_management`,
     `number_of_holdings_generic`, `one_year_fund_level_flows_to_aum`.

   Three traps, each of which has already produced a wrong reading:

   - **Never take the bond sectors from the `*_bond_exposure` family.** That
     family is mostly credit ratings and countries; `government_bond_exposure_
     generic` returns **0 on every bond fund** while VBILX is majority
     treasuries. The sector breakdown is `*_fixed_income_exposure`.
   - **Sector weights on a bond fund are noise.** They are a share of whatever
     equity sleeve exists, so VWEAX reads **100% financial services** off almost
     nothing. Decide which breakdown applies from `broad_asset_class`, never
     from whether the numbers look complete — PWB is an all-equity ETF whose
     bond sleeve YCharts reports as 100% government.
   - **A weight is a property of a BOOK.** A fund at 33% in one portfolio and
     25% in another is not 58% of anything; report the range and name the books.

   **How to read the alternatives table** — seven rules, each of which changes
   the answer. **The examples are dated observations (9 Nov 2026), not the
   state of the book:** the watchlist is still being filled in and cohorts are
   still being set, so re-read what the query returns and never assert a count
   from this file. Each rule stands without its example.

   - **Match on the normalised `category_name` and nothing more** — trim,
     lowercase, collapse runs of whitespace. Both sides are the same vendor
     column, so case and spacing are the only variation there is. **Do not add
     hyphen or spelling variants.** Those belong where two vocabularies meet (a
     fund's "Large Growth" against a benchmark's "US Large Cap Growth"), and
     inventing them here matches sleeves Morningstar considers distinct.
   - **A fund is never its own alternative.** A fund can be held in one book
     and watched for another — VBTLX is both — so the self-exclusion in the
     query is load-bearing, not tidying.
   - **`(held here)` is a CONSOLIDATION question and nothing else.** The
     alternative is already in the book under review, so there is no purchase
     to recommend — only whether the sleeve needs both funds. On 9 Nov 2026
     Foundation Conservative showed the case, and it is the same argument this
     job has already had: VBILX at 33% offered VBTLX, which sat beside it at
     25%. That is the Nov 2026 question — 60% against 52% government, 0%
     against 21% securitized, realised returns 31bp apart — surfaced on the
     row instead of waiting to be noticed.
   - **`(held elsewhere)` is a purchase, but of a fund the firm already
     knows.** On 9 Nov 2026 four of Hybrid Balanced's Intermediate Core Bond
     funds — BIMIX 11%, DHRIX 7%, PYTRX 7%, DFCF 4%, together 29% of the book
     — all pointed at VBTLX, held in three Foundation books at 25/18/12%.
     Moving into a fund already held under another model is a different
     recommendation from buying a stranger, and the memo should say which.
   - **The same idea against several holdings in one sleeve IS the finding.**
     Those four core-bond funds are one question — how many funds that sleeve
     needs — not four swap questions. Answer it once, at the sleeve, rather
     than four times at the holding.
   - **An empty cell is a real answer, not a gap.** Judge that holding on its
     own scorecard and composition and say that is what you did. **Do not go
     and find candidates.** The watchlist is the firm's written-down idea list;
     a name you introduce in a memo has had no research run on it, no bear
     case, and no record of when the firm started considering it. Empty cells
     are common and getting less so — seven of Hybrid Balanced's sixteen on
     9 Nov 2026, while the list was still being built — so an empty column is
     not evidence the step was skipped.
   - **NEVER compare two scorecard totals graded in different cohorts.**
     `securities2.scorecard_cohort` decides whether a fund is ranked against
     its category or against its peer group, and the two are different
     populations, so the totals are not on one scale. **Check the cohort of
     each pair you compare** — do not assume a category's funds agree, and do
     not assume they disagree either, because the cohorts are being set as
     this is written. On 9 Nov 2026 every Intermediate Core Bond holding in
     these books was graded `category` while VBTLX, the alternative offered
     against all of them, was graded `peer`; that may be corrected by the time
     you run. Reading one against the other is the failure
     `lib/fundPeers.ts` was written for — on that exact pair the printed totals
     once reversed the order every underlying metric gave. Force ONE cohort
     across the comparison, the subject holding's, as the fund page does, and
     say in the memo which you used. Where you cannot, compare the underlying
     metrics instead of the totals.
   - **A NULL `scorecard_cohort` on an alternative does not block the
     comparison.** `buildFundScorecard(security, cohort)` takes the cohort as
     an argument, so a fund can be scored in either one; the column records
     which cohort the FIRM judges it in, not which it can be measured in.
     Since the rule above already forces the subject holding's cohort, a null
     on the alternative changes nothing about how you score it — score it and
     move on. **Name it in the memo all the same**, in one clause: it means
     the idea is not yet fully set up, which is the advisor's to finish and
     not a reason to withhold the comparison. On 9 Nov 2026 three watched
     funds were in that state while the list was being extended. A null on the
     SUBJECT HOLDING is different and is a real gap — the review's scorecard
     step says so on that holding's own card.

   **The advisor sees this same comparison** on each fund's page, built by
   `lib/fundPeers.ts` — one cohort forced across the table so the scores are
   comparable, behaviour and composition kept separate. Reach the same
   conclusions from the same columns, or the memo and the page will disagree
   about a fund in front of the person reading both.

5. **DISPATCH THE THREE ROLES** via the Agent tool, in one message so they run
   together. These resolve from `.claude/agents/*.md`, so there is no inlined
   copy to keep in sync.

   - **`portfolio-manager`** — construction, and **the comparison the advisor
     set out**. Does the mix still implement the model's asset-class targets?
     Where is the book over or under its bands? Then take the alternatives
     table holding by holding: where a holding has an alternative, say whether
     it still earns its place against **that named fund**, and on which
     measure — a scorecard rank, a composition difference, a cost, a drawdown.
     Where it has none, say the holding was judged on its own and why it
     stands. Where one idea sits against several holdings in a sleeve, answer
     the sleeve.
   - **`risk-manager`** — concentration, factor exposure, and **verification
     against every active rule in the Compliance Rules hub**
     (`firm_compliance_rules` plus `compliance_rules` matching the portfolio OR
     its strategy — match on both or you silently miss every strategy-scoped
     rule). Measure against the ACTUAL book where an allocation file exists,
     and say so when you fall back to targets.
   - **`macro-strategist`** — the regime this book is being run into, and what
     it means for duration, credit and equity-style tilts at these weights.
     Context, not a stock call.

   **Hand each role the alternatives table** — every holding, its weight, its
   category, and the ideas recorded against it, with the held-here /
   held-elsewhere marks intact
   — plus the scorecard and composition columns for the holdings AND the
   alternatives, and the advisor's note if they left one. A role that cannot
   see the comparison answers a different question from the one the handoff
   asked, and the memo then talks past the page the advisor is reading.

6. **SYNTHESISE ONE MEMO.** Not three. The advisor reads one document and
   decides; three unreconciled opinions make that their job rather than yours.
   Where the roles disagree, say so in the summary — a disagreement between the
   PM and the risk manager is information, not a defect to smooth over.

   Per-holding recommendations use the SAME vocabulary as the advisor's final
   decision — `keep` / `increase` / `reduce` / `replace` / `exit`
   (`ANNUAL_DECISION_OPTIONS` in `lib/holdingReviews.ts`) — so the final step
   can put the two side by side and badge the difference as an override. Give a
   `targetWeight` only for a size change; on `keep` or `exit` it is noise or a
   contradiction.

   **`replace` MUST name the fund it replaces with, and that fund must be one
   of the alternatives.** It is the one recommendation the alternatives column
   makes answerable, and a `replace` with no counterparty sends the advisor
   back to find one — which is the work the handoff just did. Put the ticker in
   the rationale; `targetWeight` is the weight the replacement should carry. A
   holding with no alternative recorded cannot be recommended for `replace`:
   `exit` or `reduce` is the honest form of that view.

   **Recommend a change only where you have something to say.** A memo that
   lists every holding with "keep" teaches the reader to skim it.

7. **WRITE THE RISK REPORT**, portfolio-scoped, through the committee API:

   ```sql
   select committee_insert('risk_reports', $j$ {
     "portfolio_name": "...", "scope": "portfolio",
     "concentration": {...}, "factor_exposures": {...},
     "mandate_checks": [{"limit": "...", "actual": "...", "pass": true}],
     "verdict": "pass", "notes": "..."
   } $j$::jsonb);
   ```

   Keep the returned id for the memo.

8. **WRITE THE MEMO**, one per review, through the same API:

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

9. **DO NOT TOUCH THE REVIEW ITSELF.** `portfolio_review_log` is not on the
   committee write allowlist, deliberately: the advisor owns the review and
   completes it. Your memo appearing is what moves the review forward.

   **`holding_reviews` is not on the allowlist either, and its
   `proposed_decision` / `proposed_weight` / `proposed_rationale` columns now
   sit empty on every new review.** An empty column is not an invitation, and
   this one has already been filled wrongly: review 30 carries **seven
   AI-drafted rationales in the advisor's name**, written in Nov 2026 by a
   Claude Code run preparing that handoff. The advisor objected, and the
   redesign that removed those columns from the UI came out of it — because
   the order is the control, and a committee reviewing proposals the committee
   wrote is not independent of them. `lib/holdingReviews.ts` still reads and
   writes the columns, and no screen renders them any more, so a repeat would
   be both a false record of who held a view and an invisible one. Your
   recommendations go in the memo's `recommendations` array and nowhere else.

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
- for each review, how many holdings you judged against a named alternative
  and how many on their own
- anything you could not read, and what you did instead
