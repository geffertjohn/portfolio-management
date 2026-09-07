# Scheduled YCharts refresh

Unattended daily refresh of the YCharts workbook on the Mac mini, feeding the
same importers the app's Import page uses.

```
launchd (weekdays 05:30)
  └─ refresh.sh
       prlctl start "Windows 11"          resume the suspended VM
       prlctl exec  → Excel opens C:\portfolio\Ycharts.xlsm
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

**No Windows Task Scheduler.** Driving Excel through `prlctl exec` keeps
scheduling in one place instead of two that can drift apart.

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

1. `git clone` the repo to `~/portfolio-management`, then `npm install`.
2. Copy `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into `~/portfolio-management/.env`.
   The anon key is enough — RLS is open on these tables, so this is no more
   privileged than the browser bundle. No service-role key.
3. `sh scripts/refresh/build.sh` to produce `import-workbook.cjs`.
4. `mkdir -p ~/portfolio-refresh/{inbox,processed,failed,logs}`
5. In Parallels: share `~/portfolio-refresh` into Windows so the inbox is
   reachable as `Z:\portfolio-refresh\inbox\`.
6. In Windows: put the workbook at `C:\portfolio\Ycharts.xlsm`, add
   `C:\portfolio` as a Trusted Location, and paste `Ycharts.bas` into
   **ThisWorkbook** (not a Module — `Workbook_Open` only fires from there).
7. Windows power + recovery: never sleep, `powercfg /h off`, auto-login via
   `netplwiz`, and set Windows Update active hours outside 05:00–07:00.
8. **Set the Windows VM to the same timezone as the mini.** The macro stamps
   local time and the importer parses local time; a mismatch shifts every
   freshness check by the offset. The importer refuses a stamp more than 2h in
   the future to make that mistake loud rather than silent.
9. Install the agent:
   ```
   cp scripts/refresh/com.john.ycharts-refresh.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.john.ycharts-refresh.plist
   ```

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
