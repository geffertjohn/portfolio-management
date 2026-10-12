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

---

## Standing rules

- **Ground every figure with its period.** "$109.2B (FY2025)", not "$109.2B".
- **Say when a number is unavailable** rather than estimating one. Naming the gap
  is a finding; inventing a series is a defect.
- **Flag low-precision metrics** as such — a figure disclosed only as a rounded
  floor is testable for direction, not for rate.
- **Do not extrapolate a cycle.** Projecting forward from the top or the bottom
  of a business cycle is the common error, especially for cyclicals.
- **Weight analyst opinion by track record, not head count**, and suppress any
  accuracy figure with fewer than ten resolved targets.
- **Recommend-only.** No agent executes a trade or writes to `positions`.
- The committee drafts; **the advisor adopts.** A published thesis is authored by
  the advisor, with the reports it drew on recorded in `source_report_ids`.
