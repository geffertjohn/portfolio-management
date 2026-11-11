#!/bin/bash
# refresh.sh — the scheduled YCharts refresh, driven from macOS on the Mac Studio.
#
#   launchd → this script → Parallels VM (Excel + YCharts add-in) → Supabase
#
# The VM is a short-lived worker: started, used, suspended. It is never left
# running, because Windows wants ~4GB of an 8GB machine.
#
# Excel is LAUNCHED by dropping a TRIGGER FILE the guest is watching for, rather
# than by `prlctl exec`. See watch-trigger.cmd. The Mac still owns the schedule;
# it just asks rather than tells.
#
# `prlctl exec` itself DOES work on this licence, whatever the older comments
# here and in README.md claimed: on 2026-11-03 it read the guest task list, saw
# EXCEL.EXE and terminated PID 9768, all from this script. The shutdown path
# below depends on that. What it cannot do is start an interactive Excel in the
# logged-in session, which is the reason for the trigger file.
#
# Completion is still detected by the OUTPUT FILE APPEARING, because that is the
# right signal: a hung Excel would otherwise wedge the run.
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
WATCHLIST="$INBOX/WATCHLIST.txt"             # funds the app wants tracked; read by SyncWatchlistTickers
WATCHLIST_NOTE="$INBOX/watchlist-note.txt"   # macro warnings that are NOT a reason to fail the run

# The guest reaches $INBOX as \\Mac\Home\portfolio-refresh\inbox — a UNC path,
# because Parallels' drive letters differ per machine (the Studio maps Y: to Home,
# Z: to AllFiles) and mapped letters are invisible outside the interactive logon.
# Parallels' "Shared Profile" provides the share; no extra folder to configure.

# The guest polls every 2 min, and a first open takes a few minutes while the
# add-in fetches every data point, so allow generously.
# Must outlast the macro's own LOAD_TIMEOUT (900) so a run can report its own
# failure instead of being killed mid-sentence. Briefly 3000 on a wrong
# diagnosis; the measured cost is ~320s end to end (settle_secs=253), so this
# carries roughly 4x headroom. Do not raise it to cover a suspended VM - that
# only delays the report; see "A SUSPENDED VM reads exactly like a hung Excel".
WAIT_SECS="${WAIT_SECS:-1500}"               # 25 min
POLL_SECS=10
KEEP_DAYS=30

mkdir -p "$INBOX" "$PROCESSED" "$FAILED" "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m-%d).log"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

# log(), but to the FILE only. `log` tees to stdout, so calling it inside a
# `$(...)` capture folds the log line into the captured value — which silently
# broke `excel_state`'s return the first time it was written this way.
log_quiet() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }

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
rm -f "$OUTPUT" "$VM_ERROR" "$TRIGGER" "$UNATTENDED" "$WATCHLIST" "$WATCHLIST_NOTE"

# ── Tell the workbook which funds to track ──────────────────────────────────
# Must be written BEFORE the trigger: the trigger is what opens Excel, and the
# macro reads this file as its first action so a new ticker is in column B for
# the same fetch everything else is about to make.
#
# A failure here is logged and ignored. The macro treats a missing roster as
# "refresh what the sheet already names", so the worst case is that a watchlist
# fund waits a day — which is strictly better than failing a refresh that would
# otherwise have updated all 46 holdings.
if node "$REPO/scripts/refresh/watchlist-tickers.cjs" "$WATCHLIST" >>"$LOG" 2>&1; then
  log "watchlist roster written ($(grep -c . "$WATCHLIST" 2>/dev/null || echo 0) symbols)"
else
  log "WARN: watchlist roster not written — the sheet keeps the funds it already names"
  rm -f "$WATCHLIST"
fi

# ── Ask the guest to open the workbook ──────────────────────────────────────
log "dropping trigger for the guest watcher"
date '+%Y-%m-%d %H:%M:%S' > "$TRIGGER"

# ── And tell the watcher to look NOW ────────────────────────────────────────
#
# The task that reads the trigger repeats every 2 minutes for ONE HOUR from
# 05:25 on weekdays, so a trigger dropped at any other time sat unnoticed and
# the run died 25 minutes later on `no output` — which reads exactly like a
# hung Excel and is not. The README's answer was to tell a human to run
# `schtasks /run` in a second terminal. A pipeline that needs a person at a
# keyboard is not a scheduled pipeline, and it cannot be driven by anything
# else either.
#
# **This does NOT launch Excel, and that distinction is the whole reason it
# works.** `prlctl exec` runs as NT AUTHORITY\SYSTEM in session 0, a profile
# with no YCharts add-in — Excel started there resolves no YCP() at all and the
# macro aborts on its error-ratio guard. But `schtasks /run` only ASKS the
# Task Scheduler to start the task, and the task's own principal is
# `InteractiveToken` under the logged-on user, so the work still happens in the
# console session with the add-in. SYSTEM asks; the desktop session acts.
#
# Safe to send unconditionally, including during the 05:25-06:25 window when
# the task is already polling: its `MultipleInstancesPolicy` is `IgnoreNew`
# (read from the live task XML, 9 Nov 2026), so a kick arriving while an
# instance runs is dropped by the scheduler rather than racing it.
#
# IT RETRIES FOR TWO MINUTES, because the VM was started a few lines above and
# `prlctl exec` answers 255 until the guest is ready: "Unable to open new
# session in this virtual machine. Make sure your virtual machine has finished
# booting". Measured on this box (9 Nov 2026) a RESUME is ready in about five
# seconds — attempt one fails, attempt two succeeds — but `prlctl start` also
# cold-BOOTS a stopped VM, which is far slower, and a budget sized on the
# resume would lose exactly the run that had to boot. Two minutes costs
# nothing on the common path and is a twelfth of the wait it protects.
#
# A FAILURE HERE IS A WARNING, NEVER FATAL. The polling window is still a real
# path for the 05:30 run, so a failed kick costs nothing on the one run that
# matters most. The one cause that cannot be retried away is nobody being
# logged into Windows, since the task's principal requires an interactive
# token. That already broke every run; what changes is that it now says so
# while there is still time to act, instead of timing out at twenty-five
# minutes with a message about Excel.
kick_watcher() {
  _k=1
  _t0=$(date +%s)
  while [ "$_k" -le 12 ]; do
    _out=$(prlctl exec "$VM" schtasks.exe /run /tn '\YCharts Refresh Watcher' 2>&1); _rc=$?
    if [ "$_rc" -eq 0 ]; then
      log "watcher kicked after $(( $(date +%s) - _t0 ))s"
      return 0
    fi
    _k=$((_k + 1))
    sleep 10
  done
  log "WARN: could not kick the guest watcher after $(( $(date +%s) - _t0 ))s (prlctl rc=$_rc): $(printf '%s' "$_out" | head -1)"
  log "WARN: the run now depends on the 05:25-06:25 polling window noticing the trigger"
  return 1
}
kick_watcher

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
# Is Excel still up in the guest? THREE answers, not two.
#
# This used to be a one-liner that discarded stderr and never read the exit
# status, so ANY failure — a suspended VM, a Parallels hiccup — produced empty
# output, the grep found nothing, and the leading `!` turned that into "Excel is
# gone". `close_excel_and_suspend` then logged "Excel exited on its own after 0s"
# and suspended the VM with Excel possibly alive: the self-perpetuating wedge
# that cost 15 of 20 runs in October, with `clear_excel_lock` unreachable in
# exactly the state that needs it.
#
# Reproduced against the live VM while suspended: `prlctl exec` returns 255
# (`PRL_ERR_IO_STOPPED`) and the old predicate answered "gone".
#
# `lock_gone` below has the same shape but fails the SAFE way — empty output
# means no LOCK_CLEAR, so it reports the lock present and retries. Only this one
# inverted its result, which is why only this one was dangerous.
excel_state() {
  _tl=$(prlctl exec "$VM" tasklist.exe 2>&1); _rc=$?
  # An empty task list is impossible on a live Windows box, so treat it as
  # unreadable rather than as "nothing is running".
  if [ "$_rc" -ne 0 ] || [ -z "$_tl" ]; then
    log_quiet "WARN: cannot read the guest task list (prlctl rc=$_rc): $(printf '%s' "$_tl" | head -1)"
    printf 'unknown'
  elif printf '%s\n' "$_tl" | grep -qi '^EXCEL.EXE'; then
    printf 'running'
  else
    printf 'gone'
  fi
}

# Gone means GONE. "Unknown" is not gone — assuming otherwise is the whole bug.
excel_gone() { [ "$(excel_state)" = gone ]; }

# Is the stale ~$ lock gone?
#
# `if exist` tests the path directly, so unlike a `dir /b` listing it SEES a
# HIDDEN + SYSTEM file — which this lock is. A listing-based check reports a
# clean directory while the lock sits there, which is how its absence went
# unnoticed; do not swap this for one.
lock_gone() {
  prlctl exec "$VM" cmd.exe /c 'if exist "C:\portfolio\~$Ycharts.xlsm" (echo LOCK_PRESENT) else (echo LOCK_CLEAR)' 2>/dev/null |
    grep -q 'LOCK_CLEAR'
}

# Delete the stale ~$ lock, waiting out the handle Windows has not released.
#
# A ~$ lock makes the next open READ-ONLY, which breaks a run silently rather
# than loudly, so it is worth clearing properly. Two things defeat the obvious
# one-liner, and both have actually happened:
#
#   1. The lock is HIDDEN + SYSTEM, and plain `del` refuses it with "Could Not
#      Find" while leaving the file in place — so `attrib -h -s -r` runs first.
#   2. `taskkill /F` returns as soon as the kernel has SIGNALLED the process,
#      not when its handles are closed. A `del` on the very next line therefore
#      fails with "being used by another process" — which is exactly what it did
#      on 2026-11-03, in a log that otherwise read clean.
#
# So: wait for Excel to leave tasklist, retry the delete while the handle drains,
# and then SAY whether it worked. A cleanup that cannot report its own failure is
# how (1) survived for weeks.
#
# Failing here is not fatal: watch-trigger.cmd kills Excel and clears the lock
# before the next launch, which is the fix that actually saves a run. This one
# keeps a wedge from sitting on disk all day, and tells the truth either way.
clear_excel_lock() {
  waited_proc=0
  until excel_gone || [ "$waited_proc" -ge 12 ]; do sleep 2; waited_proc=$((waited_proc + 2)); done
  excel_gone || log "WARN: Excel still in tasklist after ${waited_proc}s — the lock delete may not take"

  attempts=0
  while [ "$attempts" -lt 6 ]; do
    if lock_gone; then
      if [ "$attempts" -eq 0 ]; then log "no stale ~\$ lock to clear"
      else log "stale ~\$ lock cleared after ${attempts} attempt(s)"
      fi
      return 0
    fi
    prlctl exec "$VM" cmd.exe /c 'attrib -h -s -r "C:\portfolio\~$Ycharts.xlsm" & del /f /q "C:\portfolio\~$Ycharts.xlsm"' >>"$LOG" 2>&1
    attempts=$((attempts + 1))
    sleep 2
  done

  if lock_gone; then
    log "stale ~\$ lock cleared after ${attempts} attempt(s)"
  else
    log "WARN: stale ~\$ lock SURVIVED ${attempts} attempts — watch-trigger.cmd will clear it before the next launch"
  fi
}

close_excel_and_suspend() {
  grace_max="${1:-60}"; grace=0
  state=unknown
  while :; do
    state=$(excel_state)
    [ "$state" = gone ] && break
    # No point waiting out a grace period we cannot observe: if the task list is
    # unreadable it will still be unreadable in 60 seconds, and the whole reason
    # to wait is to watch Excel leave.
    [ "$state" = unknown ] && break
    [ "$grace" -ge "$grace_max" ] && break
    sleep 5; grace=$((grace + 5))
  done

  case "$state" in
    gone)
      log "Excel exited on its own after ${grace}s" ;;
    unknown)
      # Say what is actually known. The old code logged "exited on its own after
      # 0s" here, which reads as a clean shutdown and is why a wedge could sit
      # undetected: the line was unfalsifiable from the log alone.
      log "WARN: Excel's state is UNKNOWN (guest unreadable) — NOT claiming it exited; trying to force it anyway" ;;
    *)
      log "WARN: Excel still running after ${grace}s — forcing it" ;;
  esac

  if [ "$state" != gone ]; then
    prlctl exec "$VM" taskkill.exe /IM EXCEL.EXE /F >>"$LOG" 2>&1 \
      || log "WARN: taskkill failed (rc=$?) — Excel may survive into the suspend"
    clear_excel_lock
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

# A watchlist fund that found no free row would otherwise be silent — it simply
# never appears. Reported, not fatal: the refresh itself worked.
if [ -f "$WATCHLIST_NOTE" ]; then
  while IFS= read -r line; do log "WARN: $line"; done < "$WATCHLIST_NOTE"
fi

find "$PROCESSED" -name '*.xlsx' -mtime +$KEEP_DAYS -delete 2>/dev/null
find "$LOGDIR" -name '*.log' -mtime +$KEEP_DAYS -delete 2>/dev/null
exit $RC
