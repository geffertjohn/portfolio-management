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
> **Next step when resuming:** paste `Ycharts.bas` into ThisWorkbook (manual —
> programmatic VBA import needs "Trust access to the VBA project object model"),
> then do one timed run to replace the guessed `MIN_WAIT_SECS` (240s) and the
> 25-minute outer timeout with real numbers.
>
> The app-side half — `import_runs`, the `data_refresh` action, the headless
> importer — **is finished, tested and live.** Only the VM half is unbuilt.

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

**The VM is a worker, not a service.** Windows wants ~4GB of an 8GB machine, so
it is resumed, used, and suspended. Suspending (not shutting down) preserves the
logged-in Windows session, so auto-login inside Windows is only the recovery path
for a cold start — a host power cut or a Parallels update.

**The Mac asks rather than tells — but it CAN see.** `prlctl exec` does work on
this licence, and the shutdown path depends on it: on 2026-11-03 it read the
guest task list, found `EXCEL.EXE` and terminated PID 9768, all from
`refresh.sh`. An older note here claimed the command was Pro/Business only;
that is wrong and was corrected on 2026-11-04.

What `prlctl exec` cannot do is start an **interactive** Excel inside the
logged-in session — a process it starts has no desktop to draw on, which is the
actual reason for the trigger file. So the Mac drops one in the shared folder
and `watch-trigger.cmd`, run by Task Scheduler every 2 minutes, picks it up. This beats scheduling the refresh
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

The tell is `Trusted Locations` listing `C:\WINDOWS\system32\config\systemprofile\...`
paths — that is SYSTEM's Excel, not yours.

## Why macros actually run

`VBAWarnings = 1` ("enable all macros") is set in the user's hive. That, not any
trusted location, is what lets `Workbook_Open` fire unattended. It is broader
than this job needs — a dedicated single-purpose VM makes it defensible, but it
is worth knowing it is the load-bearing setting. `C:\portfolio\` is also
registered as a Trusted Location for the user, so tightening `VBAWarnings` to 2
("disable with notification") later will not break the scheduled run.

## Install on the Mac Studio

### On the Studio (macOS)

1. **Install Node** — if the host has git but no node or npm.
   `brew install node`, or the installer from nodejs.org.
2. `git clone` the repo to `~/portfolio-management`, then `npm install`.
3. Copy `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into
   `~/portfolio-management/.env`. The anon key is enough — RLS is open on these
   tables, so this is no more privileged than the browser bundle. **No
   service-role key.**
4. `sh scripts/refresh/build.sh` to produce `import-workbook.cjs`.
5. `mkdir -p ~/portfolio-refresh/{inbox,processed,failed,logs}`
   No Parallels config needed: "Shared Profile" already maps the Mac home to
   `Z:`, so this becomes `Z:\portfolio-refresh\inbox\` automatically.
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

   > **The watcher only polls 05:25–06:25.** That bound is deliberate — an
   > indefinite 2-minute repetition fired 720 times a day — but it means
   > **`refresh.sh` run by hand at any other time always ends in
   > `FATAL: no output after 1500s`.** The Mac drops the trigger and nothing is
   > awake to read it. To run off-schedule, start `refresh.sh`, wait for it to
   > log "dropping trigger", then kick the watcher yourself:
   >
   > ```
   > prlctl exec "Windows 11" schtasks.exe /run /tn "\YCharts Refresh Watcher"
   > ```
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

Rebuild `import-workbook.cjs` after changing any importer — it is a bundle, not
a live reference:

```
sh scripts/refresh/build.sh
```

## Not automated

**Portfolio allocations.** `importAllocationSnapshots` runs delete-then-insert,
making it the one destructive importer, and `portfolio_allocations` changes
rarely. It stays a deliberate manual upload on the Import page.
