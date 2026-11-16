#!/bin/bash
#
# catchup.sh — run the refresh if the Mac was OFF when its slot came round.
#
# THE GAP THIS CLOSES, AND ONLY THIS ONE. `com.john.ycharts-refresh` is a
# StartCalendarInterval agent at 05:30 on weekdays. launchd already handles the
# Mac being ASLEEP at that moment: the job fires on the next wake, and
# `pmset repeat wakepoweron 5:25` wakes it anyway. What neither covers is the
# Mac being SHUT DOWN, because **scheduled power-on from a full shutdown does
# not exist on Apple Silicon** — `pmset` accepts the syntax and registers the
# event, so this fails looking perfectly healthy. 16 Nov 2026: the Studio booted
# at 09:37, the 05:30 agent never fired, and the book sat on Friday's figures
# with every log and every status line saying the last run was fine.
#
# So this cannot make the refresh run while the Mac is off. It makes it run at
# the first moment the Mac is on.
#
# **IT IS A WRAPPER, NOT A CHANGE TO refresh.sh.** The guard below must never
# apply to `bash refresh.sh`, which is the documented by-hand path and has to
# run unconditionally when a person asks for it. A guard inside refresh.sh
# would silently refuse that.
#
# **IT CATCHES UP A MISSED RUN, NOT A FAILED ONE.** The test is whether a run
# STARTED today, not whether one succeeded. A failure already surfaces as the
# `data_refresh` action in the Actions hub, where a person can judge it; a
# wrapper that re-ran every failure on a timer would spend the morning
# restarting Excel against a vendor outage and turn a visible problem into a
# noisy one. The boundary is deliberate: machine was off → handled here;
# run went wrong → handled by a human.
#
# Installed by `com.john.ycharts-refresh-catchup.plist` with RunAtLoad (so it
# fires at login after a boot) and a 30-minute StartInterval (so a boot that
# beats Parallels to readiness gets another go).
set -uo pipefail

REPO="${REPO:-$HOME/Developer/Portfolio Management}"
BASE="${REFRESH_HOME:-$HOME/portfolio-refresh}"
LOGDIR="$BASE/logs"
CATCHUP_LOG="$LOGDIR/catchup.log"

# The slot the scheduled agent holds, and the hour past which catching up stops
# being worth a VM resume. 20:00 is late enough to cover any working day and
# early enough that a near-midnight boot does not refresh five hours before the
# morning run would have.
# Overridable so the window itself is testable without faking the clock.
SLOT_HHMM="${SLOT_HHMM:-0530}"
LATEST_HHMM="${LATEST_HHMM:-2000}"

mkdir -p "$LOGDIR"
say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$CATCHUP_LOG"; }

dow=$(date +%u)        # 1=Mon … 7=Sun
now=$(date +%H%M)
today_log="$LOGDIR/$(date +%Y-%m-%d).log"

# Weekends are not a missed run; the agent does not fire on them either.
[ "$dow" -le 5 ] || exit 0
# Before the slot there is nothing to catch up — the agent is still to come.
[ "$((10#$now))" -ge "$((10#$SLOT_HHMM))" ] || exit 0
[ "$((10#$now))" -le "$((10#$LATEST_HHMM))" ] || exit 0

# Did a run START today? `=== refresh start ===` is written immediately after
# the lock is taken, so this is true of a run in flight as well as a finished
# one. refresh.sh holds its own lock regardless, so a race here is safe.
if [ -f "$today_log" ] && grep -q '=== refresh start ===' "$today_log"; then
  exit 0
fi

# Parallels may not be up yet at login. Wait for it rather than failing and
# relying on the retry, so the common case resolves on the first attempt.
waited=0
until prlctl list --all >/dev/null 2>&1; do
  [ "$waited" -ge 300 ] && { say "giving up: prlctl not answering after ${waited}s"; exit 1; }
  sleep 15
  waited=$((waited + 15))
done
[ "$waited" -gt 0 ] && say "prlctl ready after ${waited}s"

say "no run recorded for today and it is past ${SLOT_HHMM} — catching up"
bash "$REPO/scripts/refresh/refresh.sh"
rc=$?
say "refresh.sh exited ${rc}"
exit "$rc"
