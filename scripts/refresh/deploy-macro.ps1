# deploy-macro.ps1 - replace ThisWorkbook's code in C:\portfolio\Ycharts.xlsm.
#
# Runs in the guest under prlctl exec, which means NT AUTHORITY\SYSTEM - a
# profile with NO YCharts add-in. Every YCP()/YCI() in the workbook resolves to
# #NAME? for this account, so a recalculation followed by a save would wipe
# every cached value the importers read and leave a file that still opens, still
# has its formulas, and carries nothing. That failure is completely silent,
# which is why this script is mostly safeguards:
#
#   - calculation is forced to manual BEFORE the workbook opens (which needs a
#     throwaway workbook open first, since the property does not exist with
#     none), and CalculateBeforeSave is turned off;
#   - events are disabled, or Workbook_Open fires and quits Excel underneath us;
#   - it PROBES for #NAME? cells and refuses to save above a small threshold;
#   - it backs the workbook up before touching it;
#   - and it does nothing at all without -Apply.
#
# ASCII ONLY. Windows PowerShell 5.1 reads a BOM-less .ps1 as CP1252, so a
# UTF-8 em-dash decodes to a right curly quote, which PowerShell honours as a
# string delimiter and the whole script fails to parse.

param(
    [switch]$Apply,
    [string]$Workbook = 'C:\portfolio\Ycharts.xlsm',
    [string]$Source   = '\\Mac\Home\portfolio-refresh\inbox\Ycharts.bas'
)

$ErrorActionPreference = 'Stop'
$NAME_ERR   = -2146826259   # #NAME?
$MAX_NAME_ERRORS = 20       # a healthy open reports 0

function Say($m) { Write-Host ("[deploy] " + $m) }

if (-not (Test-Path $Workbook)) { throw "workbook not found: $Workbook" }
if (-not (Test-Path $Source))   { throw "source not found: $Source" }

$code = [IO.File]::ReadAllText($Source)
if ($code.Length -lt 500) { throw "source looks truncated ($($code.Length) bytes)" }
Say "source is $($code.Length) bytes"

if ($Apply) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "C:\portfolio\Ycharts-pre-vbaedit-$stamp.xlsm"
    Copy-Item $Workbook $backup
    Say "backed up to $backup"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.EnableEvents = $false

$tmp = $null; $wb = $null
try {
    # Application.Calculation does not exist with no workbook open, and it has
    # to be manual BEFORE the template opens or Excel recalculates on load.
    $tmp = $excel.Workbooks.Add()
    $excel.Calculation = -4135          # xlCalculationManual
    $excel.CalculateBeforeSave = $false

    $wb = $excel.Workbooks.Open($Workbook)
    Say "opened, calculation=$($excel.Calculation) events=$($excel.EnableEvents)"

    # Probe: how much of the cached data has already been destroyed?
    $nameErrors = 0
    $populated  = 0
    foreach ($ws in $wb.Worksheets) {
        $rng = $ws.UsedRange
        if ($null -eq $rng) { continue }
        $vals = $rng.Value2
        if ($null -eq $vals) { continue }
        if ($vals -isnot [Array]) { $vals = @($vals) }
        foreach ($v in $vals) {
            if ($null -eq $v) { continue }
            $populated++
            if ($v -is [int] -and $v -eq $NAME_ERR) { $nameErrors++ }
        }
    }
    Say "probe: $nameErrors #NAME? of $populated populated cells"
    if ($nameErrors -gt $MAX_NAME_ERRORS) {
        throw "ABORT: $nameErrors #NAME? cells - the cached values are already gone. Nothing saved."
    }

    $mod = $wb.VBProject.VBComponents.Item('ThisWorkbook').CodeModule
    Say "current ThisWorkbook module: $($mod.CountOfLines) lines"

    if (-not $Apply) {
        Say "DRY RUN - no change written. Re-run with -Apply."
        $wb.Close($false)
        $wb = $null
    } else {
        if ($mod.CountOfLines -gt 0) { $mod.DeleteLines(1, $mod.CountOfLines) }
        $mod.AddFromString($code)

        # Read it back rather than trusting the write. CodeModule.Find's ByRef
        # position arguments do not marshal from PowerShell, so compare text.
        $back = $mod.Lines(1, $mod.CountOfLines)
        if ($back -notmatch 'SyncWatchlistTickers') {
            throw "ABORT: readback does not contain SyncWatchlistTickers - not saved."
        }
        Say "new module: $($mod.CountOfLines) lines, readback OK"

        $wb.Save()
        $wb.Close($false)
        $wb = $null
        Say "SAVED"
    }
}
finally {
    if ($null -ne $wb)  { try { $wb.Close($false)  } catch {} }
    if ($null -ne $tmp) { try { $tmp.Close($false) } catch {} }
    try { $excel.Quit() } catch {}
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
Say "done"
