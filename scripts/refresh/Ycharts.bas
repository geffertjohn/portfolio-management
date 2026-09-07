' Ycharts.bas — the driver macro for the unattended YCharts refresh.
'
' Versioned here as text so it is diffable; the workbook itself is binary. Paste
' into ThisWorkbook (NOT a Module — Workbook_Open only fires from there) in
' C:\portfolio\Ycharts.xlsm inside the Parallels VM.
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

    Application.DisplayAlerts = False
    Application.ScreenUpdating = False
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

    Application.DisplayAlerts = True
    ThisWorkbook.Close SaveChanges:=True
    Application.Quit
End Sub

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

    Application.DisplayAlerts = True
    ThisWorkbook.Close SaveChanges:=False
    Application.Quit
End Sub
