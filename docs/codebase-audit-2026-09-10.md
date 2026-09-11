# Portfolio Management — Full-Codebase Audit Report

> **How to read this:** file links are relative to the repo root
> (`~/Developer/Portfolio Management`), so they resolve when this file is opened
> from inside the repo. Generated 2026-09-10 by a 13-agent audit of all 172
> source files; every finding below survived an adversarial verification pass.

52 distinct defects (57 verified findings, 5 merged as duplicates across chunks). Grouped by theme so the systemic patterns are visible; themes and items within them are ordered by real-world consequence — a number that is silently wrong outranks anything that crashes or merely looks untidy.

**Merges applied:** `FundScorecard.tsx:173` + `fundScorecard.ts:153` (one bug, two layers) · `rebalancing.ts:43` + `RebalancingPanel.tsx:24` (one unit conflation) · `positions.ts:30` + `EditPositionModal.tsx:145` (one collision path) · `InvestmentCommitteePage.tsx:1` + `CompliancePage.tsx:27` + `CLAUDE.md:492` (one doc error reported three times).

**⚖️ = the fix involves a judgement call, a convention decision, or a data migration — do not let an agent apply these unattended.** There are 13 of them, flagged inline and listed again at the end.

---

## Theme 1 — Numbers that are silently wrong on screen

The highest-consequence cluster. Each of these renders a plausible figure that is not the figure it claims to be, with no error and no visual tell.

### 1.1 The performance engine erases one trading day per rebalance ⚖️
[client/src/lib/portfolioPerformance.ts:133](client/src/lib/portfolioPerformance.ts:133)

**Wrong:** In the episode loop, episode *n* emits days `d >= a && d < b`, and episode *n+1* starts at `a' = b`, rebuilding shares from `nav` (still NAV of the last day *before* b) at `px = close(b)`. Evaluating d = b returns exactly `nav`. NAV(b) === NAV(b−1) unconditionally whenever the snapshot's `effective_date` is itself a trading day.

**Consequence:** Every rebalance date contributes exactly 0.00%. At a monthly allocation cadence that is ~12 zeroed trading days per year, compounding into understated 1Mo/3Mo/YTD/1Yr/3Yr/All-Time figures on the audit-facing Performance table. The benchmark row (`computeBenchmarkPeriodReturns:270`) is a raw adjusted-close series with no episodes, so it carries no such loss — **the portfolio is systematically biased downward against its own benchmark on the same table.** CLAUDE.md currently attributes the residual YCharts gap to FMP-adjusted-price methodology, which will mask this permanently.

**Fix:** Value the boundary day with the *old* shares before rebalancing — make the non-final episode range inclusive (`d >= a && d <= b`) and start each subsequent episode strictly after its own start (`d > a`), so episode *n* produces NAV(b) from the prior shares and episode *n+1* rebalances at close(b) off the already-advanced NAV. Add a regression test: two episodes with identical weights must reproduce a single buy-and-hold run.

**⚖️ Judgement:** this changes every historical performance number the tool has ever displayed, and the documented "matches YCharts to ~0.2%" calibration was established *with* the bug present. Re-verify the convention against YCharts before and after; do not let the existing calibration note be used as evidence the current behaviour is right.

### 1.2 The Positions "Target" column reads a different DB column than the Target editor writes ⚖️
[client/src/pages/PortfolioDetailPage.tsx:548](client/src/pages/PortfolioDetailPage.tsx:548) (header `:462`, edit seed `:420`, save `:392`)

**Wrong:** Header says `Target`; the read cell renders `pos.weight` (= `allocation_pct`). The bulk editor's Target input is seeded from `p.targetWeight` and saved via `updatePositionBands` → `target_weight`. Two distinct nullable columns (`schema.sql:1308` / `:1312`) under one header.

**Consequence:** An advisor changes Target 6.0 → 7.0, saves; `target_weight` is written, the cache is invalidated, and the column still prints 6.0%. The edit looks like it reverted. Meanwhile the same row's Lower/Upper cells (`:542`, `:555`) and the amber out-of-band flag (`:524-530`) all use `pos.targetWeight ?? pos.weight` = 7.0 — bands and a breach flag drawn around a target that appears nowhere on screen. `RebalancingPanel.tsx:106-107` labels the *same* `allocation_pct` number "Current", so one value carries two opposite labels on two tabs of one page.

**Fix:** Render `pos.targetWeight ?? pos.weight` in the Target cell (matching the band math and the editor) and add a separate "Current" column for `allocation_pct`.

**⚖️ Judgement:** this is a data-model question, not a rendering bug — decide first what `allocation_pct` vs `target_weight` are *for* (current book vs model target), then make every surface use that vocabulary. Align the header wording with RebalancingPanel in the same change.

### 1.3 `drift_percentage` is read as absolute points in Rebalancing and as relative % everywhere else ⚖️
[client/src/lib/rebalancing.ts:43](client/src/lib/rebalancing.ts:43) + [client/src/components/RebalancingPanel.tsx:24](client/src/components/RebalancingPanel.tsx:24) *(merged)*

**Wrong:** `calcDrift` does `threshold = p.driftThreshold ?? modelDriftPct ?? 5` and tests `Math.abs(p.weight - target) > threshold` — percentage *points* vs the raw column. `positionBands.ts:56/60`, `PortfolioDetailPage.tsx:103-104` and `ModelPortfolioModal.tsx:15-19` all use `target * (1 ± driftPct/100)` — a *relative* fraction. The authoring default is 20 (`ModelPortfolioModal.tsx:109`; `schema.sql:941` `drift_percentage numeric DEFAULT 20`).

**Consequence:** With drift_percentage = 20, a 5% target has a 4.0–6.0% band on the Allocation tab and in `PositionSizingCheck`, but Rebalancing only flags at ±20 points — unreachable for any normal position. Every drifted holding renders in-tolerance, the "N positions outside drift tolerance" banner never fires, and the Threshold column prints "±20.0%" for a band that is really ±1.0 point. `positions.drift_threshold DEFAULT 5.0` (`schema.sql:1313`) partially rescues normal rows at 5 points, but `RebalancingPanel.tsx:60` seeds a blank threshold from `modelDriftPct` (=20) and **writes the relative value into the absolute-points column**, permanently disabling that row's flag.

**Fix:** Make the drift source genuinely single — have `calcDrift` call `computePositionBands` and test the weight against lower/upper, and render the Threshold column as the resulting band ("4.0–6.0%") rather than "±20.0%".

**⚖️ Judgement:** existing `positions.drift_threshold` rows may already hold values written under either interpretation. Decide whether the per-position column is points or relative %, then audit/migrate the stored rows — a code-only fix silently reinterprets whatever is already there.

### 1.4 Fund scorecard scores missing metrics as zero, out of a hard-coded 100 ⚖️
[client/src/lib/fundScorecard.ts:153](client/src/lib/fundScorecard.ts:153) + [client/src/components/FundScorecard.tsx:173](client/src/components/FundScorecard.tsx:173) *(merged)*

**Wrong:** `total = rows.reduce((s, r) => s + (r.score ?? 0), 0)` — `computeMetric` returns `score: null` when a rank or cohort size is null, and `?? 0` folds it into a denominator that is a literal `/ 100` (`FundScorecard.tsx:96`) with fixed 70/60 colour thresholds. `hasData` requires only *one* of ten rows to be populated.

**Consequence:** Live example: **DFCF** has 8 of 10 peer metrics populated (sub-5-year fund, so the 5Y rank and 5Y upside/downside are unattainable — 20 points that cannot be earned). Its populated metrics are strong (tier 1 on 1Y rank, IR, expense ratio, R²) yet it totals **68.0** — amber, just under the 70 pass line. Scored against attainable points it is 68/80 = 85%. Sharpe 3Y and IR 3Y alone are 40 of the 100 points, so a workbook gap in two rank columns can drive a good fund into the red "replace this" band. The same unqualified total is frozen into the review-evidence PDF (`reviewEvidencePdf.ts:124-127`) — into the regulatory artefact — with no coverage note. (The expanded table *does* show per-metric em-dashes, so coverage is discoverable; the headline, the dot, the collapsed header and the PDF never say so.)

**Fix:** Have `buildFundScorecard` also return attainable weight and a scored-row count; render against attainable ("68.0 / 80") or normalise, apply colour to the normalised value, and print "8 of 10 metrics scored" in both `FundScorecard.tsx` and `reviewEvidencePdf.ts`.

**⚖️ Judgement:** normalising changes every historical comparison and every already-issued PDF's basis. Alternative: keep /100 but require a coverage floor before applying the colour rule. Pick one deliberately — this number drives replace/retain decisions.

### 1.5 "Category return" / "Peer group return" show a benchmark *index*, not the cohort
[client/src/components/ReturnRanksTable.tsx:218](client/src/components/ReturnRanksTable.tsx:218)

**Wrong:** The row's value comes from `fetchCategoryBenchmarkRow` / `fetchPeerGroupBenchmarkRow` — a single row keyed by ticker, with a tradeable `etf_proxy`. That is an index, not the cohort's mean/median. The rows directly beneath it ("Category rank", "Category size") *are* genuine cohort statistics off `securities2`. The module's own comment at `:131-133` asserts the opposite of what the data is.

**Consequence:** A reader sees "Category rank 8 / Category size 250 / Category return 12.3%" and reads 12.3% as what the 250-fund cohort returned. It is one index's return, typically differing from a category average by roughly the cohort's fee load. No ticker or index name is rendered anywhere in the table (unlike Total Performance, which tags its proxy `· <ETF>`), so the substitution cannot be checked from the UI.

**Fix:** Relabel to name what it is — `Benchmark return (${bench.category_benchmark})` or append a `· <ticker>` tag — and correct the misleading comment. ⚖️ If a genuine cohort average is actually wanted, that needs a new data source (a category-average series), which is a product decision, not a rename.

### 1.6 "All Time" is annualized unconditionally, including below one year ⚖️
[client/src/lib/portfolioPerformance.ts:260](client/src/lib/portfolioPerformance.ts:260)

**Wrong:** `allTime: days > 0 ? Math.pow(navLast, 365.25 / days) - 1 : null` — no `days >= 365` guard, unlike the sibling `ann()` helper at `:231` which does guard. The column header is a bare "All Time" (`PortfolioPerformancePanel.tsx:16`) and nothing on the panel says "annualized".

**Consequence:** A three-month-old portfolio up 8% renders All Time as **+36.0%**, next to a benchmark row inflated identically. Even for the two current >1yr portfolios, a 1.4-year cumulative +45% displays as ~+30% with no explanation. Latent today, deterministic for any new portfolio.

**Fix:** `allTime: days <= 0 ? null : days >= 365.25 ? Math.pow(navLast, 365.25/days) - 1 : navLast - 1` and label the column "All Time (ann.)".

**⚖️ Judgement:** cumulative-below-one-year is the GIPS convention, but it makes All Time change basis mid-life. Confirm which convention the advisor reports on before changing it.

### 1.7 SGA "Surprise %" chart shows the opposite sign from the table beneath it
[client/src/components/FinancialsSection.tsx:362](client/src/components/FinancialsSection.tsx:362)

**Wrong:** The chart beat-normalises (`pct = beat ? Math.abs(rawPct) : -Math.abs(rawPct)`) while the table (`:229-231`) prints the raw signed value. Identical only when `higherIsBetter` — and `sga` is the one metric defined with `higherIsBetter: false` (`:34`), and it is a selectable tab.

**Consequence:** A quarter where SGA came in 5% *below* estimate shows "−5.0%" in the table and a "+5%" green bar in the chart, on the same screen, both headed "Surprise %". Taking the chart's axis at face value reads the expense as 5% *higher* than expected. (Both surfaces agree on green/red, so beat/miss is never wrong — only the printed sign.)

**Fix:** Drop the beat-normalisation (`const pct = rawPct`) and let the existing green/red `Cell` fill convey favourability; or relabel the chart "Surprise vs expectation (favourable +)".

### 1.8 Merged IG Fixed Income row turns unset bands into a 0.0% floor
[client/src/components/PortfolioOverview.tsx:71](client/src/components/PortfolioOverview.tsx:71)

**Wrong:** `sumField` coerces nulls with `?? 0` for the merged row's lower/upper limits, while every ordinary row passes the nullable column through so `fmtPct` can render `—`. `ig_intermediate_*` / `ig_short_*` limits are nullable with no default (`schema.sql:912-920`).

**Consequence:** A model with unset IG sub-class limits shows "Lower 0.0%" — a missing band presented as an explicit 0% floor. Where only one sub-class has limits, the merged upper limit is that single leg shown as the combined ceiling. Data-dependent (I could not check which models have nulls).

**Fix:** Give `sumField` a null-preserving variant for limits — return null when any summand is null (a partial sum is not a combined band) and let `fmtPct` render `—`.

### 1.9 Allocation import scales percent/decimal per *cell*, not per file
[client/src/lib/portfolioAllocations.ts:222](client/src/lib/portfolioAllocations.ts:222)

**Wrong:** `return Math.abs(n) <= 1 ? n * 100 : n` inside the per-row `pct()`. Correct for the documented decimal YCharts export; armed only by the comment's own promise to "accept already-percent".

**Consequence:** If a percent-format file is ever imported, any holding ≤ 1.00% (a ~0.9% cash sleeve — both Equity portfolios run ~1% cash) is stored as 100× its weight, e.g. 90% cash. That vector feeds both the History grid and the performance engine. Latent — I found no path that feeds a percent file to this parser.

**Fix:** Decide the scale once per sheet: collect raw numbers, `const isDecimal = raw.every(n => Math.abs(n) <= 1)`, apply uniformly. Or drop dual-format support and reject ambiguous files.

---

## Theme 2 — Silent data loss and destructive writes

### 2.1 Retargeting a position onto a ticker already held silently merges and loses weight
[client/src/lib/positions.ts:30](client/src/lib/positions.ts:30) + [client/src/components/EditPositionModal.tsx:145](client/src/components/EditPositionModal.tsx:145) *(merged)*

**Wrong:** `updatePosition` soft-deletes the old row, then upserts the new one with `onConflict: 'portfolio_name,security_id'` — the composite natural key. An existing live row for `newSecurityId` is **UPDATEd, not rejected**: its `allocation_pct` is replaced by the outgoing row's weight. Neither caller guards — `EditPositionModal`'s security `<select>` (`:214-233`) is `fetchSecurities` with no exclusion of held tickers, and `ExecuteSwapModal.tsx:56-67` maps this over every selected portfolio inside a `Promise.all` while telling the user "The existing weight will be preserved."

**Consequence:** Portfolio holds VTI 5% and VOO 3%. A VTI→VOO swap soft-deletes VTI and rewrites VOO to 5%. Target allocation drops 8% → 5%, silently, across every selected portfolio at once. There is not even an audit row: `log_position_change()` only logs an UPDATE when `allocation_pct IS DISTINCT FROM`, and the soft-delete only touches `deleted_at`. The `trade_suitability` row written describes a different trade than the one that happened.

**Fix:** In `updatePosition`, look up a live row for `(portfolioName, newSecurityId)` before the upsert and throw a clear error ("Portfolio already holds NEWSYM at X% — merge or remove it first"); exclude held tickers from the Edit modal's select; have `ExecuteSwapModal` pre-check every candidate portfolio and show which would collide before running.

**⚖️ Judgement:** reject-vs-merge is a business decision. If merging is ever legitimate (consolidating share classes), it must be explicit, confirmed, and produce suitability rows for *both* tickers.

### 2.2 Uploads use `upsert: true` on a date+filename key, overwriting frozen review evidence
[server/src/index.ts:233](server/src/index.ts:233)

**Wrong:** `storagePath = ${folder}/${datePrefix}_${safeName}` with `{ upsert: true }`. The fund evidence filename is deterministic per ticker per review date (`reviewEvidencePdf.ts:155`: `${ticker}-review-${isoDay(reviewDate)}.pdf`), uploaded into `folder = securitySymbol`. Two reviews of the same fund resolving to the same Review Date collide on one key, and both `review_log` rows persist that same `evidence_doc_path`.

**Consequence:** The first review's frozen evidence is destroyed with no trace. Its row still renders an "Evidence PDF" link, which now opens the *second* review's scorecard and outcome — an audit record pointing at evidence it was not recorded with. Applies to any repeat same-named upload in any Documents folder.

**Fix:** `${folder}/${datePrefix}_${Date.now().toString(36)}_${safeName}`, or `upsert: false` with a `-2`/`-3` retry on 409. `uploadFile` already returns the server's real path and callers persist it, so no client change is needed.

### 2.3 A portfolio's "actual allocation" is whatever file was uploaded last ⚖️
[client/src/lib/currentAllocation.ts:36](client/src/lib/currentAllocation.ts:36)

**Wrong:** `fetchAllFiles(PORTFOLIO_DOCS_BUCKET)` → filter by folder → sort by `createdAt` desc → `[0]` → parse. No extension, MIME or filename check. That bucket+folder is the general portfolio Documents tab, whose own empty-state copy (`PortfolioDetailPage.tsx:651-656`) invites "IPS, statements, compliance records, and other files".

**Consequence:** Any spreadsheet dropped into Documents silently becomes the portfolio's actual allocation — labelled "Current allocation as of \<upload date\>", used as the basis for band breaches and (per CLAUDE.md) for the AI risk manager's compliance verification. `parseActualAllocations` `continue`s past unparseable rows, so a wrong workbook yields a *partial* map rather than an error. A PDF makes `XLSX.read` throw, and with `retry: false` the query resolves to undefined — the Current column just vanishes, indistinguishable from "no file uploaded".

**Fix:** Give allocation files their own subfolder or bucket so a general document can never be selected; validate the parse result (require a recognisable header cell or a minimum count of resolvable tickers); surface "file found but not an allocation export" distinctly from "no file".

**⚖️ Judgement:** the storage-layout change touches an existing bucket with existing files. Decide the layout (subfolder vs bucket vs naming convention) and plan the migration of anything already relied on.

### 2.4 Candidate workspace discards unsaved edits on a window-focus refetch
[client/src/pages/SecurityAdditionWorkspace.tsx:38](client/src/pages/SecurityAdditionWorkspace.tsx:38)

**Wrong:** The query (`:26-31`) sets only `gcTime: 0` — no `staleTime`, no `refetchOnWindowFocus: false`, against a global 2-min staleTime and default focus-refetch. The reset effect keys on `[candidate]` (a fresh object every refetch) and does `setContent(...); setChecklist(...); setDirty(false)`. `PortfolioReviewWorkspace.tsx:82-83` guards exactly this; CLAUDE.md gotcha #9 names the pattern.

**Consequence:** Text typed into a research/thesis field can be silently replaced by the server copy, with the header still reading "Saved". The concrete loss path is the in-flight-save race: the autosave effect (`:58-62`) early-returns while `saveMut.isPending` and its deps omit `isPending`, so keystrokes made during a save schedule no new timer, then `onSuccess` clears `dirty` and the next refetch overwrites them. In an audit-documentation workflow, lost rationale is invisible until someone rereads the record.

**Fix:** Add `staleTime: Infinity, refetchOnWindowFocus: false`; key the reset effect on `[candidate?.id]`; add `saveMut.isPending` to the autosave deps (or queue rather than early-return).

### 2.5 Allocation grid cell edits can fail or be skipped with no signal
[client/src/components/AllocationHistoryPanel.tsx:94](client/src/components/AllocationHistoryPanel.tsx:94)

**Wrong:** Uncontrolled `defaultValue` inputs; the `onBlur` parse has no `else` — a non-finite value ("7,5", "7.5.1") takes no branch at all, no mutation, no message, and the typed text stays in the DOM. All four mutations (`:26-41`) declare only `mutationFn` + `onSuccess` — no `onError`, no `isError` rendering. The wrapper `key={dates.join('|')}` changes only when the *set of dates* changes, so a refetch after a rejected write never resets the input.

**Consequence:** A rejected or mis-parsed edit leaves the typed value on screen while `portfolio_allocations` keeps the old weight. These weights are the source of truth for the performance engine, so the return series silently disagrees with the grid the advisor is reading. The only tell is the server-computed Total row drifting from the visible cells.

**Fix:** Control the input off query data (or key it on `${d}|${r.security_id}|${r.weights[d]}`); add an `else` that flags the cell instead of dropping the edit; give all four mutations an `onError` banner.

### 2.6 Allocation import deletes the whole history before inserting
[client/src/lib/portfolioAllocations.ts:164](client/src/lib/portfolioAllocations.ts:164)

**Wrong:** With `replace` (default true, and passed explicitly at `ImportExportPage.tsx:277`), every row for the portfolio is deleted, then 500-row chunks are upserted in separate round trips with `if (error) throw`.

**Consequence:** Narrower than it first looks — the parse throws *before* the delete, the selected file is the full replacement, and re-running restores everything. The residual window is a network drop or per-row rejection between the delete and the last chunk: the table is left empty or partial, the user sees an import error but not that history is gone, and the performance engine silently recomputes off the truncated history.

**Fix:** Move the replace into a single transaction (an RPC called via `supabase.rpc`), or upsert all chunks first and then delete rows whose `effective_date` is not in `parsed.dates`.

---

## Theme 3 — The audit trail records something other than what happened

This is the tool's stated purpose (regulatory audit defence), so these rank above their raw severity.

### 3.1 Fund reviews started from the Review Calendar are recorded through the stock path
[client/src/pages/ReviewCalendarPage.tsx:164](client/src/pages/ReviewCalendarPage.tsx:164)

**Wrong:** The calendar opens `MarkReviewedModal` with `securityId`, `securitySymbol`, `currentCadence`, `mode`, `lastEarnings`, `nextEarnings` — and nothing else. The modal destructures `isFund = false, security` (`:89-91`), so both default falsy. `SecurityDetailPage.tsx:905-916` *does* pass both. Nothing blocks submission: the gate is `stockReviewReady = !!recommendation && notes.trim() !== ''`.

**Consequence:** Clicking "Mark Reviewed" on a mutual-fund/ETF row in `/reviews` renders the stock form and writes `outcome: null`, a `recommendation` funds are documented never to carry, `evidence_doc_path: null` (**no PDF is built or uploaded — the upload-or-abort atomicity is bypassed, not violated, because the fund branch is never entered**), and a `metrics_snapshot` from stock-only FMP endpoints. Since funds have null earnings dates, `review_date` is null too and scheduling falls back to cadence. **The shape of the audit record depends on which page the advisor started from.**

**Fix:** The classification is already on the row — `fetchReviewSchedules` embeds the classifier columns for exactly this purpose and this page already calls `isFundOrEtfSecurity(s)` at `:38`. Simplest and safest: for fund rows, navigate to `/security/:security_numeric_id` and open the review there rather than rendering a half-configured modal. Additionally make the modal fail loudly: `if (isFund && !security) throw`.

### 3.2 Logged communications are dated one day early for every US viewer
[client/src/components/LogCommunicationModal.tsx:34](client/src/components/LogCommunicationModal.tsx:34)

**Wrong:** `occurred_at: new Date(occurredAt).toISOString()` where `occurredAt` is a bare `YYYY-MM-DD` from a date input — parsed as **UTC** midnight per spec, stored in a `timestamptz` (`schema.sql:449`), then rendered by `CommunicationTimeline.tsx:56` → `fundFormat.ts:6-15`, which takes the `includes('T')` branch (no noon fix-up) and calls `toLocaleDateString()` in the viewer's zone.

**Consequence:** Every meeting/call/email logged west of UTC reads back one calendar day early in the client communication timeline — the exact record an audit inspects — and `occurred_at` ordering shifts across day boundaries. The read side already guards date-only strings, which shows the author knew the trap; the write side is unguarded.

**Fix:** `occurred_at: new Date(occurredAt + 'T12:00:00').toISOString()` — local noon, matching what `formatDate` already assumes.

### 3.3 Evening fund reviews are stamped and filed as tomorrow
[client/src/components/MarkReviewedModal.tsx:69](client/src/components/MarkReviewedModal.tsx:69)

**Wrong:** `toDateInputValue` returns `date.toISOString().slice(0, 10)` — UTC. It seeds `reviewDate` (`:98`, `:112`), which flows into `fundReviewedAt` (`:273`) → `review_log.reviewed_at` *and* `review_schedules.last_reviewed_at`, into the evidence PDF's `reviewDate` (filename `${ticker}-review-${YYYY-MM-DD}.pdf`), and into the Review Date box at `:368-371` — which is **read-only for funds**, so the advisor cannot correct it.

**Consequence:** After ~19:00–20:00 ET, `reviewed_at` holds a future date and the frozen evidence PDF is named and headed with it. The audit trail disagrees with when the work was done. Same UTC slice at `PortfolioReviewWorkspace.tsx:93` and `:103`.

**Fix:** Format the local date (`toLocaleDateString('en-CA')`, or a padded `getFullYear/getMonth/getDate`). Put it in `lib/formatters` as `toLocalDateInputValue()` and use it in all three places.

### 3.4 "Maintain + At-Risk" is stored as a clean Maintain, contradicting its own evidence PDF
[client/src/components/MarkReviewedModal.tsx:236](client/src/components/MarkReviewedModal.tsx:236)

**Wrong:** `resolveFundOutcome()` never consults `fundAtRisk`: `if (fundMainOutcome === 'maintain') return 'no_issues'`. But `fundOutcomeLabel()` (`:242-247`) pushes **both** labels, and that string is what goes into the PDF (`:257-266`). The combination is reachable — the buttons toggle independently and the gate is `fundMainOutcome !== null || fundAtRisk`.

**Consequence:** A fund maintained but flagged at-risk is recorded in `review_log` as `no_issues`, while the uploaded evidence PDF for the same review says "Maintain · At-Risk" and an `at_risk` row is created. **The frozen evidence document contradicts the database record of the same event**, and a reviewer reading only the log sees no trace of the at-risk decision.

**Fix:** Let the flag win the enum: `return fundAtRisk ? 'placed_on_watchlist' : 'no_issues'` (the label "Flagged At-Risk" already covers it), or persist the flag separately so log and PDF agree.

### 3.5 Suitability records label unchanged-weight saves as "Decrease" ⚖️
[client/src/lib/tradeSuitability.ts:96](client/src/lib/tradeSuitability.ts:96)

**Wrong:** `determineTradeAction` has no equality branch: `if (newWeight > oldWeight) return 'increase'; return 'decrease'`. `EditPositionModal` gates submit on the monitoring assessment and reason code, not on a weight change, and pre-fills the weight input with the current value.

**Consequence:** Every hold/monitoring save with an unchanged weight writes a `trade_suitability` row asserting the position was **decreased**, rendered as "Decrease · 6% → 6%" in the log. A false statement in the regulatory record, and it skews any later reading of the action mix.

**Fix:** Add `if (newWeight === oldWeight) return 'hold'`, extending `TradeAction`, `ACTION_LABELS`, `ACTION_COLORS`, `REASON_OPTIONS_BY_ACTION`.

**⚖️ Judgement:** `trade_suitability.action` is CHECK-constrained in the DB (`schema.sql:1838`), so this needs an `apply_migration` plus regenerated `schema.sql` and `database.types.ts`. The alternative — derive the badge from `monitor_action` when weights match — avoids the migration but leaves the stored `action` wrong.

### 3.6 Executing a swap writes no suitability record at all ⚖️
[client/src/components/ExecuteSwapModal.tsx:55](client/src/components/ExecuteSwapModal.tsx:55)

**Wrong:** The mutationFn calls only `updatePosition` + `advanceSubstitutionStatus`. `recordTradeSuitability` has exactly three call sites — `AddPositionModal:41`, `EditPositionModal:152`, `:174` — and this is not one of them. No DB trigger backfills it. `determineTradeAction` already returns `'replace'` for this case and `REASON_OPTIONS_BY_ACTION.replace` exists, so the schema anticipated it.

**Consequence:** After a substitution swap, the affected portfolios' Trade Suitability log shows nothing: the incumbent's removal and the replacement's insert both go undocumented, while a manually added position of the same size is fully documented. An auditor reading the log sees adds and edits but no replacements. (Mitigated: `substitutions` carries rationale/reviewed_at/approved_at/swapped_at, so the decision is not entirely undocumented — it just never reaches the per-portfolio suitability log.)

**Fix:** After each `updatePosition`, call `recordTradeSuitability({ portfolio_name, security_id: proposedSymbol, action: 'replace', reason_code, rationale: substitution.rationale, old_weight, new_weight })`, and invalidate `QUERY_KEYS.tradeSuitability(pid)` alongside positions.

**⚖️ Judgement:** `reason_code` is required and per-portfolio. Decide whether the modal collects one reason for the whole swap or one per portfolio, and whether it should be a hard gate (matching `AddPositionModal`) — that is a workflow change, not a code fix.

### 3.7 The Audit Log's "Positions" filter can only ever return zero rows ⚖️
[client/src/lib/auditLog.ts:27](client/src/lib/auditLog.ts:27)

**Wrong:** `AUDITED_TABLES` lists `'positions'`, but the only trigger on that table (`schema.sql:2493`, `log_position_change()`) writes to `holdings_change_log`, never `audit_log`. Conversely `firm_compliance_rules` *is* wired to `log_audit` but is absent from the list — no filter button, and its rows render under a raw table name. The file's own header comment names six audited tables and does not include positions, so the array contradicts its own doc.

**Consequence:** In a tool built for audit defence, clicking "Positions" shows an empty list — reading as "no allocation changes were ever recorded" when every change went to a table this page does not read.

**Fix:** Add `'firm_compliance_rules'` with a `TABLE_LABELS` entry and fix the header comment. ⚖️ For positions, choose: (a) drop it from the list and point the story at the Change Log surface, or (b) add a `log_audit` trigger via `apply_migration` and regenerate `schema.sql` + `database.types.ts`. (b) gives a real audit trail but duplicates logging; that is a records-retention decision.

*Caveat: `schema.sql` is the git mirror, not the live DB — the Supabase connector was unavailable during verification.*

### 3.8 The stock review promises "no next review date" and writes one anyway
[client/src/components/MarkReviewedModal.tsx:296](client/src/components/MarkReviewedModal.tsx:296)

**Wrong:** `stockNextReview` is null when FMP has no next-earnings date; the UI at `:435-442` renders "Next review will be set to —". But `reviewSchedules.ts:127` does `opts.nextReviewAt ? … : calcNextReview(cadence, now)` — a null falls back to cadence scheduling. Submit is reachable in this state.

**Consequence:** For a new or thinly covered ticker, the advisor is told no date is being set while the schedule row advances to today + cadence. The Review Calendar and Actions hub then show a due date the advisor never agreed to, silently bypassing the earnings-driven convention.

**Fix:** Either display the cadence-derived date that will actually be written, or give `markReviewed` an explicit no-date signal (`undefined` = fall back to cadence, `null` = leave unset) and warn that scheduling resumes when FMP publishes a date.

### 3.9 Partial imports are logged as `rows_written: 0`
[scripts/refresh/import-workbook.ts:105](scripts/refresh/import-workbook.ts:105)

**Wrong:** Each dataset block throws on a row-count floor *after* the importer has already committed its writes; the catch pushes `{ rows: 0, status: 'failed' }`.

**Consequence:** `import_runs` records zero rows written while partially refreshed data is live in the tables — the opposite of the provenance guarantee the table exists for. `actions.ts:195-201` then renders "N dataset(s) wrote nothing on the last run — only 40 benchmark rows (floor 41)", a sentence that contradicts itself.

**Fix:** Capture the result before the floor check and push the real count with `status: 'failed'`; soften the hub copy to "failed their row-count check".

---

## Theme 4 — Cross-surface disagreement and stale caches

Two surfaces of the same fact, disagreeing.

### 4.1 Model Compatibility shows a verdict computed from the old IPS bands
[client/src/components/IpsModelCompatibility.tsx:48](client/src/components/IpsModelCompatibility.tsx:48)

**Wrong:** `queryKey: QUERY_KEYS.ipsModelCompatibility(clientId)` while `queryFn: () => fetchIpsModelCompatibility(clientId, ips)` — the `ips` bands are a closure variable absent from the key. A repo-wide grep finds exactly two references (the key factory and this call site), so nothing ever invalidates it. `IPSPanel.tsx:124-130` invalidates only `QUERY_KEYS.ips(clientId)`; the panel stays mounted; global staleTime is 2 minutes.

**Consequence:** An advisor tightens equity max 80% → 60% and saves; the block keeps rendering "✓ Within IPS bands" — computed against the old 80% bound — for a model that now breaches policy. This is *the* surface linking client IPS to model targets, and it can display a stale pass.

**Fix:** Put the inputs in the key (`ipsModelCompatibility(clientId, ips.id, ips.updated_at)`) — safer than adding an invalidation, because it also covers refetches from any other source.

### 4.2 Changing a benchmark does not reach the Monitor tab
[client/src/components/StockReturnTable.tsx:147](client/src/components/StockReturnTable.tsx:147)

**Wrong:** `saveSecurityBenchmarks(...).catch(() => {})` — no `queryClient.invalidateQueries`, unlike `AlternativesPanel.tsx:120-127` which does invalidate after `saveAlternatives`. The `benchmark-changed` CustomEvent has exactly one listener (`StockScorecardPanels.tsx:116-117`); `AlternativesPanel` has none and reads `security.preferred_benchmark1_id/2_id` straight off the prop.

**Consequence:** Pick a new benchmark in Total Performance on Overview, switch to Monitor: the Alternatives scorecard and Trailing-Returns tables keep the **old** benchmark's name and figures indefinitely while the window stays focused. Two tabs show different benchmarks for the same stock. Separately the empty `.catch` swallows a failed write, leaving a selection on screen that was never persisted.

**Fix:** `saveSecurityBenchmarks(...).then(() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.security(security.id) }))`, and surface the rejection instead of an empty catch. The CustomEvent can stay as the instant-feedback path.

### 4.3 The Actions hub counts soft-deleted positions as drift breaches
[client/src/lib/actions.ts:151](client/src/lib/actions.ts:151)

**Wrong:** `fetchDriftActions` selects from `positions` with no `.is('deleted_at', null)`. Every other reader filters (`positions.ts:137`, `:157`), and the same file filters soft deletes for `action_items` at `:104`.

**Consequence:** A removed position keeps contributing to "Rebalance \<portfolio\> — N positions outside drift tolerance" on `/actions` and in the Home Action Center. The count is inflated by historically removed holdings and **cannot be cleared from any workflow**, because the row is invisible in the Positions and Rebalancing UI. (Limited to removed rows that had a `target_weight` — exactly the rows a rebalancing check cares about.)

**Fix:** Add `.is('deleted_at', null)`. Better: reuse `fetchPositionsByPortfolioId` + `calcDrift` so the hub and the Rebalancing panel cannot diverge (see 1.3 — they currently do).

### 4.4 The Import card says "Last imported today" after a total failure
[client/src/pages/settings/ImportExportPage.tsx:373](client/src/pages/settings/ImportExportPage.tsx:373)

**Wrong:** `ImportCard`'s inline `lastRun` reduce omits the `status !== 'failed'` filter that `ychartsAsOf` (`importRuns.ts:106-108`) applies. The workbook card writes three `status: 'failed'` rows dated now when all three datasets throw.

**Consequence:** After a workbook upload that failed outright — the exact scenario the file's own comments describe — the card reads "Last imported \<today\> from Ycharts.xlsm" while `DataAsOf` on the fund pages correctly keeps showing the older date and ambers it. The same state is reported fresh on the import page and stale on the fund page, and the import page is where someone goes to check whether the refresh landed.

**Fix:** `const lastRun = runs ? ychartsAsOf(runs, sources) : undefined`. Optionally surface the failure separately ("Last attempt failed \<date\>").

### 4.5 Action items due *today* are painted overdue
[client/src/pages/ActionItemsPage.tsx:329](client/src/pages/ActionItemsPage.tsx:329)

**Wrong:** `new Date(a.dueDate) < new Date()` on a bare `YYYY-MM-DD` (`action_items.due_date` is a date column, mapped straight through). ES parses that as UTC midnight — the previous evening local in any negative-offset zone. `lib/actions.ts:333-339` `bucketOf` handles the same string correctly by appending `T00:00:00`.

**Consequence:** Every action due today renders inside the "Due Today" group **with a red row and a red "Due \<date\>" label claiming it is late**, and `duePriority` (via `reviewSchedules.isOverdue`, which has the same naive comparison) auto-escalates it to high. The red overdue signal is permanently non-empty, devaluing it for genuinely late work. `HomePage.tsx:208` repeats the pattern.

**Fix:** Export one date-only-aware helper (`bucketOf` already has the logic) — `isPastDue(d) => bucketOf(d) === 'overdue'` — and use it at `ActionItemsPage.tsx:329` and `HomePage.tsx:208`; fix `reviewSchedules.isOverdue`/`isDueSoon` the same way so priority, bucket and styling agree.

---

## Theme 5 — Errors swallowed, so failures look like empty data

A recurring violation of the project's own "always destructure and handle the error" rule, in each case turning a failure into a plausible-looking empty result.

### 5.1 `fetchRelatedSecurities` drops the error on its second query
[client/src/lib/securities.ts:350](client/src/lib/securities.ts:350) — `const { data: secRows } = await supabase...` with no `error`. The *first* query in the same function destructures and throws.
**Consequence:** On any failure (RLS change, dropped column, network blip) `idMap` is empty and every related security returns `related_numeric_id: null`. `SubstitutionsList.tsx:67-71` and `SecurityDetailPage.tsx:382-385` then render dead text instead of links, `isError` never fires, and nothing surfaces to the user or an error boundary.
**Fix:** Destructure and throw, matching the first query.

### 5.2 `snoozeActionItem` drops the error on its prior-status read
[client/src/lib/actionItems.ts:208](client/src/lib/actionItems.ts:208) — the sibling `updateActionItemStatus` (`:155-160`) does it correctly.
**Consequence:** On a transient failure the snooze still applies and `action_item_events` records the transition with `from_status: null` — a hole in the very table whose purpose is the status-transition audit trail.
**Fix:** `const { data: current, error: fetchError } = ...; if (fetchError) throw fetchError`.

### 5.3 `createCandidate` drops the error on its existing-draft lookup
[client/src/lib/securityAdditions.ts:171](client/src/lib/securityAdditions.ts:171) — every other fetcher in the file handles it.
**Consequence:** Largely self-correcting (the partial unique index makes the insert raise 23505, which *is* thrown), but the user sees a confusing unique-violation instead of the real cause — and if that index were dropped, duplicate open drafts would be created silently.
**Fix:** Destructure and throw before the `if (existing)` check.

### 5.4 Position add is two un-transacted writes with invalidation only on success
[client/src/components/AddPositionModal.tsx:39](client/src/components/AddPositionModal.tsx:39) — `createPosition` then `recordTradeSuitability` in one mutationFn; both invalidations live in `onSuccess`.
**Consequence:** The headline failure path is *not* reachable (the reason-code gate guarantees the CHECK constraint passes). The residual risk is a transient failure between the two calls: the modal shows "failed" and an unchanged holdings list while the DB already holds the position with no suitability record. Re-submitting is safe (upsert), but only if the operator retries rather than concluding nothing happened.
**Fix:** Invalidate `QUERY_KEYS.positions(portfolioId)` in `onError` too, and name the missing suitability note in the message; or move both writes into one Postgres RPC.

*(Also in this theme: 4.2's `.catch(() => {})` and 2.5's four `onError`-less mutations.)*

---

## Theme 6 — Wrong options offered to the user

### 6.1 The At-Risk "Add" modal always offers stock metrics
[client/src/components/AddToAtRiskModal.tsx:64](client/src/components/AddToAtRiskModal.tsx:64)

**Wrong:** `metricsForAssetClass('stock')` is hardcoded; `selected` is used only as a presence check. The picker is `fetchSecurities`, which filters only `$Cash` — ETFs and mutual funds are selectable. The sibling `AtRiskModal.tsx:21` branches correctly on asset class.

**Consequence:** A fund flagged from the At-Risk page's "+ Add" button is offered "Operating Margin TTM", "FCF Margin TTM", revenue/EPS growth — metrics never computed for funds. Whatever is ticked is written verbatim to `at_risk.metrics`, rendered as the flag's evidence chips, and **counted to set `removal_date`**: `calcRemovalDate` keys off `metrics.length`, and only the six-option stock set can reach the 30-day tier (the fund sets have four). Ticking five puts a fund on a 30-day forced-sell timer justified by measurements that do not exist for it.

**Fix:** Either filter the picker to stocks (the modal's own heading already says "Flag stock as at-risk") via `securities.filter(s => !isFundOrEtfSecurity(s))`, or branch like `AtRiskModal` does — which requires adding `broad_asset_class` to the `fetchSecurities` select. Do not re-implement the stock/fund test inline.

### 6.2 A snoozed action renders with a blank status control
[client/src/pages/ActionItemsPage.tsx:371](client/src/pages/ActionItemsPage.tsx:371)

**Wrong:** The controlled `<select value={a.manual!.status}>` has options open/in_progress/waiting/blocked/closed — no `snoozed`, which this same page writes (`:85` → `actionItems.ts:207-213`).

**Consequence:** Once a snooze expires the row returns to the default view still carrying `status='snoozed'`, and the control renders with no selection — the row's state is unreadable. Self-heals on the next change.

**Fix:** Render the options from `STATUS_LABELS` so the control can never drift from the `ActionStatus` union again; optionally show `snoozed_until` beside it.

### 6.3 One shared flag expands every objective group at once
[client/src/components/compliance/CrossPortfolioSection.tsx:32](client/src/components/compliance/CrossPortfolioSection.tsx:32)

**Wrong:** A single `consistencyExpanded` boolean owned by `CompliancePage.tsx:49` gates every group's body and every header's `onClick`. Separately, `:25` pre-filters to `deviations.length > 0`, after which `hasBreaches` is a constant `true` — the green header, the "Consistent" badge and the "All portfolios consistent" branch at `:53` are all unreachable.

**Consequence:** With two or more objectives showing deviations, expanding one expands all; there is no way to inspect one in isolation. And three code paths advertise states the component can never display.

**Fix:** Key expansion by objective (`useState<Record<string, boolean>>`). Then either drop the `:25` filter so consistent objectives render green, or delete the unreachable branches.

---

## Theme 7 — Shadowed and duplicated shared helpers

The project has designated single sources of truth; these are the copies that escaped, and two of them are live hazards.

### 7.1 `AnalystSummaryCards` shadows `fmtSignedPct` with 100×-different semantics
[client/src/components/AnalystSummaryCards.tsx:37](client/src/components/AnalystSummaryCards.tsx:37) — a local `fmtSignedPct(v) => v.toFixed(1)+'%'` taking *percent points*, while `formatters.ts:49-54` exports the same name taking a *decimal*. The file already imports `consensusColor` from that module — the two names are one keystroke apart on the same import line.
**Consequence:** Rendering is correct today, but performing the CLAUDE.md-mandated cleanup (importing the shared helper) turns +12.3% upside into **+1230.00%**, with nothing in typecheck or lint to catch it. A booby trap for exactly the person trying to do the right thing.
**Fix:** Delete both local helpers, import `fmtUsd` and `fmtSignedPct`, and pass the decimal ratio.

### 7.2 `TipRanksPanel` defines a third `consensusColor`
[client/src/components/TipRanksPanel.tsx:74](client/src/components/TipRanksPanel.tsx:74) — `formatters.ts:78-90`'s own header says it exists because "previously two divergent copies disagreed". They differ for labels this panel actually produces: Moderate Buy green-700 vs green-600, Hold amber-600 vs yellow-600, and **"No consensus" amber-600 vs gray-700**.
**Consequence:** The same consensus word is coloured differently on Street Coverage than on the Analysts panel one tab away, and "No consensus" is painted the neutral/hold amber — implying an opinion where there is none.
**Fix:** Delete the local arrow function and import the shared one (which already has green-700/red-700 for the Strong variants).

### 7.3 `quoteStream` never applies `fmpSymbol()`
[client/src/lib/quoteStream.ts:127](client/src/lib/quoteStream.ts:127) — `symbols.map(s => s.toLowerCase())` with no `.` → `-` mapping, and the file does not import `fmpSymbol`. CLAUDE.md gotcha 16 is explicit that every FMP-by-symbol call must use it.
**Consequence:** For BRK.B and any class ticker the live-price leg never populates; the REST snapshot silently stands in, so the failure is invisible — the same mode that previously blanked profile/quote/scorecard data for class tickers. *(I could not empirically confirm FMP's socket handling of a dotted symbol; the degradation is graceful either way.)*
**Fix:** Normalise at the store boundary — key `refCounts`/`quotes` on `fmpSymbol(symbol).toUpperCase()` inside subscribe/unsubscribe/`useLiveQuote`, importing from `lib/fmpClient`.

### 7.4 `PortfolioPage` re-implements decimal-percent formatting
[client/src/pages/PortfolioPage.tsx:7](client/src/pages/PortfolioPage.tsx:7) (duplicate inline at `PortfolioDetailPage.tsx:267-269`) — local `fmtPct` guards only `== null`, while `fmtDecimalPct` guards `!Number.isFinite`.
**Consequence:** A future change to the shared convention skips six financial columns on the Portfolios list (dividend yield, 1M/3M/1Y return, std dev, max drawdown) plus the detail header. The NaN divergence is theoretical.
**Fix:** Import `fmtDecimalPct`; replace the inline expression too.

### 7.5 `fetchSecurities` casts to `Security` without fetching `scorecard_cohort`
[client/src/lib/securities.ts:274](client/src/lib/securities.ts:274) — the SELECT omits a field the interface declares non-optional, and `as Security[]` defeats the schema-typed client CLAUDE.md relies on.
**Consequence:** Nothing visibly broken today (the only reader uses `fetchSecurityById`'s `select('*')`). But a future `s.scorecard_cohort === null` check on a list row compiles and evaluates false for every security — suppressing exactly the "cohort not chosen" signal the field's own comment says must be surfaced rather than defaulted.
**Fix:** Add the column to the SELECT, or give the fetcher a narrower return type (`SecurityListRow` / `Pick<Security, …>`).

---

## Theme 8 — Documentation that points developers (and agents) at the wrong thing

Elevated above ordinary dead code because CLAUDE.md is the operating manual for both humans and the AI committee.

### 8.1 CLAUDE.md names the wrong file as the Compliance Rules hub
`CLAUDE.md:492` *(merged: also reported against `InvestmentCommitteePage.tsx:1` and `CompliancePage.tsx:27`)*

**Wrong:** CLAUDE.md says rules live in `pages/settings/InvestmentCommitteePage.tsx`. That file's own header reads "Reference page documenting the AI investment team's roles & responsibilities … Read-only, informational" and is a static `GROUPS` array importing nothing from `lib/compliance` or `lib/firmCompliance`. The real hub is `pages/settings/CompliancePage.tsx` (routed at `App.tsx:69` `/settings/compliance`), which imports the full CRUD and renders Fiduciary / CrossPortfolio / PortfolioRules / PositionRules sections.

**Consequence:** Anyone following CLAUDE.md to change a compliance threshold — **including the AI risk manager, whose instructions require it to locate the rules it verifies** — opens a static reference page, finds no rule storage, and either edits the wrong file or concludes the hub was deleted and rebuilds CRUD elsewhere, splitting rules across two surfaces.

**Fix:** Change the path to `pages/settings/CompliancePage.tsx` (route `/settings/compliance`, backed by `lib/compliance.ts` + `lib/firmCompliance.ts`) and describe `InvestmentCommitteePage.tsx` separately as the read-only roles reference.

### 8.2 `StockScorecardPanels`' header docstring describes a retired component
[client/src/components/StockScorecardPanels.tsx:4](client/src/components/StockScorecardPanels.tsx:4) — the docstring claims two strategy blocks (Equity Income / Core Growth) with Sharpe 1Y, Sortino 1Y, PEG, sourced from `securities2` columns. The component renders one six-card grid (Operating Margin TTM, FCF Margin TTM, Revenue/EPS Growth TTM, Revenue/EPS Growth 3Y) from on-demand FMP. CLAUDE.md matches the code, not the docstring.
**Consequence:** A maintainer trusting the header will keep `AT_RISK_METRICS_BY_ASSET_CLASS.stock` — documented as mirroring this file — in sync with metrics that no longer exist here.
**Fix:** Rewrite the docstring to describe what is rendered, note the FMP-derived/never-persisted sourcing, and record the At-Risk mirror relationship.

### 8.3 `MetricCard`'s `scale` prop is required, documented, and never read
[client/src/components/MonitoringPanelShared.tsx:77](client/src/components/MonitoringPanelShared.tsx:77) — `scale: number` is declared in the props type but never destructured or referenced; `DivergingBar` (the only thing it existed to drive) is exported at `:14` with **zero importers**. Unused exports do not trip `noUnusedLocals`, which is why both survive the clean baseline.
**Consequence:** Six call sites in `StockScorecardPanels.tsx` pass `scale={0.3}`/`{0.5}` values that affect nothing, and CLAUDE.md's Component Patterns section is wrong about one of MetricCard's four documented colour inputs — so anyone tuning `scale` sees no effect and no error.
**Fix:** Delete the prop from the type and all six call sites, delete `DivergingBar` (or re-wire it), and drop `scale` from the CLAUDE.md example.

### 8.4 The AI-committee write layer has never executed
[client/src/lib/researchReports.ts:116](client/src/lib/researchReports.ts:116) (also `:143`, `riskReports.ts:92`, `:112`) — `insertResearchReport`, `softDeleteResearchReport`, `insertRiskReport`, `softDeleteRiskReport` have zero callers anywhere, including `.claude/workflows`. Consistent with CLAUDE.md's own note that the orchestrator persists the bundle — in practice via MCP SQL.
**Consequence:** The `NewResearchReport`/`NewRiskReport` normalisation (ticker uppercasing, default status) has never run, so no existing row was created through it. A contributor adding a UI write path will treat these as sanctioned and inherit untested normalisation that does not match how the rows were actually written.
**Fix:** ⚖️ Either delete the four functions and their input types, or wire the orchestrator's persistence through them so the normalisation is exercised. Either way, state explicitly in CLAUDE.md that persistence happens via MCP SQL. This is a direction decision about where the write path should live.

### 8.5 `fetchActionItemsByClient` is dead, and CLAUDE.md documents it as live
[client/src/pages/ClientDetailPage.tsx:50](client/src/pages/ClientDetailPage.tsx:50) — the page fetches the **entire** `action_items` table (with the `securities2` embed, no status filter) under an inline key `[...QUERY_KEYS.actionItems, 'all']` and filters client-side. `fetchActionItemsByClient` has no callers; CLAUDE.md `:531` claims it scopes this page "client-linked plus its portfolios' actions" — the function does neither (it filters only `linked_type='client'`).
*Partial refutation of the original finding:* the inline key is **not** an invalidation hazard — TanStack prefix-matches, so `invalidateQueries({ queryKey: QUERY_KEYS.actionItems })` does match it. The real issues are the full-table fetch, the dead fetcher, and the wrong doc. Closed items also appear alongside open ones.
**Fix:** ⚖️ Either delete the fetcher + key and correct the doc, or widen `fetchActionItemsByClient` to take the linked portfolio names and do the OR server-side. Decide separately whether closed items belong on that tab.

### 8.6 Two export cards describe columns the CSV does not contain
[client/src/pages/settings/ImportExportPage.tsx:293](client/src/pages/settings/ImportExportPage.tsx:293), `:299` — Securities promises "asset class, expense ratio" but writes id/security_id/security_name/detailed_security_type/fund_company_name/peer_group_name; Portfolios promises "risk profile, benchmark" but writes name/portfolio_strategy/created_at — and the `portfolio` table has neither column (they live on `model_portfolio_data`).
**Consequence:** Someone exporting "for reporting and backup" to build an expense-ratio or benchmark report gets neither column, and a portfolio "backup" that drops everything but three fields. Self-evident on opening the file.
**Fix:** Align the text to the payload, or add the fields (`broad_asset_class` / `expense_ratio_generic` exist; risk profile and benchmark need the `portfolio_model_map` lookup).

### 8.7 A no-op invalidation loop over an unregistered query key
[client/src/pages/settings/CompliancePage.tsx:117](client/src/pages/settings/CompliancePage.tsx:117) — `QUERY_KEYS.complianceRules(name)` has exactly two references repo-wide: the factory and this `invalidate()` call. No `useQuery` registers it. `fetchComplianceRules` and `updateComplianceRule` (`lib/compliance.ts:61`, `:78`) are orphaned exports.
**Consequence:** No runtime harm, but it reads as live cache plumbing — the next person adding a per-portfolio compliance query will assume invalidation already works.
**Fix:** Delete the loop (keeping the `allComplianceRules` invalidation), the key, and the two orphaned exports.

### 8.8 `AtRiskPage`'s METRIC_LABELS keys are all retired metric names
[client/src/pages/AtRiskPage.tsx:14](client/src/pages/AtRiskPage.tsx:14) — none of the five keys can be produced by any writer (`metricsForAssetClass` only returns `AT_RISK_METRICS_BY_ASSET_CLASS` members).
**Consequence:** No wrong output (the `?? m` fallback prints the full name), but a future metric literally named "Revenue Growth 1Y" would silently render as "Rev 1Y". *Caveat: pre-rename `at_risk` rows in the live DB could still carry these strings — I could not query it — in which case the map is still abbreviating legacy chips.*
**Fix:** Delete it and render `{m}`; if abbreviation is wanted, derive it from `AT_RISK_METRICS_BY_ASSET_CLASS`.

### 8.9 Notification preferences are localStorage-only and read by nothing
[client/src/pages/settings/NotificationsPage.tsx:80](client/src/pages/settings/NotificationsPage.tsx:80) — `pm_notification_settings` has one reference: the key declaration. No consumer for any of the six settings, in the client or the Express server. This is the exact pattern CLAUDE.md records as deleted (Firm Settings / `lib/appSettings.ts`) with an instruction not to reintroduce.
**Consequence:** Toggling "Overdue reviews" changes nothing, yet the page returns a green "Saved." and the Alert Types blurb states "Choose which events create in-app alerts" — which is false. (The Email Delivery section *does* carry an honest disclaimer; Alert Types does not.)
**Fix:** ⚖️ Move to a Supabase settings table with a real consumer, or delete the page and its route. Minimum interim: reword the Alert Types blurb to match Email Delivery's disclaimer so the UI stops asserting an effect it does not have.

### 8.10 Bulk fund import names the wrong ticker in failure messages
[client/src/lib/fundBulkUpload.ts:250](client/src/lib/fundBulkUpload.ts:250) — `records[i + j]` where `i`/`j` index the *filtered* `updateOps` array. Indexes shift exactly when a Step-2 insert batch failed. No crash possible (always in range).
**Consequence:** Diagnostic only — no wrong data written. But the banner names a fund that imported cleanly as the failure while the real culprit goes unmentioned, and since this importer maps headers straight to DB columns, a column mismatch is precisely the failure the advisor must chase.
**Fix:** Carry identity with the op — build `{ securityId, op }` objects and report `slice[j].securityId`.

### 8.11 An unlabelled analyst count under the price target
[client/src/components/AnalystCoveragePanel.tsx:170](client/src/components/AnalystCoveragePanel.tsx:170) — `{pt.numberOfAnalysts}` rendered bare in grey under the Upside/Median row.
**Consequence:** A reader cannot tell it is the count of analysts behind the consensus target — a different population from the grades head-count lower in the same card. Minor: the block above uses explicit `$` prefixes, so a lone "41" is unlikely to be read as a dollar figure.
**Fix:** `{pt.numberOfAnalysts} analyst{pt.numberOfAnalysts === 1 ? '' : 's'}`.

---

## Judgement calls — do not apply unattended

Thirteen fixes require a decision, a convention choice, or a data migration, and should not be handed to an automated fixer:

| # | Item | The decision |
|---|---|---|
| 1.1 | Performance rebalance-day | Changes every historical figure; the "matches YCharts to ~0.2%" calibration was established with the bug present and must be re-derived |
| 1.2 | Positions Target column | What `allocation_pct` vs `target_weight` mean; align vocabulary across tabs |
| 1.3 | drift_percentage units | Points vs relative; existing `positions.drift_threshold` rows may hold either — needs a data audit |
| 1.4 | Scorecard denominator | Normalise vs coverage floor; changes the basis of already-issued evidence PDFs |
| 1.5 | Category/peer return row | Relabel, or source a genuine cohort average (new data) |
| 1.6 | All Time annualization | GIPS cumulative-below-1yr vs always-annualized |
| 2.1 | Position collision | Reject vs explicit merge; if merge, both tickers need suitability rows |
| 2.3 | Actual-allocation file selection | Storage layout change over an existing bucket with existing files |
| 3.5 | `'hold'` trade action | DB CHECK migration + regenerated types, vs deriving the badge without one |
| 3.6 | Swap suitability | Who supplies `reason_code`, per-swap or per-portfolio, and whether it hard-gates |
| 3.7 | Audit Log positions | Drop the filter vs add a `log_audit` trigger (duplicate logging; retention decision) |
| 8.4 | Committee write layer | Delete vs wire the orchestrator through it |
| 8.5 / 8.9 | Client actions fetch, Notifications page | Delete the dead path vs build the real one |

---

## Honest notes on the weaker findings

Not everything above carries equal weight. In descending order of how much I would discount them:

- **8.11 (unlabelled analyst count)** — closest to taste. The surrounding figures are explicitly `$`-prefixed, so misreading is unlikely.
- **8.8 (METRIC_LABELS)** — I could not query the live DB (the Supabase connector was unavailable), so pre-rename `at_risk` rows may still make this map useful. If so, it is not dead.
- **7.3 (quoteStream `fmpSymbol`)** — a documented-convention violation; I did not empirically confirm that FMP's socket rejects a dotted symbol. The failure degrades gracefully to REST either way, so no wrong number is displayed.
- **1.9 (per-cell percent scaling)** — latent only. I found no path that feeds a percent-format file to this parser; the trap is armed solely by the code comment's promise to accept one.
- **1.8 (IG merged bands)** — the coercion is certain, the manifestation is data-dependent and unverified.
- **7.5 (`scorecard_cohort` cast)** — nothing is broken today; this is a trap set for a future reader.
- **5.4 (AddPositionModal atomicity)** — the originally-claimed failure path (CHECK constraint violation) is **not reachable**; only a transient network/RLS failure triggers it, and no data is corrupted.
- **2.6 (allocation import delete-first)** — the originally-claimed "irrecoverable loss" is overstated: the parse throws before the delete, and re-running the same file restores everything. The real window is narrow.
- **8.10 (fundBulkUpload index shift)** — diagnostic-message only; no wrong data is written or displayed.
- **3.9 (`rows_written: 0`)** — the true count survives inside the error string on the same line, so the message contradicts itself rather than hiding the number. Only `import_runs.rows_written` is flatly wrong.
- **8.6 (export descriptions)** — misleading, but self-evident the moment the CSV is opened.

Two claims in the source findings were **partially refuted** during verification and are corrected above rather than carried forward:
- **8.5** — the inline query key is *not* an invalidation hazard (TanStack prefix-matches). Only the full-table fetch, the dead fetcher and the wrong doc stand.
- **1.3** — the flag does *not* universally fail to fire: `positions.drift_threshold DEFAULT 5.0` rescues ordinary rows. The damage is confined to null-threshold rows and to rows whose threshold was seeded from the model value.

Also worth stating plainly: **3.1** is often described as breaking the fund review's upload-or-abort atomicity. It does not. The fund branch is never *entered*, so nothing is half-written — the record is simply the wrong shape. The distinction matters for how you fix it.

---

## What this audit could not see

This was a **static read of the source**. Everything below was out of scope and remains unverified:

- **Runtime behaviour.** Nothing was executed. No page was rendered, no mutation fired, no query run. Where a finding says "the flag never fires" or "the input loses focus", that is read off the code, not observed.
- **The live database.** The Supabase connector was invalidated during verification. Findings referencing `supabase/schema.sql` rest on the git mirror, which the project documents as a snapshot of a live DB that is itself the operational source of truth — they can drift. Row-level questions (how many `effective_date`s fall on trading days; whether legacy `at_risk.metrics` strings persist; which models have null IG limits; what units existing `positions.drift_threshold` rows actually hold) are **open**, and several severity estimates depend on them.
- **Live data mismatches.** FMP, YCharts and TipRanks responses were not compared against what the code expects. Endpoint shape changes, missing fields, and symbol-coverage gaps are invisible to a static read — including whether FMP's websocket in fact rejects dotted tickers (7.3).
- **Scheduled jobs.** The three `create_scheduled_task` routines, the paused YCharts refresh, and the `.claude/workflows` committee pipeline were not run. Whether the inlined agent prompts still match their `.md` counterparts was not checked line by line.
- **The AI committee's actual output.** Whether the risk manager can in practice locate the compliance rules (8.1), and whether its verdicts are sound, requires running it.
- **Anything requiring execution**: `npm run typecheck` / `npm run lint` output, the pre-commit hook, CI, the Express file server, Supabase Storage behaviour under `upsert`, and the browser's real focus/refetch timing (2.4).
- **Not attempted at all**: security/authz review (RLS is open by design and auth is unwired), performance profiling, accessibility, bundle size, and test coverage — the repo has no test suite to assess.