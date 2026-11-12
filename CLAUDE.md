# Portfolio Management — Claude Guidelines

Investment advisor tool for process documentation, regulatory audit defense, and strategic asset allocation management.

## Stack

- **Frontend:** React 18, TypeScript (strict), Vite, Tailwind CSS, TanStack Query v5, React Router v7
- **Data layer:** Supabase (PostgreSQL) via `@supabase/supabase-js`
- **Charts:** Recharts
- **Excel import/export:** `xlsx` library
- **Backend:** Express.js (health/ping only — no business logic lives here)

---

## Project Layout

```
client/src/
  pages/         Route-level page components
  components/    Shared UI components (no data fetching)
  hooks/         Custom React hooks + query key factory
  lib/           Data access layer — pure async Supabase functions, one file per domain
  types/         Shared TypeScript interfaces
supabase/        Historical SQL (archive/) + README + generated schema reference; live DB is authoritative (see DDL note)
```

The lib → hooks → components → pages layering is strict:
- **lib files** are pure async functions that call Supabase. No React, no hooks.
- **hooks** wrap lib functions in `useQuery` / `useMutation`. No JSX.
- **components** receive data via props or hooks. No direct Supabase calls.
- **pages** compose components, own routing params and top-level queries.

---

## Data Model — Critical Conventions

### `securities2` is the canonical securities table

The legacy `securities` table is retired. Always use `securities2`.

### Classifying a security (stock vs ETF vs fund)

`classifySecurity()` in `lib/securities.ts` is the **single source of truth** for stock vs ETF vs mutual fund. `getSecurityDisplayType()` (badge text) and `isFundOrEtfSecurity()` (fund-specific UI branches) both derive from it, so they can't disagree. Never re-implement the detection inline — call one of those two helpers. `detailed_security_type` wins when present; otherwise fund-only signals (peer group, fund company/family, expense ratio) classify ambiguous rows.

### Resolving a security's asset class

`resolveAssetClass()` in `lib/assetClass.ts` is the **single source of truth** for
which of the firm's asset classes a security belongs to — the same kind of
convention as `classifySecurity()` above. Never re-implement it inline.

It is **derived from the vendor `category_name`, not stored on `securities2`**, so
the rules live in git and a mapping change shows up in a PR diff. Three
classification columns exist and they disagree (FLCSX is Morningstar "Large Blend",
Lipper "Large-Cap Value Funds", YCharts "US Large Cap Value"); **`category_name` is
the chosen authority**, while `peer_group_name` and `ycharts_benchmark_category`
stay load-bearing for the peer scorecard and the `category_benchmarks` lookup
respectively. Don't repurpose them.

- **`null` is a real answer.** A security that can't be placed surfaces as
  *unclassified weight* beneath the allocation table rather than being dropped from
  the rollup — otherwise the tiers stop summing to 100% with nothing saying why.
  That row is a feature, and it is how the gap in gotcha 23 was caught.
- **The vendor vocabulary is not consistent, and two spellings of one category can
  be live at once.** `ASSET_CLASS_BY_CATEGORY` must carry every form actually
  present in `securities2`, not just the documented one — see gotcha 23.
- `ASSET_CLASS_OVERRIDES` is a per-ticker escape hatch (`BRK.B` and `TIBIX`).
  **Keep it short** — a growing list means the category map is wrong.
  - **Use it when the category is UNINFORMATIVE rather than missing or
    misspelt.** A misspelt or new spelling belongs in the map (gotcha 23); an
    override is for a fund whose category describes a MANDATE the taxonomy has
    no sleeve for. `TIBIX` (Nov 2026) carries Morningstar's "Global Moderately
    Aggressive Allocation", and mapping that CATEGORY would be false in
    general — a global allocation fund is typically about half US, so the next
    one to arrive would be silently mis-filed with no warning, because the
    category would now resolve. TIBIX itself is atypical for it: 90.6%
    developed-market exposure against a 24.4% US region total, so ~66% non-US
    developed, and a Lipper peer group of "Global Equity Income Funds".
  - **An override SILENCES the import warning for its own ticker and for no
    other** — see `unplacedCategories` below. That property is what makes the
    list safe to use rather than a way of hiding gaps.
- **Known gap, and the remedy this bullet used to name DOES NOT EXIST for a
  stock.** It said a ticker-created security resolves to `null` "until a YCharts
  workbook import fills `category_name`". Traced Nov 2026: **nothing has written
  a stock's category since Sep 2026, and nothing can.**
  - A stock's `category_name` — and its near-twin `equity_style_internal` —
    came from the **per-ticker YCharts security template**, via
    `securities2ExcelUpload.ts`. That file was **deleted in `0f50b03`** ("six
    import cards become two") together with the two single-security cards. Both
    columns were in its `TEXT_COLS` and neither was in its `SKIP` set.
  - **The workbook's `Securities` sheet is funds only**, so it cannot stand in:
    the last import wrote exactly **46** rows and `securities2` holds exactly
    **46** funds. Every fund row was updated by it; no stock row was.
  - **FMP supplies no Morningstar category.** `createSecurityBySymbol` inserts
    `{ security_id }` and calls `refreshSecurityFromFMP`, which writes six
    columns — name, sector, industry, description and the two earnings dates.
    Category is not among them.
  - **It has not bitten yet only because no stock has been created since.** The
    four securities added after the deletion (VBTLX, VMSAX, VVIAX, VIGAX) are
    all mutual funds and were filled by the workbook.
  - **CLOSED Nov 2026: a stock's category is now set BY HAND on its page.**
    `setSecurityCategory` in `lib/securities.ts` is the only writer that
    exists, and the control is the `Category` cell in the stock header.
    - **A fixed list, never a text box** (`STOCK_CATEGORY_OPTIONS`). The
      failure being closed is a `category_name` the map cannot place; free
      text would let a typo, or a fund-side spelling like "Large Blend" on a
      stock, recreate it one keystroke at a time and silently.
      `assetClass.test.ts` asserts **every option resolves** and that each uses
      the stock grid — the `*_OPTIONS ⊆ CHECK` discipline applied to a
      vocabulary rather than a constraint.
    - **Stocks only.** A fund's category comes from the workbook, so a
      hand-edit would be overwritten by the next import without warning. The
      fund page has its own layout and never renders this cell.
    - **Unset is amber and says "excluded from allocation"**, because an
      unclassified stock leaves the rollup and nothing else on that page would
      show it. The save error is rendered, never swallowed — the
      benchmark-picker lesson, for the same reason: this is a governed value
      the allocation tables read.
    - **This IS audited** (Nov 2026). `securities2` joined the `log_audit`
      tables the day after this shipped, conditionally: `category_name` is one
      of the seven decision columns whose change writes an `audit_log` row, so
      a hand-set classification now leaves a trail with its old and new value.
      See Audit & Governance surfaces. (`model_portfolio_data` still has no
      trigger — that caveat stands for it.)
- **`equity_style_internal` is the stock vocabulary's dead twin.** 42 of the 43
  stocks carrying it hold a value identical to `category_name`, 12 stocks have
  a category and no style at all, and **META disagrees with itself** —
  `category_name = 'Large Cap Growth'` against `equity_style_internal =
  'Large Cap Core'`, which are different sleeves. `resolveAssetClass` reads
  `category_name`, so the category wins; the style column is read only as a
  display fallback on `SecurityDetailPage`. Do not start reading it.
- **A new vendor spelling is now reported AT THE IMPORT**, which is where one
  arrives (Nov 2026). `unmappedCategories(categories)` lives beside the map,
  `fundBulkUpload` runs the workbook's categories through it, and the import
  banner names any the map cannot place. It is returned as its own field, **not
  in `errors`** — the row writes fine, so folding it into errors would mark a
  clean import partial and push a false failure into `import_runs`.
  - **There are TWO probes and they answer different questions.**
    `unmappedCategories` asks whether a VOCABULARY is known and probes with a
    **synthetic ticker**, so a per-ticker override cannot speak for a whole
    category and let the next security carrying it fall through — right for
    auditing the map, which is what `asset-class-coverage.ts` does.
    `unplacedCategories` asks whether any SECURITY was left unclassified, by
    resolving each one on its own id — **right for the import warning**, which
    is a claim about the book rather than about the map. The importer uses the
    second.
    - **Mixing them up is a standing false alarm.** TIBIX is placed by
      override, so nothing is unclassified, yet the synthetic probe still
      calls its category unmapped — on the vocabulary probe the import would
      have raised a high-priority action every morning over a book with no gap
      in it.
    - **The per-security question keeps what the synthetic one protected.**
      A new fund in TIBIX's category has no override of its own, so it is
      unplaced and still reported — which is right, because somebody has to
      look at its composition too. The original danger was using ONE real
      ticker as a sample for a whole category; asking about every security
      individually is strictly stronger.
  - **A MISSING category is not an unmapped one** and is deliberately not
    reported — that is the FMP-created security above, a different problem, and
    warning on it would cry wolf on every new ticker.
  - **`assetClass.test.ts` pins the 23 categories the live book actually uses**,
    so dropping either emerging-market spelling or `Multisector Bond` now fails
    the suite. That assertion is the one that would have caught the VMSAX case.
  - **`scripts/audit/asset-class-coverage.ts`** answers the same question across
    the whole book on demand (`npx vite-node scripts/audit/asset-class-coverage.ts`),
    calling the same helper so the script and the importer cannot disagree. On
    5 Nov 2026 every held security resolved, and all 23 categories in
    `securities2` — held or not — were mapped.

### Two identifiers — use the right one for the right purpose

| Field | Type | Purpose |
|---|---|---|
| `securities2.security_id` | `TEXT` (primary key) | Ticker symbol — `"AAPL"`, `"VFIAX"`. FK target for most child tables. |
| `securities2.id` | `BIGINT` (surrogate) | Integer row id. Used only for URL routing and loading the security detail record itself. |

**URL routing uses the numeric `id`:** `/security/:securityId` where the param is parsed as an integer via `parseInt`. The `useSecurityDetail(id: number)` hook takes this integer.

**All FK columns in child tables use the text `security_id`:**

| Table | Column | Type |
|---|---|---|
| `at_risk` | `security_id` | `TEXT → securities2.security_id` (held securities flagged for replacement) |
| `prospects` | `security_id` | `TEXT → securities2.security_id` (buy-candidate watchlist) |
| `review_schedules` | `security_id` | `TEXT → securities2.security_id` |
| `review_log` | `security_id` | `TEXT → securities2.security_id` |
| `action_items` | `security_id` | `TEXT → securities2.security_id` (nullable) |
| `alert_events` | `security_id` | `TEXT → securities2.security_id` |
| `communication_log` | `security_id` | `TEXT → securities2.security_id` (nullable) |
| `substitutions` | `incumbent_security_id`, `proposed_security_id` | `TEXT → securities2.security_id` |
| `positions` | `security_id` | `TEXT → securities2.security_id` (current target allocation) |
| `portfolio_allocations` | `security_id` | `TEXT` — **no DB FK** (stages import symbols not yet in securities2); dated allocation snapshots |
| `holdings_change_log` | `security_id` | `TEXT → securities2.security_id` (the **`positions` audit trail**, written by a trigger — see Audit & Governance surfaces) |
| `security_related_securities` | `security_id` | `TEXT → securities2.security_id` |

When querying any of these tables by security, pass `security.security_id` (the text ticker), not `security.id`.

### Model portfolio resolution

All portfolios resolve their model through a single lookup chain:

```
security_id → portfolio_model_map → model_portfolio_id → model_portfolio_data
```

`portfolio_model_map` is the authoritative mapping for all portfolio types. Never bypass it with hardcoded portfolio IDs.

### Soft deletes

Records in `action_items` (and several other tables) use soft deletes — `deleted_at` timestamp, never hard `DELETE`. Always filter `is('deleted_at', null)` when querying. Similarly `removed_at` on `at_risk` and `prospects`.

### At-Risk vs Watchlist — two distinct lists

These are different features and **must not be conflated**:

- **At-Risk** (`at_risk` table, `lib/atRisk.ts`, `/at-risk`, nav "At-Risk") — **held** securities flagged for monitoring and possible **replacement**: deteriorated scorecard metrics (`metrics[]`), an auto-expiry sell timer (`removal_date`), and proposed `substitutions` (incumbent→replacement swaps). This is the *renamed* original "watchlist" — the table, the `substitutions.at_risk_id` FK (was `watchlist_id`), the audit trigger, and all code identifiers (`fetchActiveAtRisk`, `addToAtRisk`, `QUERY_KEYS.atRisk`) were renamed. Funds reach it via the review modal's "At-Risk" outcome (stored `review_log.outcome = 'placed_on_watchlist'`, kept as-is; label is "Flagged At-Risk").
- **Watchlist** (`prospects` + `prospect_portfolios`, `lib/prospects.ts`, `/watchlist`, nav "Watchlist") — an **idea list**: tickers being **considered for purchase** (not held). No metrics, no sell timer, no substitutions. Added from the security detail header ("+ Watchlist", `AddProspectModal`) or the page.
  - **The Add modal takes SEVERAL tickers at once** (Nov 2026). Ideas arrive as
    a LIST — a screen, a fund family's line-up, a column out of a research note
    — and adding them one modal at a time meant re-choosing portfolios for each.
    Tickers become chips; `lib/tickerList.ts` (pure, tested) owns what counts as
    one.
    - **`parseTickerList` splits on commas, semicolons and ANY whitespace**, so
      a pasted spreadsheet column works. It de-duplicates case-insensitively,
      keeps first-seen order (the advisor's order may mean something), and
      **reports rejects rather than dropping them** — a paste that silently
      loses two of eight rows is invisible until somebody notices the idea was
      never recorded. It cannot tell a SHORT WORD from a ticker and does not
      pretend to: `ALL`, `ON` and `BUY` are all real symbols and `ALL` is held
      here. The chips are shown before anything is written, so a wrong one
      costs a click.
    - **The batch seeds cohorts ONCE, not once per ticker.** `addProspect`
      splits into `writeProspect` (the write) plus one `seedScorecardCohorts`
      call; `addProspects` loops the first and seeds the whole batch at the
      end, over only the tickers that actually landed. Per-ticker made a
      ten-ticker paste do ten selects and ten updates where one of each does,
      and `seedScorecardCohorts` has always taken a list.
    - **`addProspects` is per-ticker, never all-or-nothing**, and SEQUENTIAL.
      Failing eight because the fifth errored throws away seven good ideas;
      and two concurrent adds of one symbol would both see no existing row,
      so the partial unique index would reject one with an error the advisor
      cannot act on. Failures stay on screen as chips, so pressing the button
      again retries exactly those — safe, because `addProspect` merges.
    - **In a mixed batch the portfolio selection belongs to the STOCKS**, and
      the modal says which ones by name. A fund is identified by its category,
      so it is passed no portfolios whatever is ticked.
    - It carries the same **empty-row** gate as the Watchlist page: a
      `securities2` row with no classification signal falls through to FMP,
      or three funds get a portfolio picker.
  - **One row per ticker, portfolios attached through `prospect_portfolios`** (Oct 2026). `prospects.target_portfolio` used to put the portfolio *in the idea's identity*, so one ticker under three portfolios was three rows and three cards, and an idea you had not placed yet could not be recorded at all. A partial unique index `(security_id) WHERE removed_at IS NULL` keeps one live idea per ticker; removed rows are exempt so a ticker can be watched, dropped and watched again. **Re-adding a watched ticker merges** — `addProspect` attaches the new portfolios to the open idea rather than failing on the index. **Zero portfolios is valid.**
  - **`security_id` has no FK** — watching a ticker you do not own is the normal case, so `securities2` is resolved through a separate lookup and is often null. Identity and asset type for those come from **FMP `/profile` (`companyName`, `isEtf`, `isFund`)**, because the `securities2` classifier has no columns to read and would call every unheld idea a stock.
  - **`fetchProfile` NEVER RETURNS NULL, and that hid a real defect.** On an
    empty FMP response it builds a zero-valued `Profile`, so "FMP has no record"
    and "FMP says this is a stock" both arrive as `isEtf: false, isFund: false`.
    `Profile.found` now separates them. Without it, RSIYX (Victory RS Investors
    Fund Y) was filed on the watchlist as a STOCK — given a portfolio picker, an
    "Awaiting committee" badge for research that was never coming, and a place
    in the Stocks column. **FMP covers US stocks comprehensively but misses 11
    of this book's 27 mutual funds**, all institutional share classes, so a
    ticker it has never heard of is far more likely a fund than an unindexed
    company. `getProspectDisplayType` reads `found === false` as a fund.
    - **YCharts owns the answer; FMP is the stopgap.** Once the ticker reaches
      `securities2` **with something in it**, the classifier reads that and
      never consults FMP again. The window only matters before the next refresh
      — except for a STOCK, where it is permanent, because the workbook's
      Securities sheet is funds-only and a stock idea never gets a
      `securities2` row at all.
    - **AN EMPTY ROW IS NOT AN ANSWER, and a row no longer proves YCharts has
      classified anything** (Nov 2026). The watchlist sync creates the row as
      soon as the macro adds the ticker to column B, so for one refresh cycle
      it exists with every YCP formula unfilled. `classifySecurity`'s final
      `return 'stock'` is a DEFAULT for an ambiguous row, not a finding about
      an empty one — so handing it back as authoritative put **ARMIX, DFALX
      and TDADX (ids 161-163, nothing else) in the Stocks column**, with a
      portfolio picker and an "Awaiting committee" badge for research that was
      never coming. The RSIYX defect, re-entered through a different door.
      `hasClassificationSignal` is the gate: no signal, fall through to FMP,
      exactly as a missing row already did. `WatchlistPage` must also ASK FMP
      about those symbols — a fallback with nothing to fall back to is no fix.
    - **`undefined` and `null` are different and callers must not collapse
      them**: not-asked-yet versus asked-and-empty. `WatchlistPage` was doing
      `?? null` and the Add modal `profile ?? null`; both now pass the tri-state
      through, and the modal shows "Checking whether this is a stock or a
      fund…" rather than guessing in a form being filled in.
    - **Two classifiers with opposite defaults is how this happened.**
      `watchlist-tickers.cjs` had always treated an empty profile as a fund
      while `getProspectDisplayType` treated it as a stock, each documented as
      deliberate, written hours apart on the same day. `prospectType.test.ts`
      asserted the wrong one and defended the bug.
  - **A WATCHED FUND NOW REACHES THE WORKBOOK BY ITSELF** (Nov 2026). A fund's
    columns come from the YCharts workbook, so adding one to the watchlist used
    to populate nothing until someone remembered to type the ticker into the
    `Securities` sheet and wait for a refresh — an idea could sit for weeks with
    no category, no cohort and no scorecard, which is every measure a fund is
    judged by. `refresh.sh` now writes `inbox/WATCHLIST.txt` (via
    `scripts/refresh/watchlist-tickers.cjs`) and the macro's
    `SyncWatchlistTickers` reconciles it into column B before the fetch, so the
    fund is in `securities2` the next morning. **The sheet already had the
    machinery, and it GROWS** — a row pre-wired with `=YCP($B<row>, <col>$2)`
    populates 82 columns from one string, and `fundBulkUpload` needs no change.
    The 53 spare rows it shipped with were just where someone stopped filling
    formulas down, so `EnsureFundRow` copies the last row down when they run
    out: **there is no cap on how many funds the watchlist can carry.**
    `MAX_FUND_ROW` (1,000) guards a defect, not the product. A wired row with
    no ticker returns empty rather than an error, so spare rows cost nothing
    until used. Full rules in
    `scripts/refresh/README.md`; three worth knowing here: **the roster is held
    ∪ watched** (so a watched-then-bought fund is never released while it is
    owned), **stocks are excluded** (the sheet is funds-only), and **the macro
    clears only rows it added**, remembered in `Control!B`. A consequence:
    `securities2` no longer equals the held fund set, the way it no longer
    equals the held stock set.
  - **A card opens `/research/:ticker`** — the on-demand research page, which runs on a bare ticker. `ResearchPage` is **stock-only** (its scorecard is margins/growth, which FMP does not serve for funds), so an ETF/fund idea opens its `securities2` detail page instead when it has one. Do not point a stock idea at `/security/:id`: that is the held-security surface (positions, review schedule, documents, at-risk).
  - **STOCKS ARE CARDS; FUNDS ARE ONE TABLE GROUPED BY ASSET CLASS** (Nov 2026).
    The page used to be three card columns — Stocks, ETFs, Mutual Funds — and
    **the vehicle split answered a question nobody asks of an idea list.** FELC
    is an ETF and ICAFX is a mutual fund; both are Large Blend, both compete
    for the same sleeve, and they sat in different columns where no comparison
    between them was possible. Funds are now one table whose groups are the
    firm's fourteen `ASSET_CLASS_ROWS`, and the vehicle survives as a column.
    - **The grouping IS `resolveAssetClass`**, never a vocabulary of its own —
      the same single-source rule as everywhere else. `lib/watchlistGroups.ts`
      is pure and tested; `components/WatchlistFundTable.tsx` only renders.
    - **Stocks keep their cards deliberately.** A card carries bear/base/bull
      targets, a buy-below with its gap to today's price, and the AI Research
      drawer; a row holds none of that, and forcing one layout on both would
      have cost the stock side most of its page.
    - **All fourteen classes render, empty ones greyed.** "Nothing good is
      available" and "nobody has looked" are different states of an idea list,
      and only one is visible if the row is dropped. Six of fourteen were
      populated on 9 Nov 2026.
    - **US Large Cap is the ONLY nested group** (Blend / Growth / Value),
      because the taxonomy splits large cap three ways and nothing else.
    - **"Unclassified" and "Awaiting YCharts data" are SEPARATE groups** — the
      `UnpricedReason` split. A fund with **no `category_name`** resolves
      itself on the next refresh; one whose category the map cannot place stays
      broken until somebody edits `ASSET_CLASS_BY_CATEGORY`.
      - **The test is the CATEGORY, not whether a `securities2` row exists.**
        It was the latter until Nov 2026, which assumed a row implies the
        workbook has filled it — the same assumption the watchlist sync broke
        above. Keying on the category asks the question the two groups actually
        differ on (does this clear by itself overnight, or is somebody waiting
        on a map edit) and gives the same answer as before for a fund with no
        row at all. It is the **missing vs unmapped** distinction the import
        warning already draws, applied to the grouping.
      - **`toFundRow` takes the resolved display type rather than re-deriving
        it.** An empty row answers `Stock`, which would contradict the decision
        that put the row in the fund table in the first place.
    - **Rows rank by score, then cost, then ticker**, with an UNSCORED fund
      last rather than as a zero — unscored means the workbook has not filled
      it, not that it scored nothing. The score is computed in the fund's
      **designated** cohort via `designatedCohort`, so the watchlist and the
      review cannot show one fund two numbers; a defaulted cohort is marked
      with a dagger rather than presented as a decision somebody made.
    - **`fetchActiveProspects` selects `securities2.*`.** The scorecard
      reads ~20 rank/size/value columns decided in `fundScorecard.ts`, and a
      column list in `prospects.ts` would be a second copy of that metric set
      — silently wrong the day a metric is added, and failing as a COLUMN OF
      DASHES rather than an error. That is exactly what the first run showed.
    - **`fetchActiveProspectsLite` is for everyone else** (Nov 2026). That `*`
      is **43x the payload** — measured at **154,559 bytes against 3,625** for
      the same 29 rows — and it had three callers: the Watchlist's fund table
      (which needs it), the dashboard (which renders a COUNT) and the annual
      review's alternatives panel (which reads four fields). The dashboard is
      usually the first page loaded, so it paid 151 KB of scorecard metrics to
      print the number of ideas.
      - **Its query key is a CHILD of `QUERY_KEYS.prospects`** (`['prospects',
        'lite']`), because TanStack matches by prefix — so every existing
        `invalidateQueries({ queryKey: QUERY_KEYS.prospects })` clears both. A
        sibling key would have left one stale after an add or a remove, which
        shows up as a count that will not move.
      - **The column set is NOT a parameter.** The schema-typed client only
        checks `.select()` names when the argument is a single string literal,
        so passing it in returns `GenericStringError[]` and silently gives up
        the check that turns a dropped column into a `tsc` failure instead of a
        runtime 400. The two fetches share the prospect, link and holdings
        queries and each writes its own literal select.
      - `ProspectIdeaLite` is the MINIMUM shape and `ProspectIdea` satisfies it
        structurally, so a consumer typed on the lite shape takes either.
    - **An idea the firm ALREADY HOLDS is marked `Held`** (Nov 2026), on the
      fund table and on the stock cards, naming the books on hover. A watchlist
      is a list of tickers being considered for PURCHASE, so a holding is the
      one row the page's own subtitle does not describe — and **VBTLX is live**:
      watched, and held in three Foundation books, rendered identically to a
      fund nobody owns. `heldIn` comes from one `positions` query inside
      `loadProspectCore`, not `fetchPortfoliosHoldingSecurity` per ticker, and
      is carried on a PENDING row too: a purchase and a YCharts refresh are
      different events, so a fund can be bought before the workbook reaches it.
  - **`prospects.thesis`, `.conviction` and `.target_price` were DROPPED** (Nov 2026). They were stock-only fields from before the AI research stage: the hand-typed thesis and conviction went when the committee took over, and the target price left the Add form in Oct 2026 (a price you mean to pay is a sizing decision belonging to the candidate stage).
    - **This is the exception to keeping a dead column with its values** — the convention that preserved `model_portfolio_data.review_frequency` and `holding_reviews.proposed_*`. That convention protects DATA, and measured on the only denominator that counts (stock ideas, since funds were never meant to carry them) there was none: **7 stock ideas ever recorded, 1 target price, 0 convictions, 0 theses** — and the one value was `3` on LRCX, a stock trading around $220. A stray keystroke from the day the field was removed, recorded in full in the migration before it went.
    - What keeping them cost was interpretive: a reader sees `prospects.thesis` and reasonably concludes the watchlist stores a thesis, so this document had to spend a sentence saying it does not. A column that exists only to be explained away is the same shape as the documented-but-untrue claims the Nov 2026 audit kept finding.
    - The displayed thesis/rating/conviction come from `research_reports`, filtered to the portfolios the idea names plus any unscoped report — and since `watchlist-research` now always writes unscoped, new research shows on every card regardless of the books an idea names.
  - **Removing an idea DETACHES its portfolios** (Nov 2026). A
    `prospect_portfolios` row answers "which books is this being considered
    for", so once the idea is dropped the answer is none — and every reader
    already filters to active ideas, so a link under a removed row could not be
    read even deliberately. Left behind they accumulate: two of nine were
    stranded under ideas dropped in July and October.
    - **It loses no unique record, which is the test that mattered before
      writing it.** The "considered for X" fact survives in the committee's own
      deliverables — `ic_memos`, `research_reports` and `security_additions` all
      carry `portfolio_name` for both stranded tickers — and the removal is in
      `audit_log` via `audit_prospects`. `prospect_portfolios` carries no audit
      trigger of its own, so it was never serving as the record.
    - **The idea is retired FIRST, then the links.** A failure after the first
      step leaves exactly the state this cleans up, which is harmless; the other
      order would, on a failure, strip the portfolios off an idea that is still
      live — silently losing something the advisor chose.
    - Re-watching a dropped ticker still starts with no portfolios: it is a new
      idea and a new row, and the Add modal asks again.
  - **The Add-to-watchlist portfolio picker hides derived blends** (`DERIVED_BLEND_PORTFOLIOS` in `AddProspectModal`). Equity Income & Core Growth is a computed 50/50 of the two books it names, so a stock enters it only by being bought in one of them; offering it would invite an idea no book can act on.

`substitutions.at_risk_id` is a `BIGINT → at_risk.id` FK (not a `security_id`).

---

## Supabase Patterns

### All queries go through the singleton

```ts
import { supabase } from '@/lib/supabase'
```

Never instantiate a new client.

### The client is schema-typed

`supabase.ts` uses `createClient<Database>` with `Database` generated from the live
schema in `client/src/types/database.types.ts`. This means **column/table names in
`.select()` / `.eq()` / `.insert()` are type-checked** — a select naming a dropped or
mistyped column (incl. inside an embed) now fails `tsc`/CI instead of 400ing at
runtime. Regenerate the types after any schema change (Supabase MCP
`generate_typescript_types`, or `supabase gen types typescript --project-id … >
client/src/types/database.types.ts`).

DB text columns surface as `string`, so where a domain type narrows to a union/enum
(e.g. `priority`, `cadence`, `outcome`) the lib fn casts the *result* at the return
boundary (`as DomainType[]`) — the column names stay checked. Genuinely dynamic table
names (the benchmark/ychart bulk uploaders) opt out locally via `supabase as
SupabaseClient`; don't spread that pattern to static-table code.

### Always destructure and handle the error

```ts
const { data, error } = await supabase.from('at_risk').select('*')
if (error) throw error
return data ?? []
```

Never silently swallow or ignore `error`.

### `maybeSingle()` vs `single()`

- `maybeSingle()` — returns `null` when no row found. Use for lookups that might not exist.
- `single()` — throws when no row found. Use only when absence is a bug.

### TanStack Query exclusively for server state

No raw Supabase calls in components or pages. All queries go through `useQuery` / `useMutation` with query functions in `lib/`.

### Cache keys are centralized

All query keys live in `hooks/queryKeys.ts`. Add new keys there, never inline. To bust stale cached data after a schema change, add a version suffix: `['benchmarks', 'v3']`.

### Invalidate related keys after mutations

```ts
const queryClient = useQueryClient()
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk })
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRiskBySecurity(security.security_id) })
}
```

### DDL vs DML via Supabase MCP

- Schema changes (CREATE, ALTER, DROP): use `apply_migration` — runs in a transaction and is tracked.
- Read queries: use `execute_sql`.
- Never use `execute_sql` for DDL.
- **`supabase/archive/` is excluded from search by the repo-root `.ignore`.** 32
  non-authoritative pre-MCP scripts that were making greps lie — the Nov 2026
  audit cleared dead `portfolio` columns as "referenced" when their only mentions
  were in archived DDL. `.ignore` binds ripgrep and the tools built on it; git
  ignores the file, so the scripts stay committed. `rg --no-ignore` to search them.
- **The live DB is the operational source of truth, tracked by the remote MCP migration history.** It is **mirrored into git** by `supabase/schema.sql` — the full, reproducible schema snapshot (generated by `npx supabase db dump -f supabase/schema.sql`, which needs Docker running + the linked CLI). **After any schema change, regenerate BOTH `supabase/schema.sql` and `client/src/types/database.types.ts`** so a fresh environment can be rebuilt from git and the types stay in sync. The `supabase/archive/` `.sql` files are historical, non-authoritative reference only (pre-MCP hand-written scripts); see `supabase/README.md`.

### RLS is enabled

Row Level Security is on for all tables with open `USING (true)` policies for `anon` and `authenticated`. Auth is not yet wired — this is infrastructure-ready. Do not disable RLS.

---

## TypeScript Conventions

### Dynamic key access on typed objects

When you need to access a typed object with a dynamic string key (e.g., model portfolio asset class fields), use the double cast to make the intent explicit:

```ts
// ✅ correct — makes unsafe access intentional
const mp = modelPortfolio as unknown as Record<string, unknown>
const target = mp[`${key}_target`] as number | null

// ❌ wrong — TypeScript rejects the direct cast
const mp = modelPortfolio as Record<string, unknown>
```

### Display formatting

Use helpers from `lib/formatters` — never format inline:

```ts
import { fmtDecimalPct, fmtNum, fmtInt, fmtUsd, fmtSignedPct, fmtUtcLongDate, EMPTY } from '@/lib/formatters'

fmtDecimalPct(value)   // 0.0831 → "8.31%"
fmtNum(value)          // 1.234 → "1.23"
fmtInt(value)          // 42.7 → "43"
fmtUsd(value)          // 1234.5 → "$1,234.50"
fmtSignedPct(value)    // 0.0123 → "+1.23%"  (decimal-stored, always signed)
fmtUtcLongDate(value)  // '2027-02-11T00:00:00Z' → "February 11, 2027"  (see gotcha 24)
EMPTY                  // '—' — use for null/missing display values
```

`lib/formatters` also exports `stripTotalReturn(name)` and **`consensusColor(label)`** — the shared helper for analyst-consensus text colors, read by `AnalystSummaryCards` and `TipRanksPanel`. **`sharedHelpers.test.ts` now enforces that nobody re-implements it**, or `fmtUsdCompact`: both had been quietly duplicated and each copy drifted (`TipRanksPanel` returned the strong shade for any label containing "Buy", flattening "Moderate Buy" into "Strong Buy"; two components grew a money ladder whose last two branches were identical, printing a $400k figure as "$0.40M" and $3.2T as "$3200.00B"). A convention in this document did not stop either; the test names the helper to import rather than only saying no. Other cross-cutting shared helpers: **`mapSecurityJoin(row)`** in `lib/securityJoin.ts` (flattens an embedded `securities2(id, security_id, security_name)` join onto a row — **only `lib/actionItems.ts` imports it today**, though the alerts, comm-log and review-schedule fetchers each hand-roll the same flatten and would be the natural second callers); shared UI primitives **`DetailPageState`** (loading/error/not-found scaffold for detail pages) and **`RangeBar`** (analyst range bar) in `components/`.

### No `any`

Use `unknown` with type guards or explicit casts. `any` bypasses all type checking and hides real bugs.

### Null guards before navigation

When navigating with a potentially-null value, always guard:

```ts
// ✅
onClick={() => { if (id != null) navigate(`/security/${id}`) }}

// ❌ navigates to "/security/null"
onClick={() => navigate(`/security/${id}`)}
```

---

## Code Quality Gates — run before every change

**A green browser preview is NOT proof a change is correct.** The Vite dev server (esbuild) **strips types without checking them**, and there is no CI or pre-commit hook. So a change can render perfectly in the browser while introducing type errors, unused-variable errors, or `any` violations that stay invisible until `npm run build` (which runs `tsc -b`) fails. These accumulate silently — the repo has reached a backlog precisely because "it worked in the browser" was treated as done.

`tsconfig.json` is strict: `strict`, `noUnusedLocals`, `noUnusedParameters` are all on — so a leftover import or unused variable is a hard **compile error** (not a warning) that breaks the production build. Refactors are the usual culprit: remove the last use of something and you must remove its import/declaration too.

### Definition of done for ANY code change — agents included

Before declaring a task complete, run both and reach **zero new problems in the files you touched**:

```bash
npm run typecheck   # tsc --noEmit — type errors + unused locals/params
npm run lint        # eslint .    — no-explicit-any, unused vars, hook deps, fast-refresh
```

- **Agents must run these explicitly.** You cannot rely on the preview (esbuild skips type errors) or on a human catching it later. Verifying behavior in the running app and verifying type/lint cleanliness are *two separate steps* — do both.
- **Never add to the error count.** Pre-existing errors elsewhere are not yours to fix in passing, but your diff must not introduce a single new `error TS…` or ESLint error. Grep the output for the files you changed to confirm.
- **No `any`** — it's lint-enforced; use `unknown` + a type guard or an explicit cast (see "No `any`" above).
- **Clean up as you go** — if a refactor orphans an import/variable, delete it in the same change; `typecheck` will flag it if you forget.

### Tests — Vitest, over the pure `lib/` layer only

```bash
npm run test          # vitest run   — from the root or the client workspace
npm run test:watch    # client only
```

**25+ test modules** (`npm run test` prints the exact counts — it was 147 cases
over 11 modules when this began), added Nov 2026 as audit §20. The repo had no
runner and no test file at all until then, while ~1,700 lines of React-free
business logic in `lib/` encoded the rules the tool rests on — verified only by
driving a browser. Three defects the audit found (§3 band rounding, §11
`$0.40M`, §13 the pre-earnings dedupe) were the kind a unit test catches at
write time.

- **Scope is deliberate: `src/lib/*.ts` and nothing else.** No component tests,
  no E2E, no DOM. The strict `lib → hooks → components → pages` layering above
  is what makes this possible — lib is pure by rule, so it needs no harness, and
  that is where the value is concentrated. Don't add a component-testing library
  without a reason the pure layer cannot serve.
- **Tests live in `src/lib/__tests__/<module>.test.ts`** and are covered by the
  same `tsc` and ESLint gates as the app (they are under `src`), so a sloppy
  fixture is a build error, not a silent pass.
- **Test the RULE, not the implementation.** Nearly every case here is traceable
  to a documented gotcha or a real past defect, and says so in a comment. A test
  that merely restates the code it covers costs maintenance and buys nothing.
- **`vitest.config.ts` pins two things, both load-bearing:**
  - **`TZ: 'America/New_York'`** — gotcha 24 (a `timestamptz` holding a calendar
    DATE rendering a day early) can only reproduce *west* of Greenwich, so on
    CI's UTC box those tests would pass without exercising the bug. The config's
    TZ beats the shell's, so `TZ=UTC npm test` still runs them properly. A
    harness self-check in `reviewSchedules.test.ts` asserts the zone, so the
    pin cannot be dropped silently.
  - **Placeholder Supabase/FMP env vars** — `lib/supabase.ts` THROWS at module
    load when its two vars are missing, so importing any lib that happens to
    also hold a data-access function would fail before a pure function ran. They
    point nowhere; no test performs I/O.
- **`schemaContract.test.ts` asserts the code still agrees with the DATABASE**,
  by reading `supabase/schema.sql` — which CI already forces to stay current, so
  it is an offline copy of what the live DB will accept. No connection, no
  Docker, no credentials. Three rules, and the first two point in opposite
  directions deliberately:
  - **`*_OPTIONS` ⊆ CHECK** — every value the UI can WRITE must be one the DB
    accepts, or the save 400s at runtime.
  - **`*_LABELS` ⊇ CHECK** — every value the DB can HOLD must have a label, or a
    stored row renders blank. An OPTIONS list NARROWER than its CHECK is
    legitimate and common: a retired value stays permitted so old rows keep
    their meaning while the way to record a new one is gone
    (`review_log.outcome` is the standing example), which is why equality is the
    wrong assertion in both directions.
  - **A numeric guard matches the constraint it stands in for** —
    `isStorablePositionWeight` against `positions_allocation_pct_check`. That
    pairing is why the file exists: `positions.allocation_pct` is constrained
    0–100 and `portfolio_allocations.weight` is not constrained at all, so the
    History grid could hold a weight Positions would reject.
  - It also asserts that each **partial unique index that encodes a documented
    rule still exists** (the pre/post-brief dedupes, one draft + one current
    thesis, one live watchlist idea per ticker, …) — dropping one silently
    re-opens the defect it was added for.
  - **A bare TS union with no runtime list is locked three ways** via the
    `Exhaustive<>` helper: `tsc` fails if the UNION drifts from the literal, and
    the test fails if the DATABASE does. Covers `Rating`, `ReportType`,
    `ThesisStatus` and `ImportSource`.
  - **It is NOT a substitute for integration tests against a real Postgres** —
    those would also cover FKs, RLS and PostgREST behaviour. This is the cheap
    half, and it closes the one failure this repo keeps repeating: a constraint
    and the code meant to mirror it drifting apart with nothing noticing.
- **The suite is wired into both gates** — the pre-commit hook and CI run it
  alongside typecheck and lint.
- **`quarterlyBrief.test.ts` carries the one test that is a safety property, not
  a correctness one:** every held-back field in the fixture is tagged with a
  sentinel string, and one assertion over the serialized brief proves none of it
  leaks. That brief is shaped to be handed to a client, so a field added to
  `ResearchReport` later must not quietly ride along. It asserts the sentinel is
  *present in the input* first, so it cannot pass vacuously.

### `optimizeDeps.include` is a correctness setting, not a speed one

`client/vite.config.ts` lists every external dependency. **Every route is
`lazy()`**, so Vite's first optimize pass — which crawls from the entry — cannot
see `recharts`, `xlsx` or `jspdf`. They are discovered when a lazy page first
loads, which triggers a SECOND optimize pass and a new browser hash while the
page already holds React from the first. Two React instances in one tree, and
the symptom is:

```
Invalid hook call … (3) You might have more than one copy of React
TypeError: null is not an object (evaluating 'dispatcher.useContext')
```

reported at the **first hook of whatever mounted** — `Layout` on one load,
`PortfolioDetailPage` on the next. The named file is never the cause, which is
what makes it so misleading.

- **It only bites on a COLD dep cache**, which is why it looks random: it
  reappears after a dependency install or a change to `vite.config.ts`, and not
  otherwise. It struck twice in Nov 2026, and the first diagnosis — a transient
  that a restart would settle — was wrong.
- **Anything imported by a lazy page belongs in the list.** A missing entry costs
  the bug above; a stale entry costs nothing.
- `resolve.dedupe: ['react', 'react-dom']` sits alongside it and guards a
  different failure (a transitive dependency resolving its own React in a
  workspaces repo). Dedupe alone does **not** fix the two-generations race.
- Deleting `node_modules/.vite/deps` under a RUNNING dev server does not force a
  re-optimize — Vite serves from its in-memory cache. Only a restart does, so
  that is the only way to test this.

### Automated gates — now in place

The manual definition-of-done above is still the per-change discipline, but two automated gates now enforce it (the backlog was driven to zero first, so they hold from a clean baseline):

- **Pre-commit hook** — `.githooks/pre-commit` runs client `typecheck` + `lint` + `test` whenever staged files include `client/src/**/*.{ts,tsx}`. Dependency-free (no husky); activated by the root `package.json` `prepare` script (`git config core.hooksPath .githooks` on `npm install`). Bypass with `git commit --no-verify`.
- **CI** — `.github/workflows/ci.yml` runs on push to `main` and every PR: `npm ci`, `npm run lint --workspace=client`, `npm run test --workspace=client`, and `npm run build` (client `tsc -b && vite build` + server `tsc`). Build/lint failures should block merge.
- **Keep the baseline at zero.** Treat any real type mismatch (e.g. a property that doesn't exist on a type) as a latent runtime bug, not just noise — fix the code or the type, don't silence it. If CI's `npm ci` ever fails on a lockfile mismatch, run `npm install` and commit the updated `package-lock.json`.

---

## Component Patterns

### MetricCard

The primary display primitive for numeric metrics. Use `benchmarkValue`, `rawValue`, `neutral`, and `scale` to drive color coding:

```tsx
<MetricCard
  title="Sharpe 3Y"
  subtitle="vs category benchmark"
  displayValue={fundSharpe !== null ? fmtNum(fundSharpe) : EMPTY}
  rawValue={fundSharpe}
  neutral={bmkSharpe ?? 0}
  higherIsBetter={true}
  benchmarkValue={bmkSharpe}
  components={bmkSharpe !== null ? [{ label: 'Benchmark', value: fmtNum(bmkSharpe) }] : []}
/>
```

- **Color coding with two benchmarks:** when both `benchmarkValue` (b1) and `benchmark2Value` (b2) are passed, the value is green if it beats both, red if it beats neither, yellow if it beats one. Used to compare a metric against benchmark + peer (or against its own prior years).
- **`title` accepts `ReactNode`**, not just a string — pass JSX for inline emphasis, e.g. `title={<>Operating Margin <span className="font-bold text-gray-700">TTM</span></>}`.
- **`subtitle` only renders when non-empty.** Pass `subtitle=""` to omit it; the value stays vertically centered between the header and the component-row separator.

### StockScorecardPanels

The stock Scorecard cards (Operating Margin, FCF Margin, Revenue/EPS Growth TTM, Revenue/EPS Growth 3Y) live in `StockScorecardPanels.tsx` and pull derived metrics from `lib/fmpRatios.ts`. When showing a TTM headline plus prior fiscal-year rows, use `priorFullYears()` to drop the latest annual year if it equals the TTM (a fiscal year that just closed is fully captured by the TTM window — otherwise the first row duplicates the headline). Benchmark/peer comparison rows strip the "Total Return" suffix via `stripTotalReturn()` from `lib/formatters`.

### A stock's preferred benchmarks are set on the Monitor tab

`securities2.preferred_benchmark1_id` (→ `category_benchmarks`) and
`preferred_benchmark2_id` (→ `sector_benchmarks`) are the comparators for the
**four growth scorecard cards**, the Alternatives tables, `ReturnRanksTable`,
and the **at-risk committee's grading**. The two MARGIN cards do not use them —
they grade against the security's own prior fiscal years — which is why an unset
comparator degrades rather than breaks.

**The picker lives in `StockScorecardPanels`, directly above the cards it
grades** (a "Graded against" row, Nov 2026). It had no home at all between
14 Oct and then: `StockReturnTable` carried the only picker, and `77f89ef`
("the stock Overview tab is the thesis") removed its last host with a real
`securities2.id`. The only surviving renderer is `ResearchPage`, whose synthetic
security has `id: 0` — so `if (security.id)` suppressed the write, correctly for
that page and fatally for everything else. **55 of 56 stocks carry both
benchmarks** (the 56th is `$Cash`); they were set while the old picker worked.

- **Persisting and announcing are SEPARATE decisions.** Both used to sit behind
  the same `if (security.id)`, which is why `StockScorecardPanels`' listener
  never fired once. The announcement now always goes out — so the Research
  page's two panels agree with each other — while the write stays guarded, since
  that page states it saves nothing.
- **A new stock is the live risk.** `createSecurityBySymbol` writes no
  benchmarks, and with both null every card falls back to `neutral={0}`, so any
  positive growth reads green and the committee can only ever flag the name on
  its margins. The control shows an amber prompt when either slot is unset.
- **The save is never swallowed.** It writes a governed number the committee
  reads; a selection that looks applied but was not is worse than a visible
  error. (`.catch(() => {})` was the old behaviour, on a path that could not
  fire.) On success it invalidates `QUERY_KEYS.security(id)`.

### Comparing a fund with the alternatives in its category

`lib/fundPeers.ts` (pure) + `FundPeerPanel` on the fund detail page, below the
scorecards. **The scorecard ranks a fund WITHIN its cohort and can never say
whether two funds in the same category are the same thing**, which is what a
holding-vs-alternative question asks.

The Nov 2026 Foundation Conservative review is the case it was built from: the
PM found VBILX and VBTLX are NOT one sleeve because their holdings differ
(60/52% government, 39/25% corporate, 0/21% securitized) while the risk manager
found they ARE one position because their realised returns sit 31bp apart. Both
were right about different things, and **every composition number in that
argument was fetched from the fund provider** because the app held none.

- **BEHAVIOUR and COMPOSITION are separate tables**, deliberately — a blended
  one would have hidden that disagreement rather than shown it.
- **One cohort grades every row.** VBILX is designated `category` and VBTLX
  `peer` despite sharing both, and the printed totals reversed the order every
  underlying metric gave. The subject's cohort is forced on the table and a
  banner says so when the funds disagree.
- **Weights are PER BOOK, never summed.** An early version added VBILX across
  four Foundation books and printed "91%", which is not a weight of anything;
  weighting them properly needs market values the app does not hold. The range
  is shown instead.
- **An unheld idea has a null weight**, not 0. A fund in the category that is
  neither held nor watched is excluded entirely.
- **WHICH breakdown is meaningful comes from `getBroadAssetClass`** (moved to
  `lib/securities.ts` for this), never from the numbers. PWB is an all-equity
  ETF whose bond sleeve YCharts reports as 100% government, so a breakdown that
  reconciles says nothing about whether there is anything to break down — the
  same artefact gives VWEAX 100% financial services off a negligible equity
  sleeve.
- **The bond sleeve is five sectors — government, corporate, securitized,
  municipal, other — and they sum to 100%.** Measured, not assumed: 28 of the
  29 funds reporting a breakdown land within 0.5pp (the 29th is an equity ETF
  reporting zeros). **Cash and derivative sit OUTSIDE that 100%**; including
  them holds for only 14 and reaches 120%. `fixedIncomeSum` is null unless every
  component is present, and `fixedIncomeReconciles` is null for a fund with no
  bond sleeve rather than false.

### A fund's actual holdings (`fund_holdings`)

The top 25 positions of each fund, with weights, from the YCharts workbook's
**`Holdings` sheet** (Nov 2026). Until this existed the committee could read a
fund's sector and credit PERCENTAGES and never a single position — so two funds
holding the same twenty names read as diversification, and nothing anywhere
could say otherwise.

- **A TABLE, not columns on `securities2`.** 25 holdings is a repeating group,
  and the fund importer maps sheet header straight to DB column, so columns
  would also mean 50 headers on the `Securities` sheet. The vendor returns a
  list; store a list.
- **A SEPARATE SHEET, because the SHAPE is different, and this is the lesson.**
  `YCI(ticker,"holdings_weight")` returns 25 rows for ONE fund while the
  `Securities` sheet is one row PER fund. Entering it there put the row-3
  fund's holdings into the next 24 funds' rows and, being a legacy CSE array,
  locked those rows out of carrying a formula of their own.
- **THE SHEET IS PRE-WIRED in blocks of 26 rows, and the macro only ever
  APPENDS to it.** The first version rebuilt the whole sheet from
  `Securities!B` on every run and cost two refreshes — unproven code on the
  critical path took the funds, benchmarks and portfolios with it, and the
  sheet did not exist until a run succeeded, so a person opening the workbook
  could not tell broken from not-yet-run. `EnsureHoldingsBlocks` replaces it
  and adds ONLY a block that is missing: the shape of `EnsureFundRow`, not a
  wholesale rewrite.
  - **It must be in the macro.** `SyncWatchlistTickers` writes a new ticker
    into `Securities!B` during `Workbook_Open`, so anything host-side is
    always one run behind and a new fund would carry a full scorecard with no
    holdings until the next morning.
  - **`scripts/refresh/extend-holdings.ps1` is for SEEDING AND BULK
    BACKFILL**, not routine growth. It COPIES an existing block rather than
    writing one — SYSTEM has no add-in, so a written `_xll.YCI` reads
    `#NAME?`. Layout in `scripts/refresh/README.md`.
- **Rewritten per fund on every import (delete-then-insert), never upserted.**
  A fund whose list shortens — 25 names last month, 20 this month — would
  otherwise keep ranks 21-25 from the previous holdings date, mixing two as-of
  dates in one list with nothing on the row to show it.
- **ONE COLUMN CARRIES BOTH THE SYMBOL AND THE NAME**, and `splitSymbolAndName`
  separates them on length. The vendor fills it with whatever identifies the
  holding: `ASML` or `RHHVF:DL` for an equity, a CUSIP like `039956AA5` for a
  bond that has one, and a description — `Intertape Polymer Group Inc
  28-JUN-2028 Term Loan B` — for one that does not. Anything over 12
  characters is filed as the NAME; keeping it as a symbol would make the
  cross-fund overlap join match on prose.
- **`holding_symbol` is NOT an FK to `securities2` and must not become one.**
  A CUSIP is not a security the firm tracks, and neither is most of what a
  broad fund holds.
- **`as_of` is copied onto every row** from `securities2.latest_holdings_date`,
  so a holdings row is self-describing. Funds disclose holdings monthly or
  quarterly, so it is routinely **weeks behind the price columns on the same
  `securities2` row** — which nothing said until this landed.
- **`ycharts_holdings` is its own `import_runs` source.** A holdings failure
  must not mark the fund import failed, and its stamp says when we last ASKED
  YCharts — not the holdings' as-of date, which is `fund_holdings.as_of` and is
  a different fact.
- **IT IS A FLOOR, NEVER A TOTAL.** Only the top 25 of each fund are known, so
  a single-name look-through across a book under-counts a name held at position
  30 in one fund and 5 in another. The committee prompt requires any figure
  drawn from it to be quoted as "at least".
- **`percent_of_assets_in_top_25_holdings` is the denominator and the list is
  not readable without it.** Measured by holding COUNT the spread is enormous —
  FTZIX holds 25 names, VBTLX holds 16,290 — but count is only a proxy. Where
  the share is high the list IS the fund; where it is low it is the
  twenty-five largest positions in a long tail.
- **On the BOND side the composition columns remain the better read.** Twenty-
  five loan tranches out of a thousand support no conclusion about credit; the
  DHRIX finding of 9 Nov 2026 came from `investment_grade_bond_allocation_generic`
  and `securitized_fixed_income_exposure_generic`, and would not have come from
  a holdings list. Holdings earn their place there for ISSUER overlap between
  two funds, which the percentages genuinely cannot show.

### What the holdings ARE (`holding_profiles`)

Sector, industry, country and market cap for every security inside a fund,
from FMP, keyed on the symbol as `fund_holdings` spells it (Nov 2026).

- **IT REPLACES RECOGNITION WITH DERIVATION, and that is the whole case for
  it.** `fund_holdings` gives a symbol and a weight; knowing that NVDA, AVGO,
  MU, AMD, TSMWF and SSNLF are one industry was being supplied by a model from
  memory. On 11 Nov 2026 a role agent reported a "semiconductor cluster of
  6.11% across 8 vehicles"; derived, it is **8.27% across 11 funds and 39
  lines** — the book's largest thematic exposure, understated by a third,
  with nothing in the system able to catch it.
- **A DELIBERATE EXCEPTION TO "FMP IS READ ON DEMAND, NEVER PERSISTED."** That
  rule holds because a stored copy of a live figure goes stale silently. Two
  things override it here: the committee runs headless at 10:45 and needs
  these facts in SQL, and ~2,500 live profile calls per run is worse than a
  cached table. Sector, industry and country are near-static; **`market_cap`
  is the only field that moves**, and its column comment says not to price off
  it.
- **CUSIPs and cash lines are excluded BY RULE, not missed.** `isCusipLike`
  keys on a 9-character identifier starting with a digit — every bond line in
  the book matches and no equity ticker does — and `isCashLike` catches
  `USD Cash` and the `M:` money-market symbols. A stray match on the latter
  would file a cash sweep as an equity exposure, which is the error the
  committee prompt already warns about.
- **`fmpQuerySymbol` is NOT `fmpSymbol`.** A dot before ONE letter is a share
  class (`BRK.B` → `BRK-B`); a dot before two is an exchange (`ABX.TO`,
  `L.TO`) and must survive. Blanket dot-to-hyphen breaks the second. It also
  drops the YCharts `:DL` dual-listing marker.
- **`unresolved = true` is a recorded answer, not an absence** — FMP has no
  record, six symbols on this book — so the next import does not re-ask and a
  reader can tell "we do not know" from "we never looked". A confirmed miss
  is exempt from the 30-day staleness retry: FMP's catalogue is a fact, not a
  value that ages.
- **MEDIAN MARKET CAP OF A TOP 25 IS BIASED UPWARD** and must be quoted with
  `percent_of_assets_in_top_25_holdings`. At ~100% coverage it is sound —
  FTZIX shows a 41.6bn median inside a Mid-Cap Blend label. At ~50% it is
  suggestive only.
- **`apiKey()` gained a `process.env` fallback for this** (`lib/fmpClient.ts`),
  mirroring `lib/supabase.ts`. It read only `import.meta.env`, so every call
  threw under Node — and because callers catch per-symbol, that surfaced as
  402 "fetch failed" results in 1.2 seconds rather than one missing-config
  error. A credential problem wearing a data problem's clothes.

**Four fund flags landed with it, each changing how an existing number is
read** — all on `securities2`, all from the same import:
`index_fund_generic` (trailing a benchmark is a finding for an active fund and
the expense ratio for a tracker), `open_to_new_investors_generic` (an
alternative that cannot be bought is not an alternative, and this book is built
on the institutional share classes that close),
`waiver_expense_ratio_generic` + `waiver_expiration_date` (where a waiver is
set, `expense_ratio_generic` is not what the fund will charge next year), and
`prospectus_objective` + `prospectus_benchmark_index` (a prospectus benchmark
disagreeing with the category we grade against is the clearest evidence a fund
is filed in the wrong sleeve).

**A newly added column shows the SOURCE cell's value until something
recalculates.** `add-sheet-columns.ps1` pastes a copied formula with
calculation on manual and `CalculateBeforeSave` off, so every cell in a new
column displays the model cell's cached value — nine new columns all reading
one fund's `security_name` is the expected state, not a broken formula. It
clears on the first `CalculateFullRebuild`, which is the unattended run.
Check the FORMULA, not the value, when auditing a freshly added column.

### A benchmark has no composition of its own

**YCharts computes no holdings for an INDEX.** A category or sector benchmark is
a total-return index (`^SPXTR`, `^RLGTR`, `^SP15HCSTR`), and YCharts holds a
price series for one, not a portfolio — every composition metric returns
`ERR: INVALID CALC`. Measured on all 42 category rows (Nov 2026), not assumed.

- **Risk metrics DO work**, because they derive from the price series:
  `max_drawdown_3y`, `max_drawdown_5y` and
  `monthly_standard_deviation_annualized_3y` populated 42/42 and are kept on
  `category_benchmarks`. They give a fund's drawdown and volatility an index to
  be read against, which nothing offered before.
- **50 exposure and maturity columns were dropped** from
  `peer_group_benchmarks` and `sector_benchmarks` (Nov 2026), verified at **0
  non-null values in 56 rows**. This document previously described the Sep 2026
  slimming of `category_benchmarks` as leaving a deliberate asymmetry, with
  those two tables keeping their exposure columns on purpose. **That was wrong**
  — they were as unfillable there as here, and the drop was simply never
  extended. The sheets had already lost the headers, so the DB columns were
  orphans with no source.
- **Composition comes from the `etf_proxy`**, which every benchmark row already
  names (IWF for `^RLGTR`, SPY for `^SPXTR`). An ETF is a portfolio and carries
  the full set. The 33 distinct proxies live in `securities2`, because that is
  where the composition columns are, and are added by the same roster the
  watchlist uses — `watchlist-tickers.cjs` writes **held ∪ watched ∪ proxied**.
- **`securities2.is_benchmark_proxy` hides them**, and is **recomputed on every
  import** by `fundBulkUpload` rather than set once, so it cannot drift from the
  three facts that define it: named as a proxy, not held, not watched. A ticker
  that is both a proxy and a holding comes out **false** and behaves as the
  holding. `fetchSecurities` filters on it, which covers all five "choose a
  security" pickers in one place.
- **The benchmark row in `FundPeerPanel` has TWO sources and says so.**
  Behaviour (drawdown, volatility) is the index's own; composition is the
  proxy's. `FundPeerRow.compositionFrom` names the ETF and the card prints
  "composition via IWF" — a reader must not assume one line came from one place.
- **The resolution chain is `ycharts_benchmark_category`, not `category_name`.**
  The two tables use different vocabularies: a fund's `category_name` reads
  "Large Growth" where the benchmark's `category` reads "US Large Cap Growth".
  Joining on `category_name` matches nothing. `hyphenVariants` handles the
  second spelling, as it does for the existing benchmark lookups.

**Two traps when widening a benchmark sheet**, both hit on 6 Nov 2026:

- **A formula cannot be REPOINTED over COM.** Pasting a column works as SYSTEM
  because the paste preserves the formula's link to the XLL name table. A
  `Range.Replace` that rewrites `$B` to `$E` makes Excel RE-PARSE it, and
  `_xll.YCP` is not registered for an account with no add-in, so every cell
  becomes `#NAME?` on sight — 1,210 of them, caught by the probe in
  `add-sheet-columns.ps1` and not saved. Calculation mode is irrelevant; it is a
  parse, not a calculation. Verifying that the formula TEXT changed is not a
  test of this.
- **Dropping a DB column the sheet still carries fails the whole upsert batch.**
  Check the sheet headers before dropping, or add the column to that table's
  `skipCols`.

### Benchmark data

There are **four** benchmark tables: `category_benchmarks`, `sector_benchmarks`, `peer_group_benchmarks`, `model_portfolio_benchmarks`. The legacy standalone `benchmarks` table was **dropped** (Jun 2026) — it was unused; do not reference it.

- `category_benchmarks` — broad asset-class benchmarks; column is `category_ticker` (not `ticker`), renamed to `ticker` in the fetch layer. **One ticker can serve multiple categories** — the unique key is the composite `(category_ticker, category)`, not ticker alone.
- `sector_benchmarks` — sector ETF benchmarks; column is `ticker` (unique).
- Benchmark **data access lives in `lib/benchmarks.ts`** (`fetchBenchmarkOptions`, `fetchSectorBenchmarkOptions`, `fetchBenchmarkByName`, `fetchCategoryBenchmark`, `fetchPeerGroupBenchmark`, `fetchBenchmarkTable`, plus the `BenchmarkOption` type and SELECT column lists). `BenchmarkPickerModal` is now just the picker UI and imports the fetchers from there (it no longer exports data fns). When adding a benchmark column, add it to the SELECT strings **and** the `BenchmarkOption` interface in `lib/benchmarks.ts`.
- Growth columns are YCharts **annualized** figures: `sales_growth_1_yr_generic`, `eps_growth_1_yr_generic`, `sales_growth_3_yr_generic`, `eps_growth_3_yr_generic` (the 3-yr ones are annualized CAGRs, comparable to derived stock 3Y CAGRs).
- **`category_benchmarks` was slimmed 53 → 20 columns (Sep 2026).** Dropped: the risk ratios beyond the 3-year pair (`historical_sharpe_5y`, `historical_sortino_5y`, the three `calmar_ratio_*`, the three standard-deviation columns) and every exposure breakdown (11 sector, 7 credit-quality, 7 maturity). All 33 were loaded by YCharts and read by **nothing** — the exposure columns were for an allocation-comparison surface that was never built. The table now holds exactly what the app selects, plus `updated_at`. They were removed from the workbook's `category_benchmarks` sheet in the same change; `CATEGORY_DROPPED_COLS` in `ychartBenchmarksUpload.ts` keeps the import safe if an older workbook still carries them. **Note the asymmetry:** `sector_benchmarks` and `peer_group_benchmarks` still have their own 5-year/std-dev columns — this drop was scoped to `category_benchmarks`.

### LocalStorage persistence for UI state

**ONE key, device-local UI state and nothing else:** the Actions page's
filters, owned by **`hooks/useActionFilters.ts`**. That is the whole of it —
`grep localStorage client/src` returns three lines, all in that hook.

It was two until Nov 2026. `settings/NotificationsPage` stored six preferences
that **nothing read**, behind a nav link and a green "Saved." — the same
localStorage-only pattern this document records as deleted for Firm Settings,
with an instruction not to reintroduce it. The page, its route and its nav entry
are gone (audit §19). The filters hook wraps both the read and the write in
`try`/`catch`: a private window makes either throw, and losing a remembered
filter is not a reason to fail to render the page.

This section used to describe benchmark selections persisting under
`fund_benchmarks_${securityId}`. **No such key exists, and never did in this
tree.** A stock's benchmarks are a governed value and live in
`securities2.preferred_benchmark1_id` / `2_id`; the cross-component sync is the
`benchmark-changed` event, **declared once in `lib/benchmarkSelection.ts`**
(`announceBenchmarkChange` / `onBenchmarkChange`) rather than inline at each end
— being inline in both is how that listener stayed dead for three weeks.

**Do not reintroduce localStorage as an authority for a governed value.** The
committee only ever sees Supabase, so anything it must read has to be there (the
same reason the firm-settings store was deleted).

---

## FMP Financial Metrics

### YCharts owns fund/ETF data; FMP is for stocks

**For a fund or ETF, the YCharts workbook's `Securities` sheet is the primary
source for every field it carries — never FMP.** Those columns land on
`securities2` through `fundBulkUpload.ts` and YCharts is the system of record the
advisor reconciles against, so a figure the sheet carries is **read**, not
recomputed from a price feed. FMP's role is the stock side, where there is no
published fund figure to read.

This is a coverage fact before it is a preference, and the fact is **partial
coverage, not none** (measured 6 Nov 2026 against `/stable/profile` and
`historical-price-eod`): FMP serves **all 19 ETFs** the book holds and **16 of
its 27 mutual funds**, missing eleven — AVERX, BIMIX, DHRIX, EICOX, FTZIX,
IDHIX, NSMRX, OBSIX, PGNPX, PYTRX and VMSAX, every one an institutional or
boutique share class. This paragraph read "FMP prices none of the institutional
mutual-fund share classes these books hold", which is too broad: VBTLX, FXAIX
and the other Vanguard and Fidelity admiral classes all price fine.

**The conclusion is unchanged, because partial coverage is the worse failure.**
Pricing every holding from FMP left Hybrid Conservative's attribution ranking
42% of itself, with its largest holding (BIMIX, 21%) among the 57% that
silently vanished — while YCharts carried a figure for all thirteen the whole
time. A feed that answers for two holdings in three produces a ranking that
looks complete and is not, which is exactly why the rule is to read the sheet
rather than to fall back per-ticker.

- **`fetchPortfolioMovers` is the live example.** It reads
  `securities2.{one,three}_month_total_return_nav` for anything
  `isFundOrEtfSecurity` calls a fund or ETF, and computes from
  `fetchDailyAdjustedSeries` only for stocks. `HoldingMover.source` records
  which, and `AttributionMovers` prints it.
- **A fund with no YCharts figure is reported UNPRICED, not fallen back to FMP.**
  The two feeds measure different windows — a calendar month against a rolling
  thirty days — so substituting one into a list built from the other would rank
  them against each other as if they agreed. `UnpricedReason` separates
  `no_ycharts_figure` (a workbook gap, fixable at the source) from
  `no_price_series` (a feed limit, not).
- **`*_total_return_nav` is also populated for STOCKS and is stale there** —
  residue from the deleted `fmpSync`, last written between Aug and Oct 2026.
  Always gate on the classifier before reading those columns; a stock's value is
  not a current figure.
- **No portfolio mixes stocks and funds today** — every book is all-stock
  (Core Growth, Equity Income, EI & CG) or all-fund (Foundation / Hybrid / ETF /
  Fixed Income), so the two window conventions are never compared within one
  list. `returnSource: 'mixed'` exists to say so loudly if that ever changes
  rather than quietly ranking them together.

Financial figures are fetched on-demand from Financial Modeling Prep (stable API) in `lib/fmpFinancials.ts` (income statements, estimates, earnings) and `lib/fmpRatios.ts` (margins, growth, CAGR). They are **not** persisted to Supabase. The only FMP data written to `securities2` is identity + earnings dates, via `refreshSecurityFromFMP` (see below).

**Shared FMP plumbing lives in `lib/fmpClient.ts`** — `FMP_STABLE`/`FMP_V3`, the guarded `apiKey()`, `num()`/`str()`/`asArray()`/`firstItem()`, `fmpFetch()`, and `fmpSymbol()`. All `fmp*.ts` modules import from it instead of redefining the boilerplate. `fetchScorecardMetrics` fetches each distinct endpoint at most once (ratios-ttm, cash-flow-ttm, income-statement-ttm, annual income limit=4) and derives all six scorecard metrics from the shared rows — 4 calls, not 7. The standalone exported fetchers (`fetchFcfMargins`/`fetchTtmGrowth`/`fetchCagr3y`/`fetchRatiosTTM`, used by `StockScorecardPanels`) are unchanged.

### Stock detail page reads FMP on-demand, not `securities2`

For **stocks** (not funds), the detail page pulls these live via `useQuery` rather than reading synced `securities2` columns:

| UI | Source | securities2 column it replaced |
|---|---|---|
| Header identity — company name, description, sector, industry | `lib/fmpMarket.ts` (`fetchProfile`, `/stable/profile`) | `security_name`, `long_description`, `morningstar_sector`, `morningstar_industry` |
| Scorecard margins/growth/CAGR | `lib/fmpRatios.ts` | — |
| Analyst panel (targets, grades, consensus) | `lib/fmpAnalyst.ts` (`fetchAnalystData`) | `consensus_recommendation_label` |
| Price + 52-week range | `lib/fmpMarket.ts` (`fetchQuote`) | `close_price`, `year_high`, `year_low` |
| Header next-earnings + review-modal dates | `lib/fmpMarket.ts` (`fetchEarningsDates`) | `last_earnings_release`, `next_earnings_release` |
| Total Performance — security row | `lib/fmpMarket.ts` (`fetchStockReturns`, dividend-adjusted EOD prices) | `*_total_return_nav` |

- **There is no "Sync from FMP" button on the stock page** — it was removed. All stock-page data is on-demand `useQuery` (gated on `isStock`); identity/returns/price/earnings/consensus/scorecard all refresh on load (≤ `staleTime`) with no manual sync.
- Identity uses `(isStock ? profile.x : null) ?? security.x` — live FMP for stocks (so new positions aren't blank), stored `securities2` value as fallback and for funds. **Excel can no longer write these four** (mapped to `null` / in the `SKIP` set in `securities2ExcelUpload.ts`).
- The **benchmark return rows** (Total Performance on Overview *and* the Monitor Alternatives "Trailing Returns" table) are **live FMP total return via a representative ETF**, not the YCharts return columns. FMP serves none of the TR index symbols (`^SPXTR`, `^RLGTR`, the `^SP15…STR` sector indices — all confirmed *not found*); the price-return symbols it *does* serve (`^RUI`, `^RLG`, `^RLV`) understate total return by ~0.5–2.5%/yr and are deliberately unused. **`resolveEtfProxy(bench)` in `lib/benchmarks.ts` is the single resolver: it reads the benchmark row's own `etf_proxy` column (source of truth, loaded from the benchmark workbook — 41/41 category + 10/10 sector rows populated) and falls back to the hardcoded `BENCHMARK_ETF_PROXY` map only when the row has none.** Never call `benchmarkEtfProxy(ticker)` directly from a component — the map is partial (17 tickers) and was the cause of mid/small-cap-value, fixed-income and international benchmarks silently reverting to stored YCharts columns with `—` in the 5D column. The ETF's dividend-adjusted returns come from the same `fetchStockReturns` used by the security row, so all periods (incl. 5D) populate. Benchmarks with no proxy from either source still fall back to the stored YCharts columns. The Total Performance benchmark label shows a `· <ETF>` proxy tag. (Stocks only — funds keep their stored comparison.) **Adding a column to a benchmark option select requires bumping `QUERY_KEYS.benchmarks` / `sectorBenchmarks`.**
- **`fmpSync.ts` and the bulk "Sync all stocks from FMP" button were DELETED (Aug 2026).** The Jun 2026 slim-down left `syncStockFromFMP` writing 27 columns, of which 21 (`*_total_return_nav` + the risk metrics) had no stock-side reader at all — every consumer (then `FundReturnTable`, since deleted; today `FundMonitoringPanel`/`ReturnRanksTable` and `reviewEvidencePdf`) is gated behind `isFundOrEtfSecurity`, while the button filtered to non-funds. Its only irreplaceable job was seeding the four identity columns, which is now done at creation time. **Do not reintroduce a bulk sync**; use `refreshSecurityFromFMP` instead.
  - **`refreshSecurityFromFMP(symbol)` in `lib/securities.ts` is the single writer of the FMP-owned columns**: `security_name`, `morningstar_sector`, `morningstar_industry`, `long_description`, `last_earnings_release`, `next_earnings_release`. It runs (a) inside `createSecurityBySymbol`, so a security added by ticker is never nameless, and (b) as a **write-through on the stock detail page**, which already fetches profile + earnings live — so simply opening a stock refreshes the stored dates. Only non-empty values are written, so a partial FMP response never blanks a good value.
  - **The Review Calendar self-heals.** On mount, `ReviewCalendarPage` finds its **stock** rows (via `isFundOrEtfSecurity` — `fetchReviewSchedules` embeds the classifier columns for exactly this) whose stored `next_earnings_release` is null or in the past, and tops them up through `refreshSecuritiesFromFMP(symbols)` — a bounded-concurrency (4) batch wrapper around `refreshSecurityFromFMP` that swallows per-symbol failures. It runs **once per mount** (a `useRef` guard, not a dependency-driven effect) and invalidates `reviewSchedules` only when something actually changed, so it cannot loop.
  - **Excel cannot write any of those six.** Excel has had no path to them since `securities2ExcelUpload.ts` was deleted (Sep 2026); before that they were in its `SKIP` set. Earnings dates come from FMP only — they drive stock review scheduling, and the cross-security surfaces (`ReviewCalendarPage`, `fetchReviewSchedules`) read the STORED columns because they cannot fire a per-row FMP request the way the detail page does.
- `fetchEarningsDates` derives last = most recent release ≤ today, next = soonest release > today, from `/stable/earnings` (which lists past + scheduled releases).

### Stock detail tab layout

Tabs are **Overview · Monitor · Commentary** (no Alternatives tab; the Research tab was removed and its blocks redistributed). The third tab was called **Documents** until Oct 2026, when the earnings briefs and transcripts moved into it off Monitor and it was renamed — the split is now **Monitor = measurement** (scorecard, alternatives, financials) and **Commentary = what is said about the security**.
- **Overview (stocks): Street Coverage, then the Investment Thesis card.** The Scorecard, Total Performance, News, Alerts and the Review Schedule / Review History blocks were **removed from the stock Overview (Oct 2026)** — they live on Monitor, and the tab is the ownership case. **`TipRanksPanel` was moved back here (Oct 2026), deliberately ABOVE the thesis**: the outside view is context for our own, and placing it second invites anchoring the thesis on the street rather than measuring the street against the thesis. Two consequences worth knowing: the price moved to the **header** as the first cell of the stock metrics row (so that row is `grid-cols-6`, funds stay `grid-cols-3`). It keeps the documented seam — TanStack owns the REST `fetchQuote` baseline, `quoteStream` owns the live last-trade leg via `useLiveQuote`, and a "Live" dot shows only while ticks arrive; `useLiveQuote` is passed `null` for funds, which is how they opt out of a stream FMP does not serve them. `AnalystCoveragePanel` was **deleted** — the header covers the price, and the 52-week range and vendor price-target consensus it added on top were reviewed on the page and not wanted. `RangeBar` survives as a shared primitive (`TipRanksPanel` uses it); and `StockReturnTable` / `NewsAlertsPanel` are **still live** via `ResearchPage`, so neither is dead code. **Funds are untouched** and keep their own (untabbed) layout.
- **Monitor:** Scorecard cards (with Review button) · the two **Alternatives comparison tables** · **Review** (schedule + history) · **Financials**. The Review block was added Nov 2026: `ReviewLogSection`'s only mount was inside the fund branch, so a stock's recommendation, conviction, rationale and frozen snapshot were recorded on every review and rendered on no tab, while the header asserted "Review Overdue" with nowhere to look. It shows Last Reviewed / Next Review / Next Earnings rather than a cadence, because stock reviews are earnings-driven. (Street Coverage, AI Research & Briefs and Transcripts all used to sit here; the first is on Overview now, the other two on Commentary.)
- **Commentary** (the renamed Documents tab): **AI Research & Briefs** (`SecurityResearchPanel`) · **Documents** (`DocumentsFolderPanel`, `Security Documents`/`<ticker>`). **The separate Transcripts block is GONE (Oct 2026)** — it could only ever show the LATEST call, so the evidence behind any brief older than a quarter was unreachable from the page. Everything written around a call now sits on that call's own row in the **Commentary timeline** (below), and the transcript opens in a modal with the committee's summary above it — the call is still read before our conclusions. The tab id in `activeTab` is `'commentary'`, and the nav label is derived from the id by capitalising it, so renaming the id renames the tab.

### Alternatives comparison tables (`AlternativesPanel.tsx`)

Rendered on the **Monitor tab** below the scorecard: two tables (Scorecard metrics + Trailing returns), columns **Position · Ticker · …metrics**, one row per security: **Security · Alt 1 · Alt 2 · Alt 3 · Benchmark 1 · Benchmark 2**.

- The three Alt slots are **editable ticker inputs (in the Ticker column) persisted to `securities2.alt_1/alt_2/alt_3`** (via `saveAlternatives`, saved on blur, uppercased, blank → null). The Position column shows the company name (from FMP `/profile` for alt rows via `fetchProfile`).
- **The stock detail header "Related:" tags are these `alt_1/2/3` tickers** (plain pills, not links), so they stay in sync with the Monitor tab. On blur, `saveAlternatives` invalidates `QUERY_KEYS.security(id)` so the header refreshes live. **Funds** keep sourcing the header "Related" tags from the Excel-uploaded `security_related_securities` table; the `SecurityDetailPage` relatedSecurities query is gated `enabled: !isStock`. (`security_related_securities` is otherwise left alone — it's only the *display source* that differs by asset type.)
- Alt/security metrics are fetched **on-demand and not persisted**: `fetchScorecardMetrics` (one call → all six scorecard values) and `fetchStockReturns`, keyed per symbol so rows dedup with the rest of the page.
- The shared table is rendered via a **plain inline function, not a JSX component** — defining it as a `<Component/>` would remount the subtree each render and the Alt `<input>` would lose focus on every keystroke.
- The state-reset `useEffect` depends on **`[security.id]` only** — NOT the alt columns. Including query-backed fields would let `refetchOnWindowFocus` (fires when the user tabs back from looking up a ticker) clobber in-progress edits.
- Benchmark scorecard cells: growth columns map to the YCharts `*_generic` fields (1-yr generic for the TTM columns, 3-yr for 3Y); margin columns show `—` (benchmarks have no margin data). Returns map to the benchmark return columns.

### News & Alerts (`NewsAlertsPanel.tsx` + `lib/fmpNews.ts`)

On the Overview tab. News and Press Releases are company-specific feeds, side by side, 5 each.

- Use `/stable/news/stock?symbols=` and `/stable/news/press-releases?symbols=` — **NOT** the `*-latest` endpoints, which return a GLOBAL feed and ignore the symbol filter. Results come back newest-first; no client-side sorting.
- Each item shows publisher · date above the title (title links out); no domain/url text, no snippet.
- "Alerts" is a separate placeholder card under Analysts (not part of `NewsAlertsPanel`).
- **Alert-rules management was removed as dead code, and the table is now gone too.** The rule CRUD UI (`AlertRulesSection`) and the firing engine (`fireAlertIfBreached`) were never wired up and were deleted; **`alert_rules` itself was dropped in Nov 2026** (0 rows, no reader, no writer), along with `alert_events.rule_id`, whose only meaning was the FK into it. **`alert_events` survives** and is untouched — it is the HomePage alert surface and the at-risk breach alert is its live producer; `threshold_value` is kept, since an alert can carry the number it breached without a rule row behind it. `lib/alertRules.ts` keeps only the live path: `fetchUnacknowledgedAlerts` + `acknowledgeAlert` (the HomePage "Performance Alerts" list reads/acks `alert_events`). Rebuild the rule/fire side deliberately if alerts are wanted — don't assume it exists.

### At-Risk is run by the committee, not by hand (Oct 2026)

`AT_RISK_METRICS_BY_ASSET_CLASS.stock` in `lib/atRisk.ts` lists the same six
metrics as the stock Scorecard cards. Everything below is stocks only.

**The `equity` / `fixed income` sets have no live reader, and this document said
they did.** It read "funds use them, unchanged". The only consumer was
`AtRiskModal`, which was deleted as a dead file in Nov 2026 (audit §19) — it had
zero references and had been unreachable for some time. The fund path onto the
list runs through the review modal's At-Risk outcome, which calls
`addToAtRisk(securityId, [], …)` — an **empty** metrics array. So a fund flagged
At-Risk today carries no metrics, and the sell-timer tiering, which counts reds,
has nothing to count. The two sets are kept as the firm's definition and as the
intended input to the planned fund-review automation; they are **defined, not
wired**, and `lib/atRisk.ts` says so at the constant.

**The `at-risk-review` job owns the list.** Weekdays, *before* the
post-earnings brief, because the brief reports any same-day change and there is
only ever one brief per print. It flags, re-measures, clears, and raises a breach
alert. The manual "+ Add stock" modal was **deleted**; the advisor's remaining
act is an override removal, which requires a reason.

- **The red/amber/green rule lives in `lib/scorecardColor.ts`**, extracted from
  `MetricCard`. A colour rule inside a React component cannot be read by anything
  else, and the second reader restates it — which is how a metric ends up red on
  the scorecard and green on the At-Risk card. **The job writes readings, never
  colours**; the app grades them, so the two cannot disagree.
- **Amber clears the flag.** Green beats both comparators, red beats neither,
  amber beats one. `isMetricFailing` is `=== 'red'`. Beating both a benchmark and
  a peer is a high bar under pressure, and a flag nobody can escape stops being
  information.
- **Margin comparators are FROZEN at flag time; growth comparators stay live.**
  A margin card is graded against the security's OWN prior two fiscal years, so
  its bar moves on its own — roll a weak year into the window and the metric goes
  green having improved nothing. Fine on a card you glance at, not fine as a sell
  trigger, so `flaggedBenchmark`/`flaggedBenchmark2` are captured in
  `metrics_detail` and every re-measurement grades against those same numbers.
  Growth benchmarks are external and move for reasons unrelated to us, so beating
  the market *as it is now* is the real test. `gradeAtRiskMetric()` encodes the
  split; **the At-Risk card will therefore disagree with the live Monitor card on
  margins, by design.**
- **The sell timer counts EARNINGS REPORTS, not days** (`reportsToRecover`):
  5+ red → 1 report, 3–4 → 2, 1–2 → 4, as
  `next_earnings_release + (reports−1)×91 + 14` (the 14 being the lag before FMP
  posts the statements the metrics derive from). **The six metrics are TTM
  figures that only move when the company reports, so a timer shorter than one
  earnings cycle cannot be satisfied** — on the first run VZ, MSFT, TSLA and PG
  were each given 30 days while reporting in 84–92, unsatisfiable by
  construction. The old four rungs collapsed to three: 30d and 90d both meant
  "a quarter or less", a distinction with no mechanism behind it. No usable
  earnings date falls back to a day table (90/180/365). **Still set once and
  never recalculated** — re-deriving would let a name improving from 3 reds to 2
  push its deadline from 2 reports to 4. (The 13 live rows were re-anchored once
  on 29 Oct 2026 as a correction of the defective formula, each recording its
  original date in its notes; that is not licence to re-derive on new readings.)
- **A flag needs 3+ reds AND at least one MARGIN red** (`qualifiesForFlag` in
  `lib/atRisk.ts`; the job applies it). **A count alone cannot tell deterioration
  from slower growth.** The four growth metrics are graded against the category
  and sector benchmarks, so they go red whenever the company grows more slowly
  than its market — routine for a large compounder. Only the two margin metrics
  are graded against the security's own prior years, so only they show a business
  getting worse than it was. On the 29 Oct 2026 book this was 16 names vs 13: the
  three excluded (AAPL, MSI, UBER) were pure growth-vs-benchmark with healthy
  margins, while MSFT stayed on FCF margin falling 25.4% → 20.2% → 17.3%. Count
  and margin gate are separate dials.
- **A breach notifies; it never removes.** Timer expired with a metric still red →
  one row in `alert_events` (`source='at_risk'`, prose `message`, FK `at_risk_id`),
  guarded by `breach_alerted_at` and a partial unique index so it fires once.
  `alert_events` gained `source`/`message`/`at_risk_id` and `rule_id` +
  `threshold_value` became nullable — it was the HomePage alert surface with no
  writer since the rule engine was deleted, and this is its first real producer.
- **The Actions hub shows ONLY breached entries.** Every at-risk row used to
  appear there, which fitted a manual list; now that the committee re-measures on
  its own, a running timer needs nothing from the advisor and surfacing them all
  would bury the one row that does.
- **Removal requires a reason** (`removal_reason` + `removed_by`,
  CHECK-enforced). Added `NOT VALID` so the 31 rows removed before this process
  keep their history rather than having a reason invented for them.
- **Nothing in `substitutions.ts` clears the flag** — completing a swap leaves the
  entry standing. Still true, still the likeliest way one gets stranded.

### Field-name conventions (stable vs v3)

- The `stable` endpoints use **`epsDiluted`** (capital D) and **`fiscalYear`**; the legacy v3 endpoints use **`epsdiluted`** (lowercase) and **`calendarYear`**. Always read `epsDiluted ?? epsdiluted`. **Use diluted EPS** for all EPS metrics, never basic `eps`.
- Annual income statements use the stable endpoint (`period=annual`). **Do not** overwrite annual revenue/EPS with values from the `/earnings` endpoint — that endpoint is quarterly, so matching it to an annual period substitutes the Q4 figure for the full year. (The quarterly fetch legitimately does use `/earnings` values.)

### FMP has no native CAGR / TTM-growth / FCF-margin fields — derive them

- **FCF margin** = `freeCashFlow / revenue` (cash-flow + income statements). `operatingCashFlowSalesRatio` is OCF margin, not FCF.
- **TTM growth** (`fetchTtmGrowth`): `income-statement-ttm` returns rolling TTM snapshots, newest first — `row[0]` is current TTM, `row[4]` is the TTM one year (4 quarters) ago. Growth = `row[0] / row[4] - 1`.
- **3-year CAGR** (`fetchCagr3y`): annual basis — latest FY vs FY three years prior, `(latest / base)^(1/3) - 1`. (A TTM basis using `row[0]` vs `row[12]` is possible but anchors on a single trailing window and can distort off a one-time-charge trough.)
- **Suppress growth/CAGR when the base is ≤ 0** — a ratio across a zero/negative base (common for EPS) is meaningless; return `null`.
- These are GAAP figures; they won't match YCharts "Normalized" metrics, which exclude one-time items.

### FMP's annual `operatingIncome` is unreliable — check it against SEC XBRL

FMP relocates charges out of the operating line. Audited against SEC's own
`us-gaap:OperatingIncomeLoss` across the 54 names carrying a thesis, **13 of the 40
checkable names disagree on at least one fiscal year**: **BSX FY2020 is reported as
+$601M against a filed −$80M operating LOSS** (a sign flip), ELF FY2026 as $131.3M
against a filed $73.6M (a −17% trend where the filing says −53%), HWM wrong in five of
six years. **`incomeBeforeTax` ties in every case**, so nothing internal to the feed
catches it, and **`ratios.operatingProfitMargin` is derived from the same number** — so
the Scorecard inherits it directly. Confirmed affected: BSX, HWM, VZ, MA, APH, ELF,
GEV, ABBV, GLW, THC, MSI, COIN, MU.

**Do not assume "adjacent years tie" means the series is sound** — on BSX and HWM five
or six consecutive years are wrong. Agreement with the *filing* is the only test.

- **The Scorecard does NOT use this — it is single-source FMP (Oct 2026).** The card
  compares TTM against FY2025 against FY2024, and TTM can never be SEC-sourced because
  it is not a filed period; sourcing the prior years from XBRL made every comparison on
  the card apples-to-oranges. **Comparability beat accuracy, deliberately** — so the
  prior-year rows show the vendor figure, and on the 13 affected names that is the wrong
  number (BSX FY2020 reads +$601M against a filed −$80M loss). The audit below still
  stands; what changed is which figure the card displays.
- **`lib/secOperatingIncome.ts`** and the Express `/api/sec/operating-income` endpoint
  remain, working but with **no caller**. They are the tested path to the as-filed
  figure, and the obvious next use is *flagging* a vendor/filing disagreement rather
  than replacing a value. Anything computing from the scorecard — the review
  recommendation especially — must use **FMP throughout** and never compare a filed
  prior year against a vendor TTM.
- **It goes through Express** — `GET /api/sec/operating-income?cik=…`. This is a
  deliberate exception to "no business logic in Express", for two reasons that leave no
  choice: `data.sec.gov` returns **no** `access-control-allow-origin` on a 200 (only on
  its *error* responses, which is a trap that reads as working CORS), and SEC asks for a
  descriptive `User-Agent`, which a browser will not let JavaScript set. Set
  `SEC_USER_AGENT` in the server env. Cached 12h in-process; **when the server is down
  the Scorecard degrades to the unverified vendor value** rather than breaking.
- **Two traps when reading SEC XBRL** (both caused wrong answers while building this):
  `fy`/`fp` describe **the filing a fact appears in, not the period it covers**, so a
  10-K tags its own prior-year comparatives with the filing's year — **key on the period
  end date**. And among facts for the same period, **an annual form must outrank a
  quarterly one**; "latest filed wins" alone let a 10-Q's 365-day fact ($209M) replace
  Comfort Systems' audited FY2025 operating income ($1,315M).
- Banks, insurers and some foreign filers **don't tag operating income at all** (ALL,
  CVX, HCA, IBM, JPM, LLY, TSM, WELL, HOOD) — the endpoint returns `tag: null` and the
  card falls back to the vendor value, unverified. **Never substitute a pretax-income
  tag as a fallback**: doing so manufactured false defects on IBM, LLY and HOOD during
  this audit.

---

## Real-Time Quote Streaming (WebSocket)

Live last-trade prices come from FMP's stocks WebSocket, **not** REST. This is the one place the app uses a push (not pull) data source, so it lives **outside** TanStack Query.

### Architecture — two cooperating systems

- **`lib/quoteStream.ts`** — a pure, React-free **singleton** WS client. One shared connection for the whole app, opened lazily on the first subscription and closed when the last subscriber leaves. Ref-counted per-symbol subscriptions (a symbol shown in two places opens one upstream sub). Ticks are coalesced into a 200ms flush window. Reconnect with exponential backoff; the symbol registry is replayed on every (re)connect; the socket drops while the tab is hidden and reopens on return.
- **`hooks/useLiveQuote.ts`** — `useSyncExternalStore` binding. `useLiveQuote(symbol)` re-renders **only** when that symbol ticks; `useQuoteConnectionState()` exposes `'idle' | 'connecting' | 'open' | 'reconnecting'`. Built on React 18's `useSyncExternalStore` — **no new state-management dependency**.

**Do NOT route ticks through TanStack Query.** It's pull/cache-based; pushing high-frequency ticks through `setQueryData` re-renders every observer and fights `staleTime`. The seam: **TanStack owns the REST baseline** (prev close, constituents, 52-week range); **quoteStream owns the live last-price leg**; components merge them (`live?.price ?? restValue`). When the socket is down/unconfigured, `useLiveQuote` returns `null` and the REST value stands in unchanged — graceful degradation, zero behavior change.

Endpoint defaults to `wss://websockets.financialmodelingprep.com`, overridable via `VITE_FMP_WS_URL`. Live data is **never persisted** (consistent with the on-demand-FMP convention).

### FMP WebSocket protocol — three hard constraints (each caused a real bug)

1. **Wait for the `login:200` ack before sending `subscribe`.** A subscribe that races ahead of auth gets `401 "Unauthorized"` — you authenticate but receive **zero** ticks, silently masked by the REST fallback. `quoteStream` flushes the subscription registry only on the login ack.
2. **Only ONE connection per API key, and ≤100 subscribed symbols.** A newer connection kicks the older with `{event:'login',status:401,message:'Connected from another location'}`. Two tabs/instances — **or the FMP website's own "Quote Feed Connector"** — will fight over the single slot. `quoteStream` supersedes gracefully (no auto-reconnect after a kick; the active tab reclaims on visibility). When debugging "no live data," check for a competing holder first. Separately, a `subscribe` with **>100 tickers is rejected wholesale** (`{event:'subscribe',status:401,message:'...limit of subscriptions...100 symbols'}`) — *no* symbols stream, not just the overflow. Surfaces that can exceed 100 (e.g. the Index Movers board) must use REST polling, not the stream.
3. **Tick `t` is epoch nanoseconds**, not ms — divide by 1e6. Read `lp` (last price) for the current price; it's present on both trade (`type:'T'`) and quote (`type:'Q'`) frames. Symbols come back lowercase; the store keys them UPPER to match `security_id`.

### Consumers

- **Stock-detail price** — the header metrics row on `SecurityDetailPage`; live overlays the REST `fetchQuote`, with a "Live" indicator.
- **At-Risk** (`AtRiskPage`) and **Watchlist** (`WatchlistPage`, prospects) — live price per card, gated to non-mutual-fund types via a `streamable` prop (FMP streams stocks/ETFs, not mutual funds).
- **Index Movers board** (`/index-movers`, `pages/IndexMoversPage.tsx`) — top-20 gainers/losers for **S&P 500 / Nasdaq 100 / Dow Jones** (the only indices with FMP constituent endpoints; Russell has index quotes but no constituent list). **This board does NOT use the websocket** — FMP caps websocket subscriptions at **100 symbols per API key**, so a 500-name (even a 101-name) board can't stream; a >100 subscribe is rejected wholesale with a 401 and *nothing* ticks. Instead the baselines query is **polled** (`refetchInterval`, 5s; pauses while the tab is hidden) and `hooks/useIndexMovers.ts` is a pure `useMemo` that re-sorts the latest prices. `lib/fmpIndexMovers.ts` fetches constituents (`/stable/{sp500,nasdaq,dowjones}-constituent`, cached 24h) and baselines (`/stable/batch-quote-short`, chunked ≤100/call, prevClose = `price − change`). **`%` change = `(price − prevClose) / prevClose`.** Do **not** use `/biggest-gainers` or `/biggest-losers` — they are a GLOBAL, micro-cap-dominated feed that ignores index membership. Rows whose ticker is in `securities2` (the tracked universe — looked up via `fetchSecurities`, UPPER `security_id` → numeric `id`) render the symbol as an indigo link to `/security/:id` with a leading dot; untracked rows are plain text.

## Review Schedules (stocks)

Stock reviews are earnings-driven, not cadence-driven (cadence is set by the model portfolio and is hidden from the review UI). The `MarkReviewedModal` shows three dates:

- **Review Date** = `last_earnings_release + 1 day` — the system-scheduled due date (read-only).
- **Date Reviewed** = today, when the button is clicked (read-only) → `review_log.reviewed_at` + `review_schedules.last_reviewed_at`.
- **Next Review Date** = `next_earnings_release + 1 day` → `review_schedules.next_review_at`.

**A held stock with no `review_schedules` row is invisible, and nothing used to
create one** (Nov 2026). The only live writer was `markReviewed`, so a row
appeared by *completing* a review — which you would only think to do if the
security showed on the calendar. HCA (Equity Income 2.50%, EI&CG 1.25%) and TSM
(Core Growth 2.00%, EI&CG 1.00%) sat held and never reviewed, raising nothing:
`ReviewCalendarPage` **and** the Actions hub both read `fetchReviewSchedules`.
(`upsertReviewSchedule` could have seeded one and had no caller.)

- **The PURCHASE PATH creates the schedule**, through `ensureReviewSchedules`
  in `lib/reviewSchedules.ts` — called from all four writers that put a security
  into `positions`: `createPosition`, `updatePosition` (when the ticker
  changes), `syncPositionsFromLatestSnapshot` (its `toInsert` set, already
  scoped to genuinely new holdings) and `syncPositionForGridEdit`. It wraps
  `upsertReviewSchedule`, which until Nov 2026 was an exported function with no
  caller at all.
  - **It is create-only in effect**, by filtering to the unscheduled first.
    `upsertReviewSchedule` OVERWRITES `next_review_at`, which here would be a
    real defect: the allocation import runs often, and re-importing a book
    would reset the next review date of every holding, including one reviewed
    that morning. The filter is what makes using it safe.
  - **It never throws.** The position is already written, so a scheduling
    failure must not report a completed purchase as failed — the same reasoning
    as `recordImportRuns`.
- **The calendar still SEEDS on mount as the backstop**, and calls the SAME
  `ensureReviewSchedules`, so the two surfaces cannot disagree about what a new
  holding's schedule looks like. **`newScheduleWrites` (pure) is the one place
  that says the two asset types are scheduled on different principles:** a stock
  from `next_earnings_release + 1 day`, refusing a stale date; a fund or ETF
  from the cadence default, since it has no earnings date to read.
  - **This is where a second gap hid.** The seed originally called
    `seededStockSchedules`, which skips funds, so **four held mutual funds —
    VBTLX, VIGAX, VMSAX and VVIAX, across two to four books each — stayed
    unscheduled while the stock gap read as closed.** It surfaced only because
    wiring the purchase path made `fetchUnscheduledHeldSecurities` report five
    rather than the zero a stock-filtered audit query had shown. **Audit both
    asset types or neither.**
  - `$Cash` and unheld tickers like `BRK.B` are correctly excluded — nothing to
    schedule, and an unheld security on the review calendar is noise.
- **It dates forward from `next_earnings_release`, never backward from
  `last_earnings_release`.** Dating from the last call would assert a review was
  missed; nobody knows that — the position may have been added last week or
  reviewed outside the system. A stale stored date is **refused**, not used.
- **The FMP top-up was widened to the unscheduled stocks, and that is what makes
  the seeding work at all.** It used to read only schedule rows, so TSM — whose
  stored `next_earnings_release` was three weeks past — could never be
  refreshed, and therefore never seeded, and therefore never refreshed. Order on
  mount is **seed-candidates → refresh stale → seed → re-date**.
- **The staleness test is strictly `< today`.** A stock whose call is *today*
  has a review due tomorrow; treating it as stale would advance the stored date
  past that call and skip the review.
- **A stored date that is WRONG but still in the FUTURE is invisible to a
  past-only test, and that cost HOOD its earnings briefs** (Nov 2026).
  `needsEarningsCheck` now also asks FMP about any stock reporting **within 21
  days**, because there is no way to know a future date is wrong except to ask,
  and a near-term reporter is the only case where being wrong costs anything.
  HOOD's stored date read 4 Nov against a call actually held on **27 Oct**;
  nothing questioned it for six weeks while `last_earnings_release` sat a
  quarter behind on 29 July. `pre-earnings-brief` screens on that stored date,
  so HOOD was never a candidate in its real window, and by the time the stored
  date brought it into view the job **correctly** refused to write expectations
  for a print already past. Since `research_reports_post_needs_parent` makes a
  post-brief impossible without a pre-brief, **that quarter can never be
  briefed** — eight held stocks were in this state for Q3 FY2026 (BLK, GLW,
  HCA, HOOD, JPM, NXPI, VZ, WELL), each showing a quarterly brief built from a
  call summary alone with no pair behind it.
  - **21 days is a bound, not a guess**: it covers an estimate moving up by up
    to three weeks (HOOD's moved eight days) against a pre-earnings window only
    about four days wide, while asking about **six** of the fifty-four held
    stocks rather than all of them on every mount. It catches both directions —
    a date stored LATER than reality (the fatal one) now, and one stored
    earlier (JNJ: 20 Jan vs 26 Jan) when it enters the horizon.
  - **The write-back itself never needed changing.** `refreshSecurityFromFMP`
    always wrote whatever FMP supplied, and the security detail page's
    write-through has always compared stored against live. Nothing was *asking*
    FMP about those symbols — the gate was the whole bug.
  - **`correctedFutureEarnings` reports a moved future date on its own line**,
    separately from a routine roll-forward: a date that went past and advanced
    a quarter is upkeep, while a future date that changed means the brief and
    review jobs were working to the wrong day. `refreshSecuritiesFromFMP`
    returns `EarningsRefresh[]` rather than a count so the caller can tell the
    two apart. NVDA was the live case on the first run — stored 18 Nov against
    FMP's 17th.

**The stock contract has TWO arms, and an audit that checks only the first
raises false positives.** `next_review_at = next_earnings_release + 1 day`,
**unless** the review is outstanding for a call that already happened
(`next_review_at <= last_earnings_release + 1`), in which case
`redatedStockSchedules` deliberately leaves it where it is rather than pushing
it a quarter out. On 5 Nov 2026 that was 47 rows on the first arm and 7 on the
second (the names that had just reported) — checking only the first arm reports
those seven as violations.

**A re-date may correct a date; it may never retire a review that has already
fallen due** (Nov 2026). The outstanding-review arm above only sees a review
dated at or BEFORE the call it belongs to, and a schedule dated off a
next-earnings ESTIMATE that never happened lands in the blind spot between the
real call and the next one. HOOD was live proof: stored `next_earnings_release`
read 4 Nov so its review was dated 5 Nov, while the call had been held on
27 Oct and never reviewed (last reviewed 4 May). The FMP top-up corrected the
dates to `last = 27 Oct, next = 9 Feb`; 5 Nov is after 28 Oct, the first arm
passed, and the re-date moved a review due THAT DAY out to 10 Feb 2027 —
cancelling the October call's review outright. `redatedStockSchedules` now
takes `today` and skips a row already due whose correction would defer it.
Nothing is moved BACKWARD: that would assert a missed review from a date no
call was held on. **Whether the calendar should go further and date such a row
from the call it actually missed is undecided** — 27 of 54 stocks carry an
unreviewed call, 20 of them showing a future review date, so it is a product
question, not a cleanup.

**An unreviewed call is surfaced as OVERDUE** (`outstandingCallReviewDay` /
`effectiveReviewDay`, Nov 2026). A stock's schedule is
`next_earnings_release + 1` — a FUTURE date — so the fact that the PREVIOUS
call came and went unreviewed was recorded nowhere the calendar or the Actions
hub reads, and a review nobody did simply stopped being asked for. On 5 Nov
2026 that was **27 of 54 stocks**: twenty showing a comfortable future date,
six never reviewed at all (MU, JNJ, JPM, BLK, TSM, HCA), and WMT, NVDA and HD
more than seventy days past a call. The Overdue count went 3 → 23.

- **Derived, never stored.** Re-dating those rows backward drifts: the daily
  FMP top-up moves `last_earnings_release` forward, so a stored overdue date
  would stay anchored to the older call while the real obligation moved on.
  Same reasoning as the derived Change Log and `committeeStage`.
- **The EARLIER of the two obligations wins**, not the derived one. UBER is the
  live case: its schedule reads 4 Nov while the call it has not reviewed was
  held on the 4th, so the outstanding day derives to the 5th and taking that
  alone would make a row already overdue read as due tomorrow.
- **A review ON the call day counts as covering it.** Earnings land pre-market
  or post-close and the scheduled date is the day after. Claiming otherwise
  manufactures an overdue row, and a signal that cries wolf gets dismissed —
  what `never_run` and the Watchlist's "AI research pending" already cost. No
  live row sits on that boundary (strict and lenient both give 27).
- **It names the MOST RECENT unreviewed call, not every one ever missed.** A
  stock that reports again while still unreviewed moves its obligation to the
  new print, so this answers "what is owed now". "Which calls were never
  reviewed" is a coverage report over `review_log` and is **not built**.
- **Funds return null via the classifier**, not a column test — a fund review
  is cadence-driven and has no call to be behind on.
- **Four surfaces read the one value**, because this page has already disagreed
  with `/reviews` about the same row (by a day, over gotcha 24) and this would
  have re-opened it by a quarter: the calendar's status/counts/cell, the
  Actions hub adapter (where the aging line carries "92d overdue"), and both
  `Next Review` blocks plus the header badge on `SecurityDetailPage`. **The
  calendar re-sorts on the effective day** — `fetchReviewSchedules` orders by
  the stored column, so without it DUK at 92 days overdue sorted BELOW HOOD at
  8. A row pulled back to its missed call says *for the call of <date>*; the
  date alone cannot say that, and an unexplained backward jump reads as a bug.

**The COVERAGE REPORT answers the other half: which calls were never
answered** (`lib/reviewCoverage.ts`, `/reviews/coverage`, Nov 2026).
`outstandingCallReviewDay` names only the MOST RECENT unreviewed call, so a
stock that reports again while still unreviewed moves its obligation to the new
print and the older miss stops being counted — and the regulatory claim is that
the firm reviewed each holding after each print, not after the latest one. This
walks the full call history against `review_log` and reports every gap. On the
first run: **54 held stocks, every one carrying at least one unanswered call,
75 missed against 72 reviewed — 49% of 147 answerable calls.**

- **Read-only and derived; it writes and stores nothing.** The call history and
  `review_log` are already the records of fact, so a coverage table would be a
  third copy that drifts from both — the Change Log argument again.
- **The WINDOW is the whole design, and the report names which floor it used.**
  Coverage starts at the LATER of `process_start` (the first review this system
  ever recorded, **derived from `review_log`, never hardcoded** — 13 Apr 2026)
  and `first_held` (earliest dated evidence the firm owned it). A report
  charging the firm for calls before it held a security, or before the tool
  recorded any review, is worse than none: every finding is one nobody could
  have acted on, and the reader discounts the whole artifact. **All 55 held
  stocks predate the process floor today**, so `first_held` binds for nothing
  now and for everything bought from here on.
- **A fresh print is `pending`, not `missed`.** A call is answerable only once
  `release + 1 day` has passed — the date `MarkReviewedModal` schedules and the
  same "due today is not overdue" line `isOverdue` draws. DUK reported the
  morning this was built; counting it would have led the list with a false
  finding. **`rate` divides by answerable calls only**, or the figure would
  drift down and back up every quarter for reasons unrelated to the work, and
  it is **null rather than 0% or 100%** when nothing is answerable.
- **A review answers the call it FOLLOWS, up to the next one** — by window, not
  by proximity. Nearest-call matching would credit a late review to the call it
  happened to be closest to rather than the one it addressed, and on a book
  where most names run more than 45 days behind the two differ constantly.
  Same-day counts (earnings land pre-market or post-close); the day before does
  not, or the report becomes a rubber stamp.
- **A security whose history cannot be read is REPORTED, not dropped** — and a
  200 carrying an empty array counts as unreadable too, since every public
  company reports. A holding missing from an audit report reads as one with
  nothing to answer for, which is the opposite of what a feed gap means.
- **Ordered by the OLDEST gap, not the miss count**: one call unanswered for a
  year is a worse finding than three unanswered last quarter. The **CSV is one
  row per CALL**, built beside the rule like `buildActionsCsv` — "DUK, 2 of 3"
  invites the next question, while the 4 Aug call and the date its review fell
  due answers it.
- **Its own page, not a tab on the calendar**: one FMP request per holding
  (bounded concurrency 4, `staleTime` 15min, `refetchOnWindowFocus` off), which
  a weekly worklist should not pay for, and the two are read at different
  times. Reached from the Review Calendar header; **deliberately not in the
  nav** — a governed surface nobody opens is the `NotificationsPage` mistake.
- **`fetchEarningsReleaseDates`** in `lib/fmpMarket.ts` is the shared reader of
  `/stable/earnings`; `fetchEarningsDates` now derives last/next from it, so
  the two cannot disagree about what a release date is.
- **`review_log` has NO `deleted_at`** — it is insert/read/delete only, so
  there is no soft-delete filter to apply and the rows that exist are the
  review record. A `.is('deleted_at', null)` on it 400s at runtime; the
  schema-typed client checks `.select()` columns but not filter columns.

**The SALE path retires the schedule, mirroring the purchase path**
(`retireReviewSchedules` + the pure `retiredSchedules`, Nov 2026). Nothing did
until then, so selling out of every book left the timer standing: VTABX, gone
from its last book in Mar 2026, still carried a review due 9 Dec 2026, and
APDFX, sold on 1 Oct, one due 29 Dec. Both would have come up on the Review
Calendar and in the Actions hub as reviews due for funds the firm does not own
— in an audit-defence tool a review recorded against an unheld security is a
false record of process, not merely noise. Wired into the three writers that
take a security out of `positions`: `deletePosition`, `updatePosition` (the
outgoing ticker) and `syncPositionsFromLatestSnapshot` (its `gone` set).
- **Held in one book is held.** The holders are collapsed before the difference
  is taken — APDFX sat in six books, and leaving one is a rebalance, not a sale.
  `retireReviewSchedules` re-reads `positions` for exactly this, so a caller can
  pass whatever it just removed.
- **The row is deleted, not flagged.** A schedule is a forward-looking timer;
  the reviews themselves are in `review_log`, and `review_schedules` is one of
  the nine `log_audit` tables, so the deletion is recorded. Hiding the row
  instead would be worse than either — `ensureReviewSchedules` filters to the
  *unscheduled*, so a hidden row blocks a clean re-seed and a re-purchased fund
  comes back carrying a date from its previous life.
- **The calendar sweeps too** (`fetchOrphanedSchedules`), because the sale-path
  wiring cannot reach a row whose position was removed before it existed. It
  runs FIRST, so the FMP top-up does not spend a call on an unheld security and
  the re-date does not move a review nobody should be asked to do.

`review_log.review_date` persists the scheduled due date alongside `reviewed_at`. `markReviewed()` takes an options object with explicit `reviewDate` / `nextReviewAt`; when omitted (funds), it falls back to cadence-based scheduling. Funds keep the legacy editable-date + cadence flow. `review_schedules.cadence` is NOT NULL, so always write a cadence value even when it's UI-hidden.

For stocks, `last_earnings_release` / `next_earnings_release` driving these dates come **live from FMP** (`fetchEarningsDates`), passed into `MarkReviewedModal` — not from the YCharts Excel upload. The same columns are written to `securities2` by `refreshSecurityFromFMP` because the cross-security list views (Review Calendar, review schedules) read the stored values.

### Stock review captures an investment recommendation (not a process outcome)

A **stock** review records an add/hold/trim/sell decision with a documented rationale and a frozen evidence snapshot (for audit defense). The stock path of `MarkReviewedModal` shows: a **Recommendation** (`add` / `hold` / `trim` / `sell`, required — **no `buy`**, see `review_recommendations` below), **conviction** (`high` / `medium` / `low`, optional), and a **required Rationale** (stored in `review_log.notes`). It has **no "Reviewed by" or "IPS suitable"** fields (single-user). Types + labels live in `lib/reviewLog.ts` (`Recommendation`, `Conviction`, `RECOMMENDATION_*`, `CONVICTION_*`).

- `review_log` columns: `recommendation`, `conviction`, `price_at_review` (numeric), `metrics_snapshot` (`jsonb`, shape = `ReviewMetricsSnapshot`). All nullable; **funds leave them null** and keep the `outcome` enum (Maintain/Propose/At-Risk → `no_issues`/`flagged_for_action`/`placed_on_watchlist`). Stocks leave `outcome` null.
- The **evidence snapshot is frozen at submit time** from on-demand FMP (`fetchScorecardMetrics` + `fetchAnalystData` + `fetchQuote`, deduped with the page's queries) so a review stays reconstructable later even though stock metrics are never persisted. `ReviewLogSection` shows the recommendation badge, conviction, rationale, and the frozen metrics.
- `markReviewed()` takes `recommendation` / `conviction` / `priceAtReview` / `metricsSnapshot`; pass them for stocks, null for funds.

### A stock review is ALSO a PDF — the decision plus that quarter's brief

A stock review writes **both** halves now: the `metrics_snapshot` jsonb (the
frozen evidence, queryable) **and** a PDF in `Security Documents/<ticker>`,
recorded on `review_log.evidence_doc_path` like the fund one. The document is
the decision, the evidence it was taken against, and **the quarter's brief
stapled on as its second half** — one file.

- **It is INTERNAL.** The quarterly brief alone is shaped to be handed to a
  client; the review half carries the allocation recommendation, conviction, the
  open questions and the rationale, so the combination must not leave the firm.
  Every page says so in the footer.
- **The brief is embedded through `drawQuarterlyBrief`**, the same renderer the
  standalone client-facing PDF uses — extracted from `buildQuarterlyBriefPdf`
  for exactly this. Two renderers of one document is how a page and a PDF drift.
- **A missing brief does NOT block the review.** Most quarters carry no
  post-brief and no call summary, and `canBuildQuarterlyBrief` refuses to build
  one from expectations alone. The document states which quarter had nothing
  rather than omitting the section — a reader must be able to tell "nothing was
  written" from "we left it out".
- **Unlike the fund path, an upload failure does NOT abort the review.** For a
  fund the PDF is the only frozen evidence, so recording without it loses the
  record; for a stock the jsonb snapshot already freezes it, so the document is
  the readable artifact rather than the record. The modal stays open with an
  amber note and the backfill can rebuild it.
- **`review_log.source_report_id`** (FK → `research_reports`, `ON DELETE SET
  NULL`) records WHICH brief a review was drafted from. It was prose in the
  rationale — "Drafted from the post-earnings brief of Nov 3, 2026" — so the
  quarter had to be inferred from the review date, which picks the wrong one
  whenever a review is recorded late. `lib/reviewBrief.ts` keys on the brief's
  own `(fiscal_year, quarter)`.
- **Backfill:** `npx vite-node scripts/reviews/backfill-stock-review-pdfs.ts`
  (`--dry-run` first). It imports the app's own builders so a rebuilt document
  is what the app would have produced, only touches rows with no
  `evidence_doc_path`, and stamps every page **"Rebuilt from the recorded review
  on <date>"** — a reconstruction must not read as a contemporaneous freeze. The
  25 reviews from 28 Oct – 2 Nov 2026 were backfilled this way, all 25 with a
  brief. Needs the Express server running.
- **`review_log` had no UPDATE policy** until Nov 2026 — insert, read and delete
  only — so an update was silently dropped (PostgREST reports success, zero rows
  affected). That is not append-only; a DELETE policy already existed. It
  surfaced when the first backfill run uploaded all 25 PDFs and recorded none of
  them.

### Fund/ETF review captures a PDF evidence document (not a jsonb snapshot)

A **fund/ETF** review keeps the process `outcome` enum (Maintain/Propose/At-Risk) + notes, but ALSO freezes the Category + Peer group scorecard/metrics **as a PDF uploaded to Storage** — the audit analogue of the stock jsonb snapshot (stocks read on-demand FMP → jsonb; funds' metrics are already stored on `securities2` → a rendered document). Stocks are unaffected.

- **Shared scorecard logic** lives in **`lib/fundScorecard.ts`** (`buildFundScorecard(security, 'category'|'peer')`, `fmtScorecardValue`, `categoryScorecardScore`/`peerGroupScorecardScore`) — React-free, the single source for BOTH the on-page `FundScorecard.tsx` tables and the PDF. Don't re-implement the tier/score math; call `buildFundScorecard`. (`FundScorecard.tsx` is now just presentation; `FundMonitoringPanel` imports the score fns from the lib, not the component.)
- **PDF builder** = **`lib/reviewEvidencePdf.ts`** (`buildFundReviewPdf`, `jspdf` + `jspdf-autotable`) → returns `{ blob, filename }`, filename `${ticker}-review-${YYYY-MM-DD}.pdf`. Captures headline metrics + trailing returns/ranks + **both** scorecards + the outcome/notes.
- **`MarkReviewedModal` takes ONE path-selecting prop — `fundSecurity: SecurityDetail | null`** (Nov 2026), required so a caller must decide rather than inherit a default. It used to be two, an `isFund` flag beside an optional `security`, and they could disagree: the **Review Calendar passed neither**, so all 42 of its fund/ETF rows took the stock path — writing a `recommendation` funds never carry and silently skipping the evidence PDF (`uploadFundEvidence` returned null on `!security`). It never fired, but it was one click away on 42 rows. The calendar now loads the record on demand (`fetchSecurityById`, keyed `QUERY_KEYS.security(id)` so it shares the detail page's cache) and opens the real fund modal; it does **not** send funds to the security page, because the calendar is the review-completion workflow and that would have removed nearly half its rows from it. Classification still happens at the call site via `isFundOrEtfSecurity`.
- **The fund path of `MarkReviewedModal`** (widened to `max-w-3xl`, taking the `fundSecurity` record) embeds the live `FundMonitoringPanel` as the "Evidence at review" block, then on submit builds the PDF, uploads it to the **`Security Documents`** bucket under the `<ticker>` folder (`uploadFile`), and records the review with `evidenceDocPath = "<ticker>/<filename>"`. **Upload + record are ATOMIC** — if the upload throws (e.g. Express file server down), the review is NOT recorded and a clear error shows; never a review without its evidence.
- `review_log.evidence_doc_path` (text, nullable) stores the path; `ReviewLogSection` renders an **"Evidence PDF"** link (opens via `getSignedUrl(path, SECURITY_DOCS_BUCKET)`). Stocks leave it null.
- **Funds/ETFs now have a Documents section** on the detail page (the same `DocumentsFolderPanel` stocks use, `Security Documents`/`<ticker>`) so the uploaded evidence is browsable; the review mutation invalidates `documentsFiles(SECURITY_DOCS_BUCKET)`.

## Portfolio Reviews (cadence-driven)

Portfolio-level reviews are **separate from per-security reviews** (above) and from the per-security `review_schedules`/`review_log` tables. **The annual REPLACES the fourth quarterly**, so a portfolio runs **three
quarterly reviews and one annual** a year and never two on the same day
(`advanceSchedule`, Nov 2026).

This document used to say the timers were "independent … and advance
separately", and they were: quarterly stepped +3 months and annual +12, each
ignorant of the other. That gives FOUR quarterlies and an annual every year,
and a guaranteed collision when the fourth quarterly lands on the annual's own
date. The seed trigger made it certain from birth by inserting both at `now()`
— every one of the 19 portfolios started colliding, and Foundation Conservative
was still sitting on it (both due 30 Sept 2026) when this was found.

- **The annual is the anchor.** `quarterlyAnchorFor(annualDue)` is annual − 9
  months and is the single definition of the invariant; the quarterlies fall at
  −9, −6 and −3 and the annual takes the fourth slot.
- **Completing an annual re-anchors the quarterly** as well as advancing
  itself, which is why `completeReview` writes two schedule rows for that
  cadence and reads the annual's due date before writing anything.
- **Completing a quarterly steps +3 months unless that reaches the annual**, in
  which case the annual covers the slot and the quarterly moves to three months
  beyond it — **but only while the annual is still AHEAD of the completion.** An
  overdue annual has already missed its slot and cannot claim a future one;
  letting it pinned the quarterly to `annual + 3 months`, which is a date on or
  BEFORE the completion, so the review stayed due the instant it was signed off
  (Foundation Conservative, annual overdue 30 Sept 2026 and quarterly due 30
  Dec, returned 30 Dec) or was born overdue (an annual stale by a year returned
  eleven months in the past). Fixed Nov 2026; `reviewCadence.test.ts` asserts
  the property — no annual due date, at any staleness, yields a next quarterly
  that is not strictly after the completion.
- **An explicit next-review date from the Summary section still wins** for the
  cadence being completed, and the re-anchored quarterly follows the date
  actually used — not the default — so the two cannot end up inconsistent.
- **A larger review ABSORBS the monthly that lands on its date** (Nov 2026).
  Monthly is Equity-only and still steps +1 month, but a step onto the
  quarterly's or annual's own day skips to the next month — so an Equity book
  runs **8 monthly + 3 quarterly + 1 annual = 12 sittings a year, no two on one
  day**. It was 16 with four collisions: monthly on the 4th against quarterlies
  on 4 Feb / 4 May / 4 Aug and the annual on 4 Nov.
- **The absorbing review therefore CARRIES the monthly's two checks**, and this
  did NOT transfer from the quarterly/annual rule. There was no redundancy to
  absorb: the Equity quarterly never included `position_sizing` or
  `performance_attribution`, so a quarterly simply swallowing the monthly would
  have dropped that month's sizing and attribution — 8 a year instead of 12.
- **The dodge is one DAY, not one month.** A monthly a fortnight after a
  quarterly is fine and keeps its own day; only an exact collision moves. It is
  bounded (12 attempts) rather than a single step, because real rows are not
  always well formed — Foundation Conservative's annual sat overdue for weeks —
  and a quarterly one month from the annual would otherwise dodge onto it.
- **`advanceSchedule` takes a named `OtherDueDates` object**, not a bare
  `annualDueAt`: a quarterly needs the annual's date, a monthly needs both, and
  two adjacent nullable `Date`s is the shape that let `MarkReviewedModal`'s
  `isFund` disagree with its `security`.
- **`reviewCadenceShapes.test.ts` walks the nineteen REAL shapes** (a 4 Nov 2026
  snapshot, not a live mirror) three years forward and asserts no two cadences
  ever share a day, every sitting moves forward, and a full year holds the right
  MIX — 8 monthly + 3 quarterly + 1 annual for an Equity book, 3 + 1 for a fund.
  The mix assertion is load-bearing: "no collisions" is also what you get by
  silently dropping reviews. Its value is Foundation Conservative's overdue
  annual sitting alongside eighteen healthy books — the idealised 12-cycle
  simulation written with the first fix passed through all three defects,
  because it only ever modelled healthy timers completed on their due dates.
- The seed trigger now starts a new portfolio's quarterly at `now()`, its
  annual nine months out, and an Equity book's **monthly one month out — not at
  `now()`**, which put every new Equity portfolio on the quarterly's own day.
  The absorb rule above only runs when a review is COMPLETED, so a seeded
  collision is one nothing clears until the advisor finishes something; the seed
  has to be clean on its own. `schemaContract.test.ts` pins both the offset and
  the Equity guard, since prose did not stop it the first time. **Monthly is Equity-only**: individual-stock strategies (`portfolio.portfolio_strategy = 'Equity'` — Core Growth, Equity Income, Equity Income & Core Growth) get monthly + quarterly + annual; the fund/ETF strategic models (Foundation/Hybrid/ETF/Fixed Income) get **quarterly + annual only**. `cadencesForStrategy(strategy)` in `lib/portfolioReviews.ts` is the single source for which cadences apply (mirrors the seed trigger); `PortfolioReviewsPanel` takes `portfolioStrategy` and renders only those cards, and `PortfolioReviewWorkspace` blocks a disallowed cadence (e.g. a direct `/review/monthly` URL on a fund portfolio).

**`model_portfolio_data.review_frequency` is RETIRED — review cadence is not a model-level setting.** The column and its values stay in the DB and on the `ModelPortfolio` type (so the domain type still matches the generated row type), but nothing reads or writes them: the Review Frequency control was removed from the model editor and the Model Portfolios list in Nov 2026. It drove nothing — only the editor that wrote it ever read it — while sitting one page away from the real timers and appearing to contradict them, which is exactly how it surfaced: the editor showed Core Growth as "Quarterly" while the Actions hub correctly showed a monthly review due, because Core Growth is an Equity strategy. Don't re-add a model-level review cadence; `cadencesForStrategy` + the seed trigger are the authority. **Contrast `rebalance_frequency`, which IS live** — `lib/rebalanceSchedule.ts` reads it to date the rebalance timers, so the two neighbouring fields are not the same kind of thing. Data layer is `lib/portfolioReviews.ts`. The Reviews tab on `PortfolioDetailPage` renders `PortfolioReviewsPanel` (the three cadence status cards + completed-review history); **"Start Review" navigates to a dedicated workspace page** (`PortfolioReviewWorkspace`, route `/portfolio/:portfolioId/review/:cadence`) — there is no longer a review modal. The workspace is the right container for the data volume (a 29-holding grid + per-holding scorecards + watchlist), and the annual review will have more sections still.

### Two tables

- **`portfolio_review_schedules`** — one row per `(portfolio_name, cadence)` (unique constraint on that pair; FK `portfolio_name → portfolio.name ON DELETE CASCADE`). Columns: `cadence` (`monthly`/`quarterly`/`annual`), `last_reviewed_at`, `next_review_at`. Every portfolio gets **quarterly + annual** rows; **only Equity portfolios also get a `monthly` row** (`next_review_at = now()`). New portfolios seed automatically via an `AFTER INSERT` trigger on `portfolio` (`seed_portfolio_review_schedules()`, idempotent `ON CONFLICT DO NOTHING`) which conditions the monthly insert on `new.portfolio_strategy = 'Equity'`; a migration dropped the pre-existing monthly rows for non-Equity portfolios. The rows cascade-delete with the portfolio. Cross-portfolio "due" queries (`fetchPortfolioReviewSchedules`) drive the HomePage **"Portfolio Reviews Due"** card (and the Actions hub), so deleting the monthly rows is what removes monthly from those surfaces.
- **`portfolio_review_log`** — the review record (draft *or* completed). `status` (`draft`/`completed`, default `completed`); a **partial unique index `(portfolio_name, cadence) WHERE status='draft'`** enforces at most one open draft per cadence (resuming reuses it). Other columns: `cadence`, `review_date` (the due date it addressed), `reviewed_at`, `completed_at`, `next_review_at`, `notes` (summary), and **`checklist` `jsonb`** = `ReviewChecklistItem[]` (each `{key, label, done, notes}`, one per section). History (`fetchPortfolioReviews`) filters `status='completed'`. The legacy `outcome`/`period`/`reviewed_by` columns are nullable and unused.

### Checklists are the documented process

**The fund/ETF QUARTERLY review has its own list** (Nov 2026): position sizing →
performance attribution → **scorecard review**, then the built-in summary. It is
not the Equity list with extras prepended, because the shared sections ask a
fund holder stock questions it cannot answer — `full_monitoring` wants a
Business Trend and a Valuation call of attractive/fair/expensive,
`thesis_scorecards` wants a thesis when `security_theses` is stocks-only by
design, and the annual `deep_review` asks whether the moat is intact and whether
"there is a better STOCK for the same role". **Four fund reviews were opened
under that list and none was ever completed.**

- **`scorecard_review` shows each holding against the cohort
  `securities2.scorecard_cohort` names**, with a Category/Peer toggle — the same
  default the per-security review modal uses, so the two surfaces cannot show a
  holding a different scorecard. A fund with no cohort set is said so rather
  than quietly defaulted.
- **A TRACKED FUND IS SEEDED TO `category` AUTOMATICALLY** (Nov 2026).
  `needsDefaultCohort` + `seedScorecardCohorts` in `lib/securities.ts` are the
  one place that decides it; it runs from `fundBulkUpload` after every workbook
  import and from `addProspect` on every watchlist add. The manual
  Category/Peer toggle on the fund page is unchanged and still the only way to
  set `peer`.
  - **`peer` is a deliberate override, not the other side of a coin flip**, so
    it stays manual. All six funds carrying it are ones whose Morningstar
    category mis-describes the mandate and whose peer group reads it better —
    AVERX ("Value Focused") filed Mid-Cap Blend against a Multi-Cap Growth peer
    group, FTZIX ("Unconstrained") the same, IDHIX (a dividend-harvest fund)
    filed Large Value against Equity Income Funds, VFMO (a momentum factor ETF)
    filed Mid-Cap Blend. **Nothing in the data derives that**: measured 9 Nov
    2026, all 59 graded funds score 9 of 9 scoreable metrics on BOTH cohorts,
    so availability cannot choose between them. The default is the 53-of-59
    answer.
  - **FILL-THE-NULL, never recomputed** — the opposite of its neighbour
    `is_benchmark_proxy`, which is re-derived on every import precisely so it
    cannot drift. A cohort is a human's call, so re-deriving would silently
    revert those six. Same shape as `ensureReviewSchedules` filtering to the
    unscheduled first.
  - **A STOCK NEVER GETS ONE, and this is the guard that would do damage if
    dropped.** 54 held stocks carry a hand-set `category_name` (see
    `setSecurityCategory`), so "has a category and no cohort" describes every
    stock in the book — a column test alone would have written a fund-only
    setting onto all 54. Gated on `isFundOrEtfSecurity`, and the 55 stock rows
    are cleanly separable because every one has `detailed_security_type =
    'stock'` and none carries a peer group, fund company, family or expense
    ratio.
  - **A benchmark proxy never gets one either**, and all 33 of today's
    remaining nulls are exactly those. Proxies are re-flagged BEFORE the
    seeding runs, because `is_benchmark_proxy` already subtracts held ∪
    watched — a former proxy that has since been bought or watched only
    becomes eligible once that flag is cleared.
  - **No `category_name`, no cohort yet.** There is nothing to grade it
    against, and it keeps the Watchlist card honest: "Category pending" and
    "No cohort" now resolve in one step instead of one badge clearing and the
    other remaining.
  - **The watchlist add is a no-op for a genuinely new fund**, because
    `prospects.security_id` has no FK and the `securities2` row does not exist
    yet. The workbook import seeds it on the next refresh — minutes, via the
    poller. Only an already-known ticker (a past holding, a proxy, a fund the
    workbook has already fetched) is seeded on the spot.
  - **It never throws**, like `markBenchmarkProxies` and `recordImportRuns`:
    the caller's own write has already landed, and the cost of missing a
    default is one manual click rather than a wrong number —
    `designatedCohort` already reads a null as `category` for grading.
  - **`scripts/audit/scorecard-cohort-coverage.ts`** answers "is anything
    waiting" on demand (`npx vite-node
    scripts/audit/scorecard-cohort-coverage.ts`), calling the same
    `needsDefaultCohort` so the script and the app cannot disagree. It excludes
    `$Cash` via `isCashTicker` — a held row with no type and no category, which
    otherwise appears as a finding on every single run.
- **The flag decision sits with the evidence**, on that step rather than in the
  summary: deciding in the summary means deciding away from the numbers.
- **Flagging records the FAILING READINGS**, via `atRiskMetricsFromScorecard`
  (`lib/fundAtRisk.ts`). Tier 4 is the scorecard's own definition of a
  bottom-tier reading, so no new threshold is invented; the comparators frozen
  onto the entry are the **tier-3** line (out of tier 4) and the **tier-2** line,
  taken from `ScorecardRow` rather than restated. That makes the shared colour
  rule say the right thing — still tier 4 reads red, back in tier 3 reads amber,
  and **amber clears the flag**. `basis` is `benchmarks` (live), because a fund's
  cohort re-ranks every quarter.
- **This fixes a real gap.** The fund path called `addToAtRisk(securityId, [], …)`
  — an EMPTY array — so IAGG sat on the list with no metrics, nothing to
  re-measure, and a sell timer on the longest rung because `calcRemovalDate`
  sizes on the failing count. **Worse, it could never raise a breach alert**:
  the job fires on "any metric still red", which over an empty array is false
  for ever, so the entry would have sat flagged past its timer with
  `alert_events` never hearing about it.
  - **BACKFILLED 12 Nov 2026** by `scripts/atrisk/backfill-fund-metrics.ts`
    (dry-run by default), which calls the same `designatedCohort` →
    `buildFundScorecard` → `atRiskMetricsFromScorecard` chain, so a backfilled
    entry is what a flag raised today would have recorded. IAGG took three
    bottom-tier readings against its category — Sharpe 3Y 56, Information
    Ratio 3Y 60, Alpha 3Y 54, all against a tier-3 line of 51 — and all three
    grade RED, which is the property that matters: these are rank percentiles,
    so `higherIsBetter` is **false**, and had it been carried wrong they would
    have graded green and the entry would still have been unalertable.
  - **The readings are TODAY'S, not the flag day's, and the note says so.**
    Nobody kept the figures from the day it was raised, and writing them
    silently would assert the fund was flagged on numbers it was not — a false
    record in an audit-defence tool. Same shape as the 29 Oct 2026 sell-timer
    re-anchor recording each original date in its notes.
  - **The sell timer was NOT re-derived.** It is set once, never recalculated;
    the script reports what the new count implies (3 reds → 2 reports, ~May
    2027 against the stored Sept 2027) and changes nothing, leaving that to the
    advisor. `nextEarnings` is deliberately not passed for a
  fund: it does not report, so the day table is the right basis.
- **The summary leads with At-Risk**, scoped to the portfolio's own holdings
  (`at_risk` is keyed by security, so the firm-wide list is mostly Equity
  stocks). Entries added since the draft opened are badged; clearing requires a
  reason, which is CHECK-enforced anyway. **Fund books only** for now.
**The fund/ETF ANNUAL review** (Nov 2026) is the quarterly's three evidence
steps, then **considerations → committee review → final decision**. The stock
`deep_review`, `conviction_rankings` and `portfolio_construction` sections are
gone from it: the tier bands never fitted a book of five funds at twenty to
forty percent each, which `hasConvictionTiers` already says in the model editor.

- **The ORDER is the control**, and what it governs CHANGED in Nov 2026. The
  Considerations step used to ask the advisor for a per-holding Proposal,
  Target % and Rationale; it now asks what each holding should be **weighed
  against** — the watchlist ideas that would compete for the same sleeve. The
  advisor names the comparison and does not make the call, so there is no
  advisor proposal for the committee's view to contaminate.
  - **`alternativeKey` decides what "the same sleeve" means**, and it is NOT
    always `category_name` (Nov 2026). **Mid- and small-cap pool across
    styles**, because `ASSET_CLASS_ROWS` gives large cap three rows — blend,
    growth, value — and mid and small ONE each: where the firm's own taxonomy
    says style is not a distinguishing feature, the alternatives must not
    pretend it is. FTZIX and AVERX (Mid-Cap Blend) were being offered only
    RSIYX while QVAL, NAMAX and FSMVX sat on the list competing for the same
    sleeve, and OBSIX (Small Growth) was offered nothing at all. The footer
    went 15 of 16 holdings to 16 of 16.
  - **`POOLED_SLEEVES` is a LIST, not "every sleeve the taxonomy does not
    split".** Non-US developed is also one row, and pooling it would offer
    TIBIX — a global allocation fund placed there by a per-ticker override —
    against two foreign large-blend index funds. One sleeve holding things
    that are not substitutes for each other is a judgement about the book, not
    something to derive. Large cap, foreign, emerging and every bond sleeve
    still match on the exact category.
  - The builder is **`watchlistAlternativesByKey`**, renamed from
    `…ByCategory`: calling it a category grouping when two sleeves group by
    something else is how a name starts lying. `alternativesFor` takes the
    holding's `security_id` as well as its category, because the sleeve
    resolves through `ASSET_CLASS_OVERRIDES`, which is keyed by ticker. The freeze still
  matters for the free-text note, which is written before the committee looks;
  and the final step still pre-selects **neither** the committee's
  recommendation nor a decision, because defaulting to the committee would
  make the decision an acceptance and defaulting to the advisor would make the
  handoff ceremonial.
- **The handoff has NO APP-SIDE GATE, and the job's gate had to be rebuilt
  when the proposals went** (Nov 2026). Review 30 (Foundation Conservative)
  reached the queue with all four pre-committee sections ticked `done` and
  nothing behind them, so `portfolio-committee-review` learned to skip a
  review carrying **zero `holding_reviews.proposed_decision` rows AND no
  `considerations`**. The redesign made that test true of EVERY handoff —
  nothing writes `proposed_decision` any more and the note is optional — so it
  would have skipped review 36 (Hybrid Balanced — 16 holdings and no note on
  9 Nov 2026) as empty. **It now gates on the portfolio having holdings at all**, the one
  thing that can still genuinely be missing: the rest of the briefing (each
  holding, its category, the ideas competing in it) is derived, so the advisor
  cannot leave it blank. An **uncategorised** holding is reported in the memo
  rather than skipped — the same null drops it out of the allocation rollup,
  so the risk manager is the person who needs to hear about it. Withdrawing a
  handoff stays the advisor's call, never the job's.
- **The prompt's examples are DATED, not current, and deliberately so.** The
  watchlist and `securities2.scorecard_cohort` are being filled in as this is
  written, so how many holdings have an alternative, and which cohort any pair
  is graded in, both change week to week. Every count in the prompt carries
  its observation date and every rule stands without it — the §23 lesson
  applied to a prompt: do not duplicate a fact that lives somewhere
  authoritative, and the query is the authority here.
- **The committee prompt's model lookup joined on the wrong key** and was
  fixed in the same change. `portfolio_model_map` keys on the portfolio's own
  `security_id` — a YCharts id like `P:2371412` — **not on its name**, so
  `where pm.security_id = :portfolio` matched nothing for all sixteen fund
  books and would have handed the PM a construction question with no targets
  to answer it against. Go through `portfolio` as `useResolvedModelPortfolio`
  does, and report a missing mapping rather than falling back to
  `investment_objective`, which is not unique.
- **`committee_requested_at` IS the queue, and the stage is DERIVED.**
  `committeeStage()` reads two facts — requested or not, memo or not — and
  there is deliberately no stored status column, which could contradict either.
  Withdrawing a handoff after a memo exists still reports `delivered`: the work
  exists and the review has to show it.
- **The app cannot run the committee and does not pretend to.** The roles run
  in Claude Code; there is no Express → Anthropic bridge. The waiting state
  says who acts next and how, rather than describing an absence as if something
  were coming — the mistake the Watchlist card's "AI research pending" made,
  where FCX sat 23 days with nothing behind it.
- **`portfolio_review_memos` is the deliverable**, portfolio-scoped, which
  `ic_memos` cannot be (its `security_id` is NOT NULL and it is keyed to a
  candidate). The risk leg still writes its own `risk_reports` row — that table
  already supports portfolio scope — and the memo REFERENCES it rather than
  copying it, so the two cannot disagree about what risk said. A partial unique
  index allows one live memo per review.
- **`holding_reviews.proposed_decision` / `proposed_weight` /
  `proposed_rationale` NO LONGER HAVE A WRITER** (Nov 2026) — they went with
  the Considerations columns. `lib/holdingReviews.ts` still reads and writes
  them and the columns keep their stored rows, so review 30's seven are the
  record as written; nothing sets them on a new review. **Do not refill them,
  and in particular the committee must not**: no screen renders them now, so a
  committee view filed there would be both a false record of who held it and
  an invisible one. That is not hypothetical — those seven rows are
  AI-drafted, which is what the redesign came out of. `annual_decision` /
  `annual_notes` are the decision of record, and the final step marks the row
  **override** (renamed from `split`) where it differs from the MEMO's
  recommendation — the committee against the advisor, which is the comparison
  that means something now.
- **Recorded only.** Nothing writes `positions` or stages a trade, matching the
  candidate workflow's CIO decision.
- **`saveReviewMemo` exists so the write contract is type-checked**, even
  though a Claude Code run is what calls it — column names living only inside a
  prompt is the failure the committee write API was built to stop.

`PORTFOLIO_REVIEW_TASKS` in `lib/portfolioReviews.ts` defines the base task list per cadence (monthly: performance attribution · position sizing; quarterly: full monitoring review · update thesis scorecards · update watchlist status · check valuation changes; annual: deep review of every holding · rebuild conviction rankings · reassess portfolio construction · check valuation changes). **`reviewTasksFor(cadence, strategy)` is the authoritative resolver** — **every** quarterly and annual list now opens with **`position_sizing` then `performance_attribution`**, for two different reasons that arrive at the same place: fund/ETF portfolios have no monthly review at all, and an Equity quarterly or annual **absorbs** the monthly that falls on its date (see the cadence rules above), so it has to carry that month's two checks. Only the monthly list itself differs, keeping its own `performance_attribution`-then-`position_sizing` order. Change tasks here and the workspace sections + history follow. **In the workspace each task is a section** (left nav); a section = its special content (below) + a "Mark reviewed" toggle (the `done` flag) + section notes.

### Workspace draft lifecycle

`PortfolioReviewWorkspace` opens a **draft** via `startOrResumeDraft(portfolioName, cadence, dueDate, strategy)` (resumes the open draft for that cadence, else creates one with a checklist seeded from `reviewTasksFor(cadence, strategy)`). A **resumed draft is reconciled** against the current task list (`reconcileChecklist`) — newly-added sections (e.g. position sizing / performance attribution) are inserted in order and the reconciled checklist is written back, carrying over each existing task's `done`/`notes` by key — so a task-list change reaches open drafts without wiping progress. (The workspace waits for `portfolio` to load before seeding so the strategy is known.) Edits live in local state and **autosave on a 1.5s debounce** (plus an explicit "Save draft") via `saveReviewDraft` (checklist/notes/dates) + `saveHoldingReviews` (per-holding, delete-then-insert). **"Complete review"** calls `completeReview(...)` — stamps `status='completed'` + `completed_at`, sets `reviewed_at`/`next_review_at`, and advances ONLY that cadence's `portfolio_review_schedules` row (`onConflict: 'portfolio_name,cadence'`) — then navigates back. `next_review_at` defaults to the cadence interval (+1mo/+3mo/+1yr). The workspace init query uses **`gcTime: 0`** and `completeReview`'s `onSuccess` **must not invalidate** `['review_workspace', …]` — otherwise a mid-session refetch resurrects a fresh draft. `isOverdue`/`isDueSoon` are re-exported from `reviewSchedules.ts`. After completing, invalidate `portfolioReviews(name)`, `portfolioReviewSchedules`(+`For`), `holdingReviews(name)`. The resolved `modelPortfolio` (for sizing bands) comes from the shared `useResolvedModelPortfolio` hook (`hooks/usePortfolio.ts`).

### Section content

- **`performance_attribution`** (Equity monthly; fund/ETF quarterly & annual) → `AttributionMovers` — a **"Trailing Returns"** block ranking holdings by **contribution** (`fetchPortfolioMovers`) and reconciling to 100% of the book. Returns are **YCharts for funds/ETFs, FMP for stocks** — see "YCharts owns fund/ETF data" above — and the block names both the weight basis and the return source. Each window is its own query.
  - **The FUND ANNUAL review shows 3 Month · YTD · 1 Year; every other review keeps 1 Month · 3 Month** (Nov 2026). A fund book has no monthly review at all, so its annual sits furthest from the last look at the numbers, and ranking a year of decisions against a thirty-day window measures noise — a bond sleeve's month says nothing about whether holding it for the year was right. **`attributionWindowsFor(cadence, strategy)`** in `lib/portfolioReviews.ts` is the authoritative resolver, beside `reviewTasksFor` and for the same reason; the component takes the result as a prop so it cannot become a second place that decides. Scoped to the annual deliberately: a fund quarterly reading 1M/3M is coherent, and an Equity monthly is a thirty-day check by definition.
  - **A window is a NAMED period (`AttributionWindow`), not a day count.** YTD is calendar-anchored — 309 days on 5 November, 5 days on 5 January — and the YCharts column behind it is a calendar figure, so keying the lookup on `days` would have meant inventing a number wrong on every date but one, and silently mapping a fund's calendar YTD onto a rolling request. Each leg resolves it in its own terms: `storedReturnFor` picks the column, `attributionWindowStart` dates the price series, and **both are exported and tested** because a mis-mapped window is invisible on screen — YTD pointed at the three-month column renders two identical rankings under two headings, which reads as coincidence rather than a bug.
  - **All 44 held fund/ETF securities carry `ytd_total_return_nav` and `one_year_total_return_nav`**, so the longer windows add no unpriced rows. `QUERY_KEYS.portfolioMovers` went to `v3` when the key's second argument stopped being a number.
- **`position_sizing`** (Equity monthly; fund/ETF quarterly & annual) → `PositionSizingCheck` — **allocations file upload** (YCharts export: col A ticker, col B weight %; `.xls/.xlsx/.csv`). `parseActualAllocations` + `compareSizing` (`lib/positionSizingCompare.ts`) compare each holding's actual weight to its effective band and surface **only breaches**. Display-only. Bands from `computePositionBands` (`lib/positionBands.ts`) — explicit limits win, else `roundToHalf(target × (1 ± drift%/100))`; cash uses model cash limits. Keep in sync with the same logic inlined in `PortfolioDetailPage`.
- **`full_monitoring`** (quarterly) → `HoldingMonitorGrid` — five review *areas* as guidance, then a per-holding grid of five categorical assignments: **Thesis Status** (intact/at_risk/broken), **Business Trend** (improving/stable/deteriorating), **Valuation** (attractive/fair/expensive), **Conviction** (high/medium/low), **Action** (add/hold/trim/exit/watchlist).
- **`thesis_scorecards`** (quarterly) → `ThesisScorecardSection` — collapsible per-holding cards with five text fields (original thesis, what changed this quarter, evidence for, evidence against, current conclusion). "Evidence behind the ownership decision," not a thesis rewrite.
- **`watchlist_status`** (quarterly) → `WatchlistStatusSection` — trigger reference + a per-holding flag; when flagged, a trigger select (6 enum tokens) + reason / required improvement / review deadline / exit trigger.
- **`deep_review`** (annual) → `DeepReviewSection` — the "build from scratch today?" purpose + 7 guidance areas (business quality · competitive position · management · financial strength · growth runway · valuation · alternatives), then a per-holding **decision** (keep/increase/reduce/replace/exit) + optional rationale.
- **`conviction_rankings`** (annual) → `ConvictionRankingSection` — tier reference (Tier 1–4 → meaning + target band), then a per-holding **tier** select with current weight, the tier's target band, an **amber out-of-band flag** when the weight doesn't fit the tier, and a prior-conviction hint (most recent quarterly `conviction` from history). The **target bands are editable per model portfolio** — `model_portfolio_data.tier{1..4}_{lower,upper}` (defaults 5–7/3–5/1–3/0–1, set in the Edit Model Portfolio modal's "Conviction Tiers" table); `resolveTierInfo(modelPortfolio)` in `lib/holdingReviews.ts` reads them (falling back to the framework defaults) and the workspace passes the result as `tierInfo`.
- **`portfolio_construction`** (annual) → `PortfolioConstructionSection` — whole-portfolio (not per-holding): quick stats (# holdings, cash %), the 8 check areas, and the key annual question; the advisor's assessment goes in the section notes.

### Per-holding data → `holding_reviews`

All per-holding facets (quarterly #1 monitoring / #2 thesis scorecard / #3 watchlist; annual deep-review decision+notes + conviction tier) live on one **`holding_reviews`** row per `(review_log_id, security_id)` (unique; FKs to `portfolio_review_log` + `portfolio`, both `ON DELETE CASCADE`; CHECK constraints on the enum columns — incl. `annual_decision`, `conviction_tier` 1–4). A given cadence uses its own subset of columns; others stay null. Stored separately from the review's checklist jsonb so they're **queryable across reviews over time** (the annual conviction-ranking section reads prior quarterly conviction this way). Types/labels/options + `saveHoldingReviews` (delete-then-insert, skips empty), `fetchHoldingReviewsForLog` (resume), and `fetchHoldingReviewsByPortfolio` (history) live in `lib/holdingReviews.ts` (DB stores lowercase tokens). Manual-entry, **recorded-only** (no At-Risk/Watchlist side effects yet). `PortfolioReviewLog` shows a per-review summary (action breakdown + thesis at-risk/broken count). Query key: `holdingReviews(name)`.

## New-Security Workflow (candidates)

A guided "add a new **stock** to a portfolio" workflow, mirroring the review workspace (dedicated page, left section-nav, draft autosave + Complete). Launched from the portfolio detail page's **Candidates tab** (`CandidatesPanel`): enter a ticker → `createCandidate` inserts a draft row → navigates to the workspace (`SecurityAdditionWorkspace`, route `/portfolio/:portfolioId/candidate/:additionId`). Data layer is `lib/securityAdditions.ts`.

- **`security_additions` table** — one row per candidate: `portfolio_name` (FK `portfolio` ON DELETE CASCADE), `security_id` (ticker, UPPER, no securities2 FK — candidate may not be held yet), `status` (`draft`/`completed`), `decision` (`approve`/`watchlist`/`reject`, derived from `content.decision`), **`content` jsonb** (all section field values keyed by field), **`checklist` jsonb** (`[{key,label,done,notes}]` per stage). Partial unique index `(portfolio_name, security_id) WHERE status='draft'` (one open draft per ticker). Unlike the review workspace, the row is created explicitly (no create-or-resume on mount), so the workspace just fetches by id — no stray-draft gymnastics.
- **Stages** = the documented buy process 3–8 (1–2 idea-generation/screening are non-actionable, omitted): **Full Research** (business overview · thesis · risks · financial review · valuation · portfolio fit) · **Portfolio Fit Review** (strategy/sector/factor/existing-holdings) · **Approval Decision** (thesis strength · expected return · downside risk · fit · decision · rationale) · **Position Sizing** (conviction → 4–5/2–4/1–2% reference · initial/max weight · reason) · **Purchase** (date · price · allocation · funding · rationale) · **Monitoring Setup** (success criteria · watchlist triggers · exit triggers). `ADDITION_STAGES` in `lib/securityAdditions.ts` defines the stages + fields (rendered generically by `type`: textarea/text/number/date/select); change them there and the workspace + summary follow.
- **Recorded-only** — no side effects into Watchlist/positions/At-Risk yet (a `watchlist`/`approve` decision is captured but doesn't create a prospects/position row). Query keys: `securityAdditions(name)` (list) + `securityAddition(id)`.

## AI Investment Team

A **recommend-only** AI committee layered on the app: role-scoped subagents produce documented, audited recommendations. **No agent ever executes a trade or writes to `positions`/`portfolio_allocations`.** Full charter: `docs/ai-investment-team-charter.md`.

**Runs in Claude Code, not the browser.** The committee/agents run in the Claude Code harness (they can't run from the React app); they persist deliverables to Supabase, and the app renders them **read-only** plus a manual CIO decision. A UI-triggered "run" would need an Express/Anthropic-API bridge (not built).

### Roles (`.claude/agents/*.md`)

Seven subagents, each recommend-only: **research-analyst** (is it ownable? fair value + rating), **devils-advocate** (independent bear case), **quant-analyst** (systematic screen + correlation/incumbent comparison), **portfolio-manager** (capital allocator — sizing + construction), **risk-manager** (concentration/factor/stress **and compliance verification** → verdict pass/warn/veto), **compliance-ips** (mandate/IPS suitability), **macro-strategist** (standing top-down). Also invocable directly via the Agent tool.

**"Hard guardrails" was an overstatement and is now specific.** Every agent file
carries `disallowedTools: Write, Edit, NotebookEdit, Bash` (Nov 2026, audit §8);
until then none scoped its tools at all, so each inherited Write/Edit/Bash and
the full MCP surface while two documents called the constraint technical.
`research-analyst`, `devils-advocate` and `macro-strategist` also deny
`mcp__claude_ai_Supabase`. **What is still prompt-level: `execute_sql` reads and
writes through one tool**, so the five roles that must read the book could in
principle write `positions` — the `committee_*` allowlist excludes it, but raw
SQL bypasses that and the connector runs as `postgres`, which bypasses RLS. The
charter states the full picture; don't re-summarise it as "enforced".

### New-buy committee (`.claude/workflows/new-buy-ic-review.js`)

`Workflow({ scriptPath: '…/new-buy-ic-review.js', args: { ticker, portfolioName, additionId } })`. Six-role run: research analyst + devil's advocate + quant (parallel) → PM sizing → risk + compliance (parallel) → memo synthesis. `args.lean: true` runs the original 4 (no quant/compliance). **A risk `veto` OR a compliance `unsuitable` forces the committee recommendation to `reject`.** The workflow RETURNS the bundle; the **orchestrator persists** it (no writes inside the workflow) — analyst/bear/quant → `research_reports` (`author_role` = `research_analyst`/`devils_advocate`/`quant_analyst`), risk → `risk_reports`, memo → `ic_memos` (compliance folded into the memo rationale). Custom `.claude/agents` types don't resolve inside `agent()`, so the workflow **inlines** each role's prompt — keep the inline copy and the `.md` in sync. (Two gotchas: `args` may arrive as a JSON string — parse it; run via `scriptPath`, not `name`.)

**Every role is `required()`, and the control gate fails closed.** `agent()`
resolves to **null** when a subagent dies on a terminal API error after its
retries — it does not throw. An expired OAuth token killed the risk agent on
30 Oct 2026 and `risk.verdict` threw a `TypeError` three lines on, losing the
whole LRCX committee including the three roles that had already answered, and
stopping the job before the next ticker. `required()` now turns that into a
named error naming the dead role. It throws rather than carrying the null
through, deliberately: **a control leg that never ran must not read as one that
raised no objection.** For the same reason the gate is written as "only `pass`
or `warn` clear the name" rather than "`veto` blocks it", so an unrecognised or
empty verdict blocks too — a verdict we cannot read is not consent. The
pass/warn/veto and suitable/caution/unsuitable behaviours are unchanged.

### Deliverable tables + UI

`research_reports` · `risk_reports` · `ic_memos` — RLS open, soft-delete via `deleted_at`; `security_id` = text ticker (no FK); `addition_id` links to the candidate. Data layer `lib/{researchReports,riskReports,icMemos}.ts` + query keys. Read-only viewers: **`ICReviewPanel`** (candidate-workspace section — memo + research + risk cards, with the CIO **approve/watchlist/reject** action via `recordIcDecision`), **`SecurityResearchPanel`** (security Commentary tab), **`PortfolioRiskPanel`** (portfolio Reviews tab). Shared cards in `components/icReviewCards.tsx`.

### Section-drafter (`.claude/agents/addition-drafter.md`)

On-demand: re-synthesizes a candidate's committee output into the Add Security workflow fields (`security_additions.content`). **Fills empty fields only; never sets the Approval `decision` or the actual `purchase_*` trade facts** — those stay the CIO's.

### How the committee recommends — key conventions

- **Mandate fit is PORTFOLIO-LEVEL and CRITERIA-BASED, not a per-security gate.** For an income strategy the requirement is that the *portfolio's* yield exceeds its benchmark (carried by the mix — a name like VZ ~6.6% does the heavy lifting), so a low-yield name is fine if the book stays above its benchmark. The strategy's **Investment Philosophy** (`model_portfolio_data.investment_philosophy`) is the justification rubric: a candidate need not meet every INCOME/STABILITY/GROWTH criterion but must justify inclusion by the combination it contributes. **Never disqualify a name on its own dividend yield alone.**
- **Construction is relative (opportunity cost), not standalone merit.** The PM uses `model_portfolio_data` (style/asset-class targets, bands, conviction tiers) + the current book to place the candidate in its sector, read the book's allocation there, and run the opportunity-cost test vs the existing names — **a high-merit stock can be `watchlist`/`reject` when keeping the incumbents is the better allocation** (the quant supplies the incumbent comparison; the memo states a construction-based decline explicitly).
- **Objective / risk profile are allocation-derived** (see the portfolio-objective convention in memory), NOT the income-vs-growth style; the style/mandate lives in the narrative fields (below).

### Compliance architecture (rules hub → risk report)

Compliance rules live **only** in the Settings **Compliance Rules hub** (`pages/settings/CompliancePage.tsx`, route `/settings/compliance`), stored in `firm_compliance_rules` (firm-wide, e.g. Max Single Position, Minimum Holdings Count) and `compliance_rules` (per-portfolio). **There is no per-portfolio Compliance tab** (the old `CompliancePanel` was removed). The **risk manager verifies each portfolio against every active rule and folds the results into `mandate_checks`**, measured against the **ACTUAL** book — the most recent file in the `Portfolio Documents` storage bucket, parsed by `lib/currentAllocation.ts` — falling back to model targets (and flagging the basis) if no actual-allocation file exists. The AI risk report **is** the compliance surface; there is no separate per-portfolio compliance report.

**Every `mandate_checks` entry must be a MEASUREMENT, and a CROSS-PORTFOLIO rule is not one** (Nov 2026). A rule comparing portfolios to each other — `consistency_deviation`, "Cross-Portfolio Consistency Deviation" — cannot be evaluated from inside one book; it belongs to the hub, which sees all of them at once. The risk-manager prompt used to say it "may note" such rules, and every portfolio report from Jul to Nov 2026 duly ended with `pass: null` / `"not computed per-portfolio"` — a line that occupies space in the report, invites the reader to look, and says nothing. Worse, the rule had been retired from the hub on 4 Nov, so the last reports cited one that no longer existed. **The prompt now says to omit an unmeasurable rule entirely — not as a check, not as a note, not as a caveat** — and the 61 stored reports carrying it were stripped (none was emptied; every other check survived in order). `consistency_deviation` remains a `FIRM_RULE_TYPES` option and the hub's own `CrossPortfolioSection` is untouched: the rule is legitimate *there*, where it can actually be computed.

**The hub is also the authority for what COUNTS as a check.** If the advisor has authored two firm rules, the report shows two firm checks, and a reader comparing the two should find them identical. An exposure worth attention that *no rule covers* — a sector weight with no sector limit authored — is a finding for `notes` and may justify a `warn`; it is not a check, because there is nothing to check it against.

**BEING ON MODEL IS NOT A WARNING** (Nov 2026). `warn` was defined as "acceptable with caveats", loose enough that the risk manager warned on books where *every check passed* — **12 of 42 portfolio warns had no failed check at all**. The Hybrid Growth report of 9 Nov said so itself: "Exactly on model … no limit breached … The warn is for size of exposure rather than for any defect in construction." A 99% equity target met at 99.00% inside its own band is the strategy working, and a warn that fires on a correctly-built aggressive book fires on every one of them for ever. The prompt now requires a `warn` to **name something that could change** — drift toward a limit, a non-hard check that failed, an unauthored exposure, an unverifiable basis — and carries a guardrail mirroring the dividend-yield one a level down: *do not grade a portfolio against a mandate it was never given*. **Stored verdicts are NOT rewritten** — a verdict is the risk manager's recorded judgement, unlike the cross-portfolio line, which was never a measurement.

**`MandateCheck.pass` is `boolean | null`, and null means NOT MEASURED.** It was typed `boolean` while 13 stored checks across 12 live reports carried null, so `icReviewCards` could render `pass ? '✓' : '✗'` without the compiler objecting — drawing every unmeasured check in red beside 64 genuine failures, indistinguishable from a breach. Three states now: green ✓, red ✗, grey – with a "Not measured" tooltip.

### Model IPS vs Client IPS — two distinct documents

Two **separate** IPS concepts; never conflate them:
- **Model IPS** — how a *strategy* is managed. It **IS** `model_portfolio_data` (the narrative fields above + bands/tiers/drift/cadence/benchmark). **This is what the Investment Committee reviews** (the committee reads `investment_philosophy`). There is **no separate model-IPS table**.
- **Client IPS** — how a specific *client account* is managed: **`investment_policy_statements`** (per `client_id`; risk tolerance, horizon, liquidity, return target, and equity/FI/cash min–max). Data layer `lib/ips.ts`; edited on the client detail **IPS tab** (`IPSPanel`). **The IC never reads the client IPS** — it is advisor/suitability-side only.

**Compatibility check** (`lib/ipsCompatibility.ts` + `IpsModelCompatibility`, rendered on the client IPS tab): for each portfolio a client's accounts map to, it flags where the **model's category targets fall outside the client IPS asset-class bands**. This links the two stacks *without* the IC touching the client IPS.

### Governance data — single sources of truth (retired parallel stores)

The settings/governance data was consolidated so each concept has one authoritative home:
- **Firm Settings page + `lib/appSettings.ts` were DELETED** — they were localStorage-only and read by nothing. `/settings` now **redirects** to `/settings/model-portfolios`; there is no firm-settings store. Do not reintroduce localStorage as an authority for governed values (the committee only sees Supabase).
- **`portfolio_asset_class_targets` was DROPPED** — a dead duplicate of `model_portfolio_data`'s asset-class targets (0 readers).
- **Position drift is single-sourced on the model**, and `lib/positionBands.ts`
  is the one derivation. A position's band is its own explicit
  `lower_limit`/`upper_limit` first, then the model's cash limits for a cash
  row, then `model_portfolio_data.drift_percentage` — `computePositionBands`
  applies that order and `driftBandFor` does the arithmetic.
  **There is no hardcoded default**: a model with no `drift_percentage` yields
  **no band at all**, not an assumed 5%. Callers: `lib/positionSizingCompare.ts`
  (behind `PositionSizingCheck`) and `lib/actions.ts` (the drift-breach action)
  call `computePositionBands`; `PortfolioDetailPage` and `ModelPortfolioModal`
  call `driftBandFor` directly. **`positions.drift_threshold` is NOT in that
  chain** — it is still selected and mapped onto
  `PortfolioPosition.driftThreshold`, and then read by nothing; the per-position
  override went with the Rebalancing panel in `95f041c`, which also dropped
  `positions.target_weight`. This bullet named that panel and a `modelDriftPct`
  prop until Nov 2026, months after both were deleted, and stated a resolution
  chain (`driftThreshold ?? drift_percentage ?? 5`) that no code has followed
  since.

### Narrative fields = the mandate rubric

`objective_statement`, `investment_philosophy`, and `investment_process` live on **`model_portfolio_data`**, which is now the ONLY home. **`investment_philosophy`** = the income/stability/growth **criteria/rubric the committee reads** (mandate rubric, above). (These narrative fields + the bands/tiers/drift/cadence/benchmark are the **Model IPS** — see below.)

**`portfolio.objective_statement` and `portfolio.investment_philosophy` were DROPPED** (Nov 2026). This document used to call them "a fallback copy", which is what a second copy always is until it drifts — and it had: Equity Income's two differed from model 11's on both columns. Checked before dropping, every point in them survives across model 11's three narrative fields (the yield criterion in its objective, the payout/FCF/intrinsic-value/leadership criteria in its philosophy, the top-down-plus-bottom-up process bullets in its process); EI&CG's objective was byte-identical to model 13's. **The full text of both is recorded in the migration**, the way `prospects.thesis` was. Nothing read `investment_philosophy` at all, and the one reader of `objective_statement` was a dead `??` fallback in `PortfolioDetailPage` — dead because all 19 books are mapped to a model.
- **`portfolio.description` survives** and is the last portfolio-level narrative column: it is `NOT NULL` and the workbook importer's insert path still writes `''` for a brand-new portfolio. It is blank on every book.
- **The Overview now reads `modelPortfolio?.objective_statement` directly**, with no `usesModelNarrative` gate — there is nothing left to choose between. That is strictly better for an UNMAPPED portfolio, which the gate excluded: `modelPortfolio` falls back to the model matched by `investment_objective`, so such a book shows its strategy's objective instead of nothing.

**`investment_process` was `investment_strategy` until Nov 2026, and the rename was not cosmetic.** Two reasons:

- **The field is UNGATED and rendered on every model.** It describes how the firm RUNS a strategy, and every model has an answer to that. Before the change **eleven of the fourteen models carried no narrative field at all** — only Core Growth, Equity Income and EI&CG had any. A column called `investment_strategy` behind a box labelled Investment Process is the shape of name that starts lying. (**Objective and Investment Philosophy were ungated in the same week**, for the reasons below; **no narrative box is gated any more.**)
- **`securities2.investment_strategy` STILL EXISTS AND IS A DIFFERENT THING** — a fund's description from the YCharts workbook's `Securities` sheet, rendered on the fund detail page. One name for two unrelated concepts across two tables was a standing trap for a grep. **Do not rename that one**: the fund importer maps sheet header straight to DB column with no whitelist, so it would fail the entire upsert batch (gotcha 7).

**The committee now reads `investment_process` alongside the philosophy**, and the two answer different questions: the philosophy is the authority for *does this belong here*, the process for *is the firm doing what it said it would do* — which is the test an audit actually asks.

**A NULL narrative field is a finding, not a blank to work around.** Measured 12 Nov 2026, after the gate came off and the text was authored: **objective 14/14, philosophy 14/14, process 14/14**. There is no gap today; the three counts above were 3/14 on two of them that morning.

**ELEVEN OF THE FOURTEEN SHARE ONE PHILOSOPHY AND ONE PROCESS, BYTE-IDENTICAL** (`Strategic Asset Allocation`, and a four-step Capital Market Assumptions → Asset Allocation → Investment Selection → Ongoing Monitoring process): the five Fund models, the five Foundation books and **Fixed Income Total Return**. That is correct rather than lazy — all eleven are strategic-allocation fund mandates run the same way, which is what the Fund column's "shared risk tiers" already says.

**The line is NOT the Fund/Foundation vs Strategy grouping** the page draws, and assuming it is will be wrong about FITR. The three books carrying their own rubric are the **equity** ones — Core Growth, Equity Income, Equity Income & Core Growth — because they are run as individual stock strategies. FITR is grouped under Strategy (it is its own book, not a shared risk tier) yet managed on the shared process. Query `investment_process` rather than inferring it from the column a model appears in.

- A reader must not take the shared rubric as evidence that a *particular* book was reasoned about on its own; it is a statement about how the firm runs that whole set. Finding the same text on a second book is not corroboration.
- **A model shared by two families must be authored for both or neither** — model 3 runs both Hybrid Balanced and ETF Balanced, which is why the shared text is the right shape for it.

**ALL THREE NARRATIVE BOXES ARE NOW UNGATED** (Nov 2026), philosophy last and it is the one where the gate did real damage. A philosophy existed on 3 of 14 models — **exactly the three the `id >= 10` gate let through**, which is the tell: the field was not missing because nobody had views about the fund strategies, it was missing because there was nowhere to type them. Models 1–5 could not be given one at all, and model 3 is the sharp case, running **both** Hybrid Balanced and ETF Balanced, so one unauthorable field left two books with no rubric. **The advisor filled all ten the same day the gate came off**, which is the evidence for that reading.

- **The gate was an `id` threshold standing in for "custom strategy model"**, and it stopped describing anything real once the fund models grew narrative of their own. It survives in two places only, and neither hides a field: Investment Objective and Risk Profile render a free-text **input** for `id >= 10` and a **dropdown** otherwise. That one is worth keeping — a fixed vocabulary is the `*_OPTIONS ⊆ CHECK` discipline applied to a picker, and free text there would let a typo create a new objective silently.
- **All eleven were authored the same day**, ten by the shared text above and model 12 right after it, so **nothing is missing now**. The committee's instruction to report a missing rubric rather than infer one stands, and currently fires for nothing.

**Portfolio Overview narrative** (`PortfolioNarrative`): shows the **Description**, or the **Objective** (`objective_statement`) when there is no Description — the block label follows the content (`description || objective`).

**THE NARRATIVE NOW LIVES ON `objective_statement` FOR EVERY MODEL** (Nov 2026). It used to live in two columns: the ten fund models kept theirs in `description` while the three stock models used `objective_statement`, so one concept had two homes and the Overview labelled the same kind of text two ways. The data was moved onto `objective_statement`, the Description field was **removed from the editor**, and **Objective was ungated** in the same change — otherwise ids 1–5 would hold text they could neither see nor edit. **All 14 models now carry an objective**; model 12 (Fixed Income Total Return) was the one with no narrative at all and was authored by hand on 12 Nov 2026.

- **Nulling `model_portfolio_data.description` is NOT enough, and that is the trap.** `PortfolioDetailPage` prefers *any* description over the objective and falls back to **`portfolio.description`**, which is `NOT NULL` and was populated on every book. Leaving it would have kept the Objective invisible *and* promoted a drifted duplicate: the portfolio copies are the raw scrape and still carried `&nbsp;` entities where the model copies had been cleaned (10 of 16 differed). They are blanked to `''` for every book whose model has an objective to fall through to. FITR was deliberately left on its existing text — the literal word "Dynamic", a label rather than a narrative — until model 12 was authored; **no portfolio carries a description now.**
- **The Description field is GONE from the editor, not merely emptied.** Every model's box would now be blank, and one keystroke would silently hide the Objective again and re-create the split. `model_portfolio_data.description` is kept as a column and the save writes `null` to it.
- **The Model Portfolios settings list reads `objective_statement ?? description`** — it rendered `description` alone, so the move would have blanked every card.
- **THE WORKBOOK WOULD HAVE PUT IT ALL BACK OVERNIGHT, and the importer now skips the column.** The YCharts **`Model Portfolios` sheet loads the `portfolio` table** (it is keyed on `security_id`, the `P:…` id) through `lib/portfolioExcelUpload.ts`, which maps sheet header straight to DB column — and that sheet still carries `description`, holding the original scrape, `&nbsp;` entities and all. Since `portfolio.description` WINS over the objective, the next import would have refilled it, hidden every narrative again and restored the un-cleaned text. **The refresh is a daily LaunchAgent**, so this was a silent overnight revert, not a hypothetical. **The column was then removed from the workbook entirely** (12 Nov 2026, `add-sheet-columns.ps1 -Remove description -SheetName 'Model Portfolios'`; 122 columns to 121, backup on the VM) — the narrative is authored on the model portfolio page now, so YCharts should not be fetching it every morning. `description` STAYS in the importer's `SKIP_COLS` regardless — the designed escape hatch for a column the DB no longer wants — because the backup workbook and any older copy still carry it, and `portfolioImportColumns.test.ts` pins it, a comment alone not having been enough here before. The INSERT path still writes `''` for a brand-new portfolio, since the column is `NOT NULL`.
  - **Only non-empty strings were ever written**, so a blank sheet cell never cleared a stored value — which is why the three equity books (blank in the sheet) would have survived and the other sixteen would not.
  - **`updatePortfolioObjective` lost its `description` argument** in the same change. It copied the matched model's description into the portfolio whenever the objective changed; with every model description now null it was writing NULL into a `NOT NULL` column, so changing a portfolio's objective would have failed outright.
- **This document previously claimed Core Growth's Description had been cleared. It had not** — `portfolio.description` held a 445-character copy byte-identical to its model objective, so Core Growth rendered a *Description* while its two Equity siblings rendered an *Objective*. The migration cleared it.
- **Do not re-add a Description field.**

### Scheduled jobs (draft-only) — prompts live in this repo

**Eight routines**, all draft-only, all LaunchAgents: `weekly-risk-report` and
`reviews-due-digest` on Mondays, and `at-risk-review`, `post-earnings-brief`,
`pre-earnings-brief`, `earnings-call-summary`, `watchlist-research` and
`portfolio-committee-review` on weekdays, staggered through the morning. **The schedule itself lives in
`scripts/scheduled-jobs/README.md`** and in the generated plists, which are the
authority — do not copy the times here again; the copy that used to be in this
paragraph had two of them wrong.

One ordering constraint IS a convention and stays: **`at-risk-review` runs before
`post-earnings-brief`**, because the brief reports any same-day change to the
at-risk list and there is only ever one brief per print.

(The YCharts workbook refresh is a separate LaunchAgent, `scripts/refresh/`, not
one of these seven.)

#### Every job writes a `job_runs` heartbeat — it is the only health signal there is

The jobs run in Claude Code; **the React app has no bridge to the scheduler** and
cannot read its task list, its run history, or whether this morning's run is in
flight. Health therefore cannot be inferred from what a job produced: a run that
died on its first tool call and a run that correctly found nothing to do leave
the **same** trace in `research_reports`, `at_risk` and the rest — none. Two jobs
read as `running` all day in Oct 2026 while doing nothing, which is what this is
for.

So each prompt opens a `job_runs` row before any other work and closes it as its
last step, whatever happened (`status` · `items_considered` · `items_written` ·
`summary` · `errors`). Three things carry the design:

- **A row left open IS the death signal**, not a defect to clean up. Dying is the
  one state a job cannot report about itself, so the open row says it for it;
  `gradeJob` reads a `running` row older than 3h as `stalled`.
- **Close the row even when there was nothing to do.** `items_considered = 13`
  with `items_written = 0` is the healthy-and-idle case, and distinguishing it
  from a death is the entire point.
- **`never_run` raises no action** (`needsAttention` in `lib/jobRuns.ts`). It
  cannot be told apart from a heartbeat that was only just added, so treating it
  as a problem would have put one action per job into the hub on day one and
  taught the reader to dismiss the source.

`reviews-due-digest` had to have its blanket "do not write to any table" guardrail
narrowed — a prompt that forbids all writes will not write its own heartbeat.
Same shape as `import_runs`, deliberately: that table already solves this for the
spreadsheet importers and already feeds an action when a refresh does not land.
Data layer `lib/jobRuns.ts` (React-free; `JOB_DEFINITIONS` is a *description* of
the scheduler's list, never an authority — `job_id` is plain text so a new job can
log before anything here knows its name). Surfaced by `AutomationPanel` and by the
`job_health` action source.

#### They run from launchd, not the app scheduler (Oct 2026)

**The runbook is `scripts/scheduled-jobs/README.md`** — schedule, commands, logs,
and the four traps (prompt read from `main`; `CLAUDE_CODE_OAUTH_TOKEN` must stay
unset; the repo must stay out of TCC-protected folders; the tool allowlist
excludes `Bash`). It is not repeated here: this document carried its own copy of
the schedule and **two of the times had drifted wrong** while the README's were
right — which is the argument against duplicating it a third time.

What belongs here, because it is a convention rather than operations:

- **They do NOT need the app open.** The app scheduler only fired while Claude
  Code was running, which is how two jobs read as `running` all day while doing
  nothing. Its copies are disabled, not deleted — re-enabling them without
  unloading the agents would run everything twice.
  - **That warning was violated, and it cost real documents** (found Nov 2026).
    Three of the seven app tasks were enabled alongside their LaunchAgents, so
    each ran twice daily — **eleven double-run days across seven jobs**. Both
    `pre-earnings-brief` runs on 2 Nov wrote, which is where the duplicate
    pre-briefs for APP, ELF and DUK came from. **The app scheduler bypasses
    `run-job.sh` entirely**, so its lock cannot defend against this;
    configuration is the only guard. A launchd run starts within seconds of its
    slot, an app run at an irregular catch-up time — that difference is how to
    tell them apart in `job_runs`.
- **A run that DIES holding the lock used to block the job for good.**
  `run-job.sh` takes `locks/<task>.lock` with `mkdir` and releases it from an
  EXIT trap, which a SIGKILL or a sleeping machine never fires. On 4 Nov 2026
  `post-earnings-brief` died at 09:30 leaving its lock, and the next morning's
  run logged `SKIP` and did nothing — that day's briefs existed only because
  the duplicate app-scheduler run wrote them outside the script, one bug
  covering for another. The lock now records its holder's pid and is
  **reclaimed when that holder is gone**, while a live `run-job.sh` is still
  respected. The command is checked alongside the pid, since a recycled pid
  would otherwise block the job forever.
- **A prompt is edited at `.claude/scheduled-tasks/<taskId>/SKILL.md` and nowhere
  else.** The live path reads `git show main:…`, so an edit reaches the jobs when
  it is MERGED, not when it is saved — and a job can never run a half-finished
  prompt off whatever branch is checked out.
- **Do NOT symlink the scheduler's path at the repo file.** It fails in the worst
  way: the task stays registered, enabled and on schedule, but its frontmatter
  reads back empty because the reader does not follow symlinks — so the job runs
  with nothing to do while every listing looks healthy. Tried and reverted.
- `sync.mjs` is **not** part of the live path. It survives only to revert to the
  app scheduler, which reads a fixed path it owns and that nothing repoints.
  Editing a prompt through the app or `update_scheduled_task` rewrites the
  scheduler's copy, so `--from-home` afterwards or the repo goes stale.

### Watchlist research — the job that was missing

**Adding a ticker to the Watchlist fires nothing.** `addProspect` writes
`prospects` + `prospect_portfolios` and returns; the only triggers on the table
are `audit` and `updated_at`, and the committee runs in Claude Code with no
bridge from the React app. The card's badge was `research.length === 0` labelled
"AI research pending" — describing an absence as if something were coming, and
FCX sat there 23 days with nothing behind it. (HWM looked like it worked only
because its three reports came from a **candidate** committee run months earlier,
`addition_id: 4`, and the card matched them by ticker.)

**`watchlist-research`** closes it: weekdays, finds prospects with no
`research_reports` at all, and reads the **five** oldest. The badge now reads
**"Awaiting committee"**.

**The watchlist stage asks ONE question: is this company worth owning, on its
own merits?** A buy/hold/sell with a bull and a bear case, the way a sell-side
analyst rates a name — and nothing portfolio-relative. Weight, correlation to
current holdings, opportunity cost against the incumbents in a sector,
concentration and factor exposure are all real questions asked **later**, in the
candidate workflow, where a purchase is decided against an actual book.

- **Two roles only: `research-analyst` + `devils-advocate`**, via the **Agent
  tool** (those subagent types resolve `.claude/agents/*.md`, so there is no
  inlined copy to keep in sync). **Not** the `new-buy-ic-review` workflow — that
  is the candidate committee, and its PM sizing and portfolio risk gate are
  exactly the questions this stage does not ask.
- **`portfolio_name` is ALWAYS null**, with no exception for an idea naming
  exactly one portfolio. The earlier design passed one through to give the PM a
  book to size against; what it actually produced was MRVL coming back
  **"watchlist at 0%"** — a proposed weight against a book nobody had decided to
  buy into, which is an answer to a question nobody asked. The portfolios an
  idea names are **recorded on the idea, not used here**; the job's query does
  not even read `prospect_portfolios`, so there is nothing to be tempted by.
- **No `ic_memos` row and no `risk_reports` row.** A memo is a recommendation to
  buy something *at a size*, and there is no size here. The analyst's rating is
  the deliverable.
- **The two roles are independent** — the devil's advocate is never handed the
  analyst's thesis, or it writes a rebuttal instead of a bear case.
- **If one role returns nothing, neither row is written for that ticker.** Half a
  read is not a rating: a thesis with no bear case against it is the most
  misleading thing this job could leave behind.
- **`report_type` is `initial` with `fiscal_year`/`quarter` null** — standing
  research tied to no call. Status `draft`.
- **Bear / base / bull targets live in `research_reports.price_targets`**, on the
  research analyst's row only, parsed by **`lib/priceTargets.ts`** — pure and
  React-free, feeding both the compact line on the Watchlist card and the full
  per-scenario table in the research drawer, so the two cannot disagree. Each
  scenario carries a probability and a premise; the weighted value is recomputed
  only when every scenario states a probability and they sum to ~1, since
  averaging a partial set would quietly under-weight the cases that happen to
  give a number.
- **`buyBelow` may be null, and that is an ANSWER.** A hold is not always a
  valuation call. MRVL was a hold at $200 against a $240 fair value because an
  unresolved all-stock acquisition of a company worth nearly half its market cap
  changed what was being bought — no lower price made that a buy while the terms
  were unknown. `priceLimited: false` says so and `buyBelowBasis` says what
  WOULD change the rating. A computed buy-below price on an event-driven hold
  reads as "cheap but not cheap enough" when the real blocker is that nobody
  knows what they are buying. The card prints "Not price-limited" rather than a
  number, and `gapToBuy` returns null so no caller can render "0% away".
- The `not exists` guard is what makes it idempotent — an idea carrying any
  research, from any source, is left alone.
- **Rows written before Oct 30 2026 are portfolio-scoped** (FCX → Equity Income,
  LRCX → Core Growth) and some carry a memo and a risk report. They are the
  record as written and are not migrated.

### Earnings briefs — a matched pair, in two sections

`report_type` is `'pre_earnings'` / `'post_earnings'` (the pre value was `'earnings_review'` until Oct 2026; the 30 existing rows were renamed and the old value no longer passes the CHECK). A post-earnings brief **answers** a specific pre-earnings brief rather than standing alone.

**Both briefs render in two sections** (Oct 2026), and every field is filled from BOTH ends — the pre-brief states the expectation, the post-brief copies those fields forward **unchanged** and appends the outcome. One shape per concept, so `ResearchCard` renders either without branching and a resolved row still shows what was asked.

**Section 1 — The Street.**
- **`estimates`** `jsonb` = `EstimateRow[]`: `{key,label,unit,estimate,low,high,analysts,source}` from the pre-brief; the post adds `{actual,surprisePct,note}`. Four rows — `eps`, `revenue`, `ebitda`, `ebitda_margin`. `unit` drives rendering: `usd`, `usd_large` (abbreviated via `fmtUsdCompact`), `pct` (**decimal**). The Actual/Surprise columns render only once a row has an actual, so the pre-brief shows a clean expectations table.
- **Commentary** is the `thesis` column — narrative prose, not a list. The gradeable items live in `street_questions` and Section 2. **There is no timing caveat**; the post job gates on actuals and the call transcript, so that concern is structural.
- **`street_questions`** `jsonb` = `{key,question,why}` + `{answered: yes|partial|no, answer}`. The *market's* questions. `answered: 'no'` is a real outcome — a company declining to address something is information.

**Section 2 — Thesis Evaluation.** Both halves are `ThesisCheck[]` — `{key,title,metric,test,watchFor}` + `{status,finding}` — and both are **carried from the security's `security_theses` record**, with `test` being that document's own break test **verbatim**:
- **`thesis_checks`** — why we own it, from the thesis's `bull_case` metrics.
- **`risk_checks`** — what would break it, from its `bear_case` points.
- **`thesis_id`** records WHICH thesis version was graded (FK, `ON DELETE SET NULL`).
- `status` is `supported` / `mixed` / `undermined` / `not_addressed` — deliberately **not** hit/miss, because one print rarely settles a durable multi-year thesis. A **tripped break test** goes in `finding` explicitly and leads the digest.

This is the payoff of the thesis/brief split: an earnings call becomes a scheduled re-measurement of the thesis of record, not a fresh opinion.

- **`parent_report_id`** — self-FK to the pre-brief. **A CHECK enforces it for `post_earnings`**, making strict pairing structural: a holding that reported without a pre-brief gets nothing.
- **`research_reports_one_post_per_parent`** (partial unique on `parent_report_id`) is **not cosmetic.** The generator runs daily over a ~21-day lookback so it can wait for FMP to post actuals; without the index the first name to report would accumulate a duplicate brief every day.
- **The 21-day window is how the job gives up, and the AGED-OUT CHECK is the only thing that can see it do so.** A pre-brief past 21 days with no post-brief has left the candidate query, so the main query can never report it — the check is a separate, unbounded query in the prompt's step 12, run even on a day with nothing to brief (the early exit was explicitly amended to keep going). **Its floor is the oldest post-brief's `created_at`, not a fixed date**: ~30 pre-briefs predate this job and were never going to be answered, and reporting them every morning would teach the reader to skip the section — the `never_run` lesson again. Expect zero rows; the 3-business-day transcript fallback writes long before 21 days, so a hit means actuals never posted at all.
- **Duplicate pre-briefs are a live defect, and one pre-brief = one post-brief.** The 7-day dedupe guard has slipped repeatedly (TJX carries three for Q2 2027; ELF/APP/DUK each got two minutes apart on 2 Nov 2026). The unique index is per-PARENT, so duplicates each earn their own post-brief rather than colliding. When clearing a pair, **compare them before choosing** — on the Nov 2 set the LATER brief was consistently the richer one (thesis ~1.7× longer, 6 sources vs 3), so "keep the first" would have discarded the better document. Soft-delete the loser (`deleted_at`); ids 138/139/140 were cleared this way.
- **The post job gates on ACTUALS *and* the call TRANSCRIPT, never on the earnings calendar.** Either missing in FMP → skip silently and retry on a later run. The transcript gate is not optional: the job runs at ~7:25 AM ET, when a pre-market reporter's actuals are already posted but its call has not been held (BSX and GEV, Oct 2026), and since only one post-brief may exist per parent, a brief written from headline numbers can never be replaced. Match the transcript by **date on/after the report date** (`transcripts-dates-by-symbol`), not by quarter number — fiscal and calendar quarters differ. **Fallback:** after 3 business days with actuals but no transcript, the brief is written release-only and says so ("Written without the call transcript"; unanswerable street questions are `answered: "no"` with an answer prefixed `No transcript available —`, to keep them distinct from a company declining to answer).
- **`thesis_status`** (`intact`/`at_risk`/`broken`) is the post-brief's verdict, deliberately the same vocabulary as `holding_reviews.thesis_status`. It must reconcile with Section 2 — `intact` alongside an `undermined` check with a tripped test needs explaining.
- **`watch_items` is SUPERSEDED** by the four fields above. It was never populated on any row; the column and its renderer are kept only so a legacy brief would still display.
- **EBITDA caution:** FMP's `ebitda` is derived from its `operatingIncome`, which disagrees with the filing on ~1 name in 3 — the post-brief takes EBITDA from the company's own release.

### The Commentary timeline — briefs keyed to the CALL, not to the day they were written

`research_reports.fiscal_year` / `.quarter` (Oct 2026) record which earnings call
a brief concerns. Same identity as `earnings_call_summaries`, so briefs, the
committee's call summary and the transcript all line up on one key. A CHECK keeps
the pair whole (both set or both null) and another bounds the quarter to 1–4;
`initial` and `update` reports are **standing research** and carry neither.

`SecurityResearchPanel` renders standing research, then `CommentaryTimeline` —
eight quarters, newest first, one row per call with its pre-brief, post-brief,
quarterly brief and transcript. Rows are built by
the pure `buildCommentaryTimeline()` in `lib/commentaryTimeline.ts`. Four things
there are load-bearing:

- **Transcript dates are the row source, not the briefs** —
  `fetchTranscriptDates()` (`/stable/earning-call-transcript-dates`). Most
  quarters have no brief, so keying off briefs would hide every quarter whose
  transcript is still servable. FMP's list carries mislabelled historical rows
  (GOOGL reports a "Q1 2023" call dated 2014-12-02), so it dedupes on
  `(fiscalYear, quarter)` keeping the newest date.
- **Rows sort by FISCAL PERIOD, never by call date** (gotcha 22). FMP stamps the
  wrong calendar year on some Q4/Q1 dates, so a date sort silently drops recent
  quarters off the bottom of the eight. `markSuspectDates()` flags a date that
  falls before a call of an EARLIER period — compared against the running max of
  all lower periods, not just the previous one, because on GOOGL the bad Q4 date
  drags the equally-wrong Q1 date back above it and a neighbour-only check clears
  the second of the pair. A flagged date renders dotted-underlined with a `?`;
  it is shown but not asserted, and never silently "corrected" by adding a year.
- **A period with only a pre-brief still gets a row.** A pre-brief is written
  BEFORE the call, so the newest quarter has no transcript yet. Dropping it would
  hide the forward-looking document at exactly the moment it is the only one that
  exists. (It needs no date sentinel to sort first — ordering is by period, and
  it is the highest one.)
- **A dateless newest row is TWO states, and `dateBasis` separates them.** The
  call may not have been held (`expected`, dated from `next_earnings_release`),
  or it may have **reported days ago and simply not been transcribed yet**
  (`reported`, dated from `last_earnings_release`) — routine, because FMP posts
  actuals well before the transcript. `dateNewestRow()` picks between them by
  comparing the last release against the newest transcript: a release newer than
  any transcript is a quarter awaiting transcription. Collapsing the two dated
  ORLY's Q3 2026 row **"Feb 3, 2027 (expected)"** — the NEXT call — when that
  quarter had already reported on 28 October. **The transcript icon gates on
  `dateBasis === 'transcript'`**, not on `callDate` being set, or both of those
  rows would offer a transcript that does not exist.
- **Several briefs of one type in one period are NOT collapsed.** The
  pre-earnings dedupe guard has slipped before — TJX carries three pre-briefs for
  Q2 2027 — and showing one icon while dropping two would misreport the record.
- **Empty cells are the point.** No icon means no document, so a print that was
  never graded reads as a pre-brief with nothing beside it. GOOGL's Q2 2026 brief
  (id 18) is the standing example.

**Both jobs write the period, and the post-earnings job CORRECTS its parent's.**
The pre-brief's period is a forecast (increment the newest transcript entry;
`Q4` rolls to `Q1` of `fiscalYear + 1`); the post-brief's is observed, taken from
the transcript entry it matched. Because the timeline puts a pair on one row
keyed by period, a disagreement would split them across two rows and the
post-brief would appear to answer nothing — so the post job updates the parent.
Use the **fiscal** labels the transcript list gives: TJX's August call is Q2
**2027**.

### The quarterly brief is a RENDERING, not a record

`lib/quarterlyBrief.ts` assembles one quarter's story from the three documents
already written around its call — the pre-brief (expected), the call summary
(said), the post-brief (meant). **It has no table and is not stored**, because it
contains no new information: a saved copy could only drift from the rows it was
built from. The icon generates it on open.

`buildQuarterlyBrief()` is pure and React-free and is the single source for BOTH
`QuarterlyBriefView` (on screen) and `buildQuarterlyBriefPdf` (the document) —
the `lib/fundScorecard.ts` split. Decide what a reader sees in the lib, never in
one of the two renderers, or the page and the PDF diverge.

**It is shaped to be safe to hand to a client**, which is the entire reason it is
not the internal brief with a new cover. Held back deliberately, documented at
the top of the lib: **`review_recommendations`** (per-portfolio add/trim/sell with
target weights — our allocation decision, never a client's business),
`openQuestions`, conviction, the thesis **break tests** (`ThesisCheck.test` /
`watchFor` — the `finding` they produced is plain English and is kept, the
tripwire is not), estimate ranges and analyst counts, and `street_questions`.

- **`canBuildQuarterlyBrief` requires a post-brief OR a call summary.** A
  pre-brief alone is expectations for a call that has not happened, so a brief
  built from it would describe a quarter nobody has lived through.
- **The structural exclusions are enforced here; the PROSE is enforced at the
  source.** No field filter can reach inside free text, so both writing jobs now
  carry a *How to write the prose fields* rule: **every sentence must stand on
  its own**, naming the measure and the threshold rather than referring to one of
  our documents as a bare noun. "The test is met on its first leg" (GOOGL) and
  "where the thesis lives" (MSFT, a call summary) are the failures it targets.
  **It is a readability rule, not a softening one** — a tripped break test is
  still the single most valuable sentence the post-earnings job produces, and the
  rule only governs how it is phrased. This is a correctness fix before it is a
  client-facing one: a finding unreadable without a second document open fails at
  the audit job the record exists for. Applies to briefs written from here on;
  existing rows are the record as written and are **not** rewritten, so expect
  older findings to still read internally.
- **Saving is an explicit act**, for when the point IS to freeze a version: the
  PDF goes to `Security Documents/<ticker>` via `uploadFile`, which date-prefixes
  the name (gotcha 15), and the mutation invalidates
  `documentsFiles(SECURITY_DOCS_BUCKET)` so it appears in the panel below.
- **`fmtEstimate` moved to `lib/formatters.ts`** when this landed — three
  surfaces render those rows now (research card, brief on screen, brief as PDF)
  and a second copy is how a percentage starts rendering as dollars in one.

Transcripts are fetched **per row, on open** (`fetchTranscript(symbol, fy, q)` —
v3, which returns the exact `EarningsTranscript` shape `TranscriptViewer` wants).
Eight transcripts are tens of thousands of words each and the advisor opens one.
The transcript icon is tinted indigo when a call summary exists.

**`review_recommendations` — what the stock review pre-fills from.** Reviews are
earnings-driven (`next_review_at` = `next_earnings_release + 1 day`), so the post-brief
is written the day the review falls due; that is why it carries the recommendation
rather than a separate job, and why there is no staleness problem to solve.

- `ReviewRecommendation[]`, **one entry per portfolio** holding the security —
  `{portfolioName, weightPct, recommendation, rationale, scorecardRead, openQuestions[]}`.
  Add/trim is an allocation act and a name sits in several books at different weights
  (META: 7.00% / 3.00% / 5.00%), so a single answer would be wrong for one of them.
  `review_log` stays **per-security**, so the modal shows several and the advisor records one.
- **`add` / `hold` / `trim` / `sell` — there is no `buy`.** A security under review is
  already held, so adding to it is `add`. Enforced by `review_log_recommendation_check`
  and mirrored in `Recommendation` (`lib/reviewLog.ts`). `research_reports.rating` KEEPS
  `buy`: a new-buy candidate genuinely is one.
- **The rule is reconciliation, not thresholds.** The Monitor scorecard (six metrics vs
  prior years, benchmark, sector, peers) raises the question; the thesis and the print
  answer it or fail to. A metric below its prior years is not a verdict — on META,
  operating margin fell 8.6pts but ~half was a one-time legal charge (ex-charge ~37.0%,
  and operating income *rose* ~11%), while the FCF-margin fall was capex/revenue going
  20.2% → 43.2%, which is the thesis's own break test tripping.
- **`openQuestions` earns its place:** what would change the call and this print did not
  settle. On META, whether capex at 43% of revenue is building revenue or is a treadmill.
- The pre-earnings window is **~4 days, not 2**, with a 7-day dedupe guard. Strict
  pairing means a day the job does not run costs that holding its brief, its
  recommendation, and the aid for a review that will not recur for a quarter.
- **The modal shows the draft, not a banner about it.** An earlier version headed the
  Recommendation block with the brief's date, price and thesis status over a
  portfolio-by-portfolio list; it was removed as redundant, since the composed rationale
  carries those figures and signs off by naming the brief it came from. What survives is
  the one thing the buttons cannot express: where the books **disagree**, nothing is
  pre-selected and an amber line says so.
- **The rationale box is an `AutoGrowTextarea`, and that is not cosmetic.** The composed
  draft runs past a thousand characters; the fixed three-row box showed two lines of it
  behind an inner scrollbar, so the advisor was asked to sign a rationale they could not
  read. The stock modal is `max-w-2xl` with the form scrolling inside a 90vh cap.
- **Two pre-fill guards in `MarkReviewedModal`, both load-bearing.** It applies **once per
  opening** via a ref keyed to the modal opening rather than to the query data — the brief
  arrives asynchronously, so without it a `refetchOnWindowFocus` would overwrite whatever
  had been typed (gotcha 9, the trap that made Alt rows vanish). And it **never overwrites
  a non-empty rationale**, so typing before the brief lands wins.

### Related UI primitives

- **Edit Model Portfolio is a dedicated page** (`EditModelPortfolioPage`, `/settings/model-portfolios/:id/edit`), reusing `ModelPortfolioModal` via its `asPage` prop (wide two-column layout); "New model" still uses the modal.
- **The Model Portfolios list is THREE COLUMNS — Foundation · Fund · Strategy** (Nov 2026), grouped by `groupModelsByFamily` in `lib/modelPortfolios.ts` (pure, tested). A flat list of fourteen hid the one fact a reader needs before editing one: **a Fund model is SHARED** — each of ids 1–5 runs an ETF book *and* a Hybrid book, so an edit there lands in two places — while every Foundation and Strategy model runs exactly one. That is the "never edit a shared model to fix one family" rule made visible in the layout.
  - **`STRATEGY_MODEL_NAMES` is DERIVED from `EQUITY_MODEL_NAMES`**, not retyped, so a fourth equity book added there lands in the right column instead of silently falling through to `fund`. Fixed Income Total Return is its one non-equity member: a directly-run strategy rather than a shared risk tier, which is what the column means.
  - **Foundation matches the family PREFIX** (as `hasConvictionTiers` does) so a sixth Foundation book needs no edit; **`fund` is the fallback**, so a new shared tier needs none either. Only the Strategy set is a fixed list, because those are known books.
  - **All three columns render even when empty** — the `ASSET_CLASS_ROWS` rule: an empty column and a dropped column look identical to a reader, and only one is a fact about the book.
  - **Ordering is one comparator for all three** (`compareModelsForDisplay`): the benchmark risk ladder first, then name. No Strategy benchmark is on the ladder, so that column falls through to alphabetical — which is the order the four are normally spoken in. The page-local `BENCHMARK_ORDER` moved into lib with it, so the sort and the grouping cannot disagree.
  - **Every COLLAPSED card is the same height, by RESERVING space for the worst case** rather than letting the text decide. Two values wrap unpredictably — the model name, and a benchmark like `Balanced w/ Growth Benchmark (ETF)` — so measured at 1440px the fourteen cards came out at **six different heights between 134px and 191px**, tracking the length of the text rather than anything meaningful. The title reserves two lines (`min-h-[3rem]`) and the metadata block six (`min-h-[105px]`: four rows at text-xs/leading-snug plus three 2px gaps, sized so Objective and Benchmark can each take two). All fourteen now measure exactly 191px at 1440px and at 1100px.
    - **`line-clamp-2` on the title is the other half of the reservation** — without it a longer name added later overflows the reserved space and the ragged heights come straight back.
    - **It is a FLOOR, not a fixed height**, so expanding a card still grows it (795px measured) while the other thirteen stay at 191px, and at phone width — where the stack is one column and there is nothing to compare against — the cards grow to 191–274px rather than clipping.
- **The Foundation family carries no Conviction Tiers** (`hasConvictionTiers(name)` in `lib/modelPortfolios.ts`, Oct 2026; review frequency is **Semi-Annual** for all five). A tier ranks individual holdings by conviction and gives each a target weight band — 5-7% for a best idea, 0-1% for an exit candidate — which only means something in a book of twenty-odd single stocks. A Foundation portfolio holds a handful of funds at twenty to forty percent each, so every holding clears the Tier 1 band by construction. Matched on the family **prefix**, not a fixed name set like `EQUITY_MODEL_NAMES`, because Foundation gains members and a sixth should not quietly get the table back. The stored `tier{1..4}_*` columns are **left alone** — the save echoes them back rather than writing the form's defaults, and `resolveTierInfo` still reads them for the annual conviction-ranking review. **The ETF/Hybrid strategic models (ids 1–5) and Fixed Income Total Return keep their tier tables**, though the same argument arguably applies; that was not in scope.
- **`AutoGrowTextarea`** (`components/AutoGrowTextarea.tsx`) — textarea that grows to fit content (optional `maxHeightPx` cap); used on the Add Security workflow, the model-portfolio narrative fields, the `MarkReviewedModal` rationale/notes, and the fund annual review's **per-holding proposal rationale** (`ConsiderationsSection`). That last one was a single-line `<input type="text">` 265px wide until Nov 2026, and the first real handoff recorded rationales of 638–1,084 characters into it — about thirty of them visible. **Same defect as the review-modal rationale box, on the surface where it matters most**: the advisor is signing a proposal the committee will be briefed on, and could not read it. Capped at 200px so seven rows do not push the handoff button off the page; the row cells are `align-top` because the rows are now tall. It measures with `scrollHeight`, which **excludes the border** while Tailwind's preflight makes the box `border-box` — so the height must add the border width back or every caller clips its last line by 2px (it did).

## Security Theses (`security_theses`) — the durable half of the research pair

**One thesis per SECURITY (stocks only), shared by every portfolio holding it** — not
one per position. The binding process document is **`docs/research-standard.md`**; read
it before touching anything here. The split that makes the system work:

| | **Security thesis** (`security_theses`) | **Buy record** (`security_additions`) |
|---|---|---|
| Question | Is this company worth owning? | Should this portfolio buy it, at this price and size? |
| Scope | One per security | One per (portfolio, security) |
| Lifespan | **Durable** — revised only when the view changes | Point-in-time |
| Carries a price view | **No** — no rating, no fair value, no price target | Yes |

- **`thesis` / `bull_case` / `bear_case` are `jsonb`.** `thesis` is the reasons
  (`{key,title,rationale}`); `bull_case` is the supporting metrics, each tied to a
  reason by `reasonKey`; `bear_case` is the risks, with the break field in `breaksIf`.
  Every metric and bear point carries **metric / baseline / trend / breaksIf** so a
  future reviewer can re-measure. `breaksIf` is the field that does the work and is
  never optional.
- **Durable sections carry no figures.** `business_description`, `competitive_position`
  and every `rationale` must contain **no digits at all** — no money, percentages,
  fiscal periods or years. Figures live in the metrics. The rule is mechanised in
  `digitsIn()` in the loader, which deliberately allows digits welded into names
  (L3Harris, 3M) while rejecting standalone figures.
- **Append-only, enforced by a trigger** (`security_theses_append_only`): a **draft may
  be freely edited or deleted**; a `current` row may only become `superseded` and only
  with its recorded content unchanged; `superseded` rows are frozen. Partial unique
  indexes `security_theses_one_draft` / `one_current` allow exactly one of each per
  security, so **you cannot insert a second draft** — replace the existing one.
- **The committee drafts; the advisor adopts.** Publishing requires a complete row
  *and* an `evidence_doc_path` (CHECK `security_theses_published_is_complete`), the PDF
  built by **`lib/thesisPdf.ts`** and uploaded to `Security Documents/<ticker>`. Each
  version gets its own file; a revision never overwrites its predecessor. `version > 1`
  requires a `revision_reason`.
  - **Two ordering rules inside `publishThesis`, both load-bearing.** The PDF is uploaded
    FIRST and the row published only on success, so there is never a thesis of record
    without its document. And a live version is retired to `superseded` BEFORE the draft
    is promoted — `security_theses_one_current` is a partial unique index, so promoting
    first fails. Publish against **the path `uploadFile` returned**, never a derived one:
    the server date-prefixes and sanitises filenames (gotcha 15).
- **`security_id` has NO FK to `securities2`** — deliberately, so a watchlist candidate
  that is not held can still carry a thesis. Expect orphans and do not "fix" them.
- **Loader:** `scripts/theses/load-drafts.mjs <staging-dir> [--dry-run]` validates
  committee JSON against the research standard and inserts **drafts only** — it never
  publishes, never clobbers an existing lineage, and **warns on unknown keys** rather
  than silently dropping them. It recognises only `<TICKER>.research.json` /
  `<TICKER>.bear.json`, so notes and backups can sit beside the pair.
- **`SecurityThesisPanel` is the drafting AND adoption surface** (stock detail page;
  data layer `lib/securityTheses.ts`) — it is **not** read-only. It seeds a draft from the
  committee's own work (`fetchThesisSeedFromResearch` **merges two rows** — the research
  analyst writes the bull case, the devil's advocate the bear case), edits it
  (`startOrResumeThesisDraft` / `saveThesisDraft` / `discardThesisDraft`), and adopts it
  via "Save as thesis" → `publishThesis`. An adopted version renders read-only behind a
  "Revise thesis" button, which opens version N+1. The published record is authored by the
  advisor, with the reports it drew on recorded in `source_report_ids`.

## Committee Reports (`/committee`) — the first firm-wide view of the output

`lib/committeeReports.ts` merges the five deliverable tables — `research_reports`,
`earnings_call_summaries`, `risk_reports`, `ic_memos`, `portfolio_review_memos` —
into one feed (Nov 2026). **Every existing reader of them is scoped to a single
security, portfolio or candidate**, so until this page the answer to "what has
the committee produced" did not exist anywhere: 115 research reports, 41 call
summaries and 78 risk reports sat written and unreadable in aggregate.

- **Status is NOT rendered as a state.** 102 of the 115 research reports and
  **all** 41 call summaries carry `status = 'draft'`, and **nothing in the app
  has ever written `'final'`** — no code path promotes one. So "draft" never
  meant provisional, it meant "written by a job", and presenting it as a queue
  of unapproved work invents an approval step the firm does not run. The column
  stays (it is the record as written, and the jobs still set it); the `Draft`
  badge in `icReviewCards` was removed. **`ic_memos.status` is the exception and
  is kept** — there it is the real CIO decision (`pending_cio` / `approved` /
  `rejected`), written by `recordIcDecision` and routed on by the Actions hub.
  One table's vestigial column is not another's.
- **Read-only and derived.** Nothing here writes, and no copy is stored.
- **`CommitteeDoc.id` is `table:rowId`**, because the five tables number
  independently — `research_reports` 41 and `earnings_call_summaries` 41 are
  different documents and a bare id collides.
- **`docHref` has three cases, and the middle one is the trap.** A held security
  opens its detail page (where the Commentary tab renders the document); a
  **ticker with no `securities2` row opens `/research/:symbol`**, because
  `research_reports.security_id` has no FK precisely so an unheld watchlist idea
  can carry research — routing those to `/security/null` is the documented
  navigation bug. A portfolio document opens its portfolio, URL-encoded (two
  live books contain spaces and one an ampersand).
- **Grouped the way the advisor filters, not by table**: pre- and post-earnings
  briefs are two report types in one table and one thing to the reader, while a
  risk report and an IC memo are separate tables under one `memos`/`risk` split.
- **`CommitteeFeed` is shared by the dashboard section and the page** so the two
  cannot describe the same document differently — the `fundScorecard` split
  applied to a feed. `limit` bounds EACH table, not the total, so one chatty
  source cannot crowd the others out.

**The dashboard was restructured around it** (`HomePage`, Nov 2026). It carried
six stat cards over the Action Center band, and **four of them restated counts
the band already derived from the same `fetchAllActions` model** — overdue
reviews, portfolio reviews, open actions, alerts — so one fact printed three
times (band, card, list) while the committee's 235 documents appeared nowhere.
Those four are gone. The two that survive (At-Risk, Watchlist) moved INTO the
band as inventory rather than a worklist: a watchlist idea is not overdue.
The page now reads as what is owed → what was written → what is coming →
whether the machinery works → the detail the band can only count.

- **`upcomingEarnings`** (in `reviewSchedules.ts`, pure) is the forward half.
  Every other review surface answers what is owed NOW; none said what was about
  to land, though that decides whether the week holds three reviews or none. It
  reads rows the calendar has already fetched, so it costs no query, and
  **excludes funds through the classifier** — a fund review is cadence-driven.
  A call TODAY is included (its review is due tomorrow); a call already held is
  the overdue surface's business.
- **A loading `fetchAllActions` renders `—`, never `0`.** It fans out over nine
  sources and takes seconds; rendering zero while it resolves says "nothing is
  overdue" on the front page of an audit-defence tool, which is a false
  statement rather than a placeholder. It read 0/0/0/0 for ~20s before this.

## Actions Hub (`/actions`)

**The hub fetches the bucket listing ONCE and passes it down.** It used to make
**seven identical requests** for the same 15 files — one in `fetchDriftActions`,
one in `fetchAllocationBandActions`, and one more inside every
`fetchLatestActualAllocation` call, which both of those made in a loop. At 5.9s
each that was most of the page's load. `fetchLatestActualAllocation(name, files?)`
now takes the listing, and `fetchAllActions` fetches it before the fan-out.
**A parameter, not a cache** — a cache would go stale behind an upload, and
uploads invalidate a TanStack key this path does not use.

**Both per-portfolio loops run in parallel.** Each was a `for` with an `await`
in its body, so six portfolios meant six serialised rounds of download-and-parse.
Nothing in either depends on the previous portfolio's answer.

Measured on the same page: **52.4s and never rendering → 4.3s**, one bucket
listing instead of seven. What remains is ~14 signed-URL downloads, because
drift and the allocation bands each resolve the same portfolio's file
separately; sharing that result between the two sources is the next win.


The Actions page is a **unified command center**, not a plain to-do list. It shows one `UnifiedAction[]` assembled by **per-source adapters** in **`lib/actions.ts`** (`fetchAllActions`), keeping each domain single-sourced.

- **Two kinds of action.** **Manual** tasks are real `action_items` rows (created, completed, snoozed, recurring). **Derived** actions are projected **READ-ONLY** from their own authoritative tables and carry a **route into their own workflow** — they are completed **THERE, never from the Actions page** (no derived state is duplicated into `action_items`). Sources: `review_schedules`, `portfolio_review_schedules`, `ic_memos` (`pending_cio`), `security_additions` (`draft`), `alert_events`, `at_risk` (sell timer), drift breaches (computed from `positions`), `import_runs` (a YCharts refresh that failed or did not fire) and `job_runs` (a scheduled routine that died or missed a run — see the heartbeat convention above).
- **`action_items` is the manual-task backbone** (extended Jul 2026): `category` (`security`/`portfolio`/`ic`/`compliance`/`client`/`trade`/`operational`), `source` (always `manual` here), polymorphic **`linked_type`/`linked_id`** (e.g. `client`), `recurrence` + `recurrence_interval`, `snoozed_until`, and a widened `status` (`open`/`in_progress`/`waiting`/`blocked`/`snoozed`/`closed`). CHECK constraints enforce the category/recurrence/status sets. Data layer + labels + `advanceDate`/`snoozeActionItem`/recurrence-on-complete live in **`lib/actionItems.ts`**. **Closing a recurring task spawns the next occurrence** (due date advanced by the cadence). Still soft-deleted (`deleted_at`); status transitions audited in `action_item_events` (`ActionItemTimeline`).
- **Page** (`ActionItemsPage`): a summary band over sidebar facets (category + source, with counts) and a column table, **date-bucket grouping** (Overdue/Due Today/This Week/Upcoming/No Date) or group-by-category, auto-priority, snooze, bulk close/snooze, recurring **Templates**, CSV export, an **Automation** button opening `AutomationPanel` (also reachable at `/actions?automation=1`, which is where the `job_health` action routes), and **persisted filters** (`hooks/useActionFilters.ts` — six pieces of view state behind one localStorage key; device-local UI state, OK). The CSV is built by **`buildActionsCsv`** in `lib/actions.ts`, beside `actionLabel`, so the exported row and the on-screen row cannot name an action differently; the page owns only the download. Manual rows are editable; derived rows show **"Open →"**.
- **The page mixes a worklist and a calendar, and the calendar is the bigger half.** Every `review_schedules` and `portfolio_review_schedules` row is projected whether or not it is due, so 98 of 171 actions were future-dated reviews reading "this reports in six weeks". Two devices keep that from burying the ~15 rows that need doing, and **neither hides anything without a count saying so**:
  - **Upcoming and No Date are collapsed by default** (`DEFAULT_COLLAPSED`), and the group header carries the full count. A **horizon** control (7/30/90/all days) trims how far the list reaches; overdue rows always pass it, since a negative `daysUntil` is within any horizon.
  - **`clusterActions` collapses repeated DERIVED actions** sharing a source and a day into one line — "Portfolio Review — 37 due Jun 29, 2026". One fact printed 37 times is not 37 facts. Manual tasks never cluster (two sharing a date is coincidence, not a common cause), and a group under `COLLAPSE_MIN` (3) renders as itself.
  - **The cluster key is the LOCAL calendar day** (`localDayKey`), not the raw `dueDate`. These sources store `timestamptz` while the whole page treats a due date as a day — `bucketOf`/`daysUntil` round to local midnight and `formatDate` renders a bare date at local noon. Two Equity Income reviews stamped `2026-06-30T00:08Z` fall on 29 June here: keying on the raw string split them out of a cluster showing their own date, and keying on the UTC prefix would have labelled the cluster a day after the rows inside it. The label is built with `formatDate` for the same reason.
- **Overdue rows are marked on the edge and on the date, not washed red.** 48 red rows is a red page. They also carry an **aging** line (`agingLabel` — "124d overdue"): in an audit-defense tool, how late a thing is is a different fact from whether it is late.
- **Create-from-context.** `CreateActionItemModal` takes `defaultSecurityId`/`defaultPortfolioName`/`defaultClientId` and auto-sets the category; **"+ Action" buttons** live on the security detail, portfolio detail, and client detail pages. A client-linked task uses `linked_type='client'`; the client page shows **client-linked actions plus its portfolios' actions**, which it does by fetching all actions under the shared `actionItems` key and narrowing with a TanStack `select` — so it costs no extra request and shares the Actions page's cache. (This used to say `fetchActionItemsByClient` scoped that list. It did not: nothing called it, and it filtered on `linked_type='client'` ALONE, so it could not have produced the portfolios' half. Deleted in Nov 2026.)
- **Convergence.** The Home **Action Center** band shows bucket + category counts from the same `fetchAllActions` model; the **Review Calendar** stays the review-completion workflow and cross-links to `/actions`.

## Audit & Governance surfaces

Six live surfaces that carried **no entry here at all** until Nov 2026 — which
is how a reader concluded the app had no audit trail. All four are the
regulatory half of the tool, so they are worth knowing before touching the
tables they read.

- **`audit_log` + `/audit` (`AuditLogPage`, `lib/auditLog.ts`)** — a **read-only**
  surface over an append-only table, with CSV export. **Nothing in the app writes
  it:** a Postgres trigger (`log_audit`) does, on **eleven** tables —
  `action_items`, `at_risk`, `clients`, `compliance_rules`,
  `firm_compliance_rules`, `investment_policy_statements`,
  `portfolio_allocations`, `prospects`, **`prospect_portfolios` (Nov 2026)**,
  `review_schedules`, and **`securities2`
  (Nov 2026, conditionally — see below)**. Adding a trigger is how a table joins
  the log; there is no client-side path, and there should not be one.
  - **`securities2` is the only CONDITIONAL one, and that is the design.** It is
    93 columns wide and **59 of its 102 rows are rewritten on a normal day** by
    the YCharts workbook and `refreshSecurityFromFMP`; logging every write would
    add **~199 MB a year to a 2 MB `audit_log`** and bury a governed edit roughly
    one row in 1,800 — the "signal that cries wolf" failure already paid for with
    `never_run` and "AI research pending". So **`audit_securities2_ins_del`**
    logs inserts and deletes unconditionally, while
    **`audit_securities2_update`** carries a `WHEN` clause and fires only when a
    **decision** column actually changes value: `category_name`,
    `preferred_benchmark1_id`, `preferred_benchmark2_id`, `scorecard_cohort`,
    `alt_1`/`alt_2`/`alt_3`.
    - **Two triggers because a `WHEN` clause cannot reference `OLD` on an
      INSERT**, and **`IS DISTINCT FROM`, not `<>`**, because every one of those
      columns is nullable and setting one for the first time is exactly the
      manual category edit this was added to record.
    - **An absence therefore means "no decision was recorded", not "the row did
      not change".** Do not read the gap as the full history of a security.
    - Useful side effect: when the **workbook** changes a fund's
      `category_name` — a new Morningstar spelling, the gotcha-23 vector — that
      is a real value change and IS logged, while the same import rewriting the
      return columns is not.
    - `schemaContract.test.ts` pins both triggers, the `WHEN`, the governed
      column list and the absence of vendor columns, because the easy future
      mistake is to "make it consistent with the other nine".
  - **`prospect_portfolios` is audited unconditionally**, unlike its
    `securities2` neighbour. `prospects` had carried a trigger since it was
    created and its portfolio links had none, so attaching or detaching a book
    left no trail — and `removeProspect` now DETACHES on removal, so without
    this nothing would record that a link ever existed. No WHEN clause is
    needed: the table holds single figures of rows and only changes when the
    advisor acts, so there is no volume to defend against and a condition would
    only add a way to be wrong.
  - **`schemaContract.test.ts` pins the list against the triggers, BOTH ways.**
    A table in `AUDITED_TABLES` with no trigger is a filter that silently
    returns nothing; a trigger whose table is missing from the list is a record
    nobody can find. It reads the triggers out of `supabase/schema.sql`, so it
    also fails when the snapshot has not been regenerated — which is how it
    first fired.
  - **`AUDITED_TABLES` in `lib/auditLog.ts` had drifted BOTH ways** and was
    corrected in the same change. It listed **`positions`**, which is not a
    `log_audit` table at all — its `positions_audit` trigger runs
    `log_position_change()` into `holdings_change_log` — so filtering by it
    could only ever return nothing; and it omitted **`firm_compliance_rules`**,
    which carries a real trigger and 11 rows that were reachable only under
    "All". Keep that list matched to the triggers.
- **Compliance Rules hub — `pages/settings/CompliancePage.tsx`,
  `/settings/compliance`** (data layer `lib/compliance.ts`). `firm_compliance_rules`
  is firm-wide, `compliance_rules` per-portfolio. **Not** `InvestmentCommitteePage`,
  which is at `/settings/investment-committee` and is a read-only reference page
  describing the AI roles — this document pointed at the wrong one of the two for
  months. See "Compliance architecture" above for how the rules reach a risk report.
- **Households (`lib/households.ts`, `HouseholdView`)** — aggregates positions
  across every portfolio belonging to clients in one household, for
  concentration and suitability review. A client's household is
  `clients.household_name`; there is no households table.
- **Strategic Asset Allocation (`lib/strategicAllocation.ts`,
  `strategic_allocation_vintages` + `_weights`)** — the firm's PUBLISHED model
  allocations, uploaded as a PDF on the compliance page. **Its fourteen rows are
  exactly `ASSET_CLASS_ROWS`, in order**: this document is where that vocabulary
  came from, which is why the parse maps straight onto `AssetClassKey`.
  - **A vintage is keyed on the month PRINTED IN THE DOCUMENT**, never on the
    upload time, and the list orders on that. An older document can legitimately
    be uploaded later; keying on upload order would make January read as current
    and mark every model wrong.
  - **It does not touch `model_portfolio_data` in either direction.** It neither
    writes a model target nor reports on one. A read-only drift report shipped
    with it and was removed on request a day later, together with the comparison
    behind it rather than left as an unused export — `git log` has it. Worth
    knowing if it is ever rebuilt: the Foundation five carry the document's 2%
    cash while the shared ETF/Hybrid models 1–5 carry 1% with the spare point in
    equity, so that one-point offset is a standing convention and not drift.
  - **Change notes are DERIVED, never stored** — the same reasoning as the
    portfolio Change Log: a stored note is a second copy of what two vintages
    already say, and the two drift.
  - **These models go months without moving**, so "no changes from the last
    document" is the usual answer and says nothing about when they last did.
    `findLastChange` walks back from the SELECTED vintage (not from the newest,
    or viewing an old document would report a change that had not happened yet)
    and the card carries a collapsed **Last changed** row naming that month. It
    is suppressed when the selected vintage IS the last change, since the list
    above is already that answer. On the five 2026 documents the only movement
    is January → February; April, July and October are identical to it.
  - **The group totals are parsed but NOT stored.** EQUITY and FIXED INCOME are
    the sums of the rows beneath them, so they are used to CHECK a parse and
    then discarded; storing a total beside the rows it totals is how the two
    start disagreeing. A mismatch is a warning on the preview, not a silent write.
  - **PDFs go to `Portfolio Documents` under `compliance/strategic asset
    allocation models/`.** Not the `security-uploads` general store, despite that
    being the obvious home: that bucket restricts `allowed_mime_types` to the two
    Excel types and Storage rejects a PDF outright. A file at this path is
    invisible to `latestFileFor`, which matches on `folder === portfolioName` AND
    a spreadsheet extension.
  - **`pdfjs-dist` is pinned exactly and is in `optimizeDeps.include`** — the
    compliance page is `lazy()`, which is the exact condition that splits React
    in two on a cold dep cache. Text extraction is isolated in `lib/pdfText.ts`;
    everything that decides what the text MEANS is pure and tested against the
    real document's extracted text.
- **Trade suitability (`lib/tradeSuitability.ts`, `trade_suitability`)** —
  records WHY a position was added, changed or removed, which is the
  best-interest documentation requirement. Labels and the per-action reason sets
  (`REASON_OPTIONS_BY_ACTION`, `REASON_OPTIONS_BY_MONITOR_ACTION`) live in that
  module.
- **`holdings_change_log` is the `positions` audit trail** — the fifth surface,
  and the one nobody knew was there. The **`positions_audit` trigger** runs
  `log_position_change()` on every insert, update and delete of `positions` and
  appends a row: ticker, `change_type` (`add`/`remove`/`weight_change`), old and
  new weight, `changed_at`. It has been writing continuously since Apr 2026 and
  no application code touches it. **`positions` is NOT covered by `log_audit`**
  (the nine-table list above), so this is the only record of who changed a
  target weight and to what. It was twice recorded in this document as a dead
  legacy table with "no writer anywhere" and was proposed for deletion in the
  Nov 2026 audit; dropping it would make **every write to `positions` fail** —
  every allocation import and every History grid edit. `schemaContract.test.ts`
  now pins the table and the trigger together.

## Documents (Express file store)

**`/api/files` is ONE indexed read, not a Storage walk.** It used to call
Storage's `list('')` for the folders and then `list(folder)` for each one —
**7 HTTP round trips to return 15 files, measured at 5.9 seconds**. Supabase
keeps the object index in Postgres, so `public.list_bucket_objects(p_bucket)`
(SECURITY DEFINER, EXECUTE granted to **service_role only**, because a listing
names every document the firm holds) answers the same question in one query.
**0.79s cold, ~0.3s warm**, and the HTTP response is byte-identical — verified
field by field against the old output, including the timestamp FORMAT, since
callers sort on `updatedAt` as a string.

- **One wart is reproduced deliberately.** The old walk went exactly one level
  deep, so a nested path like `compliance/strategic asset allocation models/x.pdf`
  surfaced the middle segment as a FILE with null size and mimetype. Four
  surfaces read this route; a performance change is the wrong moment to alter
  what they see.


Files live in **Supabase Storage**, brokered by the Express server (`server/`, `/api/files|upload|folders|files/signed-url`) which holds the service-role key. The client lives in **`lib/documents.ts`** (`fetchAllFiles`, `uploadFile`, `deleteFile`, `getSignedUrl`, `createFolder`, `deleteFolder`, `formatBytes`, `isServerUnreachable`, `StoredFile`).

- **The `Portfolio Documents` folder is a general store, so `fetchLatestActualAllocation` must PROVE a file is an allocation.** It used to take the newest file in the folder whatever it was, parse it as a two-column `Ticker, Target` sheet, and call the result the actual allocation — so a review PDF or the dated long-format history file became the book. The dated file is the sharp case: its first column is the date, not a ticker, so every row is skipped and it parses to an **empty map**. `latestFileFor` now walks spreadsheet files newest-first and returns the first that actually parses to something. The extension check alone is not enough — the dated file is a perfectly good `.xlsx`.
- **Buckets** — every file endpoint takes a **`bucket`** param (server allowlists it; defaults to `security-uploads`): **`Portfolio Documents`** (portfolio tab), **`Security Documents`** (stock detail tab), **`security-uploads`** (Settings → Documents general store + the `/api/securities/:id/files` legacy path), `fund-fact-sheets`. Bucket constants: `PORTFOLIO_DOCS_BUCKET` / `SECURITY_DOCS_BUCKET` / `DEFAULT_BUCKET`.
- **Within a bucket**, files are organized into **folders**: a portfolio's folder = its name; a security's folder = its ticker. `DocumentsFolderPanel({ bucket, folder, scopeLabel, emptyHint })` is the shared upload/list/view/delete UI used by both the portfolio Documents tab and the stock Documents tab; it fetches all files in the bucket and filters to `f.folder === folder`.
- Query key is **bucket-scoped**: `documentsFiles(bucket)` — so the three surfaces don't collide and an upload invalidates only its bucket. `isServerUnreachable(err)` matches Chrome/Safari/Firefox network-error messages → graceful "Express server not reachable" banner (`cd server && npm run dev`). Funds are not tabbed, but they do get the same `DocumentsFolderPanel` as a section on the detail page.

## TipRanks Analyst Data (paid FMP add-on)

`lib/fmpTipranks.ts` wraps the TipRanks add-on. It answers a question the base analyst data cannot: **how good is this opinion?** Where `lib/fmpAnalyst.ts` gives a consensus target and a grade distribution, TipRanks adds analyst identity with a **track record** (`stockSuccessRate` = that analyst's hit rate on *this* stock), the **action taxonomy** (initiated / maintained / upgraded / downgraded / reiterated — i.e. *change*, not a snapshot), and **outcome scoring** (beats / misses / average return) at symbol, analyst and firm level.

- **REST-path landmine.** The documented / MCP names do NOT all match the REST paths: point-in-time is **`tipranks-pit-symbol`** and **`tipranks-pit-analyst`**. The documented `-by-symbol` / `-by-analyst` forms return **HTTP 404 with an empty-array body**, so a wrong path reads as "no coverage" rather than an error. Do not "correct" these to match the docs.
- **On demand, never persisted** (the standing FMP convention), with one exception: `MarkReviewedModal` freezes a summary into `review_log.metrics_snapshot.tipranks` so a stock review stays reconstructable. That field is optional — reviews recorded before the add-on still parse.
- **`MIN_RATINGS_FOR_ACCURACY` (10)** — `beatRate()` returns null below that many *resolved* targets, and every surface shows the count alongside. Thin coverage is real (BRK.B has 3 ratings); a 3-rating average must never be dressed up as a track record.
- **`stockSuccessRate` needs `stockHitRate()`, never direct use.** Two traps: it is **point-in-time**, so the same analyst carries different values across their own calls (Wamsi Mohan on AAPL: .800 → .758 → .773 over a year) — it means "as of that call", not "today". And **0 is a missing-data sentinel, not a literal 0%**: across AAPL/AMD/NVDA/MSFT, 65 of 1,200 rows report 0, and 9 of those are calls that BEAT their own target, while 15 are the analyst's only call on the name. `stockHitRate()` maps 0 → null so the UI shows "—" instead of falsely reporting an analyst as never right.
- **`latestByAnalyst(ratings)`** — `tipranks-pit-symbol` is a rating HISTORY (one analyst appears many times), so reduce it before rendering "who covers this now".
- **Surfaces:** `TipRanksPanel` is the **first block on the stock Overview tab, above `SecurityThesisPanel`** — the whole street, then our own thesis of record. (It sat on Monitor above `SecurityResearchPanel` until Oct 2026.) It leads with a **summary block** (consensus donut + label, and the 12-month target average/high/low against the live price via the shared `RangeBar`) and keeps the **full analyst list collapsed** behind a toggle; 40+ rows expanded by default buried the headline. Row-click opens `TipRanksAnalystModal` for one analyst's rank, stars, scorecard and recent calls across every name.
- **Consensus is head-count, not call-count.** `consensusFromRatings(latestByAnalyst(ratings))` counts each analyst's CURRENT standing call — 41 analysts on AAPL. Do not use `TipRanksSummary.buy/hold/sell` for a consensus badge: those count *recommendations* over the trailing window (AAPL 275/129/33 = 437 calls), which is the right basis for activity and momentum but wildly overstates the number of opinions. `targetsFromRatings` derives the target range from the same rows the table shows, so headline and detail cannot disagree. The consensus **label thresholds are our own approximation** — TipRanks does not publish its formula.
- **The AI committee reads it.** `research-analyst` and `devils-advocate` load the `tipranks` tool via ToolSearch and are told to **weight by track record, not head count**. The `.claude/agents/*.md` files and the inlined `TIPRANKS_NOTE` / `BEAR_TIPRANKS_NOTE` in `.claude/workflows/new-buy-ic-review.js` must stay in sync.

## Portfolio Allocations & Performance

### `portfolio_allocations` is the dated-allocation source of truth

A portfolio's allocation **history** lives in `portfolio_allocations` — one row per `(portfolio_name, effective_date, security_id, weight)`, where each `effective_date` is a full target weight vector (weights are **percent points**, e.g. `6.50` = 6.5%). This is the normalized form of the YCharts "dynamic" grid (dates as columns). It **replaced `holdings_change_log`** entirely.

**One file drives all three Allocation sub-tabs**, through `lib/allocationImport.ts`: History is `portfolio_allocations`, Positions is the NEWEST snapshot (`syncPositionsFromLatestSnapshot`), and the Change Log is **derived from the history** — so the three cannot disagree.

- **`lib/allocationChanges.ts` computes the Change Log on read** by diffing consecutive snapshots (`deriveAllocationChanges`, pure and React-free). **`holdings_change_log` is NOT the source, and the reason recorded here until Nov 2026 was wrong.** It said the table had "a reader and no writer anywhere". It has a live writer — the **`positions_audit` trigger** calls `log_position_change()` on every insert, update and delete of `positions`, and it has been appending continuously since Apr 2026. The real reason it cannot drive this tab is better: it logs a change to the **current target** — ticker, old weight, new weight, a wall-clock `changed_at` and **no `effective_date`** — so it cannot say which dated snapshot a change belongs to, which is the one thing a change log keyed by rebalance has to say. It also records only what reached `positions`, and two books' positions are not driven by their own history at all. Rebuilding this tab on it would re-create exactly the drift it exists to report. **Do not "drop the dead table"** — every write to `positions` would fail; `schemaContract.test.ts` guards it. The earliest snapshot is reported as **additions** — it is the opening position, and a log starting at the second change reads as though the book appeared from nowhere. Weight moves below 0.005pp are suppressed (a float round-trip renders "4.0% → 4.0%" otherwise).
- **`lib/allocationImport.ts` is the single import path**, shared by the Settings card and the Allocation tab so the two cannot drift: `parseAllocationFile` → `checkAllocationImport` (preview, no writes) → `applyAllocationImport`. The caller records the `import_runs` row, so it is never logged twice.
- **A missing ticker is NOT auto-created.** `syncPositionsFromLatestSnapshot` is all-or-nothing, and the import names the unknown symbols and stops at positions (history still lands). **Never create them via `createSecurityBySymbol`** — that calls FMP, and for a fund or ETF the identity and metrics belong to the YCharts workbook's `Securities` sheet (see "YCharts owns fund/ETF data"). FMP does not even serve these share classes: it returns nothing for VMSAX. `lib/portfolioAllocations.ts` owns the data layer (`fetchAllocationGrid`, `fetchAllocationSnapshots`, cell upsert, add/delete date, bulk import); `positions` still holds the *current* target allocation separately.

- **No DB FK to securities2** — the table intentionally stages arbitrary import symbols (incl. tickers not yet in `securities2`), so PostgREST **cannot embed** `securities2(...)`. Resolve names with a **separate `securities2` lookup** keyed by the distinct symbols, never an embed (an embed 400s — "no relationship found").
- **Portfolio detail tabs** (`PortfolioDetailPage`): top-level **Overview · Allocation · Reviews · Documents**. **Allocation sub-tabs** are **Positions · History · Change Log · Candidates** — Change Log and Candidates were moved from top-level into Allocation, and the **Comparison sub-tab was removed** (`AllocationComparison.tsx` was deleted with it in `c3ee3ff`; this used to say the file was left in place, and it was not).
- **UI:** the **Allocation → History** sub-tab (`AllocationHistoryPanel`) is the editable grid (dates as columns, securities as rows, per-date totals, add/delete date, add ticker). Production-editable. It carries the **"Import allocations"** action (`ImportAllocationsModal`), which **previews before it writes** — dates, holdings, per-date totals, and any unknown tickers — because the import REPLACES every stored date and re-points Positions. A per-date total that is not 100% is flagged amber: that is a broken file, not a rounding quirk.
- **The Overview's Asset Class Allocation table has NO actual/holdings column for FUND portfolios** (`PortfolioOverview`, Nov 2026) — same reasoning: their positions are the uploaded snapshot, so the comparison column restated the target beside it. The legend's second figure and the "Actual holdings as of …" basis line go with it. **Equity portfolios are unchanged** and keep all three. Two consequences were handled rather than accepted:
  - **The band status went with the column** (`STATUS_CLASS` ambers the actual figure). A class held outside the model is therefore restated as a red line beneath the table — otherwise removing the column would silently remove the finding. **The Foundation Conservative example this bullet used to give is no longer true, and was never a model gap.** It read "VWEAX 7% and VMSAX 3% sit in sleeves its model does not fund"; model 166 funds high yield at exactly 7% and multisector at exactly 3%, and the book sits on model sleeve by sleeve. The symptom was gotcha 23 — `Multisector Bond` was missing from `ASSET_CLASS_BY_CATEGORY`, so VMSAX resolved to `null` and its sleeve read 0 against a funded target. Adding the category fixed it. **An unclassified holding looks exactly like an unfunded sleeve on that table**, which is why the finding was written up as a model problem for weeks; check `resolveAssetClass` before concluding a model does not fund something.
  - **Fund portfolios now measure bands against POSITIONS, not the Documents file.** `holdingWeights` preferred the newest parseable file in `Portfolio Documents`, which for a fund book is whatever was last uploaded there and may describe an older lineup — Foundation Conservative's positions carry VMSAX while that CSV is the earlier six-holding book. Equity portfolios still prefer the file, which is the whole point for them ("has the market moved me out of band?").
- **A hand edit in the History grid writes through to `positions` — but only the newest column, and only that one holding** (`syncPositionForGridEdit`, Nov 2026). "One allocation file drives History, Positions and the Change Log" was true of the IMPORT path only; the manual path changed history and left `positions` stale in the database, with the two sibling sub-tabs disagreeing and nothing saying so. `isCurrentTargetDate` decides which column counts — an edit to an older column is history and writes nothing.
  - **It is deliberately NOT a wholesale `syncPositionsFromLatestSnapshot`.** That deletes every position absent from the snapshot, and on today's book two portfolios would lose rows: **Equity Income & Core Growth** (a derived blend whose positions are computed from its parents — 25 of its 80 rows), and **ETF Conservative**, whose newest snapshot is sixteen months older than its positions, so a sync would quietly revert a live book to a 2025 lineup. Editing one cell does not authorise rewriting a book.
  - **Adding or deleting a date does not re-point positions.** Adding clones the previous column so the weights do not move; deleting the newest column does change which snapshot is current, but re-pointing a whole book off a destructive click is not a decision to make silently.
  - **The gap that leaves is REPORTED, not resolved.** `lib/positionsDrift.ts` (`comparePositionsToSnapshot`, pure) drives an amber banner on the History sub-tab naming what differs and which tickers. **Derived blends are exempt** (`DERIVED_BLEND_PORTFOLIOS`) — their positions are computed, so disagreeing with their own history is expected. The two divergences above are live and visible there now.
  - **`positions.security_id` has an FK to `securities2` while `portfolio_allocations` deliberately has none**, so an edit naming an unknown ticker updates history and reports that Positions was left alone. That is a refusal, not a failure.
- **The Positions table has NO "Current" column** (removed Nov 2026). Positions ARE the newest uploaded snapshot, so a second column reading the same upload said nothing — and it was actively wrong: it rendered "Current allocation as of <date>" over a column of `—` with a 0.0% total whenever the newest file in Documents was not a two-column allocation export.
- **Importer:** the YCharts dynamic **source file is the LONG format** — columns `Date · Symbol · Target Weight`, one row per holding per date, weights in **decimal** (0.075 = 7.5%). `parseYchartsDynamic` pivots it to dated snapshots; `$:CASH` normalizes to `$Cash`. (Not the wide grid shown in the YCharts editor.)

### Per-holding attribution (`lib/portfolioPerformance.ts`)

**The buy-and-hold performance engine that used to live here was DELETED (Sep
2026)** — `computePortfolioPerformance`, `computePortfolioPeriodReturns`,
`computeBenchmarkPeriodReturns` and `PortfolioPerformancePanel` are all gone.
It recomputed NAV from FMP closes across `portfolio_allocations` episodes and
contributed exactly 0.00% on every rebalance date (episode *n* emitted days
`d < b` while *n+1* rebuilt shares from the same NAV at `close(b)`), zeroing
~12 trading days a year against a benchmark row that had no episodes and so no
such loss. Model-portfolio performance now comes from **YCharts' own figures on
`portfolio.*_total_return`**, refreshed by the daily workbook import and
rendered by the Total Returns block in `PortfolioOverview`. Don't rebuild it:
recomputing a number we do not own meant owning its bugs. The file's own
docstring carries this history — read it before adding anything here.

**The 3 Yr / 5 Yr / 10 Yr columns are blank because the models are too young,
not because the data is missing** (`lib/trackRecord.ts`, Nov 2026). The oldest
of the 19 is **2.5 years old**; the first three-year figure arrives in **Apr
2027**. The evidence is the one-year siblings — `historical_sharpe_1y`,
`max_drawdown_1y`, `market_alpha_12_month` and the rest are populated on 18 of
19 books while every `_3y`/`_5y` twin is null — so the workbook carries the
whole block and there is simply nothing to carry yet.

- **Do not drop those 25 columns.** They were filed as dead schema on the
  strength of an all-null count. Dropping them would delete the landing place
  for Apr 2027 *and* break the next workbook import, because the importers map
  sheet header straight to DB column with no whitelist (gotcha 7).
- **A pre-inception cell reads `n/a`, not an em-dash.** "No data" and "no track
  record" are different claims, and the em-dash sat next to a benchmark cell
  showing a real figure — inviting a comparison that cannot be made. The
  benchmark figure in such a column keeps its value but loses its colour, and a
  footnote names the inception date. `hasTrackRecordFor` returns **null** when
  there is no inception date, and null is not treated as pre-inception.
- One column list drives the header and both rows, so a relabel cannot
  mis-pair the portfolio figure with the benchmark's.

What remains is **`fetchPortfolioMovers(portfolioName, days)`** — not "how did
the portfolio do" but "which holdings led and lagged", which needs no NAV
reconstruction.

- **Ranked by CONTRIBUTION (`weight × ret`), not by return.** A 5% sleeve down
  3.51% costs the book 0.18pp while a 22% sleeve down 1.80% costs 0.40pp, so
  ranking by return alone files the real drag in the middle of the list.
- **Weights come from the UPLOADED allocation file when there is one**
  (`fetchLatestActualAllocation`, the file the review's position-sizing step
  saves), falling back to `positions.allocation_pct`. The basis is named on
  screen — a contribution measured against targets describes a book nobody
  necessarily holds.
- **It reconciles to 100%.** `cashWeight` and `unpriced[]` are returned
  separately and rendered beneath each window, because the two are different
  claims: cash genuinely contributed nothing, an unpriced holding contributed
  something nobody here can measure. Cash weight is **never redistributed** —
  renormalising would overstate every other holding.
- `SPLIT_MIN_HOLDINGS` (11) in `AttributionMovers`: below that it renders one
  ranked list instead of top-5/bottom-5. A split only informs when it *hides*
  something, and at exactly five holdings `slice(5)` returned an EMPTY "Bottom
  5" while the worst performers sat under a heading reading "Top 5" — the common
  case, since a Foundation book holds a handful of funds by construction.

## Excel Import

**Settings → Import / Export is the ONLY place the app accepts a spreadsheet.** **There are exactly two `ImportCard`s** (`pages/settings/ImportExportPage.tsx`), and Import sits **above** Exports because refreshing data is why the page gets opened: (1) **YCharts workbook** — one file, three datasets (benchmarks, funds, model portfolios); (2) **Portfolio allocations** — the long-format export, which takes a portfolio picker since it targets one entity. Six cards collapsed to two in Sep 2026: three read the identical file, and the two single-security-template cards were retired unused. **Do not add an upload button to an entity page** — the Securities, Portfolios, Benchmarks, and Security-detail pages had theirs removed deliberately (a stray "Upload manually" on the security header, filtered to `.xlsx`, was a persistent trap: it silently refused PDFs and looked like a document upload).

**The one deliberate exception is Allocation → History's "Import allocations"** (Nov 2026), added because an allocation file targets one portfolio and is the thing you are looking at when you want it. It is the opposite of the trap above: explicitly labelled a data import, not a document upload, and it **previews before writing**. It shares `lib/allocationImport.ts` with the Settings card, so neither surface can drift. Do not generalise this into a second upload button elsewhere without the same two properties.

The one exception is **file-storage uploads**, which are contextual by nature and stay where they are: `DocumentsFolderPanel` (security/portfolio Documents tabs), `PositionSizingCheck` (a step inside a review), and Settings → Documents. Those write to Storage, not to DB tables.

### One workbook, many sheets (Sep 2026)

The workbook consolidates what used to be three files — the benchmark sheets,
the fund Securities sheet, and the model-portfolio sheet — into one
**macro-enabled** workbook.

**The master lives on the VM at `C:\portfolio\Ycharts.xlsm` and nowhere else.**
A copy used to be committed at `YCharts/Ycharts.xlsm`; it is now **deleted and
gitignored**. It went stale within a day of every refresh while sitting at the
most obvious path a file picker lands on, and on 3 Nov 2026 an **Oct 5 copy was
imported by mistake** — it carried 43 securities instead of the current 46, and
rolled every fund's figures back a month under an `import_runs` stamp reading
"imported today". Provenance said fresh; the data was four weeks old. Pull the
file from the VM when you need it (`prlctl exec "Windows 11" cmd.exe /c 'copy
"C:\portfolio\Ycharts.xlsm" "\\Mac\Home\Downloads\..."'`) rather than
re-adding a copy here. **Row counts alone will not catch this** — compare a
known return value against the DB, which is how it was identified. Two shared helpers in `lib/excelImportShared.ts` make
that work, and every importer uses both:

- **`assertExcelFile(file)`** — the single extension gate, replacing four
  divergent checks. It accepts **`.xlsm`**, which is not optional: the unattended
  refresh macro can only produce a macro-enabled workbook. `EXCEL_ACCEPT` on the
  page carries the matching MIME type.
- **`pickSheetName(wb, names)`** — resolves a sheet **by name**, falling back to
  sheet 0. The fund and portfolio importers used to read `SheetNames[0]`, which
  in the consolidated workbook is `category_benchmarks`. Matching is trimmed and
  case-insensitive — the fund tab is literally named `"Securities "` with a
  trailing space. The fallback keeps older single-purpose workbooks working.
  **Never go back to `SheetNames[0]` in an importer.**

Sheets the four benchmark configs don't name are simply ignored, so extra tabs in
the workbook cost nothing.

### Import provenance — `import_runs`

YCharts figures carry **no as-of date of their own**, so a months-old number
renders identically to a fresh one. Every import logs a row: `source` (one of four,
CHECK-constrained — it was six before the Sep 2026 consolidation), `file_name`, `imported_at`, `rows_written`, `errors`, `warnings`. The
newest run per source is that dataset's stamp.

- Data layer `lib/importRuns.ts`. **`recordImportRuns` never throws** — the data is
  already committed by the time it runs, so a logging failure must not report a
  successful import as failed; it warns instead. It takes a **list**: the workbook
  card writes three rows (one per dataset) from a single upload, so per-dataset
  provenance survives the consolidation.
- `ImportCard` owns the write: its `run` callback returns `{ message, runs }`
  rather than a bare string, so logging lives in one place. A card declares the
  `sources` it loads and shows the **OLDEST** of their stamps — it is only as
  current as its stalest dataset. **The workbook card runs its three importers
  independently** (each in its own `try`), so a benchmark column mismatch cannot
  stop the funds and portfolios in the same file from loading; failures are
  reported in the banner, not thrown.
- **`warnings` is the import that SUCCEEDED and still found something wrong**
  (Nov 2026) — an unmapped vendor `category_name`, an abandoned benchmark row.
  **Separate from `errors`, because it must not touch `status`**: the row wrote
  perfectly well, so folding it in would mark a clean import `partial` and push
  a false failure into both the freshness stamp and the Actions hub.
  - **This was computed and thrown away for three months.** `unmappedCategories`
    has been returned on every fund import since #105 ("an unmapped vendor
    category is reported at the import, not months later"), and its only reader
    was `ImportExportPage`'s post-upload banner. **The unattended 05:30 refresh
    renders no banner**, and once the watchlist poller started adding fund
    tickers overnight that became the *only* path by which a new category
    arrives — so the one surface that reported was the one that had stopped
    running for new funds. Three runs on 9 Nov 2026 took the fund count
    88 → 92 → 97, introduced `Mid-Cap Value` and `Small Value`, and each
    recorded `errors: []` with nothing said anywhere. Gotcha 23 recurring was
    expected; nothing noticing was the defect.
  - **The probe is scoped to NON-PROXY rows, and that is the whole signal.**
    The `Securities` sheet carries the 33 ETF benchmark proxies, whose
    Morningstar categories are sector and maturity bands ("Technology",
    "Ultrashort Bond") the fourteen-class taxonomy deliberately has no sleeve
    for. Measured 10 Nov 2026: of 26 rows the map could not place, **21 were
    proxies** — unfiltered it reported 20 categories when 3 were real.
    `markBenchmarkProxies` now returns what it flagged so the probe can
    subtract it, and **returns `null` when it could not tell**, which
    suppresses the warning rather than widening it. A signal that cries wolf
    gets dismissed — what `never_run` and "AI research pending" already cost.
  - **`latestImportWarnings` reads only the NEWEST run of each source**, so a
    finding is derived rather than accumulated: there is no "resolved" flag to
    set, and the morning after someone edits `ASSET_CLASS_BY_CATEGORY` the next
    import simply stops repeating it and the action clears. The warnings of a
    `failed` run are ignored — nothing landed, so there is no data to make a
    claim about, and the failure is already its own action.
  - **Two surfaces, one helper**: an Actions-hub action per finding (source
    `data_refresh`, priority **high** — both producers mean a number already on
    screen is wrong with nothing else saying so) and a standing amber block on
    the Import / Export card, which survives a reload unlike the banner beside
    it. **`unmappedCategoryWarning` in `lib/assetClass.ts` is the single
    phrasing**, enforced by `sharedHelpers.test.ts`: the hub keys its action off
    the message, so two phrasings of one gap would raise two actions for it.
- **`components/DataAsOf.tsx`** renders the stamp on the fund detail page
  (`FundMonitoringPanel`) and Settings → Benchmarks, ambering
  past 45 days. It takes a **`sources` prop** and shows the OLDEST of them —
  pass the sources a surface actually reads, or an unrelated stale import will
  understate freshness (a fund page must not report the portfolio import's date).

`parseYchartsDynamic` lives in **`lib/portfolioAllocations.ts`** (moved out of `AllocationHistoryPanel` when the import consolidated) — it is a pure parser, so it belongs in lib alongside `importAllocationSnapshots`.



Upload handlers live in `lib/*ExcelUpload.ts`. **There is no column whitelist anywhere** — every importer maps sheet columns straight to DB columns, so a spreadsheet column with no matching DB column fails the write. `ALTER TABLE` before adding one to a sheet.

Identity fields (`security_name`, `long_description`, `morningstar_sector`, `morningstar_industry`) are **not writable from Excel at all** — no importer maps them. They are sourced from FMP `/profile` only (see "Stock detail page reads FMP on-demand").

**`securities2ExcelUpload.ts` was DELETED (Sep 2026)** with the two single-security cards — that per-ticker template is no longer used and nothing else consumed the module. Its removal orphaned `upsertRelatedSecurities`, so **`security_related_securities` now has no writer**: its 170 rows (all 34 parents are stocks) still render on the At-Risk page through `SubstitutionsList`, but can only be changed in the DB. `fetchRelatedSecurities` stays. Securities are created by ticker via `AddSecurityModal` → `createSecurityBySymbol` (+ FMP), or as a side effect of the workbook's Securities sheet.

**Benchmark uploads (`ychartBenchmarksUpload.ts`) have NO whitelist** — every Excel header is mapped directly to a DB column (with a few renames). So a column present in the spreadsheet but **missing from the DB table fails the entire upsert batch** (`column does not exist`). Before adding a column to the benchmark workbook, `ALTER TABLE` to add it. All four tables **upsert** (`upsertOn` is a required field on `TableConfig`), so rows absent from the new file are preserved rather than deleted — there is no full-replacement path.

**Fund bulk upload (`fundBulkUpload.ts`)** reads the workbook's **"Securities"** sheet (resolved by name via `pickSheetName`, falling back to sheet 0): row 1 = DB column names, rows 2+ = one fund each → `securities2`. It has no strip list, so every column on that sheet must exist on `securities2`. The old **"Related" sheet** and the `fund_alternatives` table it fed were **removed (Sep 2026)** along with `FundComparisonPanel` — the consolidated workbook no longer carries the sheet, and the loader had never written a row (it applied the Securities sheet's column offsets to a sheet whose used range starts one column earlier, so every child row was silently dropped). Do not reintroduce it without fixing that offset.

---

## Common Gotchas

1. **`security.id` vs `security.security_id`** — `id` is the integer for URL routing; `security_id` is the text ticker for all FK queries. Mixing these up causes silent query failures (wrong type match → zero rows returned, no error).

2. **`category_benchmarks.category_ticker`** — The column is `category_ticker`, not `ticker`. PostgREST returns a 400 if you select a non-existent column, causing `fetchBenchmarkOptions` to return `[]` and the picker to show "Failed to load benchmarks".

3. **Cache version busting** — If a query returns stale/wrong shape data after a schema change, bump the version in `queryKeys.ts` (e.g., `['benchmarks', 'v3']` → `['benchmarks', 'v4']`).

4. **Unique constraints vs indexes** — To drop a unique constraint in PostgreSQL, use `ALTER TABLE t DROP CONSTRAINT name`, not `DROP INDEX`. `DROP INDEX` will fail if a constraint depends on the index.

5. **`apply_migration` wraps in a transaction** — If any statement in a migration fails, the whole migration rolls back. Test each step independently when uncertain.

6. **Annual financials silently showing one quarter** — In `fetchAnnualFinancialsData`, never substitute `/earnings` (quarterly) `revenueActual`/`epsActual` into annual rows; date-matching pulls the Q4 release and shows it as the full year. Use the annual income statement's own `revenue` / `epsDiluted`.

7. **Adding a benchmark Excel column without the DB column** — `ychartBenchmarksUpload.ts` has no whitelist, so an unknown header fails the whole upsert batch. Add the column to the table first (see Excel Import). Going the other way — dropping a DB column the sheet still has — is the same trap; add it to that table's `skipCols` so the import survives the gap between the DB change and the workbook catching up.

8. **`upsert(..., { onConflict: 'col' })` needs a matching UNIQUE constraint** — PostgREST returns a 400 if `col` has no unique/exclusion constraint (a primary key or FK on it is not enough). This bit `review_schedules` (upsert on `security_id` with only a PK on `id`) and `category_benchmarks` (the composite `(category_ticker, category)` key). Add the constraint before relying on the conflict target.

9. **State-reset `useEffect` deps + `refetchOnWindowFocus`** — TanStack refetches on window focus by default. A `useEffect` that re-seeds local edit state from a query-backed prop must depend on a stable identity (e.g. `[security.id]`), NOT the editable fields — otherwise a background refetch (e.g. when the user tabs back) overwrites in-progress edits. This caused Alt rows to vanish in `AlternativesPanel`.

10. **WebSocket `subscribe` before `login` ack** — FMP returns `401 "Unauthorized"` on a subscribe that arrives before the `login:200` ack; you authenticate but get **zero** ticks, and the REST fallback hides it so it looks "just not live." Always gate subscriptions on the login ack (see Real-Time Quote Streaming).

11. **FMP one WebSocket per API key** — a second connection (another tab, another dev server on a different port, or the FMP site's own "Quote Feed Connector") kicks the first with `401 "Connected from another location"`. Don't auto-reconnect into a tug-of-war. When live data is missing, first check whether something else holds the single slot.

12. **WebSocket tick `t` is epoch nanoseconds**, not ms — divide by 1e6. And `getSnapshot` for `useSyncExternalStore` must return a **referentially stable** value when unchanged (the store keeps the same `LiveQuote` object until the next tick), or React re-renders in a loop.

13. **`/biggest-gainers` & `/biggest-losers` are a GLOBAL feed** — micro-cap/leveraged-ETF dominated, and they ignore any index/symbol filter. They cannot scope to S&P/Nasdaq/Dow constituents. The Index Movers board builds its lists from constituents + quotes instead. (Same trap as the `*-latest` news endpoints.)

14. **PostgREST embed needs a real FK** — `portfolio_allocations` has **no FK** to `securities2` (it stages import symbols), so `select('..., securities2(...)')` 400s with "could not find a relationship." Resolve names/fields with a separate `.in('security_id', syms)` lookup, not an embed. (Only embed across tables with a declared FK.)

15. **`uploadFile` returns the REAL storage path — never derive it** — the Express upload endpoint date-prefixes and sanitises the filename (`AMD/2026-08-18_AMD-review-2026-08-18.pdf`), so a client-side `` `${folder}/${file.name}` `` points at a file that does not exist and every signed URL for it fails. `uploadFile` returns the stored path; persist that. (This silently broke fund review-evidence links until it was fixed.)

16. **FMP class tickers use hyphens** — `BRK.B` (our `security_id` / YCharts symbol) is `BRK-B` on FMP. `fmpSymbol()` (`.`→`-`) now lives in **`lib/fmpClient.ts`** and is applied in **every** symbol-keyed FMP fetch (on-demand reads included), keeping the original `security_id` for the DB. Earlier only `portfolioPerformance` and the (since-deleted) `fmpSync` mapped it, so class-ticker stocks silently returned blank profile/quote/scorecard/analyst/news/financials/transcripts — fixed by routing all fetches through `fmpSymbol`. Any new FMP-by-symbol call must use it.

17. **`price-target-consensus` is a TRAILING-6-MONTH aggregate, not every standing target** — FMP returns `targetConsensus`/`High`/`Low`/`Median` with no horizon field, **no analyst count** (`fetchAnalystData` tries `numberOfAnalysts`/`numAnalysts`/`numberOfPriceTargets` and gets null for all three), and no documentation of the window. Reproducing it from `/price-target-news` across seven tickers shows the rule: **each covering firm's LATEST target, keeping only firms that published within ~183 days** (183–195 days fits all seven; 180 and 210 do not). It is not a fixed firm count — 10 firms for HWM, 20 for AAPL, 8 for GLW. The individual targets ARE 12-month ones by sell-side convention, but the aggregation is not. Because the filter drops stale targets, and on a re-rated name the stale ones are the LOW ones, it reads systematically high: HWM $331.10 off 10 firms vs TipRanks' $295.78 off 23 standing targets, on the same page. `AnalystSummaryCards` labels it; don't strip the qualifier.

18. **Don't rebuild a performance engine to match YCharts.** `lib/portfolioPerformance.ts` used to recompute NAV from FMP dividend-adjusted prices and was **deleted in Sep 2026** — it contributed exactly 0.00% on every rebalance date, zeroing ~12 trading days a year against a benchmark row that had no such loss. Model performance now comes from YCharts' own `portfolio.*_total_return`. The reason not to recompute is not that it was hard to match (it agreed to ~0.2% except on All-Time, where since-inception is measured from the inception *close* while YCharts credits the launch day): it is that **recomputing a number we do not own means owning its bugs**. The file's own docstring carries this history.

19. **FMP's annual `operatingIncome` disagrees with the filing on ~1 name in 3** — a charge is relocated out of the operating line while `incomeBeforeTax` ties, so no internal check catches it, and `ratios.operatingProfitMargin` is derived from the same number. BSX FY2020 reads +$601M against a filed **-$80M loss**. Never conclude the feed is sound because two adjacent years agree with each other. **But do NOT "fix" the Scorecard with `lib/secOperatingIncome.ts`:** that card compares TTM against two prior fiscal years, TTM can never be SEC-sourced because it is not a filed period, and mixing the two made every comparison on the card apples-to-oranges. The Scorecard is deliberately single-source FMP; the SEC path exists, works, and has **no caller** (see FMP Financial Metrics — this gotcha used to instruct the opposite of what that section says).

20. **TipRanks `stockReturn` is a GAP TO SPOT, not a return** — it is exactly `price / target - 1` (verified on 272 of 272 rows across three symbols), so it has no time dimension and no outcome; the same analyst's $325 and $705 targets on one name read -16.6% and -61.6% against one spot price. Never label it a return and never colour it green/red: positive just means the target sits below the price. The per-row `beatTarget` flag is likewise unreliable (on WMT it marks ~half the rows as beats against a symbol record of 6 in 259) and is deliberately not rendered -- use `beatRate()` on the summary aggregate, which gates on `MIN_RATINGS_FOR_ACCURACY`.

21. **`totalDebt` folds operating leases in as `capitalLeaseObligations`** (13+ names; TJX 4.7x overstated at $13,489M vs a filed $2,869M). On HWM and RDDT it is wrong **in kind** -- neither has any finance leases, and RDDT has no borrowings at all, so any feed-derived leverage ratio there is meaningless rather than merely wrong. It also breaks multi-year EV comparisons across the ASC 842 boundary (TJX net debt/EBITDA flips -0.11x to +1.55x). **`propertyPlantEquipmentNet`** folds in the ROU asset, with the mirror error visible in `otherNonCurrentAssets`.

22. **FMP's transcript-date list stamps the wrong calendar YEAR on some Q4/Q1 rows** — the fiscal labels are right and the transcript itself is right, only the `date` is a year early. It dates Alphabet's **FY2024 Q4** call `2024-02-04` and its **FY2025 Q1** call `2024-04-24`, though those transcripts open with "Fourth Quarter 2024" and "First Quarter 2025"; `search-transcripts`/`earning_call_transcript` by `(year, quarter)` return the correct call regardless. **2 of 42 held symbols** carry it (also APP FY2023 Q4) — a fiscal-year-boundary bug, so expect it at Q4/Q1. Anything ordering calls must sort by **`(fiscalYear, quarter)`**, not by `date`: the Commentary timeline sorted by date and GOOGL's table jumped Q2 2025 → Q3 2024, dropping two real quarters off the bottom of its eight-row window. Do not "fix" a bad date by adding a year — that is inventing a figure; flag it (`CommentaryRow.dateSuspect`) and show it unasserted.

23. **A `category_name` missing from `ASSET_CLASS_BY_CATEGORY` becomes silent unclassified weight — and TWO SPELLINGS of one category can be live at once.** **It happened again in Nov 2026, and the audit could not see it:** `Mid-Cap Value` and `Small Value` were unmapped while their blend and growth siblings were mapped, so FSMVX, NAMAX, QVAL and VSMIX resolved to `null`. All four are WATCHED, not held — and `scripts/audit/asset-class-coverage.ts` walks HELD securities, so nothing would have reported it until the first one was bought and its weight dropped out of a rollup. The `assetClass.test.ts` pinned-category list is now built from held **∪ watched**, non-proxy securities for exactly that reason: an idea becomes a holding, and placing it the day before the purchase rather than the day after is the whole margin that assertion has. (Proxies stay excluded — they carry sector and maturity categories the fourteen-class taxonomy has no sleeve for.) Separately, `Diversified Emerging Mkts` is now carried by **no row at all** — VEMAX moved to the spelled-out form — and the key is kept anyway, with a test asserting it still resolves. The lookup normalizes case and whitespace but is otherwise exact — through **`normalizeCategory`**, which is exported and is the ONLY way a vendor category becomes a comparison key. There were two (Nov 2026): `prospects.categoryKey` collapsed internal whitespace and the resolver's own normalizer merely trimmed, so `Large  Blend` would have matched a watchlist alternative while resolving to `null` in every rollup — this sentence was the documentation of a property the code did not have. It is pinned by a test asserting the two agree, not by a source scan: `.trim().toLowerCase()` appears a dozen times in this tree for unrelated reasons, so a scan would fire on legitimate code and be deleted. VEMAX carries Morningstar's abbreviated `Diversified Emerging Mkts`; EICOX / EMMF / EYLD carry the spelled-out `Diversified Emerging Markets`. Only the abbreviation was mapped, so three of the four emerging-market holdings resolved to `null` across **six portfolios** (the three Hybrid and three ETF books). The three Foundation books hold VEMAX and looked correct, which is exactly why it survived — the sleeve appeared to work. On Hybrid Balanced the Equity legend read 66.00% target against 62.00% holdings, with `4.00% unclassified — EICOX` beneath the table. **Before adding a category, read the DB for every spelling in use** (`select distinct category_name from securities2`) rather than trusting the vendor's documented form, and never delete an existing key to "tidy up" a duplicate — both may be carrying real holdings.

24. **A `timestamptz` column holding a calendar DATE renders a day early.** `at_risk.removal_date` and its kin are stored at UTC midnight, so `new Date(v).toLocaleDateString()` in a negative-UTC-offset zone shows the previous day. COIN's At-Risk card read "expires February 10, 2027" against a row holding the 11th — contradicting its own brief on the same screen. Use **`fmtUtcLongDate(value)`** from `lib/formatters` for any column that is a date rather than an instant; reserve local-time formatting for true timestamps (`reviewed_at`, `triggered_at`).

25. **Saving a model through the Edit Model Portfolio page RECOMPUTES its derived bands — it does not echo them.** In `absolute` category mode the form writes `equity`/`fixed_income` limits as **`max(0, target − category_drift_percentage)` / `min(99, target + category_drift_percentage)`** — the clamps are part of the rule, not decoration, and an audit that omits them raises a false positive on any model whose target is within the drift of the ends (Foundation Growth stores equity 98 / 93–99, which IS 98 ± 5 clamped). In `manual` category mode the form does not recompute them at all, which is why the `category_drift_percentage = 20` sitting on Core Growth, Equity Income, EI&CG, Aggressive and Fixed Income Total Return is inert rather than dangerous. In `relative` asset-class mode it writes `roundHalf(target × (1 ∓ asset_class_drift_percentage/100))`. Where the stored band disagrees with the stored drift, **the first save silently rewrites the band** and every save after that is idempotent, so the damage is invisible unless you diff. **No model is in that state today** (verified 3 Nov 2026: every `absolute`-mode row has bands equal to its own clamped formula). Two were. Foundation Balanced with Growth (id 90) was corrected by a save that set its drift to 5; **Growth (id 4)** stored drift 20 against ±5 bands since Apr 2026 and was corrected directly, setting `category_drift_percentage = 5` and leaving its bands untouched — the value its three siblings (ids 1–3) already carried, and the one its own bands already encoded. Editing id 4 would otherwise have widened equity 76–86 to 76–99 and fixed income 13–23 to 0–38, and `equity_lower_limit` is rendered on the Model Portfolios settings list, so it is a user-visible governed number. The recompute behaviour itself has not changed, so **re-check with the clamped formula above after any drift edit** rather than assuming it stays clean. Snapshot the row before saving (`md5((to_jsonb(m.*) - 'updated_at')::text)`) if you only meant to change one field — there is **no audit trigger on `model_portfolio_data`**, so nothing else records what a save overwrote.
