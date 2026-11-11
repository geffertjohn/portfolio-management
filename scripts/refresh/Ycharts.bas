' Ycharts.bas — the driver macro for the unattended YCharts refresh.
'
' Versioned here as text so it is diffable; the workbook itself is binary. Paste
' into ThisWorkbook (NOT a Module — Workbook_Open only fires from there) in the
' driver workbook, which lives on the VM at C:\portfolio\Ycharts.xlsm.
'
' IT LIVES ON C:, NOT ON THE Z: SHARE. Office treats a mapped network drive as
' untrusted, so a workbook opened over SMB needs the folder marked a Trusted
' Location AND "Allow Trusted Locations on my network" — a setting that can
' silently reset, after which Workbook_Open never fires and the run produces
' nothing at all. Every recalc would also cross SMB. An earlier layout ran it
' from ~/Documents/Ycharts/ over \\Mac\Home for exactly that reason and was
' abandoned; do not reintroduce it.
'
' HOW THE REFRESH ACTUALLY HAPPENS
' The YCharts add-in has AutoUpdate enabled, so opening the workbook is itself
' the refresh: values stream in from YCharts asynchronously without anyone
' pressing Refresh. This macro therefore does not try to trigger a fetch — it
' waits for the one already in flight to finish, checks it is sane, and saves.
'
' NEVER call the add-in's Flatten. It strips every YCP/YCS formula and would
' permanently destroy the template, leaving a workbook that can never refresh
' again. Nothing here touches it; do not add it.
'
' HOW WE KNOW IT FINISHED
' Two signals, because AutoUpdate streams in rather than announcing completion:
'   1. no cell still shows a "Loading" placeholder, and
'   2. the values have stopped changing for STABLE_POLLS consecutive polls,
' neither accepted before MIN_WAIT_SECS have passed. Waiting on (1) alone would
' save mid-stream on a sheet that had not started; accepting (2) immediately
' would save the previous run's cached values in the lull before the fetch
' begins, which is the same failure wearing a disguise.

Option Explicit

' Where the Mac-side inbox is reached from Windows.
'
' A UNC path, not a drive letter: Parallels' letters are not stable between
' machines (the mini mapped Z: to the Mac home; the Studio maps Y: to Home and
' Z: to AllFiles), and mapped drives are per-session, so they are invisible to
' anything not running in the interactive logon.
Private Const OUTPUT_DIR   As String = "\\Mac\Home\portfolio-refresh\inbox\"
Private Const OUTPUT_NAME  As String = "Ycharts-refreshed.xlsx"

' Dropped by watch-trigger.cmd immediately before it launches Excel, and
' consumed here as the macro's first action.
'
' THIS IS WHAT MAKES THE WORKBOOK OPENABLE BY A PERSON. Workbook_Open fires the
' same way whether the scheduler opened the file or someone double-clicked it,
' and the unattended path ends in Application.Quit — so without a gate, opening
' the workbook by hand meant waiting four minutes and then watching Excel close
' itself. There is no interactive path to fall back to, so the two have to be
' told apart, and the scheduler is the only side that can announce itself.
Private Const UNATTENDED_FLAG As String = "\\Mac\Home\portfolio-refresh\inbox\UNATTENDED"

' The roster of funds the app wants tracked, written by watchlist-tickers.cjs
' immediately before the trigger is dropped. One YCharts symbol per line.
'
' ADDING A FUND TO THE WATCHLIST USED TO POPULATE NOTHING. Fund columns come
' from this workbook, so the ticker had to be typed into the sheet by hand and
' the next refresh waited for, with nothing anywhere to remind anyone. An idea
' could sit for weeks carrying no category, no cohort and no scorecard - which
' is every measure a fund is actually judged by.
Private Const WATCHLIST_FILE As String = "\\Mac\Home\portfolio-refresh\inbox\WATCHLIST.txt"

' The fund sheet, matched on a TRIMMED name: the tab is literally "Securities "
' with a trailing space, and the importers already match it loosely for that
' reason. Hard-coding the spelling here would make this silently find nothing.
Private Const FUND_SHEET As String = "Securities"

' Where the symbols this macro added are remembered, so it can tell its own
' rows from the 46 hand-entered holdings and never release one of those.
' Column B of the stamp sheet - A1 holds the refresh timestamp, and the
' importers select sheets by name, so Control is invisible to all three.
Private Const ROSTER_COL   As Long = 2
Private Const TICKER_COL   As Long = 2   ' Securities!B - the only literal on the row
Private Const FIRST_FUND_ROW As Long = 3 ' 1 = group banner, 2 = DB column names

' The top-25 holdings sheet, rebuilt from Securities!B on every run.
'
' A SEPARATE SHEET BECAUSE THE SHAPE IS DIFFERENT, and that is the whole
' lesson. YCI(ticker,"holdings") returns a LIST - 25 rows for one fund - while
' the Securities sheet is one row PER fund. Entering it there put one fund's
' 25 holdings into the next 24 funds' rows and blocked those rows from
' carrying a formula of their own. The two shapes do not reconcile on one
' grid at any price, so holdings get a grid whose shape matches.
'
' Laid out one FUND PER COLUMN GROUP rather than one per 25-row block: a block
' layout means inserting 25 rows to add a fund and makes a fund's position
' depend on every fund before it, where a group is addressed by itself.
'   row 1          the YCharts symbol, exactly as Securities!B carries it
'   row 2          the metric code - the importer accepts a group ONLY if this
'                  reads "holdings", which is what keeps the probe below out
'   rows 3-27      the 25 x 3 array: weighting, symbol and name
Private Const HOLDINGS_SHEET As String = "Holdings"
Private Const HOLDINGS_CODE  As String = "holdings"
Private Const HOLDINGS_ROWS  As Long = 25   ' the vendor returns the top 25
Private Const HOLDINGS_COLS  As Long = 3    ' weighting + symbol + name
Private Const HOLDINGS_FIRST_ROW As Long = 3

' WHY `holdings` AND NOT `holdings_weight`. The catalogue documents neither
' shape - `holdings_weight` carries no Type and no Description at all - so
' both were run by hand before choosing. `holdings_weight` returns 25 x 2,
' symbol and decimal weight (SPY: AAPL 0.078573 ... summing to 0.5169).
' `holdings` returns those plus the NAME, and the name is the half that
' matters here: a bond holding's symbol is a CUSIP, so 039956AA5 is unreadable
' where "RealTruck Group Inc FRN" is not. A superset for the same one fetch.

' A guard, not a product limit.
'
' The sheet GROWS when it runs out of pre-wired rows, so there is no cap on how
' many funds the watchlist can carry — the 53 spare rows it shipped with were
' just where someone stopped filling formulas down, and treating that as a rule
' would have put an arbitrary ceiling on an idea list. This bound exists only so
' a defect cannot extend the sheet without end; it is reported, never silent.
Private Const MAX_FUND_ROW As Long = 1000

' Cell that carries the refresh timestamp, read back by the importer.
'
' A dedicated sheet on purpose: the three importers select sheets BY NAME, so a
' sheet they don't name is invisible to them. Stamping inside a data sheet would
' extend its used range and shift every parsed column by one.
Private Const STAMP_SHEET  As String = "Control"
Private Const STAMP_CELL   As String = "A1"

Private Const POLL_SECS    As Long = 10      ' between checks
Private Const STABLE_POLLS As Long = 3       ' unchanged this many times = settled
Private Const LOAD_TIMEOUT As Long = 900     ' give up after 15 minutes

' Do not even consider the values settled before this long.
'
' THIS IS NOT A COURTESY DELAY — it prevents a silent corruption. Workbook_Open
' can fire BEFORE the add-in starts fetching, and in that window the cells still
' hold last run's cached values, which are perfectly stable. Without a floor the
' macro would see three quiet polls, conclude "settled" after 30 seconds, and
' save yesterday's numbers stamped with today's time — passing every downstream
' freshness check. A first open takes a few minutes in practice, so wait.
Private Const MIN_WAIT_SECS As Long = 240

' Refuse to save if more than this share of populated cells are errors. A healthy
' file sits near 12% (bond and maturity columns are legitimately absent for
' equity benchmarks); a deauthenticated add-in returns close to 100%.
Private Const MAX_ERROR_RATIO As Double = 0.5

Private Sub Workbook_Open()
    Dim startTime As Double
    Dim lastPrint As String, thisPrint As String
    Dim stableCount As Long
    Dim ratio As Double

    ' Everything below this line is the scheduled run. A person who opens the
    ' workbook gets a workbook.
    If Not ClaimUnattendedRun() Then Exit Sub

    Application.DisplayAlerts = False
    Application.ScreenUpdating = False

    ' Before the rebuild, not after: writing a ticker into column B is what
    ' makes that row's 83 YCI() formulas resolve, so the new fund has to be in
    ' place for the SAME fetch everything else is about to make. Added after,
    ' it would sit empty until tomorrow.
    SyncWatchlistTickers

    ' After the watchlist sync and before the rebuild, for the same reason:
    ' the sheet is built from Securities!B, so a fund added moments ago has to
    ' be in column B already, and its formulas have to exist before the one
    ' fetch everything else is about to make.
    EnsureHoldingsSheet

    Application.CalculateFullRebuild

    startTime = Timer
    lastPrint = "<none>"
    stableCount = 0

    Do
        Application.Wait Now + TimeValue("00:00:" & Format(POLL_SECS, "00"))
        DoEvents

        If AnyStillLoading() Then
            stableCount = 0
        Else
            thisPrint = ValuesFingerprint()
            If thisPrint = lastPrint Then
                stableCount = stableCount + 1
            Else
                stableCount = 0
            End If
            lastPrint = thisPrint
        End If

        If stableCount >= STABLE_POLLS And (Timer - startTime) >= MIN_WAIT_SECS Then Exit Do
    Loop While (Timer - startTime) < LOAD_TIMEOUT

    If stableCount < STABLE_POLLS Then
        LogAndQuit "TIMEOUT: values had not settled after " & LOAD_TIMEOUT & "s"
        Exit Sub
    End If

    ratio = ErrorRatio()
    If ratio > MAX_ERROR_RATIO Then
        LogAndQuit "ABORT: " & Format(ratio, "0%") & " of populated cells are errors — " & _
                   "the YCharts add-in is probably not authenticated. Nothing saved."
        Exit Sub
    End If

    StampRefreshTime
    SaveOutputAtomically

    ' Save, then quit — and do NOT call ThisWorkbook.Close first.
    '
    ' Closing the workbook unloads the VBA project that is running this very
    ' procedure, so execution stops there and Application.Quit never runs. That
    ' left EXCEL.EXE alive after an otherwise perfect run. Setting .Saved marks
    ' the book clean so Quit cannot stop on a save prompt with nobody watching.
    ThisWorkbook.Save
    ThisWorkbook.Saved = True
    Application.Quit
End Sub

' True exactly once per scheduled run: the flag watch-trigger.cmd dropped is
' there, and this consumes it.
'
' Deleted BEFORE the long wait rather than after the save, so an Excel that
' crashes or is killed mid-run cannot leave the flag behind for the next person
' who opens the file.
'
' Fails CLOSED on purpose. No flag means "a person opened this", so if the flag
' ever stops being written the scheduled run produces nothing and refresh.sh
' reports "no output after 1500s" — a loud failure, rather than a silent save of
' whatever happened to be on screen. An unreachable share errors out of Dir$ and
' lands in the same place, which is also why opening the Mac-side copy in Excel
' for Mac stays interactive.
Private Function ClaimUnattendedRun() As Boolean
    On Error Resume Next
    If Len(Dir$(UNATTENDED_FLAG)) = 0 Then Exit Function
    Kill UNATTENDED_FLAG
    ClaimUnattendedRun = True
End Function

' True while any sheet still shows a YCharts loading placeholder.
Private Function AnyStillLoading() As Boolean
    Dim ws As Worksheet, arr As Variant, r As Long, c As Long

    For Each ws In ThisWorkbook.Worksheets
        arr = SheetValues(ws)
        If Not IsEmpty(arr) Then
            For r = LBound(arr, 1) To UBound(arr, 1)
                For c = LBound(arr, 2) To UBound(arr, 2)
                    If VarType(arr(r, c)) = vbString Then
                        If InStr(1, arr(r, c), "Loading", vbTextCompare) > 0 Then
                            AnyStillLoading = True
                            Exit Function
                        End If
                    End If
                Next c
            Next r
        End If
    Next ws
End Function

' A cheap signature of every numeric value in the book. Equal signatures on
' consecutive polls means AutoUpdate has stopped writing.
Private Function ValuesFingerprint() As String
    Dim ws As Worksheet, arr As Variant, r As Long, c As Long
    Dim total As Double, count As Double

    For Each ws In ThisWorkbook.Worksheets
        arr = SheetValues(ws)
        If Not IsEmpty(arr) Then
            For r = LBound(arr, 1) To UBound(arr, 1)
                For c = LBound(arr, 2) To UBound(arr, 2)
                    If IsNumeric(arr(r, c)) And Not IsEmpty(arr(r, c)) Then
                        total = total + CDbl(arr(r, c))
                        count = count + 1
                    End If
                Next c
            Next r
        End If
    Next ws

    ValuesFingerprint = Format(total, "0.############") & "/" & Format(count, "0")
End Function

' Share of populated cells that came back as a YCharts error string. The add-in
' returns "ERR: NO DATA" as TEXT, not as an Excel error, so both are checked.
Private Function ErrorRatio() As Double
    Dim ws As Worksheet, arr As Variant, r As Long, c As Long
    Dim populated As Double, errs As Double

    For Each ws In ThisWorkbook.Worksheets
        arr = SheetValues(ws)
        If Not IsEmpty(arr) Then
            For r = LBound(arr, 1) To UBound(arr, 1)
                For c = LBound(arr, 2) To UBound(arr, 2)
                    If Not IsEmpty(arr(r, c)) Then
                        If Len(CStr(arr(r, c))) > 0 Then
                            populated = populated + 1
                            If IsError(arr(r, c)) Then
                                errs = errs + 1
                            ElseIf VarType(arr(r, c)) = vbString Then
                                If Left$(Trim$(arr(r, c)), 4) = "ERR:" Then errs = errs + 1
                            End If
                        End If
                    End If
                Next c
            Next r
        End If
    Next ws

    If populated = 0 Then ErrorRatio = 1 Else ErrorRatio = errs / populated
End Function

' Read a sheet's used range in ONE call. Cell-by-cell iteration over ~26,000
' cells three times a poll would take longer than the poll interval.
Private Function SheetValues(ByVal ws As Worksheet) As Variant
    Dim rng As Range
    On Error Resume Next
    Set rng = ws.UsedRange
    On Error GoTo 0
    If rng Is Nothing Then Exit Function
    If rng.Cells.Count = 1 Then
        Dim one(1 To 1, 1 To 1) As Variant
        one(1, 1) = rng.Value
        SheetValues = one
    Else
        SheetValues = rng.Value
    End If
End Function

' The workbook carries no as-of date of its own, so write one. The importer reads
' this back and refuses anything stale.
Private Sub StampRefreshTime()
    Dim ws As Worksheet

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(STAMP_SHEET)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add
        ws.Name = STAMP_SHEET
    End If

    With ws.Range(STAMP_CELL)
        .NumberFormat = "@"
        .Value = Format(Now, "yyyy-mm-dd hh:nn:ss")
    End With
End Sub

' Write to a temp name and rename, so the Mac side never sees a partial file.
' SaveCopyAs keeps the formulas in the copy, which is fine — the importers read
' cached values. The template itself is never flattened.
Private Sub SaveOutputAtomically()
    Dim tmpPath As String, finalPath As String
    tmpPath = OUTPUT_DIR & "~" & OUTPUT_NAME
    finalPath = OUTPUT_DIR & OUTPUT_NAME

    If Len(Dir$(tmpPath)) > 0 Then Kill tmpPath
    ThisWorkbook.SaveCopyAs tmpPath
    If Len(Dir$(finalPath)) > 0 Then Kill finalPath
    Name tmpPath As finalPath
End Sub

' On an aborted run, leave a note the Mac side can read, then get out of the way
' so the VM can be suspended.
Private Sub LogAndQuit(ByVal msg As String)
    Dim f As Integer
    On Error Resume Next
    f = FreeFile
    Open OUTPUT_DIR & "refresh-error.txt" For Output As #f
    Print #f, Format(Now, "yyyy-mm-dd hh:nn:ss") & "  " & msg
    Close #f
    On Error GoTo 0

    ' Same reason as above: never Close before Quit. Marking the book saved
    ' WITHOUT saving discards the aborted state instead of persisting it.
    ThisWorkbook.Saved = True
    Application.Quit
End Sub

' ── Watchlist → sheet ────────────────────────────────────────────────────────

' Reconcile column B of the fund sheet against the roster the Mac just wrote.
'
' THE SHEET ALREADY HAD THE MACHINERY. Rows 49-101 are 53 spare rows carrying
' the full set of =YCI($B<row>, <col>$2) formulas with an empty ticker, so a
' symbol written into column B populates all 83 columns on the next fetch and
' the importer picks it up with no change at all - it skips all-empty rows and
' keys on security_id. Nothing here authors a formula; it writes one string.
'
' WHY THE MACRO AND NOT THE MAC. prlctl exec runs as NT AUTHORITY\SYSTEM, a
' profile with no YCharts add-in, so every YCI() resolves to #NAME? for that
' account and a save from there silently destroys every cached value in the
' workbook. Workbook_Open runs as the logged-on user, where the add-in works.
'
' THE ROSTER IS HELD UNION WATCHED, and that is what makes removal safe. This
' clears only rows it added itself, so the hand-entered holdings are never at
' risk - but a fund that is watched, then bought, then dropped from the
' watchlist IS one of its own rows, and releasing it would stop a HELD fund
' refreshing with nothing to show why. Holdings stay in the roster for as long
' as they are owned, so a row comes back only when the fund is neither.
'
' A MISSING FILE IS NOT AN ERROR. The Mac-side script may legitimately not have
' run - an older refresh.sh, a Supabase blip - and the right answer then is to
' refresh exactly what the sheet already names rather than to clear it.
Private Sub SyncWatchlistTickers()
    Dim ws As Worksheet, ctl As Worksheet
    Dim desired As Object, owned As Object
    Dim lastRow As Long, r As Long, i As Long
    Dim sym As String, note As String

    On Error GoTo Bail

    If Len(Dir$(WATCHLIST_FILE)) = 0 Then Exit Sub

    Set ws = FindSheetByTrimmedName(FUND_SHEET)
    If ws Is Nothing Then Exit Sub
    Set ctl = ThisWorkbook.Worksheets(STAMP_SHEET)

    Set desired = ReadSymbolFile(WATCHLIST_FILE)
    ' An empty or unreadable roster releases every row this macro owns, which
    ' is a far bigger action than any legitimate edit. Refuse it.
    If desired.Count = 0 Then Exit Sub

    Set owned = ReadRoster(ctl)
    lastRow = ws.UsedRange.Row + ws.UsedRange.Rows.Count - 1

    ' 1. Release rows this macro added that the app no longer wants.
    For i = 0 To owned.Count - 1
        sym = owned.Keys()(i)
        If Not desired.Exists(sym) Then
            r = FindTickerRow(ws, sym, lastRow)
            If r > 0 Then ws.Cells(r, TICKER_COL).ClearContents
        End If
    Next i

    ' 2. Place anything wanted that the sheet does not already carry. A symbol
    '    already present is left where it is whether a person put it there or
    '    this did, so nothing is ever entered twice.
    For i = 0 To desired.Count - 1
        sym = desired.Keys()(i)
        If FindTickerRow(ws, sym, lastRow) = 0 Then
            ' lastRow is ByRef here: the sheet may grow, and every later
            ' FindTickerRow and FirstFreeFundRow has to see the new bound.
            r = EnsureFundRow(ws, lastRow)
            If r = 0 Then
                note = note & sym & " "
            Else
                ws.Cells(r, TICKER_COL).Value = sym
            End If
        End If
    Next i

    ' 3. The roster becomes what the app asked for, so the next run's
    '    comparison is against this one rather than the original 46.
    WriteRoster ctl, desired

    ' Running out of pre-wired rows is silent otherwise - the fund simply never
    ' appears - so say it where the Mac side will see it. Not fatal: the rest
    ' of the refresh is still worth having.
    If Len(note) > 0 Then
        WriteNote "WATCHLIST: " & ws.Name & " has reached the " & MAX_FUND_ROW & _
                  "-row guard, so these were not placed: " & note & _
                  "- raise MAX_FUND_ROW if the book really is this large."
    End If
    Exit Sub

Bail:
    ' A fund that fails to appear must never cost the whole refresh.
    WriteNote "WATCHLIST: skipped after error " & Err.Number & " - " & Err.Description
End Sub

' The fund tab is named "Securities " with a trailing space; match on Trim$ so
' a tidied-up name does not break this.
Private Function FindSheetByTrimmedName(ByVal wanted As String) As Worksheet
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If StrComp(Trim$(ws.Name), wanted, vbTextCompare) = 0 Then
            Set FindSheetByTrimmedName = ws
            Exit Function
        End If
    Next ws
End Function

' One symbol per line, blank lines and whitespace ignored. Returned as a
' dictionary so membership is a lookup rather than a scan.
Private Function ReadSymbolFile(ByVal filePath As String) As Object
    ' Not named `line`: VBA's Line Input statement starts with that keyword and
    ' a variable of the same name reads ambiguously to the parser.
    Dim d As Object, f As Integer, ln As String
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    On Error GoTo Done
    f = FreeFile
    Open filePath For Input As #f
    Do While Not EOF(f)
        Line Input #f, ln
        ln = Trim$(ln)
        If Len(ln) > 0 Then
            If Not d.Exists(ln) Then d.Add ln, True
        End If
    Loop
    Close #f

Done:
    Set ReadSymbolFile = d
End Function

Private Function ReadRoster(ByVal ctl As Worksheet) As Object
    Dim d As Object, r As Long, v As String
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    r = 1
    Do While r < 1000
        v = Trim$(CStr(ctl.Cells(r, ROSTER_COL).Value))
        If Len(v) = 0 Then Exit Do
        If Not d.Exists(v) Then d.Add v, True
        r = r + 1
    Loop

    Set ReadRoster = d
End Function

Private Sub WriteRoster(ByVal ctl As Worksheet, ByVal d As Object)
    Dim i As Long
    ' Clear generously before rewriting: a shorter roster must not leave the
    ' tail of a longer one behind to be read back as still-owned next time.
    ctl.Range(ctl.Cells(1, ROSTER_COL), ctl.Cells(1000, ROSTER_COL)).ClearContents
    For i = 0 To d.Count - 1
        With ctl.Cells(i + 1, ROSTER_COL)
            .NumberFormat = "@"
            .Value = d.Keys()(i)
        End With
    Next i
End Sub

Private Function FindTickerRow(ByVal ws As Worksheet, ByVal sym As String, _
                               ByVal lastRow As Long) As Long
    Dim r As Long
    For r = FIRST_FUND_ROW To lastRow
        If StrComp(Trim$(CStr(ws.Cells(r, TICKER_COL).Value)), sym, vbTextCompare) = 0 Then
            FindTickerRow = r
            Exit Function
        End If
    Next r
End Function

' A row for one more fund, extending the sheet if every wired row is taken.
'
' THE SHEET IS GROWN RATHER THAN PRE-SIZED. It shipped with 53 spare rows, which
' is simply where someone stopped filling formulas down — not a decision about
' how many funds may be watched. Picking a bigger fixed number would only move
' the ceiling; copying a row down when one is needed removes it.
'
' It copies an EXPLICIT B..lastCol range, never ws.Rows(n): a whole-row copy
' touches all 16,384 columns. xlPasteFormulas adjusts the relative reference
' ($B101 -> $B102) so the new row is exactly what a fill-down would produce,
' which is the same reason fill-sheet-formulas.ps1 pastes rather than writes
' formula text. The ticker cell is a literal, so it is cleared after the paste.
'
' A grown row costs nothing until it is used: a wired row with no ticker returns
' empty, not an error, so it neither feeds the error-ratio guard nor asks
' YCharts for anything. Only a row carrying a ticker costs a fetch.
Private Function EnsureFundRow(ByVal ws As Worksheet, ByRef lastRow As Long) As Long
    Dim r As Long, lastCol As Long

    r = FirstFreeFundRow(ws, lastRow)
    If r > 0 Then
        EnsureFundRow = r
        Exit Function
    End If

    ' Refuse rather than grow without end; the caller reports what it dropped.
    If lastRow >= MAX_FUND_ROW Then Exit Function

    lastCol = ws.UsedRange.Column + ws.UsedRange.Columns.Count - 1
    ws.Range(ws.Cells(lastRow, TICKER_COL), ws.Cells(lastRow, lastCol)).Copy
    ws.Range(ws.Cells(lastRow + 1, TICKER_COL), ws.Cells(lastRow + 1, lastCol)) _
        .PasteSpecial xlPasteFormulas
    Application.CutCopyMode = False

    lastRow = lastRow + 1
    ws.Cells(lastRow, TICKER_COL).ClearContents
    EnsureFundRow = lastRow
End Function

' The first pre-wired row with no ticker. Bounded by the used range, so it can
' only ever return a row whose YCI() formulas already exist - writing below
' them would create a ticker with nothing to fetch it.
Private Function FirstFreeFundRow(ByVal ws As Worksheet, ByVal lastRow As Long) As Long
    Dim r As Long
    For r = FIRST_FUND_ROW To lastRow
        If Len(Trim$(CStr(ws.Cells(r, TICKER_COL).Value))) = 0 Then
            FirstFreeFundRow = r
            Exit Function
        End If
    Next r
End Function

' Rebuild the Holdings sheet from the fund tickers on the Securities sheet.
'
' REBUILT, NOT RECONCILED. The alternative was to diff the existing groups
' against Securities!B and add or remove the difference, which is what
' SyncWatchlistTickers does for column B - and it has to, because that column
' carries 46 hand-entered holdings it must never release. Nothing here is
' hand-entered: every group is derived from column B, so the cheapest correct
' thing is to derive all of them every run. A reconcile could drift; this
' cannot.
'
' It can author a YCI() formula, which the PowerShell helpers deliberately
' cannot. Those run as SYSTEM under prlctl exec - an account with no YCharts
' add-in - so assigning a formula naming _xll.YCI would store an unknown
' function and every cell would read #NAME?. They copy an existing cell for
' exactly that reason. This macro runs in the interactive logon where the
' add-in IS loaded, so here the formula can simply be written.
'
' NEVER ABORTS THE RUN. A failure here costs the holdings list; it must not
' cost the 120 columns of fund data the rest of the run is for.
Private Sub EnsureHoldingsSheet()
    Dim src As Worksheet, ws As Worksheet
    Dim lastRow As Long, r As Long, groups As Long, c As Long
    Dim sym As String, letter As String

    On Error GoTo Failed

    Set src = FindSheetByTrimmedName(FUND_SHEET)
    If src Is Nothing Then
        WriteNote "HOLDINGS: no " & FUND_SHEET & " sheet - skipped"
        Exit Sub
    End If

    Set ws = FindSheetByTrimmedName(HOLDINGS_SHEET)
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = HOLDINGS_SHEET
    End If

    ' Whole-sheet clear: an array formula cannot be cleared in part, and a
    ' group left from a ticker that has since been dropped would otherwise
    ' sit there being imported for ever.
    ws.Cells.Clear

    lastRow = src.UsedRange.Row + src.UsedRange.Rows.Count - 1
    If lastRow > MAX_FUND_ROW Then lastRow = MAX_FUND_ROW

    groups = 0
    For r = FIRST_FUND_ROW To lastRow
        sym = Trim$(CStr(src.Cells(r, TICKER_COL).Value))
        If Len(sym) > 0 Then
            c = groups * HOLDINGS_COLS + 1
            ' 16,384 columns is a hard Excel limit, not a policy; stop short
            ' of it and say so rather than raising on the assignment.
            If c + HOLDINGS_COLS - 1 > 16384 Then
                WriteNote "HOLDINGS: ran out of columns at " & groups & " funds - the rest were dropped"
                Exit For
            End If
            letter = ColLetter(c)

            ws.Cells(1, c).NumberFormat = "@"
            ws.Cells(1, c).Value = sym
            ws.Cells(2, c).NumberFormat = "@"
            ws.Cells(2, c).Value = HOLDINGS_CODE

            ws.Range(ws.Cells(HOLDINGS_FIRST_ROW, c), _
                     ws.Cells(HOLDINGS_FIRST_ROW + HOLDINGS_ROWS - 1, c + HOLDINGS_COLS - 1)) _
              .FormulaArray = "=YCI(" & letter & "$1," & letter & "$2)"

            groups = groups + 1
        End If
    Next r

    ws.Visible = xlSheetVisible
    Exit Sub

Failed:
    WriteNote "HOLDINGS: skipped after error " & Err.Number & " - " & Err.Description
End Sub

' 1 -> "A", 27 -> "AA". Derived from a real cell rather than computed, so it
' cannot disagree with Excel about the boundary cases.
Private Function ColLetter(ByVal c As Long) As String
    ColLetter = Split(ThisWorkbook.Worksheets(1).Cells(1, c).Address(True, False), "$")(0)
End Function

' Append a line to the Mac-side WARNING file.
'
' DELIBERATELY NOT refresh-error.txt. That file is the macro's abort signal,
' and refresh.sh fails the whole run the moment it appears - it polls for it
' while waiting for the output, so a note written here at the start of the run
' would be read as an abort and kill a refresh that was working perfectly.
' This file is reported after a successful run and changes nothing.
Private Sub WriteNote(ByVal msg As String)
    Dim f As Integer
    On Error Resume Next
    f = FreeFile
    Open OUTPUT_DIR & "watchlist-note.txt" For Append As #f
    Print #f, Format(Now, "yyyy-mm-dd hh:nn:ss") & "  " & msg
    Close #f
End Sub
