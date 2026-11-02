#!/bin/bash
# refresh.sh — the scheduled YCharts refresh, driven from macOS on the mini.
#
#   launchd → this script → Parallels VM (Excel + YCharts add-in) → Supabase
#
# The VM is a short-lived worker: started, used, suspended. It is never left
# running, because Windows wants ~4GB of an 8GB machine.
#
# Excel is launched by dropping a TRIGGER FILE the guest is watching for, not by
# `prlctl exec` — that command is Parallels Pro/Business only. See
# watch-trigger.cmd. The Mac still owns the schedule; it just asks rather than
# tells.
#
# Completion is detected by the OUTPUT FILE APPEARING. Nothing on this side can
# see the Excel process at all, so the file is the only completion signal — and
# it is the right one, since a hung Excel would otherwise wedge the run.
set -uo pipefail

# NOT ~/Desktop, and not ~/Documents or ~/Downloads either.
#
# Those are TCC-protected on modern macOS. A LaunchAgent has no grant for them,
# so bash could not even READ this script there: launchd fired correctly at
# 05:30, got "Operation not permitted" on the open(), and exited 126 before a
# single line ran -- which is why nothing appeared in this log. Interactive runs
# were unaffected, because Terminal already holds Desktop access, so the job
# looked healthy every time it was tested by hand. Keep the repo outside those
# three folders.
REPO="${REPO:-$HOME/Developer/Portfolio Management}"
VM="${VM_NAME:-Windows 11}"
BASE="${REFRESH_HOME:-$HOME/portfolio-refresh}"

INBOX="$BASE/inbox"
PROCESSED="$BASE/processed"
FAILED="$BASE/failed"
LOGDIR="$BASE/logs"
LOCK="$BASE/.lock"

OUTPUT="$INBOX/Ycharts-refreshed.xlsx"
VM_ERROR="$INBOX/refresh-error.txt"          # written by the macro's abort path
TRIGGER="$INBOX/REFRESH-NOW"                 # watch-trigger.cmd polls for this
UNATTENDED="$INBOX/UNATTENDED"               # guest-side gate; see ClaimUnattendedRun

# The guest reaches $INBOX as \\Mac\Home\portfolio-refresh\inbox — a UNC path,
# because Parallels' drive letters differ per machine (the Studio maps Y: to Home,
# Z: to AllFiles) and mapped letters are invisible outside the interactive logon.
# Parallels' "Shared Profile" provides the share; no extra folder to configure.

# The guest polls every 2 min, and a first open takes a few minutes while the
# add-in fetches every data point, so allow generously.
WAIT_SECS="${WAIT_SECS:-1500}"               # 25 min
POLL_SECS=10
KEEP_DAYS=30

mkdir -p "$INBOX" "$PROCESSED" "$FAILED" "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m-%d).log"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

# ── One run at a time ───────────────────────────────────────────────────────
# A run that overruns its schedule must not have the next one start a second VM.
exec 9>"$LOCK"
if ! flock -n 9 2>/dev/null; then
  # macOS has no flock(1); fall back to a pid file.
  if [ -f "$BASE/.pid" ] && kill -0 "$(cat "$BASE/.pid")" 2>/dev/null; then
    log "SKIP: a refresh is already running (pid $(cat "$BASE/.pid"))"
    exit 0
  fi
fi
echo $$ > "$BASE/.pid"
cleanup() { rm -f "$BASE/.pid"; }
trap cleanup EXIT

log "=== refresh start ==="

# ── Credentials ─────────────────────────────────────────────────────────────
if [ ! -f "$REPO/.env" ]; then
  log "FATAL: no $REPO/.env — need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  exit 1
fi
set -a; . "$REPO/.env"; set +a

# ── Start the VM from whatever state it is in ───────────────────────────────
# Suspended is the normal case; stopped happens after a host power cut or a
# Parallels update. `prlctl start` resumes or boots as appropriate.
STATE="$(prlctl list -a -o status --no-header "$VM" 2>/dev/null | tr -d ' ')"
log "VM \"$VM\" state: ${STATE:-unknown}"
if [ "$STATE" != "running" ]; then
  prlctl start "$VM" >>"$LOG" 2>&1 || { log "FATAL: could not start the VM"; exit 1; }
  # A resume is quick; a cold boot needs Windows to auto-login before Excel can
  # be launched into a desktop session.
  sleep 45
fi

# ── Clear last run's artefacts so a stale file can never be mistaken for new ──
rm -f "$OUTPUT" "$VM_ERROR" "$TRIGGER" "$UNATTENDED"

# ── Ask the guest to open the workbook ──────────────────────────────────────
log "dropping trigger for the guest watcher"
date '+%Y-%m-%d %H:%M:%S' > "$TRIGGER"

# ── Shutting the worker down ────────────────────────────────────────────────
# Excel must be gone BEFORE the VM is suspended, on EVERY path out of the wait
# below — not just the one where the output file turned up.
#
# A suspend freezes whatever is running, so a hung Excel is still sitting there
# at ~600MB when the VM next resumes, and the next morning's open finds the
# workbook already held. That is how ONE hang costs TWO runs: on 2026-11-02 the
# VM was suspended with EXCEL.EXE 10920 alive from the 05:56 timeout, and the
# next run had to be cleared by hand. This block used to live after the success
# path, so both FATAL exits skipped it — the very thing its own comment warned
# about.
#
# The grace period is the caller's, because the paths differ: a macro that
# aborted cleanly may still be quitting Excel itself, while one that has not
# written a file in 25 minutes is hung by definition and will never exit.
excel_gone() { ! prlctl exec "$VM" tasklist.exe 2>/dev/null | grep -qi '^EXCEL.EXE'; }

close_excel_and_suspend() {
  grace_max="${1:-60}"; grace=0
  until excel_gone || [ "$grace" -ge "$grace_max" ]; do sleep 5; grace=$((grace + 5)); done
  if excel_gone; then
    log "Excel exited on its own after ${grace}s"
  else
    log "WARN: Excel still running after ${grace}s — forcing it"
    prlctl exec "$VM" taskkill.exe /IM EXCEL.EXE /F >>"$LOG" 2>&1
    # A stale ~$ lock makes the next open read-only, which breaks the run
    # silently rather than loudly — and the lock is HIDDEN + SYSTEM, which
    # plain `del` refuses with "Could Not Find" while leaving the file in
    # place. Clear the attributes first, or this line only looks like it works.
    prlctl exec "$VM" cmd.exe /c 'attrib -h -s -r "C:\portfolio\~$Ycharts.xlsm" & del /f /q "C:\portfolio\~$Ycharts.xlsm"' >>"$LOG" 2>&1
  fi
  prlctl suspend "$VM" >>"$LOG" 2>&1 && log "VM suspended" || log "WARN: suspend failed"
}

# ── Wait for the macro to produce the file ──────────────────────────────────
waited=0
while [ ! -f "$OUTPUT" ]; do
  if [ -f "$VM_ERROR" ]; then
    log "FATAL: the macro aborted — $(cat "$VM_ERROR")"
    close_excel_and_suspend 15
    exit 1
  fi
  if [ "$waited" -ge "$WAIT_SECS" ]; then
    log "FATAL: no output after ${WAIT_SECS}s — Excel is hung, or the macro never fired"
    close_excel_and_suspend 0
    exit 1
  fi
  sleep "$POLL_SECS"; waited=$((waited + POLL_SECS))
done
log "output appeared after ${waited}s"

# ── Shut the worker down and give the RAM back before importing ─────────────
# The macro quits Excel itself; the grace period covers a botched quit.
close_excel_and_suspend 60

# ── Import ──────────────────────────────────────────────────────────────────
STAMPED="$(date +%Y-%m-%d_%H%M%S)"
# The importer is an esbuild bundle that INLINES client/src/lib/*Upload.ts, and
# it is gitignored — a fresh clone does not have it, and an edit to any importer
# does not reach this script until it is rebuilt. Build when it is missing or
# older than any source it bundles, so the scheduled run can never quietly use
# importer logic that the app has already moved past.
NEWEST_SRC="$(find "$REPO/client/src/lib" "$REPO/scripts/refresh/import-workbook.ts" \
                -name '*.ts' -newer "$REPO/scripts/refresh/import-workbook.cjs" 2>/dev/null | head -1)"
if [ ! -f "$REPO/scripts/refresh/import-workbook.cjs" ] || [ -n "$NEWEST_SRC" ]; then
  log "importer bundle missing or stale — rebuilding"
  if sh "$REPO/scripts/refresh/build.sh" >>"$LOG" 2>&1; then
    log "bundle rebuilt"
  else
    log "FATAL: could not build the importer bundle"
    exit 1
  fi
fi

if node "$REPO/scripts/refresh/import-workbook.cjs" "$OUTPUT" >>"$LOG" 2>&1; then
  mv "$OUTPUT" "$PROCESSED/Ycharts-$STAMPED.xlsx"
  log "=== refresh OK ==="
  RC=0
else
  # Left in failed/, never deleted — a file here is the evidence for the
  # in-app action the importer has already recorded.
  mv "$OUTPUT" "$FAILED/Ycharts-$STAMPED.xlsx" 2>/dev/null
  log "=== refresh FAILED (see above; workbook kept in failed/) ==="
  RC=1
fi

find "$PROCESSED" -name '*.xlsx' -mtime +$KEEP_DAYS -delete 2>/dev/null
find "$LOGDIR" -name '*.log' -mtime +$KEEP_DAYS -delete 2>/dev/null
exit $RC
