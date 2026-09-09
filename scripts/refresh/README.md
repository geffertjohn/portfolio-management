# Scheduled YCharts refresh

> **STATUS: PAUSED — Sep 2026. Not wired up; nothing runs on a schedule yet.**
>
> Paused while YCharts/Excel issues are sorted out. Two things below are already
> out of date and must be fixed before following them:
>
> - **The host is the Mac Studio, not the mini.** The mini was evaluated and
>   dropped: 8GB with a Windows VM was tight, but the deciding factor was that
>   the Studio already has Parallels, the repo, Node, the `.env` and the
>   scheduled-task setup, so a second machine meant duplicating and then
>   syncing all of it. The Studio sleeps, which `sudo pmset repeat
>   wakeorpoweron MTWRF 05:25:00` solves. The install steps below still say
>   "mini" and reference `johnauxcomp` paths.
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

Unattended daily refresh of the YCharts workbook on the Mac mini, feeding the
same importers the app's Import page uses.

```
launchd (weekdays 05:30)
  └─ refresh.sh
       prlctl start "Windows 11"          resume the suspended VM
       drop Z:\portfolio-refresh\inbox\REFRESH-NOW
       └─ watch-trigger.cmd (guest, every 2 min) opens C:\portfolio\Ycharts.xlsm
            Workbook_Open (Ycharts.bas):
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

**The Mac asks; it cannot tell.** `prlctl exec` — the obvious way to launch Excel
in the guest — is **Parallels Pro/Business only**, and this is a standard licence:

```
$ prlctl exec "Windows 11" cmd.exe /c ...
The command is available only in Parallels Desktop for Mac Pro or Business Edition.
```

So the Mac drops a trigger file in the shared folder and `watch-trigger.cmd`, run
by Task Scheduler every 2 minutes, picks it up. This beats scheduling the refresh
on Windows' own clock, because the Mac controls when the VM is actually awake —
and unlike a logon-triggered task, a polled one still fires after a resume.

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
mini (macOS)                          mini (Windows VM)
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

The repo's `YCharts/Ycharts.xlsm` is the **template of record** — commit it when
the structure changes, never from the job.

## Install on the mini

### On the mini (macOS)

1. **Install Node** — the mini has git but no node or npm.
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
9. Copy `watch-trigger.cmd` to `C:\portfolio\` and create a Task Scheduler task:
   trigger *at logon*, **repeat every 2 minutes indefinitely**, action
   `C:\portfolio\watch-trigger.cmd`, and **"Run only when user is logged on"**
   so Excel gets a desktop to open into.
10. Power and recovery: never sleep, `powercfg /h off`, auto-login via
    `netplwiz`, and Windows Update active hours outside 05:00–07:00.
11. **Same timezone as the mini.** The macro stamps local time and the importer
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
