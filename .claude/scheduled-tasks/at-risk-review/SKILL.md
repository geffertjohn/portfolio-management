---
name: at-risk-review
description: Weekday committee pass over the At-Risk list for held stocks — flags newly deteriorated names, re-measures the ones already flagged, clears those that recovered, and alerts when a sell timer expires with a metric still red.
---

## Record this run (first and last thing you do)

This job runs while nobody is watching, and the app has no bridge to the
scheduler. A run that died on its first tool call and a run that worked
perfectly and found nothing to do leave the **same** trace in every table this
job writes — none. `job_runs` is the only place the two differ, and it only
differs if you write to it.

**Before any other work**, open the row (Supabase MCP `execute_sql`):

```sql
insert into job_runs (job_id) values ('at-risk-review') returning id;
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

You run the At-Risk list. It was a manual list until Oct 2026; the committee now raises, re-measures and clears every entry, and the advisor's only job is to answer a breach. Recommend-only: **never sell, never write to `positions` or `portfolio_allocations`, never stage a trade.** Flagging a name is a monitoring act, not a disposal.

This runs in a fresh session in the Portfolio Management project directory. Supabase MCP project_id: oulahvazpuzfqxudmfef. FMP tools load via ToolSearch. Class tickers use the FMP hyphen form (BRK.B -> BRK-B).

## Unattended-run rules (read first)

Nobody is at the keyboard. **Any tool call that asks for approval stalls the run forever — and while it is stalled the scheduler starts no new run of this task.**

- **Do not use Bash, or any shell command, at all.** Everything here is Supabase MCP `execute_sql` plus the FMP MCP tools.
- Do date arithmetic in SQL (`select current_date`), never by shelling out.
- **Warm the connectors with ONE call before any batch.** A catch-up run seconds after the machine wakes hits a cold transport, and a burst of parallel calls then fails *every* one rather than one. Make the first FMP call alone and wait for it. After that, issue the FMP calls yourself in small batches — several tool calls in one message is fine.
- **The run is over only when the rows are written and the digest is printed.** Delegating the measuring to subagents is fine — the first run split 54 names across six of them and every one came back clean. What matters is that you stay with it: collect what they return, grade it, write the rows, print the digest. Nobody is here to ask you to continue.
- If a tool errors twice, stop and write the digest saying what failed. If several calls fail at once, retry ONE alone first — that distinguishes a dead connector from a cold one.

## What counts as red — do not restate this rule, apply it

A metric is graded against **two comparators**:

- **green** — beats BOTH
- **yellow** — beats one
- **red** — beats NEITHER

**Yellow is not failing.** A metric only keeps a position on the list while it is red. This is deliberate: beating both a benchmark and a peer is a high bar to clear under pressure, and a flag nobody can escape stops being information.

"Beats" means `>=` for all six metrics (higher is better for every one).

The app's copy of this rule is `scorecardColor()` in `client/src/lib/scorecardColor.ts`, and the metric definitions are `STOCK_AT_RISK_METRICS` in `client/src/lib/atRisk.ts`. **Read both before your first run.** You write the readings; the app computes the colour from them, so the two can never disagree — never write a colour into the row yourself.

## The six metrics, and what each is graded against

The two bases differ, and the difference is the whole reason the row stores numbers rather than verdicts.

| Metric | Value | Comparators |
|---|---|---|
| `operating_margin_ttm` | `ratios-ttm` -> `operatingProfitMarginTTM` | the security's own **prior two fiscal years** |
| `fcf_margin_ttm` | `freeCashFlow / revenue` (TTM) | its own **prior two fiscal years** |
| `revenue_growth_ttm` | income-statement-ttm `row[0].revenue / row[4].revenue - 1` | `sales_growth_1_yr_generic` on both benchmarks |
| `eps_growth_ttm` | same rows, `epsDiluted` | `eps_growth_1_yr_generic` |
| `revenue_growth_3y` | annual CAGR, latest FY vs FY three prior | `sales_growth_3_yr_generic` |
| `eps_growth_3y` | annual CAGR, `epsDiluted` | `eps_growth_3_yr_generic` |

- **Use diluted EPS** (`epsDiluted ?? epsdiluted`), never basic.
- **Suppress a growth figure whose base is <= 0** — write `null`. A ratio across a negative base is meaningless, and a null metric is simply not graded.
- Benchmarks resolve from the security's own preference, not a default:

```sql
select s.security_id,
       cb.sales_growth_1_yr_generic b1_sales_1y, cb.eps_growth_1_yr_generic b1_eps_1y,
       cb.sales_growth_3_yr_generic b1_sales_3y, cb.eps_growth_3_yr_generic b1_eps_3y,
       sb.sales_growth_1_yr_generic b2_sales_1y, sb.eps_growth_1_yr_generic b2_eps_1y,
       sb.sales_growth_3_yr_generic b2_sales_3y, sb.eps_growth_3_yr_generic b2_eps_3y
from securities2 s
left join category_benchmarks cb on cb.id = s.preferred_benchmark1_id
left join sector_benchmarks  sb on sb.id = s.preferred_benchmark2_id
where s.security_id = 'TICKER';
```

**FMP's annual `operatingIncome` disagrees with the filing on roughly one name in three**, and `operatingProfitMargin` derives from it. Use it anyway — the Scorecard is deliberately single-source FMP so that TTM and the prior years are comparable. Do not substitute an SEC figure for one side of a comparison.

## Margin comparators are FROZEN at flag time

An operating-margin card is graded against the security's **own prior two fiscal years**, so its bar moves on its own: roll a weak year into the window and the metric goes green having improved nothing.

So when you flag a name, record the two prior-year figures in `flaggedBenchmark` / `flaggedBenchmark2`, and **every later re-measurement of a margin metric is graded against those same two numbers**. The question the timer asks is "has this improved since we flagged it", and that is only answerable against a fixed bar.

**Growth metrics are the opposite** — their comparators are external benchmarks that move for reasons that have nothing to do with us. Re-measure those against the **live** benchmark figures each time, and write the current pair into `currentBenchmark` / `currentBenchmark2`.

## Steps

1. **CANDIDATES.** Held stocks, and the live at-risk entries:

   ```sql
   select s.security_id, s.preferred_benchmark1_id, s.preferred_benchmark2_id,
          a.id at_risk_id, a.date_added, a.removal_date, a.metrics_detail,
          a.breach_alerted_at, a.source
   from securities2 s
   left join at_risk a
          on a.security_id = s.security_id and a.removed_at is null
   where s.security_id in (select distinct security_id from positions where deleted_at is null)
     and s.security_id <> '$Cash'
     and coalesce(s.detailed_security_type,'') !~* '(etf|mutual|open-end|open end|closed-end)'
     and coalesce(s.peer_group_name,'') = '' and coalesce(s.fund_company_name,'') = ''
     and coalesce(s.fund_family,'') = '' and s.expense_ratio_generic is null
   order by (a.id is null), s.security_id;
   ```

   **Stocks only.** Funds and ETFs reach this list through the fund review modal and are not yours to touch.

2. **MEASURE** all six metrics for every candidate. One FMP call per distinct endpoint per symbol — `ratios-ttm`, `cash-flow-statement-ttm`, `income-statement-ttm`, and annual income statements (limit 4) — and derive all six from those rows. Four calls per name, not seven.

   Fifty-odd names is a lot of calls. Batching them across a few subagents works well and is what the first run did; so does calling them yourself a handful of symbols at a time. Either way, keep going until every candidate is measured — a long run is expected and fine.

3. **RE-MEASURE the names already flagged.** For each entry, update every object in `metrics_detail` with `currentValue`, `currentBenchmark`, `currentBenchmark2` (live pair for growth; **copy the frozen pair** for margins) and `measuredAt`, then set `last_reviewed_at = now()`.

   Grade each one by the rule above.

   - **Every flagged metric now green or yellow** -> clear the entry:

     ```sql
     update at_risk
     set removed_at = now(),
         removed_by = 'committee',
         removal_reason = 'All flagged metrics recovered: <metric> <flagged> -> <current> (<colour>), …'
     where id = <id>;
     ```

     Name each metric with the figure it was flagged at and the figure now. "Recovered" with no numbers is not a record.

   - **Any metric still red, and `removal_date` has passed, and `breach_alerted_at` is null** -> the sell timer has been breached. Raise the alert and stamp the guard **in that order**, so a failure cannot leave a silent entry:

     ```sql
     insert into alert_events (security_id, source, metric_field, message, at_risk_id, triggered_at)
     values ('TICKER', 'at_risk', 'at_risk_sell_timer',
             $m$Sell timer expired <n> days ago with <k> metric(s) still red: <metric> at <current> against <comparators>. Flagged <date> with <j> red.$m$,
             <at_risk_id>, now());

     update at_risk set breach_alerted_at = now() where id = <at_risk_id>;
     ```

     A partial unique index allows one unacknowledged breach alert per entry, so a duplicate insert fails loudly rather than piling up. **Do not remove the entry** — a breach is the advisor's decision to make, and the position stays flagged until they make it.

   - **Still red, timer not yet expired** -> leave it. Say so in the digest with the days remaining.

4. **FLAG the newly deteriorated.** A held stock goes on the list when it has **3 or more red metrics AND at least one of those reds is a MARGIN metric** (`operating_margin_ttm` or `fcf_margin_ttm`). Both conditions, every time. It must also have no live entry.

   > **Why a margin red is required, and not just a count.** The four growth metrics are graded against the category and sector benchmarks, so they go red whenever the company grows more slowly than its market — routine for a large steady compounder, and no evidence at all that anything is deteriorating. The two margin metrics are graded against the security's OWN prior two fiscal years, so a red there means the business got worse than it was. Counting alone cannot tell those apart.
   >
   > Measured on the 29 Oct 2026 book this is the difference between 16 names and 13. The three it excludes — AAPL, MSI and UBER — were each 3–4 reds of pure growth-vs-benchmark with both margins healthy. The ones it keeps all show own-history deterioration: MSFT's FCF margin fell 25.4% → 20.2% → 17.3%, which is exactly what the list is for.
   >
   > The count and the margin gate are separate dials. Raising the count to 4 trims the tail; dropping the margin requirement re-admits names that are merely growing slower than their benchmark.

   ```sql
   insert into at_risk (security_id, source, metrics, metrics_detail, notes, removal_date)
   values ('TICKER', 'committee',
           array['Operating Margin TTM','…'],
           $j$[{"key":"operating_margin_ttm","label":"Operating Margin TTM","basis":"prior_years","higherIsBetter":true,
                "flaggedValue":0.21,"flaggedBenchmark":0.24,"flaggedBenchmark2":0.26,
                "currentValue":0.21,"currentBenchmark":0.24,"currentBenchmark2":0.26,
                "measuredAt":"2026-10-29"}]$j$::jsonb,
           $n$<why, in a sentence a reader can follow without this prompt open>$n$,
           now() + interval '<days> days');
   ```

   - `metrics` carries the labels of the **red** metrics only; `metrics_detail` carries those same metrics as objects. They must agree.
   - Set `currentValue`/`currentBenchmark*` equal to the flagged values on insert, so the entry grades correctly before its first re-measurement.
   - **The sell timer is counted in EARNINGS REPORTS, not days**, because the six metrics are TTM figures that only move when the company reports. A timer shorter than one earnings cycle cannot be satisfied — nothing the business does can change the readings before it expires. On the first run that was not hypothetical: VZ, MSFT, TSLA and PG were each given 30 days while reporting in 84 to 92.

     **5+ red -> 1 report, 3-4 red -> 2 reports, 1-2 red -> 4 reports.** Compute the date as `securities2.next_earnings_release + (reports - 1) x 91 days + 14 days`, the last being the lag before FMP posts the statements the metrics come from. Only the next date is known, so later ones are projected a quarter apart; the estimate is deliberately generous, since a flag lingering a fortnight costs less than a timer expiring before the evidence exists.

     ```sql
     select security_id, next_earnings_release::date from securities2 where security_id = 'TICKER';
     ```

     If `next_earnings_release` is null or already past, fall back to the day table — 5+ -> 90 days, 3-4 -> 180, 1-2 -> 365 — and say in the digest that the name had no usable earnings date.

   - **Set once and never recalculated.** Recalculating later would let a name that improved from 3 reds to 2 push its own deadline from 2 reports out to 4.

5. **DIGEST.** Per section: **flagged** (ticker, which metrics went red with figures, the timer in days), **recovered and cleared** (ticker, metric, flagged figure -> current figure), **breached** (ticker, days overdue, which metrics are still red — **lead with these**), and **still monitored** (ticker, reds remaining, days left). Name anything you could not measure and why.

## Guardrails

Recommend-only. Never write to `positions` or `portfolio_allocations`, never place or stage a trade, never touch the watchlist (`prospects`), and never write to `security_theses` or `research_reports`. Do not remove an entry whose timer has breached — raising the alert is the whole of your job there. Do not touch fund or ETF entries.
