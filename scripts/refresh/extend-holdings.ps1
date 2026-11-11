# extend-holdings.ps1 - give every fund on the Securities sheet a block on the
# Holdings sheet.
#
#   extend-holdings.ps1            # dry run: report what it would add
#   extend-holdings.ps1 -Apply
#
# THE SHEET IS HAND-SEEDED AND THIS ONLY EXTENDS IT. A block is
#
#   row r      A ='Securities '!B<n>   B holdings_weight   C r..r+24, D r..r+24
#   row r+25   (blank separator)
#
# where C:D is a 25 x 2 legacy CSE array {=YCI(A<r>,B<r>)} returning the fund's
# top 25 holdings and their weights.
#
# IT COPIES THE ARRAY, IT NEVER WRITES IT. This runs as SYSTEM under prlctl
# exec, an account with NO YCharts add-in, so assigning a formula naming
# _xll.YCI stores an unknown function and the cell reads #NAME? on sight. A
# copy preserves the formula's link to the XLL name table, and copying DOWN by
# a whole number of blocks adjusts =YCI(A27,B27) to =YCI(A53,B53) with no text
# to parse. Same technique and same reason as add-sheet-columns.ps1.
#
# Columns A and B are written outright, because a sheet reference and a text
# label need no add-in. A is a LIVE reference to Securities!B, so the sheet
# follows that column by itself and a ticker swapped there needs nothing here.
#
# ASCII ONLY. Close any interactive Excel first.

param(
    [switch]$Apply,
    [string]$Workbook      = 'C:\portfolio\Ycharts.xlsm',
    [string]$HoldingsSheet = 'Holdings',
    [string]$FundSheet     = 'Securities',
    [int]$BlockRows        = 26,   # 25 holdings + a blank separator
    [int]$FirstFundRow     = 3,    # Securities: 1 = banner, 2 = column names
    [int]$TickerCol        = 2     # Securities!B
)

$ErrorActionPreference = 'Stop'
$NAME_ERR = -2146826259
function Say($m) { Write-Host ("[holdings] " + $m) }

if (-not (Test-Path $Workbook)) { throw "workbook not found: $Workbook" }

if ($Apply) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "C:\portfolio\Ycharts-pre-holdings-$stamp.xlsm"
    Copy-Item $Workbook $backup
    Say "backed up to $backup"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false; $excel.EnableEvents = $false

$wb = $null; $tmp = $null
try {
    $tmp = $excel.Workbooks.Add()
    $excel.Calculation = -4135          # xlCalculationManual
    $excel.CalculateBeforeSave = $false
    $wb = $excel.Workbooks.Open($Workbook)

    # With DisplayAlerts off, Save() on a read-only workbook writes nothing and
    # raises nothing - it would report SAVED over an untouched file.
    if ($wb.ReadOnly) {
        if ($Apply) { throw "ABORT: opened READ-ONLY, so the save would be silently discarded. Close Excel in the VM first." }
        Say "NOTE: opened read-only - dry run only."
    }

    $hs = $null; $fs = $null
    foreach ($s in $wb.Worksheets) {
        if ($s.Name.Trim() -eq $HoldingsSheet) { $hs = $s }
        if ($s.Name.Trim() -eq $FundSheet)     { $fs = $s }
    }
    if ($null -eq $hs) { throw "no '$HoldingsSheet' sheet - seed the first block by hand first" }
    if ($null -eq $fs) { throw "no '$FundSheet' sheet" }

    $before = 0
    foreach ($v in $hs.UsedRange.Value2) { if ($v -is [int] -and $v -eq $NAME_ERR) { $before++ } }
    Say "probe: $before #NAME? on $HoldingsSheet before"

    # Existing blocks, and the LAST one is the model to copy.
    $hLast = $hs.UsedRange.Row + $hs.UsedRange.Rows.Count - 1
    $have = @{}; $modelRow = 0; $maxTop = 0
    for ($r = 1; $r -le $hLast; $r++) {
        $a = [string]$hs.Cells.Item($r, 1).Formula
        if ($a -eq '') { continue }
        $b = [string]$hs.Cells.Item($r, 2).Value2
        if ($b.Trim().ToLower() -ne 'holdings_weight') { continue }
        # Record the Securities row this block points at, read off its own
        # formula rather than inferred from position - position is what drifts.
        if ($a -match '!\$?B\$?(\d+)\s*$') { $have[[int]$Matches[1]] = $r }
        $modelRow = $r; if ($r -gt $maxTop) { $maxTop = $r }
    }
    if ($modelRow -eq 0) { throw "no seeded block found on $HoldingsSheet" }
    Say ("$($have.Count) block(s) present; model is row $modelRow : " +
         [string]$hs.Cells.Item($modelRow, 3).Formula)
    if (-not $hs.Cells.Item($modelRow, 3).HasArray) { throw "model block at row $modelRow is not an array formula" }

    # The sheet-reference form is taken from the model, so the trailing space
    # in "Securities " cannot be got wrong by rebuilding the name here.
    $aModel = [string]$hs.Cells.Item($modelRow, 1).Formula
    if ($aModel -notmatch '^(.*!\$?B\$?)\d+\s*$') { throw "cannot read the model's ticker reference: $aModel" }
    $aPrefix = $Matches[1]

    $fLast = $fs.UsedRange.Row + $fs.UsedRange.Rows.Count - 1
    $added = 0; $top = $maxTop
    for ($r = $FirstFundRow; $r -le $fLast; $r++) {
        $sym = [string]$fs.Cells.Item($r, $TickerCol).Value2
        # A Securities row with no ticker gets NO block. YCI on an empty
        # symbol is not known to return empty the way YCP does, and an errored
        # or perpetually-Loading cell feeds the macro's error-ratio guard and
        # its settle detection. Re-run this after adding funds.
        if ([string]::IsNullOrWhiteSpace($sym)) { continue }
        if ($have.ContainsKey($r)) { continue }

        $top += $BlockRows
        Say ("  + $sym (Securities row $r) -> Holdings row $top")
        if ($Apply) {
            $hs.Cells.Item($top, 1).Formula = $aPrefix + $r
            $hs.Cells.Item($top, 2).NumberFormat = '@'
            $hs.Cells.Item($top, 2).Value2 = 'holdings_weight'
            $hs.Range($hs.Cells.Item($modelRow, 3), $hs.Cells.Item($modelRow + 24, 4)).Copy() | Out-Null
            $hs.Range($hs.Cells.Item($top, 3), $hs.Cells.Item($top + 24, 4)).PasteSpecial(-4123) | Out-Null
        }
        $added++
    }
    if ($Apply) { $excel.CutCopyMode = $false }

    if (-not $Apply) {
        Say "DRY RUN - $added block(s) would be added. Re-run with -Apply."
        $wb.Close($false); $wb = $null
    } elseif ($added -eq 0) {
        Say "nothing to do"
        $wb.Close($false); $wb = $null
    } else {
        $after = 0
        foreach ($v in $hs.UsedRange.Value2) { if ($v -is [int] -and $v -eq $NAME_ERR) { $after++ } }
        Say "probe: $after #NAME? on $HoldingsSheet after"
        if ($after -gt $before) { throw "ABORT: the paste produced $($after - $before) new #NAME? cells. Not saved." }
        $wb.Save()
        $wb.Close($false); $wb = $null
        Say "SAVED - $added block(s) added, sheet reaches row $($top + 24)"
    }
}
finally {
    if ($null -ne $wb)  { try { $wb.Close($false)  } catch {} }
    if ($null -ne $tmp) { try { $tmp.Close($false) } catch {} }
    try { $excel.Quit() } catch {}
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
Say "done"
