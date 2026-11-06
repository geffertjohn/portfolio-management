# fill-sheet-formulas.ps1 - extend the Securities sheet's YCP() formulas down to
# the last pre-wired row.
#
# WHY THIS EXISTS. Seven columns on that sheet stopped at row 45 while the rest
# ran to 101, so every row from 46 down was missing them - silently. The cells
# were EMPTY, not errored, so the importer read NULL, the app rendered a clean
# "-", and nothing anywhere said a formula was absent rather than a figure. It
# cost the Information Ratio 3Y metric, which carries 20% of the fund scorecard
# on BOTH cohorts, on four held funds (VVIAX, VIGAX, VMSAX) and on the first
# watchlist fund to land in a spare row (VUG). A committee memo read the same
# nulls and reported them as a vendor coverage gap, which they were not.
#
# It fills by COPY/PASTE of the last populated cell in each column rather than
# by writing a formula string: Excel adjusts the relative row reference
# ($B45 -> $B46) on paste, so the pasted cell is exactly what a fill-down would
# have produced and this script never has to parse or construct YCP() syntax.
#
# Safeguards are the same as deploy-macro.ps1, and for the same reason: this
# runs as SYSTEM, which has no YCharts add-in, so a recalculation followed by a
# save would wipe every cached value in the workbook. ASCII ONLY.

param(
    [switch]$Apply,
    [string]$Workbook  = 'C:\portfolio\Ycharts.xlsm',
    [string]$SheetName = 'Securities',
    [int]$HeaderRow    = 2,   # row 1 is a group banner; row 2 holds DB column names
    [int]$FirstDataRow = 3,
    [int]$LastDataRow  = 101  # the pre-wired band
)

$ErrorActionPreference = 'Stop'
$NAME_ERR = -2146826259
$MAX_NAME_ERRORS = 20

function Say($m) { Write-Host ("[fill] " + $m) }

if (-not (Test-Path $Workbook)) { throw "workbook not found: $Workbook" }

if ($Apply) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "C:\portfolio\Ycharts-pre-fill-$stamp.xlsm"
    Copy-Item $Workbook $backup
    Say "backed up to $backup"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.EnableEvents = $false

$tmp = $null; $wb = $null
try {
    $tmp = $excel.Workbooks.Add()
    $excel.Calculation = -4135          # xlCalculationManual
    $excel.CalculateBeforeSave = $false

    $wb = $excel.Workbooks.Open($Workbook)

    $ws = $null
    foreach ($s in $wb.Worksheets) { if ($s.Name.Trim() -eq $SheetName) { $ws = $s; break } }
    if ($null -eq $ws) { throw "sheet '$SheetName' not found" }
    Say ("sheet '" + $ws.Name + "' opened, calculation=" + $excel.Calculation)

    # Probe BEFORE touching anything.
    $before = 0
    $vals = $ws.UsedRange.Value2
    foreach ($v in $vals) { if ($v -is [int] -and $v -eq $NAME_ERR) { $before++ } }
    Say "probe: $before #NAME? cells before"
    if ($before -gt $MAX_NAME_ERRORS) { throw "ABORT: $before #NAME? cells - cached values already gone." }

    $lastCol = $ws.UsedRange.Column + $ws.UsedRange.Columns.Count - 1
    $filled = 0
    for ($c = 2; $c -le $lastCol; $c++) {
        $header = $ws.Cells.Item($HeaderRow, $c).Value2
        if ([string]::IsNullOrWhiteSpace([string]$header)) { continue }
        if ([string]$header -eq 'security_id') { continue }   # the ticker is a literal

        # Any cell in the band with no formula is a hole, wherever it sits.
        #
        # Scanning only for where the fill-down STOPPED would miss an interior
        # gap, and there is one: one_month_total_return_peer_group_rank_nav has
        # formulas at row 101 but not in rows 50-56, so a "last populated row"
        # test reports that column as complete.
        $src = 0
        $holes = New-Object System.Collections.ArrayList
        for ($r = $FirstDataRow; $r -le $LastDataRow; $r++) {
            if ($ws.Cells.Item($r, $c).HasFormula) { $src = $r }
            else { [void]$holes.Add($r) }
        }
        if ($src -eq 0 -or $holes.Count -eq 0) { continue }

        Say ("  " + $header + ": " + $holes.Count + " row(s) with no formula (model row " + $src + ")")
        if ($Apply) {
            $ws.Cells.Item($src, $c).Copy() | Out-Null
            foreach ($r in $holes) {
                # xlPasteFormulas: the relative row reference adjusts on paste,
                # so each cell gets exactly what a fill-down would have made.
                $ws.Cells.Item($r, $c).PasteSpecial(-4123) | Out-Null
            }
        }
        $filled++
    }
    # NOT clearing CutCopyMode: the interop enum refuses both 0 and $false from
    # PowerShell ("Invalid cast from System.Boolean"), and the clipboard marker
    # is meaningless in a headless session that quits a few lines later.

    if (-not $Apply) {
        Say "DRY RUN - $filled column(s) would be filled. Re-run with -Apply."
        $wb.Close($false); $wb = $null
    } elseif ($filled -eq 0) {
        Say "nothing to fill; every column already reaches row $LastDataRow"
        $wb.Close($false); $wb = $null
    } else {
        $after = 0
        $vals2 = $ws.UsedRange.Value2
        foreach ($v in $vals2) { if ($v -is [int] -and $v -eq $NAME_ERR) { $after++ } }
        Say "probe: $after #NAME? cells after"
        if ($after -gt $MAX_NAME_ERRORS) { throw "ABORT: paste produced $after #NAME? cells. Not saved." }

        $wb.Save()
        $wb.Close($false); $wb = $null
        Say "SAVED - $filled column(s) filled through row $LastDataRow"
    }
}
finally {
    if ($null -ne $wb)  { try { $wb.Close($false)  } catch {} }
    if ($null -ne $tmp) { try { $tmp.Close($false) } catch {} }
    try { $excel.Quit() } catch {}
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
Say "done"
