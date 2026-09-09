@echo off
REM watch-trigger.cmd — the Windows half of the refresh, run by Task Scheduler
REM every 2 minutes while the user is logged on.
REM
REM WHY THIS EXISTS
REM The obvious design is for the Mac to launch Excel directly with
REM `prlctl exec`. That command is Parallels Pro/Business only and returns
REM "The command is available only in Parallels Desktop for Mac Pro or Business
REM Edition" on the standard licence. So the Mac asks instead of tells: it drops
REM a trigger file in the shared folder, and this notices within two minutes.
REM
REM A polled trigger beats scheduling the refresh inside Windows on its own
REM clock, because the Mac controls when the VM is actually awake. It also
REM survives suspend/resume — the scheduler comes back with the OS, whereas a
REM logon-triggered task never re-fires on resume.
REM
REM It must run as the INTERACTIVE logged-on user. `prlctl exec` runs as
REM NT AUTHORITY\SYSTEM in session 0, a profile with no YCharts add-in and no
REM ycharts.key, so Excel started that way resolves no YCP() at all and the
REM macro aborts on its error-ratio guard. Only the console session works.
REM
REM Deliberately a .cmd: no PowerShell execution policy to satisfy, and no
REM VBScript, which Windows 11 has begun retiring.

REM UNC, not a drive letter: Parallels letters differ per machine and mapped
REM drives are per-session.
set TRIGGER=\\Mac\Home\portfolio-refresh\inbox\REFRESH-NOW
set FLAG=\\Mac\Home\portfolio-refresh\inbox\UNATTENDED
set WORKBOOK=C:\portfolio\Ycharts.xlsm

if not exist "%TRIGGER%" goto :eof

REM Delete first: if Excel wedges, the next tick must not launch a second copy.
del /f /q "%TRIGGER%"

REM Tell the macro that THIS open is the scheduled one. Workbook_Open returns
REM immediately without the flag, which is what lets a person open the workbook
REM normally — by hand it would otherwise wait four minutes and quit Excel.
REM Written before the launch; the macro deletes it as its first action.
echo %DATE% %TIME%> "%FLAG%"

REM File association rather than a hardcoded EXCEL.EXE path, which moves between
REM Office builds. Workbook_Open in Ycharts.bas does the rest and quits Excel.
start "" "%WORKBOOK%"
