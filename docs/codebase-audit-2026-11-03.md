# Portfolio Management — Codebase Review, 3 Nov 2026

> **How to read this:** paths are relative to the repo root, so links resolve when
> opened from inside the repo. Tick the `[ ]` boxes for what you want done and
> hand it back — nothing here has been changed except where a line says
> **ALREADY DONE**.

**Method.** Four parallel sweeps (lib · components/pages/hooks · scripts+`.claude` ·
docs) plus a database and tooling pass done directly. Every high-impact claim below
was **re-verified independently** before it was written down; where a sweep's claim
did not survive that check, it was dropped or corrected, and where a finding is real
but has never actually fired, it says so. Two of my own false positives were caught
this way and are recorded in "Checked and clean" so nobody re-derives them.

**The meta-finding, which outranks any single item.** `docs/codebase-audit-2026-09-10.md`
is a 52-defect audit of this same tree from eight weeks ago. **At least eight of its
findings are still open**, including one doc error it diagnosed *and prescribed the
exact fix for* (§3 below). Audits are being produced faster than they are burned down.
Whatever you pick from this list, picking *few and finishing them* beats triaging all
of it.

---

## P0 — Running system, recurring daily

### 1. Every committee job runs twice a day — two schedulers are live `[x] DONE 3 Nov`

> **Resolved.** All six enabled app-scheduler tasks were disabled; launchd is now the
> single scheduler. Verified after the change: all 8 app tasks `enabled: false` with no
> `nextRunAt`, and all 7 launchd agents still loaded at 09:00 / 09:30 / 09:45 / 10:00 /
> 10:20 / 07:15 / 07:40 — so the jobs run once, not zero times. The README and
> CLAUDE.md claims that these were "disabled, not deleted" are now true; no doc change
> needed, the drift was in reality rather than in the text.

`scripts/scheduled-jobs/README.md:92` and CLAUDE.md:770 both state the app-scheduler
tasks were disabled when the jobs moved to launchd. **They were not.** Six of seven
are `enabled: true`; only `weekly-risk-report` is off.

Verified three independent ways:

| | launchd | app scheduler |
|---|---|---|
| at-risk-review | 09:00 | 09:09 |
| post-earnings-brief | 09:30 | 09:31 |
| pre-earnings-brief | 09:45 | 09:33 |
| earnings-call-summary | 10:00 | 09:43 |
| watchlist-research | 10:20 | 10:06 |

`job_runs` carries both rows for every job on 3 Nov and 2 Nov. The app scheduler's
`lastRunAt` values match the second column exactly.

**It has already corrupted data.** On 2 Nov the pre-earnings job ran at 09:39 and
09:45; the duplicate ELF/APP/DUK briefs were written 09:45–09:47 and 09:51–09:54 —
one set per run. Those were deleted earlier today as "the dedupe guard slipping".
That diagnosis was wrong: it was two schedulers.

Cost: double FMP/Supabase/token spend every weekday, duplicate briefs, and two
`job_runs` rows per job so the health panel reports whichever finished last.

**Fix:** disable the six app-scheduler tasks. One call each. *Recurs at 09:00 tomorrow.*

### 2. The two schedulers run different prompts `[x] DONE 3 Nov — by §1`

Diffed all seven. Five identical, `watchlist-research` off by a trailing newline, and
**`post-earnings-brief` differs by 43 lines**: the app-scheduler copy has *zero*
occurrences of the AGED-OUT CHECK merged this morning in #59, and still says "STOP"
without the heartbeat fix. Half of tomorrow's post-earnings runs would execute the
pre-#59 prompt.

**Fix:** subsumed by §1. If you keep both schedulers for any reason, `node
scripts/scheduled-tasks/sync.mjs` is the repair.

---

## P1 — Silently wrong, or audit-record integrity

### 3. The model editor writes bands with the rounding the lib was fixed to abandon `[x] DONE 3 Nov`

> **Resolved** in PR #65. The form now imports `driftBandFor`. The one collapsed band
> this had already produced — model 1 `us_small_cap` 1/1/1 — was repaired to 0.75/1.25
> by a guarded one-row UPDATE; a re-scan shows 0 collapsed bands across all models.
> **Correction to the original finding:** neither portfolio on model 1 holds any US
> small-cap position, so the collapsed band was not producing a live false breach — it
> would only have bitten once a holding sat near 1%. The harm was latent, not active.

`lib/positionBands.ts` has `roundBand` with collapse-safe stepping, documented against
a real past failure: *"±20% of a 1.0% target is 0.8–1.2, and both edges round to 1.0,
so the band is zero-width and any deviation at all — 0.99% — reads as a breach. That
bit the 50/50 blended portfolio."*

`pages/settings/ModelPortfolioModal.tsx:13` defines its own flat `roundHalf` and
**does not import the lib at all**. Its output is written to `model_portfolio_data`
and becomes the stored authority that `computeAllocationBands` then reads.

So the lib's fix cannot reach the data. This is the live mechanism under gotcha 25,
and Equity Income & Core Growth — half-scale targets, where the rounding step exceeds
the drift — is exactly the book it bites.

**Fix:** import `driftBandFor`. Highest-value single change in this report.

### 4. A fund review started from the Review Calendar is written through the stock path `[x] DONE 3 Nov`

`pages/ReviewCalendarPage.tsx:194` opens `MarkReviewedModal` without `isFund` or
`security`; both are optional and default undefined. `SecurityDetailPage` passes both.
So from the calendar: no evidence PDF is built or uploaded, `evidence_doc_path` is
null, `outcome` is null, and a `recommendation` funds are documented never to carry
is written instead.

**It has never fired.** All 15 existing fund reviews carry `outcome='no_issues'`, a
PDF, and no recommendation — every one went through the detail page. This is a loaded
trap, not a past corruption. It was also filed in the September audit (§3.1) and is
still open.

**Fix:** for fund rows, navigate to the security page instead of opening a
half-configured modal, and add `if (isFund && !security) throw` so it cannot recur
silently.

**Done (PR #67) — but NOT by navigating away.** 42 of the 94 schedule rows are
funds or ETFs, so sending them to the security page would have taken the
review-completion workflow off the page whose job it is for nearly half its
contents. The calendar now **loads the record on demand** (`fetchSecurityById`,
keyed `QUERY_KEYS.security(id)` so it shares the detail page's cache) and opens
the real fund modal, evidence PDF and all.

The guard is structural rather than a throw: `isFund` and `security` were two
props encoding one fact, and they could disagree — so they are now **one required
prop, `fundSecurity: SecurityDetail | null`**. A caller cannot omit it and inherit
the stock branch by default, and a fund cannot be reviewed without the record its
PDF is built from. `uploadFundEvidence`'s `if (!isFund || !security) return null`
— the line that silently skipped the PDF — is now unreachable by construction.
The classifier still decides, at the call site.

Verified in the running app, all four combinations: calendar/fund now shows
Outcome + the scorecard evidence block (it showed Recommendation before),
calendar/stock and both detail-page paths unchanged, no console errors.

### 5. The benchmark picker writes nothing `[x] DONE 3 Nov`

`components/StockReturnTable.tsx:147` guards `saveSecurityBenchmarks` on
`if (security.id)`, and its only renderer is `ResearchPage`, which builds a synthetic
security with `id: 0`. So the write never fires, the `benchmark-changed` event never
dispatches, and `StockScorecardPanels`' listener is permanently dead. The rejection is
swallowed in `.catch(() => {})`.

`preferred_benchmark1_id`/`2_id` are the comparators for all six scorecard cards, the
Alternatives tables, `ReturnRanksTable`, **and the at-risk committee's grading**. They
can now only be changed in the database.

**Fix:** give the picker a real `security.id` on the detail page and invalidate
`QUERY_KEYS.security(id)`, or make it visibly session-only. Stop swallowing the catch.

**Done (PR #71) — but not by patching the id, because the premise was wrong in
two ways.** `StockReturnTable` is NOT dead code: `ResearchPage` is reachable
from the top-level Research nav link and from Watchlist cards. And on that page
`if (security.id)` is not a bug — the page states "nothing is saved" and the
synthetic `id: 0` is what implements it.

The actual defect is a dated regression. `git log -S` pins it to **`77f89ef`,
14 Oct 2026** ("the stock Overview tab is the thesis"), which removed
`StockReturnTable` from `SecurityDetailPage` — its only host with a real id. The
picker did not break; its home was deleted, and the one surviving renderer is
the place where persisting would be wrong. So the control now lives in
`StockScorecardPanels`, above the cards these benchmarks actually grade.

**Severity, corrected:** current grading is NOT broken. 55 of 56 stocks carry
both benchmarks and the 56th is `$Cash`, so real-stock coverage is 100% — they
were set while the old picker worked. The damage is **latent and lands on the
next stock added**: `createSecurityBySymbol` writes no benchmarks, and with both
null all six cards fall back to `neutral={0}`, so the four growth cards read
green for any positive growth and the committee could only ever flag that name
on its two margin cards.

**The dead listener is fixed by separating two decisions that were conflated.**
Persisting and announcing both sat behind the same guard. The announcement now
always fires (so the Research page's two panels agree), while the write stays
guarded. The event is declared once in `lib/benchmarkSelection.ts` rather than
inline at both ends — being inline in both is how nothing noticed. The catch no
longer swallows.

**Verified live:** the control renders on Monitor with AAPL's real comparators
("Russell 1000 Growth · Technology") and opens the picker; on `/research/AAPL`
it reads "this session only — nothing is saved here", and selecting a benchmark
in Total Performance now updates the scorecard row — the listener firing for the
first time. AAPL's stored row was unchanged throughout. The save path itself was
not executed against the live book, for the same reason as §9.

### 6. A stock's review history is recorded but rendered nowhere `[x] DONE 4 Nov`

`ReviewLogSection` has exactly one render site, inside the `isFundOrEtfSecurity` block
at `SecurityDetailPage.tsx:481`. No stock tab shows it. Meanwhile the header still
shows "Review Overdue" for stocks — the page asserts a review is late while offering
no way to see when it is due or what the last one concluded.

This is the audit-defence record: recommendation, conviction, required rationale,
`price_at_review`, frozen `metrics_snapshot`. CLAUDE.md says these blocks "live on
Monitor". They do not.

**Fix:** render Review Schedule + `ReviewLogSection` on the stock Monitor tab.

**Done (PR #72), and extended.** The Review block (schedule + history) now
renders on the stock Monitor tab, so the record the header complains about is
visible. On top of that, a stock review now writes a **PDF** to
`Security Documents/<ticker>` like the fund one — the decision, the evidence it
was taken against, and **that quarter's brief as its second half**, one file,
reachable from the Commentary tab.

The brief is embedded via `drawQuarterlyBrief`, extracted from
`buildQuarterlyBriefPdf` so there is one renderer rather than two. The document
is marked INTERNAL on every page: the brief alone is client-safe, the review
half is not. A quarter with no brief still produces a document that says so.

`review_log.source_report_id` records which brief a review was drafted from —
that link was a sentence in the rationale, so the quarter had to be inferred
from the review date, which is wrong whenever a review is recorded late.

All **25** existing stock reviews were backfilled, every one with a brief, each
stamped "Rebuilt from the recorded review on 4 Nov 2026" so a reconstruction
cannot be mistaken for a contemporaneous freeze.

**Found on the way:** `review_log` had **no UPDATE policy** — insert, read and
delete only — so updates were silently dropped, PostgREST reporting success with
zero rows affected. The first backfill run uploaded all 25 PDFs and recorded
none of them, with no error. It was not append-only (DELETE was already open),
just un-correctable; it is now consistent with every other table.

### 7. The committee's write path has no schema-aware layer `[x] DONE 4 Nov`

`insertResearchReport`, `insertRiskReport`, `insertIcMemo` and their soft-delete
counterparts are all dead — one reference each, their own definition. The committee
writes via raw MCP SQL, so a wrong column or enum token in a prompt lands in the table
and `tsc` never sees it.

**Fix:** either delete them and document that MCP SQL is the write path, or route the
jobs through a small script so the generated-types check actually guards committee writes.

**Done (PR #74) — but neither of those two options was available.** Routing the
jobs through a script is impossible: they run under launchd with a tool
allowlist that **deliberately excludes `Bash`**, because an approval prompt
would stall an unattended run forever. Their only write channel is Supabase SQL,
so whatever guards these writes has to live where they can reach it.

So the guard is **in the database**: `committee_insert(table, payload)` and
`committee_update(table, id, payload)`, plus `job_run_open` / `job_run_close`
for the heartbeat every job opens and closes. All **14 raw writes across the
seven prompts are gone** — none carries a column list any more.

The functions carry no column list either; they derive it from the catalog at
call time, so a schema change is absorbed rather than propagated. An unknown key
**raises** instead of being silently dropped by `jsonb_populate_record`, which is
how a prompt naming a removed column would keep "succeeding". And a write that
matches no row raises — the `review_log` failure from §6, where RLS returned
zero rows and PostgREST reported success.

The dead TypeScript writers **are** deleted, as the first option suggested, but
for a better-stated reason: the app is read-only on these tables and a
TypeScript writer could never be the jobs' path, so they were a guard over
nothing.

Verified against the live database: seven guard cases each raise with a specific
message (unknown column, generated column, table not on the allowlist, no-op
update, bad status token, empty payload, non-object payload), and the happy
paths round-trip — defaults applied, jsonb preserved, unlisted columns left
null. `schemaContract.test.ts` locks the function set, the allowlist and
SECURITY INVOKER; the DEFINER guard was mutation-tested.

**Caught on the way:** `run-job.sh` greps each prompt for a heartbeat, but it
grepped the *table name*, which the prompts also mention in prose — so it was
passing on prose, and after this change the opening statement no longer contains
the table name at all. It now greps `job_run_open`, the call itself.

### 8. The committee's recommend-only guarantee is not technically enforced `[x] DONE 4 Nov`

`docs/ai-investment-team-charter.md:62` states: *"Tool scoping enforces the guardrails:
analysts get read-only research tools; PM/Risk get Supabase read; none get write access
to `positions`."*

**No agent file scopes its tools.** All eight carry frontmatter of only `name:` and
`description:`; there is no `tools:` key anywhere in `.claude/agents/`. Each inherits
the full toolset including Write/Edit/Bash and the Supabase MCP's `execute_sql` and
`apply_migration`. CLAUDE.md:658 repeats it as "hard recommend-only guardrails".

Nothing has gone wrong — the prompts are clear and the agents have behaved. But the
constraint is prompt-level, and the document describing your audit-defence posture
says otherwise.

**Fix:** add `tools:` frontmatter to each agent (preferred), or correct both lines.

**Done — BOTH, because neither alone makes the document true.**

`disallowedTools` rather than `tools:`, deliberately: the analysts load the FMP
and TipRanks surfaces through ToolSearch, and a positive allowlist would have to
enumerate dozens of MCP tool names and would silently cut off any new one. A
deny-list of built-in names binds in every environment regardless of how the
connectors are named. All eight agents now carry
`disallowedTools: Write, Edit, NotebookEdit, Bash`; `research-analyst`,
`devils-advocate` and `macro-strategist` also deny `mcp__claude_ai_Supabase`,
which their own definitions say they do not use.

Two things found while doing it, both of which change the finding:

- **The scheduled jobs were never the exposed path.** `run-job.sh` already
  launches `claude -p` with an `--allowedTools` list that excludes Bash and
  Write/Edit and admits only three MCP servers, with a comment explaining why.
  Subagents inherit the session's tools, so the jobs were always tighter than
  the document claimed and the real gap was the **interactive** Agent path.
- **The residue cannot be closed by tool scoping, and the charter now says so.**
  `execute_sql` reads and writes through one tool, so the five roles that must
  read the book keep it. The sanctioned write path (`committee_insert` /
  `committee_update`) allowlists six tables and excludes `positions` and
  `portfolio_allocations` — but raw SQL bypasses it, and the connector
  authenticates as **`postgres`, which bypasses RLS**, so no grant or policy can
  stop it either. Closing it properly means a dedicated restricted role for the
  committee's Supabase connection: a credentials change, not a code change, and
  **not done here.**

Also newly documented: `.claude/workflows/new-buy-ic-review.js` inlines its roles
as prompt strings, so `disallowedTools` does not reach the workflow path at all.

### 9. A grid edit leaves the Change Log and Positions stale — in cache *and* in the DB `[x] DONE 3 Nov`

`AllocationHistoryPanel.tsx:23` invalidates `allocationGrid` and a dead key, but not
`allocationChanges` or `positions`. The Change Log's own docstring says it is derived
"so it cannot disagree with the History grid" — with the cache unbusted, the two
sibling sub-tabs disagree for the rest of the session.

Worse: `upsertAllocation` / `addSnapshotDate` / `deleteSnapshotDate` never call
`syncPositionsFromLatestSnapshot` — only `applyAllocationImport` does. So editing the
newest column by hand changes history and leaves `positions` genuinely stale in the
database. "One allocation file drives History, Positions and the Change Log" is true
of the import path only; the manual path is the hole.

**Fix:** add both keys to `invalidate()`, and decide whether a grid edit on the newest
date should re-sync positions.

**Done (PR #69).** Cache: `allocationChanges` and `positions` added;
`portfolioPeriodReturns` removed, since it is a dead key with no reader left
anywhere after the performance engine was deleted in Sep 2026.

**On the second half the answer is "yes, but targeted" — a wholesale re-sync
would be destructive, and the live data says so.** Querying all 19 portfolios
before writing any code: **Equity Income & Core Growth** would lose **25 of its
80 position rows** (it is a derived blend — positions computed from its two
parents, so its own history is not the authority), and **ETF Conservative**
would be re-pointed to a snapshot sixteen months older than its positions,
deleting 7 rows, adding 5 and changing 3 weights — quietly reverting a live book
to a 2025 lineup. So `syncPositionForGridEdit` writes **one holding, on the
newest column only**, mirroring exactly the edit made. Adding or deleting a date
writes nothing.

The gap that leaves is **reported rather than resolved**: `lib/positionsDrift.ts`
drives an amber banner naming what differs and which tickers, with derived blends
exempt. Both divergences above are now visible on the History sub-tab; neither
was before.

**Verified live for the read half** — ETF Conservative's banner matches the SQL
exactly (5 missing, 7 extra, 3 reweighted, tickers named), Foundation
Conservative shows none, EI&CG is exempt, no console errors. **The write half
was NOT executed against the live book**: doing so means mutating real target
allocations, the sandbox blocked it, and that is the right call to leave to the
advisor. It is typechecked and reviewed, and the two rules most likely to be
wrong — which column counts, and what counts as drift — are pure and unit-tested
(15 new tests, 162 total).

### 10. `next_review_at` renders a day early on the security page — gotcha 24, recurred `[x] DONE 4 Nov`

`SecurityDetailPage.tsx:504` normalises through `reviewDueDay()` for the *colour*, then
`:505` renders the *value* from the raw timestamp in local time. A row holding
`2027-02-11T00:00:00Z` shows **Feb 11** on `/reviews` and **Feb 10** on the security
page. Exactly the failure gotcha 24 records for `at_risk.removal_date`.

**Fix:** `fmtUtcLongDate(...)`. (Currently renders only for funds — fix with §6.)

**Done.** The fund branch now renders `formatDate(reviewDueDay(next_review_at))`,
the same expression the stock Monitor block added in §6 already used — which is
precisely why the two disagreed. `last_reviewed_at` moved to the same helper for
consistency; it is a true instant, so it keeps local formatting.

### 11. Two money formatters print sub-million figures as `$0.xxM` `[x] DONE 4 Nov`

`lib/formatters.ts:56` exports `fmtUsdCompact`; **no component imports it**.
`FinancialsSection.tsx:73` and `RevenueSegmentsPanel.tsx:17` each reimplement it, and
in both the last two branches are byte-identical — so a $400k segment renders
**"$0.40M"**, and neither has the trillion tier, so $3.2T prints "$3200.00B".

**Fix:** replace both with `fmtUsdCompact`.

**Done (PR #75).** Both replaced. `FinancialsSection` keeps a one-line
`fmtFinancial` that routes EPS to `fmtUsd` and everything else to
`fmtUsdCompact`; `RevenueSegmentsPanel`'s local copy is gone entirely. The chart
axis passes `decimals: 1`, because a tick is read at a glance and "$150.0B" says
what "$150.00B" says in less space — the table and tooltip keep the default two.

**A trap worth recording:** `FinancialsSection` also had a local `fmtSignedPct`,
and it must NOT be swapped for the lib one — the lib helper takes a DECIMAL
(0.0123 → "+1.23%") because that is how the database stores a percentage, while
`surprisePct` and `priceReactionPct` here are already percent points. It is
renamed `fmtPercentPoints` with that difference stated, since the next reader
would otherwise make exactly the swap this item invites.

### 12. `consensusColor` renders the same label in two different shades `[x] DONE 4 Nov`

CLAUDE.md records this as "a pre-existing divergence, not a pattern to copy". The two
implementations give genuinely different answers: the lib returns `text-green-600` for
a plain "Buy" (reserving `-700` for "Strong Buy"); `TipRanksPanel.tsx:74` returns
`-700` for *any* label containing "Buy", and `amber-600` where the lib returns
`yellow-600`.

**Fix:** import the lib one; it handles every label the local copy does.

**Done (PR #75).** Every difference favoured the lib, which distinguishes
strength where the local copy flattened it: "Moderate Buy" now reads
`green-600` rather than the `green-700` reserved for "Strong Buy", "Strong Sell"
gets `red-700` rather than a plain `red-600`, and Hold is `yellow-600` rather
than `amber-600`. Verified live — AAPL's consensus renders `text-yellow-600`.

**Both are now guarded** by `sharedHelpers.test.ts`, which fails if any file
outside `lib/formatters.ts` defines a `consensusColor` or divides by a billion
and fixes the decimals. Mutation-tested: reintroducing either copy trips it.

### 13. `pre_earnings` has no unique index — the dedupe is a prompt instruction `[x] DONE 3 Nov`

`post_earnings` is protected by `research_reports_one_post_per_parent`. `pre_earnings`
is protected only by a 7-day window described in prose, which two schedulers firing six
minutes apart both pass before either writes. Six duplicate groups exist today; TJX
carries three briefs for one quarter.

**Fix:** dedupe on `(security_id, report_type, fiscal_year, quarter)` and add the
matching partial unique index. Do this *even after* §1 — the guard should not depend
on there being one scheduler.

**Done (PR #66).** `research_reports_one_pre_per_period` on `(security_id, fiscal_year,
quarter)`, partial on `report_type = 'pre_earnings' and deleted_at is null` (and on both
period columns being non-null, since standing research carries neither). Excluding
soft-deleted rows is deliberate: a deleted duplicate must not block a legitimate rewrite
of that quarter later. The prompt now resolves the fiscal period *before* deduping, keys
on it, and treats a unique violation as "already briefed — skip" rather than an error to
retry.

Seven legacy duplicates blocked the index. All thirteen rows in the six affected groups
were checked first: none had a post-earnings child, none was cited by any thesis's
`source_report_ids`, and all predated the two-section brief shape. The richest of each
group was kept and the other seven soft-deleted — reversible with one `update`. Zero
duplicate groups remain against 59 live pre-briefs.

### 14. Three job-prompt defects `[x] DONE 3 Nov`

- **`weekly-risk-report:42`** tells the agent to read `positions.target_weight`. **That
  column does not exist** — it is `allocation_pct`.
- **Three prompts treat `positions` as hard-deleted**, missing `where deleted_at is
  null` (`pre-earnings-brief:61`, `post-earnings-brief:203`, `weekly-risk-report:42`).
  `at-risk-review` and `earnings-call-summary` both filter correctly, so this is
  inconsistency, not convention. There are 25 soft-deleted rows; the post-earnings path
  would emit a recommendation naming a book that sold out.
- **All three TipRanks prompts name `tipranks-pit-by-symbol`** — the path CLAUDE.md
  documents as returning *HTTP 404 with an empty array body*, so the agent reads "no
  coverage" instead of an error and the "weight by track record" instruction silently
  becomes a no-op. The working path is `tipranks-pit-symbol`.

**Done (PR #66).** `target_weight` → `allocation_pct` with the query spelled out;
`where deleted_at is null` added to `pre-earnings-brief` and `post-earnings-brief`, so
all five prompts that read `positions` now agree; and `tipranks-pit-by-symbol` →
`tipranks-pit-symbol` in `new-buy-ic-review.js` and both agent files. The TipRanks path
was the quietest of the three — a 404 with an empty array reads as no coverage, so
"weight by track record, not head count" had been doing nothing at all.

### 15. The workflow's inlined roles are missing the research standard `[x] DONE 4 Nov`

`.claude/workflows/new-buy-ic-review.js` inlines each role, and the analyst/bear copies
omit the entire "Firm research standard" block the `.md` files carry — including *"If a
sentence in a reason contains a digit, it is in the wrong layer."* `scripts/theses/load-drafts.mjs`
**rejects** a draft whose rationale contains a digit. So committee output produced via
the workflow is shaped to fail the loader; output via the Agent tool is not.

**Fix:** append the standard block to `ANALYST_ROLE`/`BEAR_ROLE`, or have both read
`docs/research-standard.md`.

**Done — the first option, and it does both.** A `RESEARCH_STANDARD_NOTE`
constant now appends to `ANALYST_ROLE` and `BEAR_ROLE`, carrying the two
governing rules verbatim *and* instructing the agent to read
`docs/research-standard.md` before writing. The second option alone was not
available: a workflow script has no filesystem access, so only the spawned agent
can read the file, and a prompt that merely points at a document is weaker than
one that states the rule.

This is now a **third** prompt-sync point alongside `TIPRANKS_NOTE` /
`BEAR_TIPRANKS_NOTE`, which is one more than is healthy. The structural fix is
`agentType` — the Workflow API resolves custom `.claude/agents` types from the
same registry as the Agent tool, which would delete all three sync points and
bring the workflow under §8's `disallowedTools` in one change. **Not taken
here**: verifying it means running the committee, which costs real tokens and
needs the explicit multi-agent opt-in. Recorded in a comment above the constant.

---

## P2 — Dead code and dead schema (safe removals)

### 16. Two dead tables — one was, one very much was not `[x] DONE 4 Nov`

- **`alert_rules`** — 0 rows, no reader or writer, only an orphaned `alertRules` key in
  `queryKeys.ts`. Drop outright.
- **`holdings_change_log`** — 208 rows, zero readers as of today. **Your call:** frozen
  history, or archive and drop.

> **`alert_rules` dropped; `holdings_change_log` REJECTED — the second finding is
> wrong and acting on it would have caused an outage.**
>
> `alert_rules` went, with `alert_events.rule_id` (whose only meaning was the FK
> into it) and the dead query key. `alert_events` survives untouched — it is the
> HomePage alert surface with the at-risk breach alert as its producer — and
> `threshold_value` is kept, since an alert can carry the number it breached
> without a rule row behind it. It is empty (0 rows), so nothing was lost.
>
> **`holdings_change_log` has a live writer.** "Zero readers" is true and was the
> only thing checked. The **`positions_audit` trigger** calls
> `log_position_change()` on every insert, update and delete of `positions`; the
> table has been appending since Apr 2026 and **the newest row was written the day
> this audit was published**. Dropping it would have made every write to
> `positions` fail — every allocation import, every History grid edit.
>
> It is also not redundant with `portfolio_allocations`, which was the implicit
> argument for archiving: it covers Apr–Nov 2026 for the three equity books,
> where their allocation snapshots stop in **Feb 2026**.
>
> And it matters on its own terms: `positions` is **not** one of the nine tables
> `log_audit` covers, so this trigger is the only record of who changed a target
> weight. It is a fifth audit surface, now documented in CLAUDE.md next to the
> other four. `schemaContract.test.ts` pins the table and the trigger together.
>
> Three repo claims said it had "no writer anywhere" — CLAUDE.md twice and
> `lib/allocationChanges.ts`'s own docstring — and this audit repeated them
> without checking. All four are corrected. The Change Log tab is still right to
> derive from snapshots, but for a better reason: the trigger logs a change to the
> *current target* with **no `effective_date`**, so it cannot say which rebalance a
> change belongs to.

### 17. Dead columns — the `portfolio` half is wrong `[x] DONE 4 Nov`

- **`portfolio`** — ≥18 of 147 columns all-null *and* unreferenced (their only mentions
  are in `supabase/archive/`). Undercounts: name-based grep can't tell `portfolio`'s
  `historical_sharpe_3y` from `securities2`'s.
- **`model_portfolio_benchmarks`** — 23+ of 131 dead, on a table of 8 rows.
- **`securities2` (93) and `model_portfolio_data` (76) are clean** — every column earns
  its place.

> **REJECTED for `portfolio`, with one exception. The columns are not dead, they
> are PRE-INCEPTION.**
>
> `portfolio` has 26 all-null columns, and **25 of them are 3-year, 5-year or
> 10-year metrics**: the `_3y`/`_5y` pairs of sharpe, sortino, treynor, max
> drawdown, tracking error, upside/downside and annualised std-dev, plus
> `market_alpha_36/60_month`, `quarterly_market_beta_36/60_month`, the
> best/worst three- and five-year returns, and the three annualised returns of
> §18.
>
> The decisive evidence is the **one-year siblings**: `historical_sharpe_1y`,
> `max_drawdown_1y`, `tracking_error_1y`, `market_alpha_12_month` and the rest
> are populated on **18 of 19** portfolios (the 19th is 0.11 years old), while
> every `_3y`/`_5y` twin is null. The workbook carries the whole block. **The
> oldest of the 19 models is 2.5 years old** — there is no three-year figure to
> carry yet, and the first one arrives in **Apr 2027**.
>
> Dropping them would have deleted the landing place for that data *and* broken
> the next workbook import, since the importers map sheet header straight to DB
> column with no whitelist — gotcha 7, which this very report quotes. Guarded
> now by `schemaContract.test.ts`, mutation-tested.
>
> **The one real dead column is `next_rebalance_date`** — the only non-period
> column in the set, null on all 19, its sole writer
> (`updatePortfolioRebalanceDates`) called from nowhere. Both are dropped, and
> `lib/rebalanceSchedule.ts`'s docstring, which cited the column as present,
> is corrected. `last_rebalance_date` is populated and untouched.
>
> **`model_portfolio_benchmarks` is NOT actioned.** Its 39 all-null columns are a
> different shape (several are *one*-year metrics, so the pre-inception argument
> does not carry), but it runs the same workbook-header hazard with an **empty
> `skipCols`**, and the sheet cannot be inspected from here — the master lives on
> the VM. Given that two of the three dead-schema findings in this section turned
> out to be false, dropping 39 more columns on an un-inspectable file is not a
> trade worth making. **Next time the VM is up, read the benchmark sheet's
> headers**; anything genuinely absent can then be dropped with the columns added
> to `skipCols`, exactly as `CATEGORY_DROPPED_COLS` did in Sep 2026.

### 18. The Total Returns 3Yr/5Yr/10Yr columns are structurally always blank `[x] DONE 4 Nov`

`PortfolioOverview` renders `annualized_{three,five,ten}_year_total_return` from the
portfolio row. Nothing populates them — the Model Portfolios sheet has no such columns
and all 19 rows are null. They sit next to a benchmark row that *does* show 9.93%.

**Fix:** add the three columns to the workbook sheet (the importer maps headers
straight through, so that is all it takes), or drop them from the table.

**Done — but neither of those two fixes was right, because the cause is not the
one stated.** The sheet is not missing the columns and the table is not dead:
**no model is three years old.** Adding workbook columns YCharts cannot populate
would change nothing, and dropping them would delete the destination for Apr
2027 (see §17 for the one-year-sibling evidence).

The real defect was the rendering. An em-dash reads as *no data* when the truth
is *no track record*, and it sat beside a benchmark cell showing a real 9.62%
three-year figure — inviting a comparison that cannot be made. In a tool built
to defend a process, that is the thing that was actually wrong.

So a pre-inception cell now reads **`n/a`**, the benchmark figure in that column
keeps its value but **loses its colour** (green on a benchmark return with no
portfolio return beside it reads as a verdict), and a footnote names the
inception date: *"3 Yr / 5 Yr / 10 Yr are n/a — this model's record starts April
25, 2024 (2.5 years)."* It is self-correcting: the cells fill themselves as each
model comes of age.

`lib/trackRecord.ts` is the pure helper, with `hasTrackRecordFor` returning
**null** for a portfolio with no inception date — "cannot tell" as a third
answer, the same shape as `excel_state` in §26. The table's header and both rows
are now driven by **one** column list; they were three parallel literals that had
to stay in the same order by hand. Verified on ETF Conservative (2.5 yrs: 3/5/10
n/a) and Foundation Conservative (0.11 yrs: 1/3/5/10 n/a).

### 19. Orphaned files and exports `[x] DONE 4 Nov`

- **`components/AtRiskModal.tsx`** — 132 lines, zero references. A dead *file*, the
  category `noUnusedLocals` structurally cannot catch. It is also the only live reader
  of `AT_RISK_METRICS_BY_ASSET_CLASS`'s `equity`/`fixed income` sets, so CLAUDE.md's
  "funds use them, unchanged" is false — and a fund flagged from the review modal gets
  `metrics: []`, which is what the sell-timer tiering keys off.
- **`'schedule'` mode in `MarkReviewedModal`** — ~100 of its 746 lines are unreachable
  (both call sites hard-code `mode="review"`), while `SecurityDetailPage.tsx:512` tells
  the user to *Click "Set Schedule"* — a control that exists nowhere. A fund with no
  schedule row has no path to one.
- **Nine unused `QUERY_KEYS` factories**; six are undocumented rot.
- **Dead lib exports:** `fetchBenchmarkAll`, `fetchTipRanksFirmSummary`, `archiveClient`,
  `updateClient`, `updatePortfolioRebalanceDates`, `deleteCandidate`, `scenarioFor`,
  `ACTIVE_STATUSES`, `fetchActionItemsBySecurity`, `OUTCOME_OPTIONS`,
  `SCORECARD_BAR_COLOR`, `PortfolioStrategy`, `SizingConviction`, `qualifiesForFlag`,
  `allMetricsRecovered`, `rulesForPortfolio`, `fetchComplianceRules`,
  `fetchActionItemsByClient`.
- **`pages/settings/NotificationsPage.tsx`** — 187 lines and a nav link storing six
  preferences nothing reads, returning a green "Saved." Same localStorage-only pattern
  CLAUDE.md records as deleted for Firm Settings *with an instruction not to reintroduce*.
- **`StatusBadge`** — `label` prop never passed; 8 of 19 variants unreachable.
- **`FinancialsTooltip.metric`** and **`MetricCard.scale`** — required, passed, never read.

Note `qualifiesForFlag` and `rulesForPortfolio` are not ordinary dead code: both carry
doc comments claiming to be the single definition of a rule, while the live consumer is
a job prompt restating it in prose. A prompt cannot call TypeScript. Decide which copy
is authoritative and delete the other.

**Done.** Deleted: `AtRiskModal.tsx` (132 lines, zero references),
`NotificationsPage` with its route and nav entry, eleven lib exports, six query
keys (nine were claimed; one went with `alert_rules` in §16 and two had gained
callers), `MetricCard.scale` and `FinancialsTooltip.metric` (both declared,
passed by every caller, never read), eight unreachable `StatusBadge` variants
and its never-passed `label` prop, and the modal's `'schedule'` mode.

**The two rule-bearing exports were decided separately, and differently.**

- **`rulesForPortfolio` / `fetchComplianceRules` — deleted; the prompt is
  authoritative.** `.claude/agents/risk-manager.md` states the rule with the SQL
  — *"a rule sets exactly one of `portfolio_name` / `portfolio_strategy`, so you
  must match on both or you will silently miss every strategy-scoped rule"* —
  and it is the copy that runs. The app's Compliance hub reads
  `fetchAllComplianceRules` (all rules, to edit them) and never needed the
  resolver.
- **`qualifiesForFlag` / `allMetricsRecovered` — KEPT, and pinned.** Deleting
  them would leave the firm's flag rule with no machine-readable form at all.
  Their doc comment claimed *"the `at-risk-review` job applies this rule"*, which
  is false — the job restates it in prose. Corrected, and
  **`atRiskRule.test.ts` now holds the two copies together**: it parses "3 or
  more red metrics AND at least one … MARGIN metric" out of the prompt and
  asserts it against `MIN_REDS_TO_FLAG` and the margin gate. Mutation-tested in
  BOTH directions — editing either copy alone fails the build.

**`AT_RISK_METRICS_BY_ASSET_CLASS`'s fund sets are confirmed dead, and the doc
was wrong about them.** CLAUDE.md said "funds use the `equity`/`fixed income`
sets, unchanged". `AtRiskModal` was their only reader; the live fund path calls
`addToAtRisk(securityId, [], …)` with an **empty** array, so a fund flagged
At-Risk carries no metrics and the sell-timer tiering has nothing to count. The
sets are kept as the firm's definition for the planned fund-review automation
and are now labelled *defined, not wired*.

**`SecurityDetailPage` told the user to click a control that does not exist** —
*No review schedule set. Click "Set Schedule"…*, which was the `'schedule'`
mode's button, never built. It now says what is true: recording a review creates
the schedule, because `markReviewed` upserts `review_schedules` on
`security_id`.

**One user-visible removal, flagged rather than buried:** the Notifications
settings page is gone from the nav.

---

## P3 — Structure and friction

### 20. There are no tests. At all. `[x] DONE 3 Nov`

No runner, no test file, nothing in CI. Meanwhile ~1,700 lines of pure, React-free
business logic sit in `lib/` — `allocationBands`, `assetClass`, `scorecardColor`,
`priceTargets`, `reviewSchedules`, `fundScorecard`, `positionBands`, `allocationChanges`,
`commentaryTimeline`, `quarterlyBrief`, `positionSizingCompare`.

Those encode the rules the tool rests on, and they are verified today by driving a
browser. §3 (band rounding), §11 (`$0.40M`) and §13 are all defects a dozen unit tests
would have caught at write time.

**Recommendation:** add Vitest and test those eleven modules only. No component tests,
no E2E — the pure layer is where the value is and it needs no harness.

**Done (PR #68). Vitest, 147 tests across those 11 modules**, wired into the
pre-commit hook and CI. Scope held exactly as recommended: `src/lib/*.ts`, no
component tests, no E2E, no DOM.

Two things in `vitest.config.ts` are load-bearing rather than boilerplate.
**`TZ` is pinned to `America/New_York`** — gotcha 24 can only reproduce west of
Greenwich, so on CI's UTC box those tests would have passed without exercising
the bug at all; a harness self-check asserts the zone so the pin cannot be
dropped silently. And **placeholder Supabase/FMP env vars**, because
`lib/supabase.ts` throws at module load and would otherwise take down any file
that holds a data-access function beside a pure one.

**The suite was mutation-tested before it was committed**, since a suite that
cannot fail is decoration. Reverting `roundBand` to the unconditional 0.5 step
(this report's §3) trips 2 tests; sorting the Commentary timeline by call date
instead of fiscal period (gotcha 22) trips 7; collapsing amber into red in
`scorecardColor` trips 2. All restore to 147 green.

Two deliberate choices worth knowing:

- **`fmtUsdCompact` is tested as CORRECT**, including the sub-million and
  trillion cases. The lib version has no defect — §11 is two components
  reimplementing it — so those assertions are the spec that fix converges on,
  not a lock on current behaviour. No test anywhere pins a known bug in place.
- **`quarterlyBrief.test.ts` holds the one safety property rather than a
  correctness one**: every held-back field is tagged with a sentinel and one
  assertion over the serialized brief proves none leaks, so a field added to
  `ResearchReport` later cannot ride along into a client's hands. It asserts the
  sentinel is present in the INPUT first, so it cannot pass vacuously.

### 21. Single-source the job schedule `[x] DONE 4 Nov`

Three different times exist for the same jobs: the plists (authoritative),
`lib/jobRuns.ts` `JOB_DEFINITIONS` (which `gradeJob` uses to decide "missed"), and
CLAUDE.md. All seven disagree. `GRACE_MINS = 180` masks it today, so no verdict is
currently wrong — but the only health signal there is derives "due" from a list nothing
keeps in sync.

**Fix:** have `generate-plists.mjs` and `JOB_DEFINITIONS` read one table.

**Done, as a gate rather than a shared table.** `JOB_DEFINITIONS`' seven times
were not merely "disagreeing" — they were the **app scheduler's** times, the
scheduler switched off in §1: 09:09 against launchd's 09:00, 09:32 against
09:45, 09:42 against 10:00. `gradeJob` was deriving "overdue" from a scheduler
that no longer exists, and `GRACE_MINS = 180` hid every one. All seven corrected.

A shared table would have meant either importing a `scripts/` file into the Vite
bundle or generating a TS file from the plist generator; `jobSchedule.test.ts`
instead reads `scripts/scheduled-jobs/launchagents/*.plist` and fails if the
catalog drifts from them again. **The plists are the better authority** — they
are what launchd actually reads, so this catches a drift that checking against
the generator's own table could not, and it is the house pattern already used by
`schemaContract` and `claudeMd`. It also asserts the one ordering that is a
convention (`at-risk-review` before `post-earnings-brief`) against the plists
rather than the prose. Parser self-check included so it cannot pass vacuously;
both drift cases mutation-tested.

### 22. Three oversized components worth splitting `[x] DONE 4 Nov`

- **`MarkReviewedModal.tsx` (746)** — two unrelated forms plus an evidence pipeline,
  every branch triple-gated on `mode × isFund`. Delete `'schedule'` mode, extract
  `buildSnapshot` to `lib/reviewSnapshot.ts`, leave `StockReviewForm` + `FundReviewForm`.
  **That matrix is what let §4 ship** — a fund can render the stock form only because
  one component can be both.
- **`Layout.tsx` (556)** — ~400 lines of inline SVG and a nav tree rendered twice.
  Extract icons, link arrays, `TickerSearch`, and one `NavDropdown`.
- **`ActionItemsPage.tsx` (651)** — extract `useActionFilters` (it owns a storage
  schema) and `exportActionsCsv` into `lib/actions.ts`, where half the CSV concern
  already lives.

**Done, with one deliberate departure.**

| file | before | after |
|---|---|---|
| `Layout.tsx` | 546 | **121** |
| `MarkReviewedModal.tsx` | 829 | **735** |
| `ActionItemsPage.tsx` | 651 | **615** |

- **`Layout`** → `components/nav/navLinks.tsx` (the tree as data),
  `NavDropdown.tsx` (desktop dropdown **and** `MobileNavGroup`), and
  `TickerSearch.tsx`. The win is not the line count: Holdings and Settings were
  two copies of the same dropdown with **two identical click-outside
  `useEffect`s** differing only in which ref they closed, and the mobile
  accordion was two more copies. Four blocks became two components used twice
  each, and the open state and ref moved to the component that owns them. The
  close-on-route-change the page did centrally is preserved inside each.
- **`ActionItemsPage`** → `hooks/useActionFilters.ts` (six pieces of view state
  behind one storage key, with `try`/`catch` on both read and write, which the
  inline version had on neither) and `buildActionsCsv` in `lib/actions.ts`,
  beside `actionLabel` so the export and the row cannot name an action
  differently. `SourceFilter` and `GroupBy` moved there too.
- **`MarkReviewedModal`**: `'schedule'` mode deleted (§19) and `buildSnapshot`
  extracted to **`lib/reviewSnapshot.ts`** — the highest-value half, because that
  mapping is the only thing making a stock review reconstructable and it sat in a
  closure where nothing could test it. Removing `mode` also exposed that
  `cadence` state could no longer diverge from `currentCadence`, so it went too.

**NOT done: the `StockReviewForm` / `FundReviewForm` split.** The stated reason
for it was that the `mode × isFund` matrix "is what let §4 ship" — and both legs
of that matrix are now gone: the `fundSecurity` prop was collapsed in PR #67 and
`mode` is deleted here. What is left is a 735-line component branching on one
boolean. Against that, components have **no** automated coverage in this repo —
the suite is lib-only by design — so a mechanical move of the audit-record write
path would be the largest unguarded change on the list for the smallest
remaining benefit. Extracting the snapshot into the tested layer bought more.

### 23. CLAUDE.md: 1,334 lines, with wrong claims in it `[x] DONE 4 Nov`

It loads into every session, so a wrong line actively misleads. Verified wrong:

- Points at `InvestmentCommitteePage.tsx` for compliance rules; the hub is
  `CompliancePage.tsx` at `/settings/compliance`. **The September audit prescribed this
  exact fix and it was never applied.**
- Says `AllocationComparison` is "left in place"; the file was deleted in `c3ee3ff`.
- Says `mapSecurityJoin` is used by four fetchers; only `actionItems.ts` imports it.
- Names `FundReturnTable` and a `fund_benchmarks_${securityId}` localStorage key —
  neither exists anywhere in `client/src`.
- Six routines → there are **seven** (`earnings-call-summary` missing); two times wrong;
  "they run in Claude Code while the app is open" contradicted 38 lines later.
- Gotcha 18 describes the deleted performance engine. Gotcha 19 instructs you to use
  `lib/secOperatingIncome.ts`, which the body explicitly says has no caller and should
  not be used by the Scorecard.
- The gotcha list runs 1–20, 22, 25, 21, 23, 24, and twelve entries restate body prose
  verbatim.

**Proposed restructure** (≈1,334 → ≈925 lines): move the scheduled-job runbook to
`scripts/scheduled-jobs/README.md` and deliverable shapes to a new
`docs/research-deliverables.md`; collapse the gotcha list to an index with the rule
*"a gotcha belongs here only if it has no body section"*; add a short **Audit &
Governance surfaces** section for `/audit`, households, the compliance hub and the
trade-suitability log, which are live and entirely undocumented.

**Done (PR #77). Every claim re-verified before acting — all seven were real**,
and one was worse than recorded: the schedule had **two wrong times**
(`at-risk-review` 09:25 → actually 09:00, `watchlist-research` 10:05 → 10:20)
*and* omitted `earnings-call-summary` entirely. Read from the installed plists,
which are the authority.

Also wrong, and now corrected: the compliance hub is `CompliancePage.tsx` at
`/settings/compliance` (`InvestmentCommitteePage` is a read-only reference page
at a different route); `AllocationComparison.tsx` was deleted, not "left in
place"; `mapSecurityJoin` has **one** importer, not four; `FundReturnTable` does
not exist; the `fund_benchmarks_${securityId}` localStorage key **never existed
in this tree** — the only two localStorage keys are the Actions filters and the
notification settings. Gotcha 18 described the deleted performance engine and
gotcha 19 instructed the reader to do precisely what its own body section
forbids.

**The gotchas are REORDERED, not renumbered** (they ran 1–20, 22, 25, 21, 23,
24). Prose throughout cross-references them by number, so renumbering would have
broken every reference to fix a cosmetic complaint.

**On length, the finding was better than the proposal.** The job schedule was
duplicated from `scripts/scheduled-jobs/README.md`, and **the copy here is the
one that drifted while the README stayed right** — so the fix is to stop
duplicating it, not to correct the copy. Both the schedule and the launchd
runbook are now pointers; what stays is the part that is a convention rather
than operations (prompts edited at `.claude/scheduled-tasks/…` and read from
`main`, the symlink trap, the at-risk → post-earnings ordering). The file is
~1,565 lines rather than the proposed ~925 — because it gained roughly 230 lines
of genuinely new material during the audit work itself, and the remaining
proposal (splitting deliverable shapes into `docs/research-deliverables.md`) was
**not** done: those shapes sit beside the conventions that reference them, and
fragmenting them looked more likely to cost accuracy than to save context.

**The Audit & Governance section is added**, covering four live and entirely
undocumented surfaces: `/audit` (read-only over an append-only table written by
a `log_audit` trigger on **nine** tables, with no client-side writer), the
compliance hub, households, and the trade-suitability log.

**Guarded going forward** by `claudeMd.test.ts`: no named `.ts`/`.tsx` file may
be absent from the tree (with an explicit `DELETED_ON_PURPOSE` list for the four
named as history, each with a reason), and the gotchas must stay in order. Three
of the seven errors were of the first kind. Both checks mutation-tested; neither
can pass vacuously.

### 24. `supabase/archive/` makes greps lie `[x] DONE 4 Nov`

32 non-authoritative `.sql` files. They caused a false positive in this very audit —
dead `portfolio` columns appeared "referenced" because archived DDL mentions them.
Both the lib sweep and I hit it independently.

**Fix:** move under a clearly-excluded path, or add the exclusion to the documented
grep recipe.

**Done — a repo-root `.ignore`, which beats both.** ripgrep and the search tools
built on it honour `.ignore`; **git ignores the file entirely**, so all 33
archived scripts stay committed and nothing moves. A documented grep recipe only
helps the person who reads the doc first, and neither sweep that hit this did.
`rg --no-ignore` searches them deliberately.

Verified the fix on the exact failure: `rg -w historical_sharpe_5y` now returns
only live references, `--no-ignore` restores the two archive files, and
`git ls-files supabase/archive/` still lists 33. Those three columns —
`historical_sharpe_5y`, `tracking_error_5y`, `market_alpha_60_month` — are the
ones §17 nearly dropped on the strength of an archive-only reference.

### 25. Loose ends `[x] 3 of 4 DONE 4 Nov`

- **`at-risk-run-check`** — a one-off task that fired 2 Nov, still registered, never
  cleaned up. (Mine; it was on my list and got dropped.)
- **`scripts/refresh/README.md:157`** tells you to commit the workbook that `.gitignore`
  was changed today to exclude — PR #61 removed the file but not its instruction.
- **`scripts/refresh/`** still describes "the mini"; the pipeline runs on the Mac Studio.
- **`docs/ai-investment-team-charter.md`** points at `scratchpad/persist_committee.py`,
  which does not exist, for the committee's documented persistence step.

**Three done, one blocked.**

- **`at-risk-run-check` — NOT DONE.** The delete call was refused by the
  permission classifier. It is disabled and one-time, fired 2 Nov and cannot
  fire again, so it is clutter rather than risk; it needs one manual delete.
- **`scripts/refresh/README.md`** — the "commit the workbook" instruction is
  replaced by the opposite, with the reason: the repo copy was deleted and
  gitignored after an **Oct 5 copy was imported by mistake on 3 Nov**, rolling
  every fund back a month under a stamp reading "imported today". The `prlctl`
  command to pull the file from the VM is given instead.
- **"the mini"** is now the Studio in `README.md`, `refresh.sh` and
  `import-workbook.ts`. The one reference left is in `Ycharts.bas`, which is
  deliberate — it explains why the drive letters differ between the two machines.
- **`persist_committee.py`** — the charter now says what actually happens: the
  orchestrator persists with Supabase MCP SQL after the workflow returns, through
  `committee_insert` / `committee_update` since §7. A scratchpad path could never
  have been the documented step for a persistence contract.

**Found while in the file, and worse than any of the four:** that README led with
**"STATUS: PAUSED — Not wired up; nothing runs on a schedule yet."** The refresh
has been running daily for weeks and succeeded at 05:36 this morning. Corrected
to LIVE, with the log path and the October failure history.

### 26. `excel_gone()` reports "not running" whenever `prlctl exec` fails `[x] DONE 4 Nov`

`scripts/refresh/refresh.sh:115` discards stderr and never reads the exit status, so any
failure → empty output → `grep -q` fails → `!` → **true**. `close_excel_and_suspend`
then logs *"Excel exited on its own after 0s"* and suspends the VM with Excel alive —
precisely the self-perpetuating wedge that cost 15 of 20 runs in October, and
`clear_excel_lock` is unreachable in that state.

I was in this file today and did not catch it.

**Fix:** capture the return code, treat non-zero as "unknown — assume NOT gone", log
stderr. Also delete the stale "Parallels Pro/Business only" claim, which this morning's
log disproves.

**Done (PR #76), and reproduced first.** Against the live VM (suspended),
`prlctl exec` returns 255 `PRL_ERR_IO_STOPPED` and the old predicate answered
**"gone"** — the exact false positive. `lock_gone` has the same shape but fails
the SAFE way (empty output means no `LOCK_CLEAR`, so it reports the lock present
and retries); only `excel_gone` inverted its result, which is why only it was
dangerous. That asymmetry is now written down beside both.

`excel_state` returns **three** answers — `gone` / `running` / `unknown` — and
`excel_gone` is just `state = gone`. An empty task list counts as unreadable,
since a live Windows box always has processes. On `unknown` the shutdown path
stops waiting immediately (a grace period cannot observe what it cannot read),
says so instead of claiming an exit, and still attempts the taskkill and the
lock clear. All three paths exercised with a stubbed `prlctl`.

**The log line this replaces was unfalsifiable.** Today's run printed *"Excel
exited on its own after 0s"*; on 3 Nov the same check took >60s and still found
Excel alive. Nothing in the log could tell a real instant exit from a failed
probe — so whether this morning suspended cleanly is genuinely unknown, and
tomorrow's log will be the first that can answer it.

**A bug I introduced and the test caught:** `log()` tees to stdout, so calling it
inside `excel_state` folded the warning into the `$(...)` capture and the `case`
fell through. Added `log_quiet()` — file only — and noted why.

**The "Pro/Business only" claim was wrong**, in `refresh.sh`, `README.md` and
`watch-trigger.cmd`. The 3 Nov log shows `prlctl exec` reading the task list and
terminating PID 9768 from this very script. The real limit is that it runs as
SYSTEM in session 0, so it has no desktop and cannot open an INTERACTIVE Excel —
which is the actual reason for the trigger file, and what the corrected comments
now say.

---

## Checked and clean — do not re-spend here

- **No direct Supabase calls** in components/pages/hooks; the lib → hooks → components →
  pages layering holds on that axis.
- **No `any` in lib**; every `{data, error}` destructure is checked (all 17 verified);
  `fmpSymbol()` applied on every symbol-keyed FMP fetch (gotcha 16 holds).
- **RLS is on for all 41 tables**, each with at least one policy — CLAUDE.md's claim holds.
- **`supabase/schema.sql` is current** — all 41 tables and every recent column present.
  That discipline is working.
- **All 7 repo plists are byte-identical to the installed ones**; all 7 prompts resolve
  on `main`, so `run-job.sh`'s `git show` path works for every job.
- **Two false positives of mine, recorded so nobody re-derives them:** `idx_scan = 0` is
  *not* evidence an index is unused at these row counts (several are partial uniques
  enforcing correctness — do not drop them); and Foundation Growth's equity band 93–99
  against a 98 target is *not* a drift mismatch, it is `min(99, target + drift)` doing
  its job. The clamp is now documented in gotcha 25.
- **Deliberate oddities confirmed as intended:** the inline-function table in
  `AlternativesPanel`, its `[security.id]`-only reset effect, `gcTime: 0` in
  `PortfolioReviewWorkspace`, `returnSource: 'mixed'` being unreachable,
  `review_log.recommended_sell` retained to render history.

---

## Suggested order

1. **§1** — recurs tomorrow at 09:00, costs money daily, already corrupted data once.
2. **§3** — one import; removes the mechanism behind gotcha 25.
3. **§8**, **§14** — small, and both are "the document claims a control that isn't there".
4. **§4**, **§5**, **§6**, **§13** — audit-record integrity.
5. **§20** — the only item that stops this list regenerating.
6. Everything else, in whatever order suits you.

**ALREADY DONE today** (for cross-reference, not action): the duplicate ELF/APP/DUK
pre-briefs were soft-deleted (symptom of §1); gotcha 25's clamp and `manual`-mode
behaviour were documented; `Multisector Bond` was added to `ASSET_CLASS_BY_CATEGORY`;
Growth (id 4)'s drift was corrected to 5.
