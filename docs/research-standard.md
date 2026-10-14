# Research Standard

How this firm researches an investment, and what the AI Investment Committee is
expected to produce. Adapted from the CFA Institute's guidance for writing
equity research reports.

**Readership.** Write every section as though three people will read it: the
advisor, a regulator examining the firm's process, and a client. That rules out
undefined jargon, unsourced assertions, and anything that only makes sense to
someone who already knows the position.

---

## The two documents, and why the split matters

The CFA outline describes a single point-in-time research report. This firm
splits that content across two records with different lifespans, because mixing
them is what makes a thesis go stale:

| | **Security thesis** (`security_theses`) | **Portfolio buy record** (`security_additions`) |
|---|---|---|
| Question | Why is this company worth owning? | Should this portfolio buy it, at this price, at this size? |
| Scope | One per **security**, shared by every portfolio holding it | One per **(portfolio, security)** |
| Lifespan | **Durable** — revised only when the view changes | **Point-in-time** — a record of one decision |
| Mutability | Append-only; published versions are immutable | Edited until completed |
| Carries a price view? | **No** | Yes |

A security held in ten portfolios has **one** thesis and up to ten buy records.

### Which CFA section goes where

| CFA section | Home | Why |
|---|---|---|
| Business Description | Thesis — `business_description` | What a company does changes slowly |
| Industry Overview & Competitive Positioning | Thesis — `competitive_position` | Industry structure changes slowly |
| Investment Risks | Thesis — `bear_case` | The risks to a durable thesis are durable |
| Financial Analysis | Thesis — `bull_case` metrics | Kept durable by the baseline/trend/break-test shape |
| **Valuation** | **Buy record** | A fair value is a view at a price. It expires. |
| **Investment Summary / recommendation** | **Buy record** | A buy/sell call and a re-rating catalyst expire |

The thesis carries **no rating and no fair value**. That is deliberate: the
document answers "is this worth owning", not "is it cheap today".

---

## The thesis — what each section must contain

### Business Description
What the company does and how it earns money: segments, and the key drivers of
revenue and of expense. A reader who has never heard of the company should
finish this section able to follow the rest. **No dated figures.**

### Competitive Position
Industry structure and the company's place in it. Name the peer set explicitly —
later comparisons depend on it. State the source of competitive advantage (the
moat) and, critically, **what would erode it**. Porter's five forces is a useful
checklist; capacity, pricing, distribution and share stability are usually the
live questions. **No dated figures.**

### Reasons to own it (the thesis proper)
Three to five named reasons, each with a title and two to four sentences of
rationale. A reason is a *structural* statement that should still read correctly
in three years.

**The test: if a sentence contains a number or a period reference, it is in the
wrong layer.** "Switching costs make replacement demand recur" is a reason.
"TTM revenue of $466.8B carried a 33.2% operating margin" is evidence.

### Supporting metrics
Two to three per reason. Each one exists so a future reviewer can re-measure and
tell whether the reason is deteriorating, so each carries four fields:

- **metric** — the exact series, named so it can be looked up again
- **baseline** — the current reading *with the period it is as of*
- **trend** — direction and rate, with the history behind it
- **breaks if** — the specific reading that would say this reason is failing

**`breaks if` is the field that does the work.** It must be checkable against
data or a named disclosure — "Services revenue grows less than 8% y/y in two
consecutive fiscal years" — never a mood like "if growth slows". For risks with
no clean series (litigation, regulatory rulings), name the docket or disclosure
to watch and the specific event that would trigger it.

Prefer **industry-specific** series where they are more meaningful than generic
financials: proven reserves per share for oil, revenue per subscriber for
wireless, revenue per available room for hotels.

### Bear case
Risks and headwinds, in the same quantified shape, with the break field reading
"worsens if". Research independently — do not invert the bull case. Cover
valuation against the company's own history, the durability of recent growth,
margin and input costs, regulatory and legal exposure, geographic concentration,
technology position, and leadership transition.

**Earnings quality is part of this.** Reported results can flatter: non-recurring
items, off-balance-sheet financing, revenue and reserve recognition, depreciation
policy. Read the footnotes. Good break tests here are a restatement, an auditor
change, a material-weakness disclosure, or a widening gap between GAAP net income
and free cash flow.

**Read the Critical Audit Matter first.** Before hunting for an earnings-quality
problem, read what the auditor already said was hard. A CAM is the independent
auditor's statement of which estimate carried the most risk of material
misstatement, and it is published in the audit report at the front of the 10-K.
In practice it has repeatedly named the exact figure the bear case turns on --
Allstate's reserve (Deloitte), AbbVie's rebate accrual and Welltower's
immediately-vesting equity grant (both E&Y), each the company's *sole* CAM. The
auditor's own described procedures are also the best available break test: when
Deloitte says it performed a retrospective review "to identify potential bias",
that is the test to re-run. Name the CAM in the relevant point's `context`, and
treat a CAM appearing, disappearing or changing subject between years as a
finding in its own right.

---

## Standing rules

- **Ground every figure with its period.** "$109.2B (FY2025)", not "$109.2B".
- **Say when a number is unavailable** rather than estimating one. Naming the gap
  is a finding; inventing a series is a defect.
- **A withdrawn disclosure is itself a reading.** When a company stops publishing
  a series, check it rather than assume it: Home Depot dropped sales per retail
  square foot after three years of decline, IBM dropped its generative-AI book of
  business, Palantir dropped customer-count growth after it decelerated. The same
  applies to a metric quietly *redefined* (P&G has changed its free-cash-flow
  productivity denominator almost every year) or to a test quietly *softened*
  (P&G's share scorecard went from "grew share" to "held or grew share", which
  understates the decline it reports). Where the key series lives only in a call
  or a slide and never in a filing, write "management stops disclosing it" into
  the break test. Report the check when it comes back clean too -- Boston
  Scientific merged two segments but kept every business unit disaggregated, and
  that is worth stating.
- **Flag low-precision metrics** as such — a figure disclosed only as a rounded
  floor is testable for direction, not for rate.
- **Do not extrapolate a cycle.** Projecting forward from the top or the bottom
  of a business cycle is the common error, especially for cyclicals.
- **Weight analyst opinion by track record, not head count**, and suppress any
  accuracy figure with fewer than ten resolved targets.
- **Verify an agency record in that agency's own data, and prefer its bulk file.**
  A docket number, clearance, investigation or enforcement action cited from
  reporting is not sourced. Two failures made this a rule. A competitor's product
  was recorded as having no decision on file when the FDA's own De Novo database
  showed it granted three months earlier (DEN250068, decided 21 Jul 2026). And a
  bear case named three NHTSA investigations when the agency's flat investigation
  file showed **eight open** on the same manufacturer, including one opened four
  days before the review. The lesson is that a bulk agency file catches
  *omissions*, not just errors: query the whole docket for the issuer rather than
  looking up only the items you already knew about. Where a regulator publishes a
  bulk extract, that is the series to name in the metric — NHTSA's is
  `static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip`, whose action number is column 0.
  Two practical traps: some agency hosts (accessdata.fda.gov, static.nhtsa.gov)
  return 404/503 to a non-browser user agent and serve the document with one; and
  openFDA lags its own source by about a week, so a very recent decision may be
  absent from the API while present in the primary database.
- **Never build a break test on a sell-side rating or price-target change.** The
  provider's per-row `stockReturn` is exactly `price / target − 1` — a **gap to
  spot**, not a realised return (verified on 272 of 272 rows across three symbols)
  — and the symbol-level beats/misses series has no documented resolution basis.
  So report analyst activity as **counts**, never as an accuracy or beat rate, and
  never make a downgrade count the trigger. On one name the street went 0-for-149
  while uniformly rating it a buy; on another there were zero upgrades and zero
  downgrades across a year in which the shares fell by a third. A rating change is
  not evidence about the business.
- **Mandate fit is portfolio-level, not a per-security gate.** For an income
  strategy the requirement is that the *portfolio's* yield exceeds its benchmark,
  carried by the mix. **Never disqualify a name on its own dividend yield alone.**
  `model_portfolio_data.investment_philosophy` is the rubric: a candidate need not
  meet every criterion but must justify inclusion by the combination it
  contributes. (A July 2026 run vetoed a name on a 0.18% yield against the
  portfolio's own blend, when the stated bar was income above the S&P 500 at the
  portfolio level.) This belongs to the **buy record**, never to the thesis — the
  thesis has no portfolio in it.
- **Take financial-statement figures from the filing, not from the data feed.**
  Four vendor defects are confirmed and recur:
  - **Annual `operatingIncome`** relocates charges out of the operating line.
    **13 of 40 checkable names** disagree with SEC's own `us-gaap:OperatingIncomeLoss`
    on at least one fiscal year — Boston Scientific FY2020 reported as **+$601M
    against a filed −$80M operating loss**, a sign flip; e.l.f. FY2026 as $131.3M
    against a filed $73.6M, which reads as a −17% trend where the filing says
    −53%. `incomeBeforeTax` ties in every case, so nothing internal catches it, and
    the vendor's `operatingProfitMargin` is derived from the same number. **Do not
    assume adjacent years tying means the series is sound** — on Boston Scientific
    and Howmet, five or six consecutive years are wrong.
  - **`totalDebt`** folds operating-lease liabilities in and mislabels them
    `capitalLeaseObligations` (one name 4.7x overstated; on two names it is wrong
    *in kind*, the companies having no finance leases and, in one case, no
    borrowings at all). It also breaks multi-year EV comparisons across the ASC 842
    boundary. **`propertyPlantEquipmentNet`** folds in the ROU asset, with the
    mirror error visible in `otherNonCurrentAssets`.
  - **Multi-year series are spliced across a separation or divestiture.** Read off
    the feed, one name's revenue looked like a −34.6% decline when continuing
    operations grew **+75.5%**. Rebuild the base from the filing's own recast
    figures and say which basis you used.
  - **Currency can be mislabelled.** One analyst row carried a target of 3,260
    tagged `USD` that was plainly the New Taiwan dollar target for the local listing.
- **Recommend-only.** No agent executes a trade or writes to `positions`.
- The committee drafts; **the advisor adopts.** A published thesis is authored by
  the advisor, with the reports it drew on recorded in `source_report_ids`.
