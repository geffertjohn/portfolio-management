# add-sheet-columns.ps1 - append metric columns to the Securities sheet.
#
# Takes a text file of YCharts metric codes, one per line, and for each one not
# already present writes the code into row 2 and copies an existing YCP() cell
# across and down.
#
# IT NEVER CONSTRUCTS A FORMULA, and that is not a style choice. This runs as
# SYSTEM under prlctl exec, a profile with NO YCharts add-in, so assigning
# "=YCP(...)" would be an assignment of an unknown function. Copying sidesteps
# it completely: the stored formula is =_xll.YCP($B3,C$2), where $B is
# column-absolute and the metric argument is column-RELATIVE, so a sideways
# copy repoints it at the new column's own header with no text to parse. Same
# technique and same reason as fill-sheet-formulas.ps1.
#
# THE ROW-2 HEADER IS DOING TWO JOBS: it is the argument YCP() reads AND the
# column name fundBulkUpload maps to securities2. So it must be the exact
# YCharts code even where the DB column differs - COLUMN_REMAP bridges those.
#
# ORDER MATTERS: ALTER TABLE first, always. The importer has no whitelist, so a
# header with no matching DB column fails the ENTIRE upsert batch, not just
# that column.
#
# Same safeguards as the other two scripts: manual calculation before the
# workbook opens, a #NAME? probe either side, a backup, and nothing without
# -Apply. Close any interactive Excel first - New-Object -ComObject attaches to
# a running instance rather than starting its own. ASCII ONLY.

param(
    [Parameter(Mandatory = $true)][string]$CodesFile,
    # old=new pairs. The header IS the metric code, so rewriting it repoints
    # the same cells at a different metric - no column is added or removed and
    # the formulas are untouched. Pair it with ALTER TABLE ... RENAME COLUMN.
    [string[]]$Rename = @(),
    # Metric codes to DELETE from the sheet. For a column that can never return
    # data - not merely one nobody reads - since every cell of it still costs a
    # YCharts call every morning and still counts toward the macro's error
    # ratio. Drop the DB column separately; this only touches the workbook.
    [string[]]$Remove = @(),
    # Column letter to fetch the ADDED columns against, in place of the sheet's
    # own ticker column. `-RepointTo E` turns =YCP($B4,W$3) into =YCP($E4,W$3).
    #
    # For a benchmark sheet, where column B is a total-return INDEX like ^SPXTR
    # and column E is its ETF proxy. YCharts holds a price series for an index,
    # not a portfolio, so every composition metric returns ERR: INVALID CALC on
    # one - proven on all 42 category rows. The proxy is an ETF and carries the
    # full set.
    #
    # It SUBSTITUTES rather than authors. Writing "=YCP(...)" outright fails for
    # this account, which has no YCharts add-in; Range.Replace edits a formula
    # that already exists, which works.
    [string]$RepointTo = '',
    # Copy an Info column (YCI) instead of a Metrics column (YCP).
    #
    # The two function names are not interchangeable and the sheet carries
    # both: C..N are =YCI($B3,C$2) and everything from O rightward is
    # =YCP($B3,...$2). A code from the reference workbook's `| Info` tab
    # returns ERR under YCP and vice versa, so the model has to match the tab
    # the code came from. Same copy-never-author rule either way - this only
    # changes which existing cell is copied.
    [switch]$Info,
    [switch]$Apply,
    [string]$Workbook  = 'C:\portfolio\Ycharts.xlsm',
    [string]$SheetName = 'Securities',
    [int]$HeaderRow    = 2,
    [int]$FirstDataRow = 3
)

$ErrorActionPreference = 'Stop'
$NAME_ERR = -2146826259
$MAX_NAME_ERRORS = 20

function Say($m) { Write-Host ("[addcol] " + $m) }

if (-not (Test-Path $Workbook))  { throw "workbook not found: $Workbook" }
if (-not (Test-Path $CodesFile)) { throw "codes file not found: $CodesFile" }

$codes = @(Get-Content $CodesFile | ForEach-Object { $_.Trim() } |
           Where-Object { $_ -ne '' -and -not $_.StartsWith('#') })
if ($codes.Count -eq 0) { throw "no codes in $CodesFile" }
Say "$($codes.Count) code(s) requested"

if ($Apply) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "C:\portfolio\Ycharts-pre-addcol-$stamp.xlsm"
    Copy-Item $Workbook $backup
    Say "backed up to $backup"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false; $excel.EnableEvents = $false

$tmp = $null; $wb = $null
try {
    $tmp = $excel.Workbooks.Add()
    $excel.Calculation = -4135           # xlCalculationManual
    $excel.CalculateBeforeSave = $false
    $wb = $excel.Workbooks.Open($Workbook)

    # ASSERT THIS. With DisplayAlerts off, Save() on a read-only workbook
    # writes nothing and raises nothing - the script reports SAVED and the
    # file on disk is untouched. The usual cause is a person having the
    # workbook open in the interactive session, which is invisible from here.
    if ($wb.ReadOnly) {
        throw ("ABORT: opened READ-ONLY, so any save would be silently discarded. " +
               "Close the workbook in the VM's interactive session first.")
    }

    $ws = $null
    foreach ($s in $wb.Worksheets) { if ($s.Name.Trim() -eq $SheetName) { $ws = $s; break } }
    if ($null -eq $ws) { throw "sheet '$SheetName' not found" }

    $before = 0
    foreach ($v in $ws.UsedRange.Value2) { if ($v -is [int] -and $v -eq $NAME_ERR) { $before++ } }
    Say "probe: $before #NAME? before"
    if ($before -gt $MAX_NAME_ERRORS) { throw "ABORT: $before #NAME? cells - cached values already gone." }

    $lastRow = $ws.UsedRange.Row + $ws.UsedRange.Rows.Count - 1
    $lastCol = $ws.UsedRange.Column + $ws.UsedRange.Columns.Count - 1
    Say "sheet is rows $FirstDataRow-$lastRow, cols 2-$lastCol"

    # Existing headers, so a re-run adds nothing twice.
    $have = @{}
    for ($c = 2; $c -le $lastCol; $c++) {
        $h = [string]$ws.Cells.Item($HeaderRow, $c).Value2
        if (-not [string]::IsNullOrWhiteSpace($h)) { $have[$h.Trim()] = $c }
    }

    # Match the model to the tab the codes came from - see -Info above.
    $want = if ($Info) { 'YCI\(' } else { 'YCP\(' }
    $model = 0
    for ($c = 3; $c -le $lastCol; $c++) {
        $f = [string]$ws.Cells.Item($FirstDataRow, $c).Formula
        if ($f -match $want) { $model = $c; break }
    }
    if ($model -eq 0) { throw "no $($want.TrimEnd('\(')) column found to copy from" }
    Say "model column $model : $($ws.Cells.Item($FirstDataRow,$model).Formula)"
    if ($RepointTo -ne '') { Say "added columns will fetch against column $RepointTo" }

    # Renames first: a code renamed INTO the sheet must not then be added as a
    # duplicate column by the loop below.
    $renamed = 0
    # Accept both a PowerShell array and ONE comma-joined string: prlctl exec
    # flattens an array argument into a single token on the way into the guest,
    # so the caller cannot rely on the array form surviving the trip.
    $pairs = @($Rename | ForEach-Object { $_.Split(',') } |
               ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    foreach ($pair in $pairs) {
        $parts = $pair.Split('=')
        if ($parts.Count -ne 2) { throw "bad -Rename pair '$pair' (want old=new)" }
        $from = $parts[0].Trim(); $to = $parts[1].Trim()
        if (-not $have.ContainsKey($from)) { Say "rename: '$from' not on the sheet, skipped"; continue }
        $col = $have[$from]
        Say "  ~ $from -> $to (column $col)"
        if ($Apply) {
            $ws.Cells.Item($HeaderRow, $col).NumberFormat = '@'
            $ws.Cells.Item($HeaderRow, $col).Value2 = $to
        }
        $have.Remove($from); $have[$to] = $col
        $renamed++
    }

    $removed = 0
    $toRemove = @($Remove | ForEach-Object { $_.Split(',') } |
                  ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

    # REFUSE a code that is in both lists. Removals run first, so the add loop
    # no longer sees it on the sheet and puts it straight back - the net effect
    # is a no-op that reports "22 removals, 22 additions" and looks like work.
    # Done exactly that way once, by passing the same file as -CodesFile and
    # -Remove.
    $both = @($toRemove | Where-Object { $codes -contains $_ })
    if ($both.Count -gt 0) {
        throw ("these codes are in BOTH the codes file and -Remove, which would " +
               "delete and re-add them: " + ($both -join ', '))
    }
    # Delete right-to-left: removing a column shifts every column after it left,
    # so ascending order would invalidate the indices still to be processed.
    $cols = @($toRemove | ForEach-Object { if ($have.ContainsKey($_)) { $have[$_] } } |
              Sort-Object -Descending)
    foreach ($c in $cols) {
        $name = [string]$ws.Cells.Item($HeaderRow, $c).Value2
        Say ("  - " + $name + " (column " + $c + ")")
        if ($Apply) { $ws.Columns.Item($c).Delete() | Out-Null }
        $removed++
    }
    foreach ($code in $toRemove) {
        if (-not $have.ContainsKey($code)) { Say "remove: '$code' not on the sheet, skipped" }
    }
    if ($removed -gt 0 -and $Apply) {
        # The map and the right-hand edge both moved.
        $have = @{}
        $lastCol = $ws.UsedRange.Column + $ws.UsedRange.Columns.Count - 1
        for ($c = 2; $c -le $lastCol; $c++) {
            $h = [string]$ws.Cells.Item($HeaderRow, $c).Value2
            if (-not [string]::IsNullOrWhiteSpace($h)) { $have[$h.Trim()] = $c }
        }
    }

    $added = 0; $skipped = @()
    foreach ($code in $codes) {
        if ($have.ContainsKey($code)) { $skipped += $code; continue }
        $target = $lastCol + 1
        Say "  + $code -> column $target"
        if ($Apply) {
            $ws.Cells.Item($HeaderRow, $target).NumberFormat = '@'
            $ws.Cells.Item($HeaderRow, $target).Value2 = $code
            $ws.Cells.Item($FirstDataRow, $model).Copy() | Out-Null
            $ws.Range($ws.Cells.Item($FirstDataRow, $target),
                      $ws.Cells.Item($lastRow, $target)).PasteSpecial(-4123) | Out-Null
        }
        if ($Apply -and $RepointTo -ne '') {
            $rng = $ws.Range($ws.Cells.Item($FirstDataRow, $target),
                             $ws.Cells.Item($lastRow, $target))
            # xlPart, matchCase: a bare "$B" must not match "$BB".
            [void]$rng.Replace('$B', ('$' + $RepointTo), 2, 1, $true)
        }
        $lastCol = $target
        $added++
    }
    if ($skipped.Count -gt 0) { Say "already present, skipped: $($skipped -join ', ')" }

    if (-not $Apply) {
        Say "DRY RUN - $removed removal(s), $renamed rename(s), $added column(s) would be added. Re-run with -Apply."
        $wb.Close($false); $wb = $null
    } elseif ($added -eq 0 -and $renamed -eq 0 -and $removed -eq 0) {
        Say "nothing to do"
        $wb.Close($false); $wb = $null
    } else {
        $after = 0
        foreach ($v in $ws.UsedRange.Value2) { if ($v -is [int] -and $v -eq $NAME_ERR) { $after++ } }
        Say "probe: $after #NAME? after"
        if ($after -gt $MAX_NAME_ERRORS) { throw "ABORT: paste produced $after #NAME? cells. Not saved." }
        $wb.Save()
        $wb.Close($false); $wb = $null
        Say "SAVED - $removed removal(s), $renamed rename(s), $added column(s) added, sheet reaches column $lastCol"
    }
}
finally {
    if ($null -ne $wb)  { try { $wb.Close($false)  } catch {} }
    if ($null -ne $tmp) { try { $tmp.Close($false) } catch {} }
    try { $excel.Quit() } catch {}
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
Say "done"
