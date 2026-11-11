# Scheduled YCharts refresh

> **STATUS: LIVE — runs weekdays at 05:30 on the Mac Studio.**
>
> This said "PAUSED — not wired up; nothing runs on a schedule yet" until Nov
> 2026, by which point it had been running daily for weeks. It failed 15 of 20
> runs in Oct 2026; the first clean unattended run was **3 Nov 2026** and it has
> run green since. Check `~/portfolio-refresh/logs/<date>.log` for the last run.
>
> - **The host is the Mac Studio, not the mini.** The mini was evaluated and
>   dropped: 8GB with a Windows VM was tight, but the deciding factor was that
>   the Studio already has Parallels, the repo, Node, the `.env` and the
>   scheduled-task setup, so a second machine meant duplicating and then
>   syncing all of it. The Studio sleeps, which `sudo pmset repeat
>   wakeorpoweron MTWRF 05:25:00` solves. The install steps below have been
>   corrected to say Studio; any remaining `johnauxcomp` path is a leftover.
> - **`watch-trigger.cmd` and the trigger-file handshake ARE still needed** — I
>   was wrong to say otherwise. The Studio's Parallels licence does allow
>   `prlctl exec`, but that command runs as **NT AUTHORITY\SYSTEM in session 0**,
>   a profile with no YCharts add-in and no `ycharts.key`. Excel launched that
>   way cannot resolve a single `YCP()`, so every run would abort on the
>   error-ratio guard. Excel must be started by the **interactive logged-on
>   user**, which is exactly what the trigger file plus a Task Scheduler task
>   achieves. Keep both.
>
> **Already done on the Studio and its VM:** `C:\portfolio\Ycharts.xlsm` in
> place **with the macro installed**, `C:\portfolio\` added as an Excel Trusted
> Location, guest timezone corrected from SA Western (no DST) to Eastern,
> `~/portfolio-refresh/{inbox,processed,failed,logs}` created, and the
> guest→Mac UNC write path verified.
>
> **A full manual run has succeeded end to end:** Excel started 13:30:46, stamped
> and saved 13:35:15 (**4m 29s**), and the headless importer read it and wrote 102
> benchmark rows, 42 funds and 18 portfolios. `MIN_WAIT_SECS` at 240s is
> therefore well calibrated — the run exited 29s past the floor, which is the
> three stability polls, meaning the data had already settled inside 4 minutes.
>
> **Two hazards found while installing the macro, both worth knowing:**
> the driver had to move OFF the `\\Mac\Home\...` share to `C:\portfolio`
> because Excel would not honour a network Trusted Location (macros stayed
> blocked); and **any Excel that opens this workbook without the YCharts add-in
> recalculates every `YCP()` into `#NAME?`**, so saving from such a session
> destroys the cached values. Automation that touches the workbook must open it
> with `Application.Calculation` already manual — which needs a throwaway
> workbook open first, since the property cannot be set with none.
>
> **Both halves are built and running.** This block used to end "Only the VM
> half is unbuilt", which contradicted its own first line by several weeks.
> The app-side half — `import_runs`, the `data_refresh` action in
> `lib/actions.ts`, the headless importer — and the VM half are all live.
>
> **Deploying the macro is no longer a paste.** That instruction said
> programmatic VBA import needs "Trust access to the VBA project object model",
> which is true and is now simply done: `scripts/refresh/deploy-macro.sh`
> turns the setting on for the edit and back off after. See *Deploying a macro
> change* below.
>
> `MIN_WAIT_SECS` (240s) has real numbers behind it now rather than a guess:
> the 6 Nov 2026 run produced its output **400s** after the trigger, so the
> floor is doing its job without being the binding constraint. The 25-minute
> outer timeout has never been reached by a run that was working.

Unattended daily refresh of the YCharts workbook on the Mac Studio, feeding the
same importers the app's Import page uses.

```
launchd (weekdays 05:30)
  └─ refresh.sh
       prlctl start "Windows 11"          resume the suspended VM
       drop Z:\portfolio-refresh\inbox\REFRESH-NOW
       └─ watch-trigger.cmd (guest, every 2 min)
            drop inbox\UNATTENDED, then open C:\portfolio\Ycharts.xlsm
            Workbook_Open (Ycharts.bas):
              claim inbox\UNATTENDED, or exit and stay open for the human
              AutoUpdate streams values in — no Refresh click needed
              wait until nothing says "Loading" AND values stop changing
              abort if >50% of populated cells are errors
              stamp Control!A1 with the finish time
              write atomically to Z:\portfolio-refresh\inbox\
       wait for the file (20 min cap)
       prlctl suspend                      give the RAM back
       node import-workbook.cjs            freshness check → 3 importers → import_runs
       mv → processed/ or failed/
```

## Why it is shaped this way

**Opening the workbook *is* the refresh.** The add-in's AutoUpdate is enabled, so
values stream in from YCharts on open without anyone pressing Refresh. The macro
does not trigger a fetch; it waits for the one already in flight. Because
AutoUpdate streams asynchronously rather than announcing completion, "finished"
is detected two ways at once: no `Loading` placeholders left, **and** the numeric
values unchanged across three consecutive polls. The first signal alone would
save mid-stream on a sheet that had not started yet.

**Flatten must never be called.** It strips every YCP/YCS formula, which would
permanently destroy the template — a workbook that can never refresh again.
Nothing in the macro touches it.

**The VM is a worker, not a service.** It is resumed, used, and suspended.
Suspending (not shutting down) preserves the logged-in Windows session, so
auto-login inside Windows is only the recovery path for a cold start — a host
power cut or a Parallels update.

The memory argument that used to be given here — "Windows wants ~4GB of an 8GB
machine" — **described the Mac mini that was evaluated and dropped.** The Studio
has **64GB** and the VM is allocated **16GB** (`sysctl hw.memsize`, `prlctl list
-i`, 6 Nov 2026), so giving the RAM back is no longer the reason. The reasons
that survive are that a suspended VM is not drawing power or running Windows
Update against the workbook, and that a resume is the only path that leaves the
logged-in session — and therefore the YCharts add-in — intact.

**The Mac asks rather than tells — but it CAN see.** `prlctl exec` does work on
this licence, and the shutdown path depends on it: on 2026-11-03 it read the
guest task list, found `EXCEL.EXE` and terminated PID 9768, all from
`refresh.sh`. An older note here claimed the command was Pro/Business only;
that is wrong and was corrected on 2026-11-04.

What `prlctl exec` cannot do is start an **interactive** Excel inside the
logged-in session — a process it starts has no desktop to draw on, which is the
actual reason for the trigger file. So the Mac drops one in the shared folder
and `watch-trigger.cmd`, run by Task Scheduler every 2 minutes **for one hour
from 05:25 on weekdays**, picks it up. The script itself does not poll — it
tests for the trigger once and exits; the repetition is the task's
(`PT2M`/`PT1H`, `StopAtDurationEnd`). This beats scheduling the refresh
on Windows' own clock, because the Mac controls when the VM is actually awake —
and unlike a logon-triggered task, a polled one still fires after a resume.

**The workbook has to stay openable by hand.** `Workbook_Open` fires identically
whether the scheduler opened the file or a person double-clicked it, and the
unattended path ends in `Application.Quit` — so before the gate existed, opening
the workbook by hand meant a four-minute wait and then Excel closing itself,
with no way in short of holding Shift to suppress the event. `watch-trigger.cmd`
now drops an `UNATTENDED` flag before launching Excel and `ClaimUnattendedRun`
consumes it; no flag means a human, and the macro returns immediately. It fails
closed — a flag that stops being written costs a refresh and gets logged as "no
output", which is the right way round.

**A minimum wait before "settled".** `Workbook_Open` can fire *before* the add-in
starts fetching, and in that lull the cells hold the previous run's values, which
are perfectly stable. Without a floor the macro would see three quiet polls,
declare victory after 30 seconds, and save yesterday's numbers stamped with
today's time — passing every downstream freshness check. A first open takes a few
minutes in practice, so stability is not even considered for four.

**Completion is the file appearing, not Excel exiting.** `prlctl exec` does not
reliably block, and a hung Excel would otherwise wedge the run.

**Three independent guards against importing garbage**, because YCharts values
carry no as-of date and a bad refresh looks exactly like a good one:

| Guard | Where | Catches |
|---|---|---|
| Error-ratio abort | macro | the add-in losing its saved app key — every cell returns `ERR: NO DATA` (text, not an Excel error) |
| Freshness stamp | importer | yesterday's file being re-imported because the VM step never ran |
| Row floors | importer | a partial fetch that parses cleanly but halves the data |

A failure is recorded in `import_runs` with `status = 'failed'`, which raises a
**high-priority action in the app** (`data_refresh` source in `lib/actions.ts`)
on the Home Action Center and `/actions`. Silence is not the failure mode.

## Layout

```
Studio (macOS)                        Studio (Windows VM)
~/portfolio-management/    ← repo     C:\portfolio\Ycharts.xlsm   ← driver workbook
~/portfolio-refresh/
  inbox/       ← VM writes here       Z:\portfolio-refresh\inbox  ← same folder, shared
  processed/   ← kept 30 days
  failed/      ← kept until you look
  logs/
```

The driver workbook lives on `C:\`, never on the `Z:` share: Office treats
mapped network drives as untrusted (needing an extra Trusted Locations setting
that can silently reset), and every recalc would otherwise cross SMB.

**There is no copy of the workbook in the repo, and there must not be one.**
`YCharts/Ycharts.xlsm` was the "template of record" until Nov 2026, when it was
deleted and gitignored — it went stale within a day of every refresh while
sitting at the most obvious path a file picker lands on, and on 3 Nov 2026 an
**Oct 5 copy was imported by mistake**: 43 securities instead of 46, every
fund's figures rolled back a month, under an `import_runs` stamp reading
"imported today". Provenance said fresh; the data was four weeks old.

Pull the file from the VM when you need it, rather than re-adding a copy here:

```
prlctl exec "Windows 11" cmd.exe /c 'copy "C:\portfolio\Ycharts.xlsm" "\\Mac\Home\Downloads\Ycharts.xlsm"'
```

Row counts alone will not catch a stale import — compare a known return value
against the DB, which is how that one was found.

## Watchlist funds reach the sheet by themselves

Adding a fund to the app's Watchlist used to populate nothing. The fund columns
come from this workbook, so the ticker had to be typed into the `Securities`
sheet by hand and the next refresh waited for, with nothing anywhere to remind
anyone — an idea could sit for weeks carrying no category, no cohort and no
scorecard, which is every measure a fund is actually judged by.

```
refresh.sh
  └─ watchlist-tickers.cjs → inbox/WATCHLIST.txt   (held ∪ watched, YCharts symbols)
       └─ Workbook_Open → SyncWatchlistTickers     (reconciles Securities!B)
            └─ the row's 83 YCI() formulas resolve in the same fetch
                 └─ import-workbook.cjs → securities2   (unchanged)
```

**The sheet already had the machinery, and it GROWS when it runs out.** A row
carrying the full set of `=YCP($B<row>, <col>$2)` formulas with an empty ticker
populates all 82 columns the moment a symbol is written into column B, and
`fundBulkUpload` picks it up with no change at all — it skips all-empty rows
and keys on `security_id`. Nothing authors a formula; one string is written.

The sheet shipped with 53 such spare rows, which was simply where someone
stopped filling formulas down — **not a decision about how many funds may be
watched**, and treating it as one would have put an arbitrary ceiling on an
idea list. `EnsureFundRow` therefore copies the last data row down when every
wired row is taken, so there is **no cap on the watchlist**. `MAX_FUND_ROW`
(1,000) is a guard against a defect growing the sheet without end, not a
product limit; hitting it is reported, never silent.

A grown row costs nothing until it is used: a wired row with no ticker returns
empty rather than an error, so it neither feeds the error-ratio guard nor asks
YCharts for anything. Only a row carrying a ticker costs a fetch.

**The macro writes the ticker, not the Mac.** `prlctl exec` runs as SYSTEM,
which has no YCharts add-in, so a save from that side turns every `YCI()` into
`#NAME?` and silently destroys the cached values the importers read.
`Workbook_Open` runs as the logged-on user, where the add-in resolves.

**The roster is held ∪ watched, and that is the whole of the removal logic.**
`SyncWatchlistTickers` clears only rows it added itself — remembered in
`Control!B`, which the importers never read — so the hand-entered holdings are
never at risk. But a fund that is watched, then bought, then dropped from the
watchlist *is* one of its own rows, and releasing it would stop a **held** fund
refreshing with nothing to show why. Holdings stay in the roster for as long as
they are owned, so a row is released only when the fund is neither held nor
watched. Two sold funds (`M:APDFX`, `M:VTABX`) sit outside the roster entirely
because a person entered them; they keep refreshing until a person removes them.

**Stocks are excluded.** The `Securities` sheet is funds-only and its 83 columns
are fund fields, so a stock ticker there would produce a row of errors rather
than a security. Asset type comes from `securities2` first and FMP `/profile`
only for what it cannot answer; **no FMP profile means mutual fund**, not
unknown, because FMP covers US stocks comprehensively while missing eleven of
the book's twenty-seven mutual funds (`VMSAX`, `BIMIX`, `EICOX` and the rest are
all institutional share classes).

**Warnings go to `watchlist-note.txt`, never `refresh-error.txt`.** The latter is
the macro's abort signal and `refresh.sh` fails the whole run the moment it
appears — it polls for it while waiting for the output — so a note written at
the start of a run would read as an abort and kill a refresh that was working.
Running out of pre-wired rows is the case that writes one; extend the `YCI()`
formulas below row 101 to add slots.

### …and a new one no longer waits until morning

The 05:30 run closes the gap within a day, which is right for a fund added at
17:00 and wrong for one added at 09:00 that the advisor wants to read about
this morning. **`poll-watchlist.sh` runs every 15 minutes** (LaunchAgent
`com.john.ycharts-poller.plist`) and starts an ordinary refresh when a watched
fund is waiting for one.

```
launchd (every 900s)
  └─ poll-watchlist.sh          hours + floor guards, logs
       └─ pending-funds.cjs     the decision; starts nothing
            └─ refresh.sh       the ordinary pipeline, own lock
```

**Why a poller and not a push.** Adding a fund is a browser write to Supabase,
and there is no path from the browser to this machine's shell — the same reason
the committee runs in Claude Code rather than from a button. So the Mac asks,
on a cycle. Almost every cycle is one Supabase read and an exit.

**THE RUNAWAY THIS IS SHAPED AROUND.** The obvious rule — "a watched fund has
no category, so refresh" — never stops being true for a ticker YCharts does not
recognise, so the poller would wake the VM for a six-minute Excel session every
cycle for ever, with nothing on screen saying why. The condition is therefore
**`prospects.date_added` newer than the newest `import_runs` row**: a fund
nobody has tried yet. A refresh that runs and fails to resolve the ticker
advances that stamp past `date_added`, and the fund stops asking *by
construction* — one extra refresh per batch of additions, no attempt counter
and no state file to corrupt. The daily run keeps trying in case YCharts adds
coverage later, and `pending-funds.cjs` names those tickers when it declines.

**Stocks are excluded, and that is the same hazard wearing a different hat.**
The `Securities` sheet is funds-only, so a watched stock never gets a
`securities2` row and would read as pending on every poll for ever. The
classifier is imported from `watchlist-tickers.cjs` rather than restated —
including its rule that an empty FMP profile means mutual fund — because two
classifiers with opposite defaults is exactly how RSIYX was once filed on the
watchlist as a stock.

**Three guards, each for a different failure:**

| Guard | Where | Stops |
|---|---|---|
| 07:00–19:00, any day | `poll-watchlist.sh` | waking the VM overnight for an idea nobody is reading |
| 45 minutes between runs | `.poll-trigger` stamp | a FAILED refresh, which writes no `import_runs` row, retrying every cycle |
| `date_added > last import` | `pending-funds.cjs` | the runaway above |

Weekends are included deliberately: a fund added on Saturday is one the advisor
wants on Saturday, and YCharts serves Friday's close happily.

The floor stamp is written **before** the run, not after — if `refresh.sh`
hangs, a stamp on the way out would never be reached and the next cycle would
start a second one. (`refresh.sh` would refuse it anyway, with its own lock;
this means the poller does not have to rely on that.)

**Install it alongside the refresh agent:**

```
cp scripts/refresh/com.john.ycharts-poller.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.john.ycharts-poller.plist
```

Its log is `~/portfolio-refresh/logs/poller.log`, and it is **silent on the
quiet path** — a line every 15 minutes saying nothing happened is a log nobody
reads.

### A hand-run import tells the poller it already tried

**`node import-workbook.cjs <file>` advances the poller's stamp without writing
a roster.** The two halves of a refresh are "put the tickers on the sheet" and
"read the sheet into Supabase", and running the second alone consumes the
evidence the first ever needed to happen.

The poller's rule is `prospects.date_added` newer than the newest
`import_runs` row — a fund nobody has tried. That is sound for `refresh.sh`,
which writes the roster *before* it imports, so a ticker that reached the sheet
and failed to resolve correctly stops asking. A hand import skips the roster
leg entirely and still moves the stamp, so a fund that was never put on the
sheet is recorded as attempted.

Seen on 2026-11-10. Four funds were watched at 11:32–11:43, after that
morning's roster had gone out, so the workbook had never seen them. A manual
import at 12:00:36 moved the stamp past all four, and the poller then declined
to do anything about it:

```
$ node scripts/refresh/pending-funds.cjs
nothing waiting (4 still unresolved after a refresh: XAGG, DFLEX, NWQIX, MGV
                 — the daily run keeps trying)
```

Every word of that is wrong about those four: no refresh had tried them.

**It is worse than a missed poll.** That manual import landed 29 seconds into a
poller run which had already written a roster naming all four and was waiting
on Excel — so it did not merely skip a future attempt, it undercut one in
flight.

**After a hand import, run `refresh.sh`** if anything has been watched since the
last roster went out. Nothing is lost if you do not: the 05:30 run writes a
fresh roster and picks them up. But the poller will stay quiet in the meantime,
and its silence will look like a decision.

### A SUSPENDED VM reads exactly like a hung Excel

`refresh.sh` detects completion by the output file appearing, which is the right
signal — a wedged Excel would otherwise hold the run open for ever. The failure
it cannot distinguish is the guest going away underneath it.

Suspend the VM mid-run and the script waits the full `WAIT_SECS` (1500s) for a
file that can never be written, then reports:

```
no output after 1500s
```

That is the message for a hung Excel, and the two have different fixes. On
2026-11-10 the poller started a run at 12:00:07 and kicked the watcher at
12:00:09; the VM was suspended seconds later while someone closed the workbook.
The run sat there with nothing wrong on screen.

**Telling them apart takes one command.** A live `refresh.sh` with a suspended
VM is the suspended case, and `prlctl exec` answers `PRL_ERR_IO_STOPPED` rather
than returning a task list:

```
prlctl list -a                      # suspended, while a refresh.sh pid is alive
ps -p "$(cat ~/portfolio-refresh/.pid)"
```

**The recovery is to stop the run and start a clean one.** `trap cleanup EXIT`
removes the pid file on a TERM, so the lock clears properly and nothing has to
be unpicked by hand; `refresh.sh` resumes a suspended VM itself, so there is no
need to start it first.

```
kill -TERM "$(cat ~/portfolio-refresh/.pid)"
bash scripts/refresh/refresh.sh
```

Do **not** suspend or shut down the VM while a refresh is in flight — and note
that **closing the Parallels window is enough to do it**, because this VM is
configured to suspend on window close:

```
$ prlctl list -i "Windows 11" | grep -iE 'on window close|autostop'
  Autostop: suspend
  On window close: suspend
```

If you want the workbook open for editing, let the run finish first;
`refresh.sh` suspends the VM itself on the way out, so there is nothing to tidy
up afterwards.

## The Holdings sheet: when the vendor returns a LIST

`YCI(ticker,"holdings_weight")` returns the fund's **top 25 holdings** — 25
rows of holding and weight. The `Securities` sheet is one row **per fund**.
Those two shapes do not reconcile on one grid, and the attempt is instructive:
a `{=YCI($B3,DS$2)}` entered in column DS of `Securities` filled DS3:DS27 with
the row-3 fund's holdings, which are the rows belonging to the next 24 funds —
and because a legacy CSE array is a locked block, those funds could not carry
a formula of their own either. One fund's data occupying another's rows is not
a formatting problem to work around; it is the sheet saying the metric does
not belong on it.

So holdings get their own sheet, in **blocks of 26 rows**:

```
 row 1    A ='Securities '!B3   B holdings_weight   C1:D25   {=YCI(A1,B1)}
 row 26   (blank separator)
 row 27   A ='Securities '!B4   B holdings_weight   C27:D51  {=YCI(A27,B27)}
```

- **Column A is a LIVE reference to `Securities!B`**, not a copied value, so
  the sheet follows that column by itself and a ticker swapped there needs
  nothing done here.
- **Column B is the marker.** A block is imported only when it reads
  `holdings_weight`, so another List metric can be parked on the sheet without
  a second convention to exclude it.
- **Column C carries the symbol OR the name**, whichever identifies the
  holding: `ASML` and `RHHVF:DL` for equities, a CUSIP like `039956AA5` for a
  bond that has one, and a description — `Intertape Polymer Group Inc
  28-JUN-2028 Term Loan B` — for one that does not. The importer splits them
  on length; see `splitSymbolAndName`.

**THE SHEET IS STATIC AND NO MACRO TOUCHES IT.** The first version had
`EnsureHoldingsSheet` in `Ycharts.bas` derive the whole sheet from
`Securities!B` on every run, and it **cost two refreshes**: unproven code sat
on the critical path of the daily job, and when it stalled the funds,
benchmarks and portfolios went down with it even though none of them had
anything to do with holdings. Three reasons the static sheet is right, in the
order they matter:

1. **A person opening the workbook can SEE it.** A sheet built only during an
   unattended run does not exist until one succeeds, so there is no way to
   tell broken from not-yet-run.
2. **It is the convention `Securities` already follows** — pre-wired, extended
   when it runs out — rather than a second way of doing the same thing.
3. **No new code on the refresh path.** The macro is back to not knowing this
   sheet exists.

**`extend-holdings.ps1` adds blocks for funds that do not have one.**

```bash
scripts/refresh/extend-holdings.ps1            # dry run
scripts/refresh/extend-holdings.ps1 -Apply
```

It **copies the last block's array, it never writes one** — the same
copy-never-author rule as `add-sheet-columns.ps1`, for the same reason: this
runs as SYSTEM with no YCharts add-in, so a formula naming `_xll.YCI` would
store an unknown function and read `#NAME?`. Copying down by a whole number of
blocks adjusts `=YCI(A27,B27)` to `=YCI(A53,B53)` with no text to parse.
Columns A and B are written outright, since a sheet reference and a text label
need no add-in. The Securities row each block points at is read off that
block's own formula rather than inferred from its position — position is what
drifts. **Run it after adding funds**, and seed the very first block by hand
in the VM's interactive session, where the add-in exists.

**A Securities row with no ticker gets NO block.** A wired-but-empty row on
the `Securities` sheet returns empty rather than an error, which is what makes
the spare rows there free; `YCI` on an empty symbol is not known to behave the
same way, and an errored or perpetually-`Loading` cell feeds both the macro's
error-ratio guard and its settle detection.

**`holdings_weight` over `holdings`.** The reference workbook documents neither
shape — `holdings_weight` carries no Type and no Description at all — so both
were run by hand. `holdings_weight` returns 25x2, the holding and its decimal
weight (SPY: `AAPL 0.078573` … summing to 0.5169, so SPY's top 25 is 51.7% of
it). `holdings` returns a third column with the name, but the name is not lost
under `holdings_weight`: the vendor already puts a description in the symbol
column for anything without a ticker, which is exactly where it is needed.

### Adding a metric column

```bash
scripts/refresh/add-sheet-columns.ps1 -CodesFile …\fund-composition-codes.txt            # dry run
scripts/refresh/add-sheet-columns.ps1 -CodesFile …\fund-composition-codes.txt -Apply

# An Info-tab code needs -Info, which copies a YCI column instead of a YCP one.
scripts/refresh/add-sheet-columns.ps1 -CodesFile …\fund-info-codes.txt -Info -Apply
```

**`-Info` picks the model, and getting it wrong is silent.** The sheet carries
both functions — C..N are `=YCI($B3,C$2)` and everything from O rightward is
`=YCP($B3,…$2)` — and they are not interchangeable: a code from the reference
workbook's `| Info` tab returns an error under `YCP` and vice versa. The script
copies an existing cell rather than authoring one, so the model has to match
the tab the code came from. Without `-Info` an Info code is pasted as a YCP
formula and every row of it comes back `ERR`, which looks exactly like a metric
YCharts does not publish.

**It now refuses a READ-ONLY open.** With `DisplayAlerts` off, `Save()` on a
read-only workbook writes nothing and raises nothing — the script reports SAVED
and the file on disk is untouched. The usual cause is someone having the
workbook open in the VM's interactive session, which is invisible from a
`prlctl exec` shell.

**`ALTER TABLE securities2` FIRST, every time.** The importer has no whitelist —
it maps row 2 straight to DB columns — so a header with no matching column
fails the **entire** upsert batch, not just that column. Then regenerate
`client/src/types/database.types.ts` and `supabase/schema.sql`.

**Row 2 does two jobs at once.** The cell is the argument `YCP()` reads *and*
the column name `fundBulkUpload` maps to `securities2`, so it must be the exact
YCharts code. Where that is not a legal Postgres identifier the DB column
differs and `COLUMN_REMAP` bridges them — `1_year_fund_level_flows_to_aum` →
`one_year_fund_level_flows_to_aum`, the same mechanism as
`inception_date_generic` → `inception_date`.

**The script never writes a formula string.** It runs as SYSTEM, which has no
YCharts add-in, so assigning `"=YCP(...)"` would be assigning an unknown
function. It copies an existing `YCP()` cell instead: the stored form is
`=_xll.YCP($B3,C$2)`, where `$B` is column-absolute and the metric argument is
column-**relative**, so a sideways copy repoints it at the new column's own
header with nothing to parse. It picks a model column by looking for `YCP(` —
an Info-tab metric would need `YCI()` and a different model.

**Check the code exists for BOTH fund types.** One sheet serves mutual funds and
ETFs, so a code present for only one errors on every row of the other.
`emerging_market_exposure` is the live example: ETF-only, and the shared code is
`emerging_market_exposure_generic`. The catalogue is the YCharts add-in
reference workbook (`Mutual Fund | Metrics` and `ETF & CEF | Metrics` tabs).

**`ERR: NO DATA` will rise, and that is correct.** A bond fund returns nothing
for sector columns and an equity fund nothing for duration, so the error ratio
climbs as the sheet widens. The macro aborts above 50%; adding the 33
composition columns took it from roughly 8.5% toward 16%, which is the number to
watch before the next widening.

### A missing FORMULA reads exactly like a missing FIGURE

**Seven columns on the `Securities` sheet stopped at row 45** while the rest ran
to 101, and an eighth had an interior gap in rows 50–56. Found 6 Nov 2026 by
asking why VUG's peer-group scorecard showed no Information Ratio 3Y.

The failure is silent by construction. An absent formula leaves an **empty**
cell, not an errored one — so it does not count toward the macro's error-ratio
guard, the importer reads NULL exactly as it would for a figure the vendor does
not publish, and the app renders a clean `—`. Nothing anywhere distinguishes
"YCharts has no value for this" from "nobody wrote a formula here".

What it cost: `information_ratio_rank` and `information_ratio_peer_group_rank`
feed **Information Ratio 3Y, which carries 20% of the fund scorecard on both
cohorts** — the joint-largest weight. Four funds were affected (VVIAX, VIGAX and
VMSAX, added to the sheet on 4 Nov, and VUG, the first watchlist fund to land in
a spare row). The scorecard sums an unscored metric as zero and still prints
`/100`, so VUG's 74.3 was 74.3 of **80 available**. A committee memo read the
same nulls on VMSAX and reported them as a vendor coverage gap on the
Multisector Bond category; they were nothing of the kind.

```bash
scripts/refresh/fill-sheet-formulas.ps1            # dry run (via prlctl exec)
scripts/refresh/fill-sheet-formulas.ps1 -Apply     # back up, fill, save
```

It derives the row band from the used range rather than assuming 101 — the
macro grows this sheet, so a hard-coded last row would silently stop filling at
the old boundary and re-create the very defect it repairs, one row lower each
time. It fills by **copy/paste of a populated cell**, not by writing a formula
string:
Excel adjusts the relative reference (`$B45` → `$B46`) on paste, so each cell
gets exactly what a fill-down would have produced and the script never parses
`YCP()` syntax. It looks for **any** cell in the band with no formula rather than
for where a fill-down stopped — the interior gap above is invisible to a
"last populated row" test. Idempotent: run it after adding rows to the sheet.

**Close any interactive Excel first.** `New-Object -ComObject Excel.Application`
attaches to a RUNNING instance rather than starting its own, so with the
workbook already open the script drives that session instead — which is how the
first `-Apply` run on 6 Nov ended up partially applied, with a stranded
`EXCEL.EXE` and a `~$Ycharts.xlsm` lock left behind. The lock is the expensive
part: `watch-trigger.cmd` clears it before each launch, but a lock plus a live
Excel at 05:30 is how one hang costs two runs.

### Deploying a macro change

`Ycharts.bas` is versioned here as text because the workbook is binary. Until
Nov 2026 the only way to deploy it was to paste it into ThisWorkbook by hand.

```bash
scripts/refresh/deploy-macro.sh            # dry run: probe and report
scripts/refresh/deploy-macro.sh --apply    # back up, replace, save
```

**Always dry-run first.** The dry run opens the workbook exactly as the real one
does and reports how many `#NAME?` cells it sees — that number is the entire
safety argument, because it says whether this account can open the file without
destroying it. A healthy report is `0 #NAME? of ~17,800 populated cells`. The
`--apply` path backs the workbook up to `C:\portfolio\Ycharts-pre-vbaedit-<stamp>.xlsm`
first and reads the module back before saving.

**Run a full refresh by hand afterwards.** A VBA *compile* error stops
`Workbook_Open` firing at all, so the flag is never claimed, no output appears,
and the run dies on the 25-minute timeout — tomorrow as well as today. The only
proof the module still runs is a run.

## Registry gotcha: prlctl exec writes to the WRONG hive

`prlctl exec` runs as **NT AUTHORITY\SYSTEM**, so `HKCU:` inside it resolves to
SYSTEM's hive (`HKEY_USERS\S-1-5-18`), **not** the interactive user's. Excel
settings written that way are invisible to the user who actually runs Excel, and
they fail silently — the listing looks right, and nothing works.

Reach the real user explicitly:

```powershell
$sid = (New-Object System.Security.Principal.NTAccount('johngeffert')).Translate(
        [System.Security.Principal.SecurityIdentifier]).Value
$sec = "Registry::HKEY_USERS\$sid\Software\Microsoft\Office\16.0\Excel\Security"
```

**The "tell" this section used to give does not work.** It said `Trusted
Locations` listing `C:\WINDOWS\system32\config\systemprofile\...` paths meant
you were looking at SYSTEM's Excel. Reading the interactive user's own hive on
6 Nov 2026 returns three of those paths among its seven, because they are
Office's defaults — so that test gives a false positive every time. Check the
HIVE you are reading instead: translate the account to a SID and address
`HKEY_USERS\<sid>` explicitly, as above.

## Why macros actually run

`VBAWarnings = 1` ("enable all macros") is set in the user's hive (verified
6 Nov 2026, along with `C:\portfolio\` appearing in that hive's Trusted
Locations). That, not any
trusted location, is what lets `Workbook_Open` fire unattended. It is broader
than this job needs — a dedicated single-purpose VM makes it defensible, but it
is worth knowing it is the load-bearing setting. `C:\portfolio\` is also
registered as a Trusted Location for the user, so tightening `VBAWarnings` to 2
("disable with notification") later will not break the scheduled run.

## Install on the Mac Studio

### On the Studio (macOS)

1. **Install Node** — if the host has git but no node or npm.
   `brew install node`, or the installer from nodejs.org.
2. `git clone` the repo, then `npm install`. **The path matters:**
   `refresh.sh` defaults to `REPO="$HOME/Developer/Portfolio Management"`, and
   that is where the live checkout is. This step used to say
   `~/portfolio-management`, which does not exist on the Studio — following it
   would leave every run reporting a missing `.env`. Override `REPO` if you
   clone elsewhere.
3. Copy `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into
   `~/portfolio-management/.env`. The anon key is enough — RLS is open on these
   tables, so this is no more privileged than the browser bundle. **No
   service-role key.**
4. `sh scripts/refresh/build.sh` to produce `import-workbook.cjs`.
5. `mkdir -p ~/portfolio-refresh/{inbox,processed,failed,logs}`
   No Parallels config needed: "Shared Profile" already exposes the Mac home to
   the guest. **Address it by UNC, never by drive letter** — the guest reaches
   it as `\\Mac\Home\portfolio-refresh\inbox\`, which is what the macro and
   `watch-trigger.cmd` both use. Parallels' letters differ per machine (the
   mini mapped `Z:` to the Mac home; the Studio maps `Y:` to Home and `Z:` to
   AllFiles) and mapped drives are per-session, so they are invisible to
   anything outside the interactive logon.
6. Install the agent:
   ```
   cp scripts/refresh/com.john.ycharts-refresh.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.john.ycharts-refresh.plist
   ```

### In the Windows VM

7. **Move the workbook to `C:\portfolio\Ycharts.xlsm`.** It currently lives at
   `~/Desktop/Ycharts.xlsm` on the Mac, reached over `Z:` — so every recalc
   crosses SMB, Trusted Locations needs the extra *"Allow Trusted Locations on my
   network"* box, and the file sits in a folder that gets tidied. Add
   `C:\portfolio` as a Trusted Location once moved.
8. Paste `Ycharts.bas` into **ThisWorkbook** — not a Module. `Workbook_Open`
   only fires from there.
9. Copy `watch-trigger.cmd` to `C:\portfolio\` and register the Task Scheduler
   task **"YCharts Refresh Watcher"** from XML — only XML expresses
   `StartWhenAvailable`. Weekly Mon–Fri, `StartBoundary` **05:25**, repeating
   every 2 minutes for a **1-hour duration**; action
   `C:\portfolio\watch-trigger.cmd`; principal `InteractiveToken` and **"Run
   only when user is logged on"** so Excel gets a desktop to open into.

   > **The watcher only polls 05:25–06:25**, and that bound is deliberate — an
   > indefinite 2-minute repetition fired 720 times a day. **`refresh.sh` kicks
   > the task itself** (9 Nov 2026), so a run at any other hour no longer
   > depends on the window: it drops the trigger and then sends
   >
   > ```
   > prlctl exec "Windows 11" schtasks.exe /run /tn "\YCharts Refresh Watcher"
   > ```
   >
   > Until then an off-schedule run always died on `FATAL: no output after
   > 1500s` — the Mac dropped the trigger and nothing was awake to read it —
   > and the fix was to tell a human to send that line from a second terminal.
   >
   > **The kick does not launch Excel, and that is why it is allowed to work.**
   > `prlctl exec` runs as SYSTEM in session 0, which has no YCharts add-in;
   > `schtasks /run` merely asks the scheduler, and the task's own principal is
   > `InteractiveToken`, so the work still happens in the console session.
   > It is safe to send during the polling window: the task's
   > `MultipleInstancesPolicy` is `IgnoreNew`, so a kick that arrives while an
   > instance is running is dropped rather than racing it. A failed kick is a
   > WARNING — the window is still a real path for the 05:30 run.
10. Power and recovery: never sleep, `powercfg /h off`, auto-login via
    `netplwiz`, and Windows Update active hours outside 05:00–07:00.
11. **Same timezone as the Studio.** The macro stamps local time and the importer
    parses local time; a mismatch shifts every freshness check by the offset.
    The importer refuses a stamp more than 2h in the future so the mistake is
    loud rather than silent. (They already match.)

Windows activation is **not** required — the watermark is cosmetic and nothing
here depends on personalization or on an activated licence.

## Running it by hand

```
bash scripts/refresh/refresh.sh                      # the whole pipeline
node scripts/refresh/import-workbook.cjs <file>      # just the import half
```

> **The import half moves the poller's stamp.** It does not write a ticker
> roster, so any fund watched since the last roster went out is recorded as
> tried without ever having reached the sheet — see *A hand-run import tells
> the poller it already tried*. Run the whole pipeline afterwards if anything
> is waiting.

**`refresh.sh` is self-contained** (9 Nov 2026). It kicks the guest watcher
itself after dropping the trigger, so a run at any hour works unattended and
nothing here needs a second terminal. This section used to say the opposite,
and it was true when written.

`watch-trigger.cmd` **does not poll** — despite what its own comment and the
diagram above suggest. It tests for the trigger once (`if not exist "%TRIGGER%"
goto :eof`) and exits. The two minutes belong to the **task**, whose trigger
reads `PT2M` every `PT1H` with `StopAtDurationEnd`, starting 05:25, weekdays
(read from `schtasks /query /tn "YCharts Refresh Watcher" /xml`, 6 Nov 2026).

**So a trigger dropped outside 05:25–06:25 on a weekday is never noticed by the
POLLING.** That is why `refresh.sh` now kicks the task itself; before it did,
an off-schedule run waited its full 25 minutes and reported `no output after
1500s`, which reads exactly like a hung Excel and is not. If you ever need to
send the kick by hand:

```
prlctl exec "Windows 11" schtasks.exe /run /tn "\YCharts Refresh Watcher"
```

Excel should appear in **Session 1 (Console)** within ~20s — `tasklist /FI
"IMAGENAME eq EXCEL.EXE"`. Session 0 means it was launched by SYSTEM, which has
no add-in, and the run will abort on the error-ratio guard.

Rebuild `import-workbook.cjs` after changing any importer — it is a bundle, not
a live reference:

```
sh scripts/refresh/build.sh
```

## Not automated

**Portfolio allocations.** `importAllocationSnapshots` runs delete-then-insert
(verified 6 Nov 2026), making it the one destructive importer, and
`portfolio_allocations` changes rarely. It stays a deliberate manual upload —
now from **two** surfaces, not one: Settings → Import / Export, and the
portfolio's own Allocation → History tab, which previews before it writes. Both
share `lib/allocationImport.ts`, so they cannot drift.
