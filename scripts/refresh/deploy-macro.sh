#!/bin/sh
# deploy-macro.sh - push scripts/refresh/Ycharts.bas into the workbook's
# ThisWorkbook module on the VM.
#
#   scripts/refresh/deploy-macro.sh            # dry run: probe and report
#   scripts/refresh/deploy-macro.sh --apply    # back up, replace, save
#
# The macro is versioned here as text because the workbook is binary, and until
# now the only way to deploy it was to paste it in by hand. This automates that
# with the safeguards the job needs - see deploy-macro.ps1 for why they exist.
#
# ALWAYS DRY-RUN FIRST. The dry run opens the workbook exactly as the real one
# does and reports how many #NAME? cells it sees; that number is the whole
# safety argument, because it is what tells you whether this account can open
# the file without destroying it.
#
# "Trust access to the VBA project object model" has to be on for the COM edit,
# and under prlctl exec HKCU *is* SYSTEM's hive, which is the one Excel-as-
# SYSTEM reads. It is turned on for the edit and back off immediately after:
# leaving it on would let any macro rewrite any other macro on that account.
set -eu

REPO="${REPO:-$HOME/Developer/Portfolio Management}"
VM="${VM_NAME:-Windows 11}"
INBOX="${REFRESH_HOME:-$HOME/portfolio-refresh}/inbox"
VBOM='HKCU\Software\Microsoft\Office\16.0\Excel\Security'

APPLY=""
[ "${1:-}" = "--apply" ] && APPLY="-Apply"

say() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }

[ "$(prlctl list -a -o status --no-header "$VM" | tr -d ' ')" = "running" ] || {
  say "starting the VM"; prlctl start "$VM" >/dev/null; sleep 45; }

# Stage both files through the share, then copy them onto C: - running a .ps1
# straight off a UNC path trips ExecutionPolicy's zone check.
mkdir -p "$INBOX"
# Transliterate to ASCII on the way in. The repo copy keeps its typography;
# what goes through COM into the VBA module should not depend on how two
# runtimes guess at an encoding.
python3 - "$REPO/scripts/refresh/Ycharts.bas" "$INBOX/Ycharts.bas" <<'ASCIIFY'
import io, sys, unicodedata
MAP = {0x2014: '-', 0x2013: '-', 0x2018: "'", 0x2019: "'",
       0x201c: '"', 0x201d: '"', 0x2026: '...', 0x2192: '->',
       0x2265: '>=', 0x2264: '<=', 0x00d7: 'x', 0x00a0: ' '}
src = io.open(sys.argv[1], encoding='utf-8').read().translate(MAP)
# Anything still outside ASCII is decomposed rather than dropped: iconv's
# //TRANSLIT silently deleted 33 characters here, which would have put a
# mangled comment into the module with nothing to show it had happened.
src = unicodedata.normalize('NFKD', src).encode('ascii', 'ignore').decode('ascii')
io.open(sys.argv[2], 'w', encoding='ascii', newline='\r\n').write(src)
ASCIIFY
cp "$REPO/scripts/refresh/deploy-macro.ps1" "$INBOX/deploy-macro.ps1"
say "staged $(wc -l < "$INBOX/Ycharts.bas" | tr -d ' ') lines of VBA"

for f in deploy-macro.ps1 Ycharts.bas; do
  prlctl exec "$VM" cmd.exe /c "copy /Y \\\\Mac\\Home\\portfolio-refresh\\inbox\\$f C:\\portfolio\\" >/dev/null
done

cleanup() {
  prlctl exec "$VM" reg.exe add "$VBOM" /v AccessVBOM /t REG_DWORD /d 0 /f >/dev/null 2>&1 || true
  rm -f "$INBOX/Ycharts.bas" "$INBOX/deploy-macro.ps1"
}
trap cleanup EXIT

prlctl exec "$VM" reg.exe add "$VBOM" /v AccessVBOM /t REG_DWORD /d 1 /f >/dev/null
say "AccessVBOM on"

say "running deploy-macro.ps1 ${APPLY:-(dry run)}"
prlctl exec "$VM" powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File 'C:\portfolio\deploy-macro.ps1' -Source 'C:\portfolio\Ycharts.bas' $APPLY

say "done"
