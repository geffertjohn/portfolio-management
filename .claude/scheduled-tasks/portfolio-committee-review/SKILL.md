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
   -- `akey` is `alternativeKey` from `client/src/lib/prospects.ts`, in SQL.
   -- Exact normalised category for most sleeves; the SLEEVE for mid- and
   -- small-cap, which pool across styles because ASSET_CLASS_ROWS gives large
   -- cap three rows and mid and small one each. Without this, FTZIX (Mid-Cap
   -- Blend) is briefed on RSIYX alone while the advisor's screen shows FSMVX,
   -- NAMAX and QVAL beside it -- a memo answering a narrower question than the
   -- one that was handed over.
   -- THIS IS A COPY of POOLED_SLEEVES + the mid/small rows of
   -- ASSET_CLASS_BY_CATEGORY. If either changes, change it here too.
   with akey as (
     select 'mid-cap blend' c union all select 'mid-cap growth' union all
     select 'mid-cap value' union all select 'mid cap core'    union all
     select 'mid cap growth'
   ), skey as (
     select 'small blend' c union all select 'small growth' union all
     select 'small value' union all select 'small cap core' union all
     select 'small cap growth'
   ), holding as (
     select p.security_id, p.allocation_pct, s.category_name,
            case
              when lower(regexp_replace(trim(coalesce(s.category_name,'')),'\s+',' ','g'))
                   in (select c from akey) then 'sleeve:us_mid_cap'
              when lower(regexp_replace(trim(coalesce(s.category_name,'')),'\s+',' ','g'))
                   in (select c from skey) then 'sleeve:us_small_cap'
              else lower(regexp_replace(trim(coalesce(s.category_name, '')), '\s+', ' ', 'g'))
            end as ckey
     from positions p
     left join securities2 s on s.security_id = p.security_id
     where p.portfolio_name = :portfolio and p.deleted_at is null
       and upper(coalesce(p.security_id, '')) not like '%CASH%'
   ), idea as (
     -- held HERE and held ELSEWHERE are different findings, so they are
     -- marked separately rather than as one "held" flag.
     select s.security_id,
            case
              when lower(regexp_replace(trim(coalesce(s.category_name,'')),'\s+',' ','g'))
                   in (select c from akey) then 'sleeve:us_mid_cap'
              when lower(regexp_replace(trim(coalesce(s.category_name,'')),'\s+',' ','g'))
                   in (select c from skey) then 'sleeve:us_small_cap'
              else lower(regexp_replace(trim(coalesce(s.category_name, '')), '\s+', ' ', 'g'))
            end as ckey,
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

   **THE MODEL CARRIES TWO NARRATIVE FIELDS AND THEY ANSWER DIFFERENT
   QUESTIONS.** Read both; do not collapse them.

   - **`investment_philosophy` is the MANDATE RUBRIC** — the income /
     stability / growth criteria a holding's contribution is judged against.
     It is the authority for "does this belong here".
   - **`investment_process` is HOW THE STRATEGY IS RUN** — screening,
     research, selection, monitoring, sell discipline. It is the authority
     for "is the firm doing what it said it would do", which is a different
     test and the one an audit asks. It was renamed from
     `investment_strategy` in Nov 2026 and **is editable on every model**, as
     are `objective_statement` and `investment_philosophy` — **no narrative
     field is gated any more.** Until Nov 2026 the philosophy was, which is
     why it is the one most often missing: it existed on exactly the three
     models the gate let through.
   - **`securities2.investment_strategy` IS A DIFFERENT COLUMN ON A
     DIFFERENT TABLE** — a fund's description from the YCharts workbook.
     Never read it as a model's process.

   **A NULL NARRATIVE FIELD IS A FINDING, NOT A BLANK TO WORK AROUND**, and
   it is the one gap that silently limits every other judgement in the memo.
   Measured 12 Nov 2026: **objective 14/14, philosophy 14/14, process
   14/14** — no model is missing a narrative field today. Should one appear,
   say plainly in the memo that no mandate test was possible and name the
   field, rather than inferring a rubric from the holdings and then grading
   the holdings against it. Do not treat a present `objective_statement` as
   a rubric: every model has one, and it states the objective, not the
   criteria.

   **ELEVEN OF THE FOURTEEN SHARE ONE PHILOSOPHY AND ONE PROCESS, WORD FOR
   WORD** — `Strategic Asset Allocation`, run as Capital Market Assumptions
   → Asset Allocation → Investment Selection → Ongoing Monitoring. All
   eleven are strategic-allocation fund mandates run the same way, so this
   is deliberate. Two consequences for the memo: finding the same rubric on
   another book is NOT corroboration, and the shared text says how the firm
   runs that whole set, not that this particular book was reasoned about on
   its own.

   **Only the three EQUITY books carry their own** — Core Growth, Equity
   Income, Equity Income & Core Growth. Fixed Income Total Return does NOT,
   despite being its own book rather than a shared risk tier, so do not
   infer which rubric applies from how a model is grouped. Read
   `investment_process`.

   **If that returns no row, say so in the memo and stop** rather than
   assessing construction against nothing. An unmapped portfolio falls back to
   `investment_objective` in the app, but an objective is not unique, so a
   guess here would be a construction verdict measured against the wrong
   model -- worse than reporting that the mapping is missing.

   **COMPARE THE BOOK TO ITS BENCHMARK'S ALLOCATION** (Nov 2026). This was
   missing from the process until the advisor asked for it, and it is the
   cheapest reading in this whole file: **`portfolio` and
   `model_portfolio_benchmarks` carry the SAME 66 allocation columns** — the
   nine-cell style box, size bands, eleven sectors, regions, credit-rating
   buckets, maturity buckets, `effective_duration`, `yield_to_maturity` — both
   computed by YCharts on the same look-through basis and both refreshed by
   the same morning import. The comparison is a one-row join. Nothing else in
   this job tells you how the book differs from the thing it is measured
   against.

   **THE JOIN IS A DIRECT MATCH ON `security_name`, and it only became one
   today — check it still resolves before trusting it.** The benchmark row's
   `security_name` and `model_portfolio_data.benchmark` now carry the same
   eight strings, so:

   ```sql
   select p.*, b.*
   from portfolio p
   join portfolio_model_map pm   on pm.security_id = p.security_id
   join model_portfolio_data m   on m.id = pm.model_portfolio_id
   join model_portfolio_benchmarks b on b.security_name = m.benchmark
   where p.name = :portfolio;
   ```

   **It needed a three-entry alias table until 12 Nov 2026**, when the advisor
   rebuilt the benchmark sheet with new YCharts ids and short names and the
   model text was aligned to match. Keep the failure in mind rather than the
   alias: **`security_name` is written FROM THE SHEET on every import**, so a
   rename there silently breaks the join for every book using that benchmark —
   and it breaks it by returning a DIFFERENT row rather than none, because
   superseded rows stay in the table until somebody deletes them. On the
   morning it happened, **16 of the 19 books were reading a frozen benchmark
   that could never refresh again**, and every page still rendered a number.

   **So verify, do not assume.** This query must return 19 rows with no null
   benchmark, and every `b.updated_at` should match the morning's import:

   ```sql
   select p.name, m.benchmark, b.security_id, b.updated_at
   from portfolio p
   join portfolio_model_map pm on pm.security_id = p.security_id
   join model_portfolio_data m on m.id = pm.model_portfolio_id
   left join model_portfolio_benchmarks b on b.security_name = m.benchmark
   where b.id is null or b.updated_at < now() - interval '2 days';
   ```

   Anything it returns is a book whose benchmark comparison is stale or
   missing: say so in that memo rather than quoting the figures.

   - **THIS IS THE LOOK-THROUGH BOOK, NOT THE TARGET VECTOR, and that is why
     it is worth reading.** `positions.allocation_pct` says what the model
     specifies; `portfolio.stock_net` says what the funds actually hold once
     you see through them. On Hybrid Balanced the target vector reads 66.00%
     equity and the look-through reads **67.8%** — because a high-yield fund
     in the bond sleeve holds equity. That gap is the kind of thing the sleeve
     labels can never show, and it is measured here rather than argued.
   - **Report DIFFERENCES, not levels.** "Technology 29.1% against a benchmark
     32.2%" is a finding; "technology 29.1%" is a number. A book on benchmark
     is as much a result as one off it.
   - **A difference is not automatically a defect.** The mandate is strategic
     allocation, so a deliberate tilt is allowed; what is not allowed is a
     tilt nobody chose. Say which you think it is, and on what evidence.
   - **`yield_to_maturity` LIVES HERE, on both sides.** It is the measure the
     bond sleeve's compensation question actually needs, and SEC yield is not
     a substitute: SEC yield measures 30-day net income, so a low-coupon fund
     trading at a discount reads far worse than it is. A macro run on 12 Nov
     2026 concluded from SEC yields that the sleeve was "barely paid" at about
     +10bp over a 2-year Treasury, and said yield-to-maturity was carried
     nowhere in the book. It was carried here all along: 5.59% against the
     benchmark's 5.86%, which is +86bp over that same Treasury. **Read YTM
     before making any claim about whether a bond sleeve is paid for its
     risk.**
   - **Not every row is populated.** 13 of 19 portfolios and 5 of 8 benchmarks
     carry a `yield_to_maturity`; the all-equity books carry none, correctly.
     A null is "not applicable here", not a gap to report.

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

   - **Match on the normalised `category_name`, EXCEPT that mid- and
     small-cap pool across styles.** Both sides are the same vendor column, so
     case and spacing are the only variation to allow for — **do not add
     hyphen or spelling variants**, which belong where two vocabularies meet (a
     fund's "Large Growth" against a benchmark's "US Large Cap Growth") and
     here would match sleeves Morningstar considers distinct.
     The one exception comes from the firm's own taxonomy, not from style
     judgement: `ASSET_CLASS_ROWS` gives large cap three rows — blend, growth,
     value — and mid and small ONE row each, so a Mid-Cap Blend holding
     competes with every mid-cap idea on the watchlist. It is a LIST of two
     sleeves, not "every unsplit sleeve": non-US developed is also one row and
     pooling it would offer TIBIX, a global allocation fund, against foreign
     large-blend index funds. The query above encodes this; do not widen it.
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

   **LOOK THROUGH THE FUNDS TO WHAT THEY ACTUALLY HOLD** (Nov 2026).
   `fund_holdings` carries each fund's top 25 names with weights, from the
   workbook's `Holdings` sheet. Until it existed the committee could see a
   fund's sector and credit PERCENTAGES and never a single position, so two
   funds holding the same twenty names read as diversification.

   ```sql
   -- THE DENOMINATOR FIRST. Read this before the list, every time.
   select p.security_id, p.allocation_pct,
          s.percent_of_assets_in_top_25_holdings as top25_share,
          s.number_of_holdings_generic as n_holdings,
          s.latest_holdings_date as holdings_as_of,
          s.index_fund_generic as is_index, s.fund_of_funds_generic as is_fof
   from positions p
   join securities2 s on s.security_id = p.security_id
   where p.portfolio_name = :portfolio and p.deleted_at is null
   order by p.allocation_pct desc;

   -- One fund's actual positions.
   select rank, holding_symbol, holding_name, weight, as_of
   from fund_holdings where security_id = :ticker order by rank;

   -- SINGLE-NAME LOOK-THROUGH ACROSS THE WHOLE BOOK. allocation_pct is in
   -- percent points and fund_holdings.weight is a decimal, so the product is
   -- percent points of the portfolio.
   select coalesce(fh.holding_symbol, fh.holding_name) as name,
          round(sum(p.allocation_pct * fh.weight)::numeric, 2) as pct_of_book,
          count(*) as in_funds,
          string_agg(p.security_id, ', ' order by p.security_id) as via
   from positions p
   join fund_holdings fh on fh.security_id = p.security_id
   where p.portfolio_name = :portfolio and p.deleted_at is null
   group by 1
   having count(*) > 1
   order by 2 desc
   limit 25;
   ```

   - **IT IS A FLOOR, NEVER A TOTAL, and you must say so wherever you quote a
     number from it.** Only the top 25 of each fund are known, so a name held
     at position 30 in one fund and 5 in another contributes from the second
     alone. "At least 2.1% of the book" is a true sentence; "2.1% of the book"
     is not, and an audit-defence memo cannot carry the second.
   - **`top25_share` decides whether the list describes the fund or a sliver
     of it.** Measured by holding COUNT the spread across this book is
     enormous — FTZIX holds 25 names and VBTLX holds 16,290 — but count is
     only a proxy and `percent_of_assets_in_top_25_holdings` is the real
     figure. Where it is high the list IS the fund and a name in it is worth
     arguing about; where it is low the list is the twenty-five largest
     positions in a long tail and says almost nothing about the fund's
     character. Quote the share alongside any claim drawn from the list.
   - **`holdings_as_of` is weeks behind the price columns on the same row**,
     because funds disclose holdings monthly or quarterly. Never present a
     holding as current, and never reconcile it against a return window it
     does not cover. Where the date is older than the period you are
     discussing, say which.
   - **A BOND FUND'S TOP 25 IS USUALLY NOT THE ARGUMENT.** It comes back as
     individual loan tranches and CUSIPs — `039956AA5`, `Polymer Group Inc
     28-JUN-2028 Term Loan B` — and twenty-five of a thousand such positions
     supports no conclusion about credit. The composition columns
     (`investment_grade_bond_allocation_generic`,
     `securitized_fixed_income_exposure_generic`, `average_credit_quality_score`)
     are the better read there and are what produced the DHRIX finding on
     9 Nov 2026. Use holdings on the bond side ONLY for CORPORATE or CREDIT issuer overlap
     between two funds. **Treasury and agency overlap is not a finding** —
     the 11 Nov run surfaced two Treasury CUSIPs held through both BIMIX and
     PYTRX and the risk manager dismissed it unprompted, correctly: two
     Treasury issues carry no issuer credit risk worth diversifying. Report
     it only if asked.
   - **An empty list is not a finding.** YCharts does not publish holdings for
     every fund and the sheet carries no row for one it cannot fetch. Report
     the absence only where the memo turns on a question the holdings would
     have answered.
   **DERIVE THE THEME, NEVER RECOGNISE IT** (Nov 2026). `holding_profiles`
   carries sector, industry, country and market cap for every holding symbol
   FMP can resolve — 396 of 402 on this book.

   ```sql
   -- industry concentration, computed
   select hp.industry,
          round(sum(p.allocation_pct * fh.weight)::numeric, 2) as pct_of_book,
          count(distinct fh.security_id) as via_funds
   from positions p
   join fund_holdings fh on fh.security_id = p.security_id
   join holding_profiles hp on hp.symbol = fh.holding_symbol
   where p.portfolio_name = :portfolio and p.deleted_at is null
     and hp.unresolved = false and hp.industry is not null
   group by 1 order by 2 desc limit 15;

   -- does a sleeve hold what its label says? (median size, and the tails)
   select p.security_id, s.category_name,
          round((percentile_cont(0.5) within group (order by hp.market_cap))::numeric/1e9,1) as median_bn,
          round(sum(case when hp.market_cap <  1e10 then fh.weight else 0 end)::numeric*100,1) as pct_under_10bn,
          round(sum(case when hp.market_cap >= 1e11 then fh.weight else 0 end)::numeric*100,1) as pct_over_100bn,
          round(s.percent_of_assets_in_top_25_holdings::numeric,2) as coverage
   from positions p
   join fund_holdings fh on fh.security_id = p.security_id
   join holding_profiles hp on hp.symbol = fh.holding_symbol
   join securities2 s on s.security_id = p.security_id
   where p.portfolio_name = :portfolio and p.deleted_at is null
     and hp.unresolved = false and hp.market_cap is not null
   group by 1,2,6 order by median_bn;
   ```

   - **THIS IS NOT OPTIONAL WHERE A THEME IS CLAIMED.** On 11 Nov 2026 a role
     agent assembled a "semiconductor cluster of 6.11% across 8 vehicles" by
     recognising six tickers. Derived, it is **8.27% across 11 funds and 39
     lines** — the book's largest thematic exposure, understated by a third
     with three funds missed, and nothing in the system could have caught it.
     If you name a theme, a sector or an issuer group, it comes from this
     table. Recognising tickers is how the number was wrong.
   - **MEDIAN MARKET CAP OF A TOP 25 IS BIASED UPWARD**, because the top 25
     are a fund's largest positions. Quote `coverage` beside it every time.
     Where coverage is ~100% the reading is sound — FTZIX at a 41.6bn median
     inside a Mid-Cap Blend label is a finding. Where coverage is ~50% it is
     suggestive only: OBSIX and NSMRX read 10.2bn and 12.3bn in a sleeve the
     model calls "us small 4", which agrees with NSMRX's own "Mid-Cap Funds"
     objective and Russell 2500 benchmark but is not settled by the data
     alone.
   - **`country` answers the sleeve question the prospectus string cannot.**
     EICOX's objective reads "Frontier Markets" while its holdings are TSMC
     and Samsung. Measure it rather than inferring from two names.
   - **`unresolved = true` means FMP has no record** — six symbols here, OTC
     and foreign-ordinary lines. Excluded from any total you quote, and say
     so rather than letting them read as zero.
   - **CUSIPs and cash lines carry NO profile by design.** A bond issue has
     none, and the bond sleeve is read on composition percentages.

   - **A CASH SWEEP VEHICLE IS NOT AN EXPOSURE.** Funds park cash in their
     own money-market vehicle and it surfaces in the top 25 like any other
     holding — "Fidelity Cash Central Fund" came back as 1.18% of Hybrid
     Balanced across two funds on 11 Nov 2026, and reporting that as a
     concentrated position would be a false finding of exactly the kind this
     report exists to avoid. The same goes for a fund-of-funds' underlying
     funds; `fund_of_funds_generic` names those.
   - **A STALE AS-OF IS ITSELF REPORTABLE where the memo leans on it.**
     Measured 11 Nov 2026, `latest_holdings_date` on this book spans **31 Mar
     to 9 Nov** — RSIYX at 225 days, and the HELD funds OBSIX and PGNPX at
     134, PGNPX with 91% of its assets in that top 25. DHRIX was 72 days
     stale when the committee analysed its credit on 9 Nov and nothing said
     so. Name the date whenever a holdings figure carries an argument.

   **TEST OVERLAP BEFORE RECOMMENDING A CONSOLIDATION.** "These two funds
   are in one sleeve and one should go" is a holdings question, and ranked
   metrics cannot answer it — two funds can rank identically and hold nothing
   in common, or rank differently and be the same book.

   ```sql
   select round(sum(least(x.weight, y.weight))::numeric * 100, 2) as overlap_pct,
          count(*) as common_names
   from fund_holdings x
   join fund_holdings y
     on upper(coalesce(y.holding_symbol, y.holding_name))
      = upper(coalesce(x.holding_symbol, x.holding_name))
   where x.security_id = :fund_a and y.security_id = :fund_b;
   ```

   - **It is a FLOOR, and its tightness is `percent_of_assets_in_top_25_holdings`
     on BOTH sides.** Where both are near 100% the answer is close to exact;
     where either is near 50% an overlap of zero means "none observed", not
     "none".
   - **The 11 Nov run shows both readings.** FTZIX and AVERX share **zero**
     names at 100% and 96% coverage — two Mid-Cap Blend funds that are
     genuinely different books, which no ranked metric would have shown. And
     **VOO against FLCSX overlaps by at least 35.6% on 11 common names** —
     27% of that book in two funds, the largest redundancy in it, and the
     committee held both without testing it.
   - **Overlap cuts both ways and must be reported both ways.** High overlap
     weakens the case for holding two; **low overlap weakens the case for
     consolidating them**, because the diversification being given up is
     real. Say which way it cut.

   **THE FOUR NEW FUND FLAGS, and what each one changes.** All on
   `securities2`, all from the same import:

   - **`index_fund_generic`** — read every scorecard row through it. "Trailed
     its benchmark by 40bp" is a finding against an active fund and is the
     expense ratio against a passive one; grading a tracker on alpha, or
     recommending a replacement for failing to generate it, is a category
     error the committee has had no way to avoid making.
   - **`open_to_new_investors_generic`** — **check it before recommending any
     alternative, and check it FIRST.** An idea that cannot be bought is not
     an alternative, and this book is built on institutional share classes,
     which are exactly the ones that close.
     - **THIS ALREADY HAPPENED.** Memo 2 (Hybrid Balanced, 10 Nov 2026)
       recommended replacing BOTH small-cap holdings with **VSMIX at 4.00%**
       and called it "the committee highest-confidence call" — two
       `replace` recommendations resting on one fund. `VSMIX` is
       `open_to_new_investors_generic = false` and is not held, so there is
       no existing position to add to and the whole call is unexecutable.
       The column did not exist when that memo was written; it does now, and
       there is no excuse for repeating it.
     - A flag is a reason to CHECK, not a fact to assert at the advisor. Say
       the vendor reports it closed and that the share class needs
       confirming, rather than declaring it shut.
   - **`waiver_expense_ratio_generic` / `waiver_expiration_date`** — where a
     waiver is set, `expense_ratio_generic` is NOT what the fund will charge
     after that date. A cost comparison between two funds where one is
     waived and the other is not is comparing a promotion against a price.
   - **`prospectus_objective` / `prospectus_benchmark_index`** — the fund's
     mandate and chosen benchmark in its own words. Where the prospectus
     benchmark disagrees with the category we grade it against, that is the
     clearest evidence the fund is filed in the wrong sleeve — which is the
     failure `ASSET_CLASS_OVERRIDES` patches one ticker at a time. Raise it;
     do not fix it.

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
     the sleeve. **Two funds in one sleeve are a candidate for consolidation
     only if their holdings say so** — the single-name look-through above is
     the evidence for that, and it is the one reading a sleeve table cannot
     give you.
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
   alternatives, the look-through rows with their `top25_share` and
   `holdings_as_of`, and the advisor's note if they left one. A role that cannot
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
