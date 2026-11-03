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

### 5. The benchmark picker writes nothing `[ ]`

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

### 6. A stock's review history is recorded but rendered nowhere `[ ]`

`ReviewLogSection` has exactly one render site, inside the `isFundOrEtfSecurity` block
at `SecurityDetailPage.tsx:481`. No stock tab shows it. Meanwhile the header still
shows "Review Overdue" for stocks — the page asserts a review is late while offering
no way to see when it is due or what the last one concluded.

This is the audit-defence record: recommendation, conviction, required rationale,
`price_at_review`, frozen `metrics_snapshot`. CLAUDE.md says these blocks "live on
Monitor". They do not.

**Fix:** render Review Schedule + `ReviewLogSection` on the stock Monitor tab.

### 7. The committee's write path has no schema-aware layer `[ ]`

`insertResearchReport`, `insertRiskReport`, `insertIcMemo` and their soft-delete
counterparts are all dead — one reference each, their own definition. The committee
writes via raw MCP SQL, so a wrong column or enum token in a prompt lands in the table
and `tsc` never sees it.

**Fix:** either delete them and document that MCP SQL is the write path, or route the
jobs through a small script so the generated-types check actually guards committee writes.

### 8. The committee's recommend-only guarantee is not technically enforced `[ ]`

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

### 10. `next_review_at` renders a day early on the security page — gotcha 24, recurred `[ ]`

`SecurityDetailPage.tsx:504` normalises through `reviewDueDay()` for the *colour*, then
`:505` renders the *value* from the raw timestamp in local time. A row holding
`2027-02-11T00:00:00Z` shows **Feb 11** on `/reviews` and **Feb 10** on the security
page. Exactly the failure gotcha 24 records for `at_risk.removal_date`.

**Fix:** `fmtUtcLongDate(...)`. (Currently renders only for funds — fix with §6.)

### 11. Two money formatters print sub-million figures as `$0.xxM` `[ ]`

`lib/formatters.ts:56` exports `fmtUsdCompact`; **no component imports it**.
`FinancialsSection.tsx:73` and `RevenueSegmentsPanel.tsx:17` each reimplement it, and
in both the last two branches are byte-identical — so a $400k segment renders
**"$0.40M"**, and neither has the trillion tier, so $3.2T prints "$3200.00B".

**Fix:** replace both with `fmtUsdCompact`.

### 12. `consensusColor` renders the same label in two different shades `[ ]`

CLAUDE.md records this as "a pre-existing divergence, not a pattern to copy". The two
implementations give genuinely different answers: the lib returns `text-green-600` for
a plain "Buy" (reserving `-700` for "Strong Buy"); `TipRanksPanel.tsx:74` returns
`-700` for *any* label containing "Buy", and `amber-600` where the lib returns
`yellow-600`.

**Fix:** import the lib one; it handles every label the local copy does.

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

### 15. The workflow's inlined roles are missing the research standard `[ ]`

`.claude/workflows/new-buy-ic-review.js` inlines each role, and the analyst/bear copies
omit the entire "Firm research standard" block the `.md` files carry — including *"If a
sentence in a reason contains a digit, it is in the wrong layer."* `scripts/theses/load-drafts.mjs`
**rejects** a draft whose rationale contains a digit. So committee output produced via
the workflow is shaped to fail the loader; output via the Agent tool is not.

**Fix:** append the standard block to `ANALYST_ROLE`/`BEAR_ROLE`, or have both read
`docs/research-standard.md`.

---

## P2 — Dead code and dead schema (safe removals)

### 16. Two dead tables `[ ]`

- **`alert_rules`** — 0 rows, no reader or writer, only an orphaned `alertRules` key in
  `queryKeys.ts`. Drop outright.
- **`holdings_change_log`** — 208 rows, zero readers as of today. **Your call:** frozen
  history, or archive and drop.

### 17. Dead columns `[ ]`

- **`portfolio`** — ≥18 of 147 columns all-null *and* unreferenced (their only mentions
  are in `supabase/archive/`). Undercounts: name-based grep can't tell `portfolio`'s
  `historical_sharpe_3y` from `securities2`'s.
- **`model_portfolio_benchmarks`** — 23+ of 131 dead, on a table of 8 rows.
- **`securities2` (93) and `model_portfolio_data` (76) are clean** — every column earns
  its place.

### 18. The Total Returns 3Yr/5Yr/10Yr columns are structurally always blank `[ ]`

`PortfolioOverview` renders `annualized_{three,five,ten}_year_total_return` from the
portfolio row. Nothing populates them — the Model Portfolios sheet has no such columns
and all 19 rows are null. They sit next to a benchmark row that *does* show 9.93%.

**Fix:** add the three columns to the workbook sheet (the importer maps headers
straight through, so that is all it takes), or drop them from the table.

### 19. Orphaned files and exports `[ ]`

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

### 21. Single-source the job schedule `[ ]`

Three different times exist for the same jobs: the plists (authoritative),
`lib/jobRuns.ts` `JOB_DEFINITIONS` (which `gradeJob` uses to decide "missed"), and
CLAUDE.md. All seven disagree. `GRACE_MINS = 180` masks it today, so no verdict is
currently wrong — but the only health signal there is derives "due" from a list nothing
keeps in sync.

**Fix:** have `generate-plists.mjs` and `JOB_DEFINITIONS` read one table.

### 22. Three oversized components worth splitting `[ ]`

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

### 23. CLAUDE.md: 1,334 lines, with wrong claims in it `[ ]`

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

### 24. `supabase/archive/` makes greps lie `[ ]`

32 non-authoritative `.sql` files. They caused a false positive in this very audit —
dead `portfolio` columns appeared "referenced" because archived DDL mentions them.
Both the lib sweep and I hit it independently.

**Fix:** move under a clearly-excluded path, or add the exclusion to the documented
grep recipe.

### 25. Loose ends `[ ]`

- **`at-risk-run-check`** — a one-off task that fired 2 Nov, still registered, never
  cleaned up. (Mine; it was on my list and got dropped.)
- **`scripts/refresh/README.md:157`** tells you to commit the workbook that `.gitignore`
  was changed today to exclude — PR #61 removed the file but not its instruction.
- **`scripts/refresh/`** still describes "the mini"; the pipeline runs on the Mac Studio.
- **`docs/ai-investment-team-charter.md`** points at `scratchpad/persist_committee.py`,
  which does not exist, for the committee's documented persistence step.

### 26. `excel_gone()` reports "not running" whenever `prlctl exec` fails `[ ]`

`scripts/refresh/refresh.sh:115` discards stderr and never reads the exit status, so any
failure → empty output → `grep -q` fails → `!` → **true**. `close_excel_and_suspend`
then logs *"Excel exited on its own after 0s"* and suspends the VM with Excel alive —
precisely the self-perpetuating wedge that cost 15 of 20 runs in October, and
`clear_excel_lock` is unreachable in that state.

I was in this file today and did not catch it.

**Fix:** capture the return code, treat non-zero as "unknown — assume NOT gone", log
stderr. Also delete the stale "Parallels Pro/Business only" claim, which this morning's
log disproves.

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
