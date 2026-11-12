<#
.SYNOPSIS
  Start the Climate Dashboard phone app in Chrome or on an Android phone, against the local backend, and
  show its log.

.DESCRIPTION
  Run from any folder:
    .\mobile\run.ps1                   in Chrome (or .\run.ps1 inside mobile)
    .\mobile\run.ps1 -Device android   on the Android phone connected by USB
    .\mobile\run.ps1 -Replay <file>    only the app's lines of a saved log

  1. Checks that Flutter is installed and that the backend answers on http://localhost:8000
     (start it with "docker compose up -d" in the project folder).
  2. In a browser: starts on port 8083 (-Port), and frees it when an earlier "flutter run" left its
     dev server running there. If another program uses the port, the app starts on the next free
     port instead. (A plain "flutter run" takes a free port of its own: web_dev_config.yaml fixes
     none, so it no longer stops with "Failed to bind web development server ... port = 8083".)
     On a phone: finds it with adb and forwards the phone's port 8000 to this computer over USB
     (adb reverse), so the app reaches the backend at http://localhost:8000 without Wi-Fi, a
     firewall rule or a change to ALLOWED_HOSTS. The forwarding is checked every few seconds and
     put back when the phone drops it, and the app's log is read straight from the phone. If
     Flutter loses its debug connection (a locked screen), the log and forwarding carry on.
  3. Gets the packages only when pubspec.yaml changed, then runs "flutter run".
  4. Shows the app's own log lines ("10:42:13 [api] GET /api/analysis/overview/ 200 (84 ms)") and
     every error. Everything "flutter run" prints, including what is hidden here, is saved in
     logs\mobile-<date>-<time>.log.

  Keys in this window: r hot reload, R hot restart, q quit.

.PARAMETER Device
  chrome (default), edge, web-server (no browser is opened; open the address yourself, and the
  app's log then appears in that browser's developer console instead of here), android (the phone
  connected by USB), or a device id from "flutter devices".

.PARAMETER Port
  The web port in a browser. Default 8083.

.PARAMETER Full
  Show everything "flutter run" prints, not only the app's log and errors.

.PARAMETER Replay
  A saved log (logs\mobile-*.log): show it through the same filter instead of starting the app.
#>
param(
    [string]$Device = "chrome",
    [int]$Port = 8083,
    [switch]$Full,
    [string]$Replay
)

Set-Location -Path $PSScriptRoot
$Backend = "http://localhost:8000/api/version/"
$OnWeb = @("chrome", "edge", "web-server") -contains $Device

function Say([string]$text, [string]$color = "Cyan") { Write-Host "[run] $text" -ForegroundColor $color }

function Get-Listener([int]$number) {
    Get-NetTCPConnection -LocalPort $number -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Find-Adb {
    $roots = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android\Sdk")) | Where-Object { $_ }
    foreach ($root in $roots) {
        $adb = Join-Path $root "platform-tools\adb.exe"
        if (Test-Path $adb) { return $adb }
    }
    $onPath = Get-Command adb -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    return $null
}

# Lines of the Flutter tool that say nothing about the app. -Full shows them; the log file keeps them.
$noise = @(
    '^\[WebDevServer\] Loaded configuration',
    '^\[proxyMiddleware\] Matched',  # one per API call; the app's own [api] line says more
    '^The web-server device requires the Dart Debug Chrome extension',
    # The debugger attaching to Chrome: it retries until the page is ready, then the app starts
    '^RemoteDebuggerExecutionContext: Timed out finding an execution context',
    '^Timed out finding an execution context',
    '^AppInspector: Error calling Runtime\.evaluate',
    '^Error calling Runtime\.evaluate with params',
    '^Utilities: Error in unawaited Future:\s*Error: Bad state: Future already completed',
    '^Error in unawaited Future:\s*$',
    '^Starting application from main method in:',
    '^Launching lib',
    '^Waiting for connection from debug service',
    '^This app is linked to the debug service',
    '^Debug service listening on',
    '^A Dart VM Service on .* is available at',
    '^The Flutter DevTools debugger and profiler on .* is available at',
    '^Flutter run key commands\.',
    '^[rRhdcq] (Hot reload|Hot restart|List all|Detach|Clear the screen|Quit)',
    '^Using hardware rendering with device',
    # Java warnings printed by Gradle on new Java versions
    '^WARNING: (A restricted method in java\.lang\.System|java\.lang\.System::load has been called|Use --enable-native-access|Restricted methods will be blocked)',
    # The Flutter engine's start-up notes on Android (which renderer it uses, where its debug service listens)
    '^I/flutter\s*\(\s*\d+\):\s*\[IMPORTANT:flutter/',
    '^I/flutter\s*\(\s*\d+\):\s*The Dart VM service is listening on',
    '^\s*$'
) -join '|'
# Android's own log lines (tag and process id, for example "D/FlutterJNI(12345): ..."), except the
# lines of the app itself, whose tag is exactly "flutter". PowerShell compares without case, so the
# tag is matched up to its bracket: "FlutterJNI(" is hidden, "flutter (" is not.
$systemLog = '^[VDIWEF]/(?!flutter\s*\()[^(]+\(\s*\d+\)'

function Show-Line([string]$line) {
    $text = $line -replace '^I/flutter\s*\(\s*\d+\):\s?', ''  # on Android the app's lines carry this prefix
    if ($line -match 'is being served at') {
        Say "App running: http://localhost:$Port" Green
    } elseif ($line -match '^Syncing files to device') {
        Say "App running on the phone." Green
    } elseif ($line -match 'INSTALL_FAILED_USER_RESTRICTED|INSTALL_CANCELED_BY_USER') {
        Write-Host $line -ForegroundColor Red
        Say "The phone refused the installation. In Settings > System > Developer options turn on 'Install via USB' (Honor and Huawei phones ask for it), accept the prompt on the phone, then run this script again." Yellow
    } elseif ($Full) {
        Write-Host $line
    } elseif ($text -match '^\d\d:\d\d:\d\d \[') {
        Write-Host $text
    } elseif ($line -match '^E/flutter') {
        Write-Host $line -ForegroundColor Red
    } elseif ($line -notmatch $noise -and $line -notmatch $systemLog) {
        if ($line -match 'Error|Exception|EXCEPTION|FAILURE|Failed|failed|Lost connection') { Write-Host $line -ForegroundColor Red }
        else { Write-Host $line -ForegroundColor DarkGray }
    }
}

# A saved log, through the same filter
if ($Replay) {
    if (-not (Test-Path $Replay)) { Say "No such log: $Replay" Red; exit 1 }
    Get-Content -Path $Replay -Encoding UTF8 | ForEach-Object { Show-Line $_ }
    exit 0
}

# 1. Flutter and the backend
if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    Say "Flutter is not on the PATH. Install it (https://docs.flutter.dev/get-started/install) and open a new terminal." Red
    exit 1
}
try {
    $server = Invoke-RestMethod -Uri $Backend -TimeoutSec 5
    Say "Backend answers: release $($server.release), API $($server.api), one-time code asked: $($server.sign_in_code)"
} catch {
    Say "The backend does not answer on $Backend." Red
    Say "Start it in the project folder with:  docker compose up -d   then run this script again." Red
    exit 1
}

# 2a. In a browser: the web port
if ($OnWeb) {
    $holder = Get-Listener $Port
    if ($holder) {
        $process = Get-Process -Id $holder.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and @("dart", "dartvm") -contains $process.ProcessName) {
            Say "Port $Port is held by an earlier Flutter dev server (process $($process.Id), started $($process.StartTime)). Stopping it." Yellow
            # The browser window that server opened (it has its own temporary profile), never another window
            $browsers = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.ParentProcessId -eq $process.Id -and $_.CommandLine -match 'flutter_tools_chrome_device' })
            if ($browsers.Count) {
                Say "Closing the browser window it had opened." Yellow
                $browsers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            }
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            for ($i = 0; $i -lt 20 -and (Get-Listener $Port); $i++) { Start-Sleep -Milliseconds 250 }
        }
        if (Get-Listener $Port) {
            $name = if ($process) { "$($process.ProcessName) (process $($process.Id))" } else { "process $($holder.OwningProcess)" }
            $free = ($Port + 1)..($Port + 30) | Where-Object { -not (Get-Listener $_) } | Select-Object -First 1
            if (-not $free) { Say "Port $Port is used by $name and no port up to $($Port + 30) is free." Red; exit 1 }
            Say "Port $Port is used by $name. Starting on port $free instead." Yellow
            $Port = $free
        }
    }
    $flutterArgs = @("run", "-d", $Device, "--web-port", "$Port", "--no-pub")
}

# 2b. On a phone: find it and forward its port 8000 to this computer
else {
    $adb = Find-Adb
    if (-not $adb) { Say "adb was not found. Install the Android SDK platform-tools (Android Studio installs them)." Red; exit 1 }
    $lines = & $adb devices 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match '\S' }
    $ready = @($lines | Where-Object { $_ -match "^(\S+)\s+device$" } | ForEach-Object { ($_ -split '\s+')[0] })
    $locked = @($lines | Where-Object { $_ -match "\sunauthorized$" } | ForEach-Object { ($_ -split '\s+')[0] })
    if ($Device -eq "android") {
        if (-not $ready.Count) {
            if ($locked.Count) { Say "The phone does not trust this computer yet: unlock it and accept 'Allow USB debugging', then run this script again." Red }
            else { Say "No Android phone found. Connect it by USB, turn on Developer options > USB debugging, and choose 'File transfer' if the phone asks." Red }
            exit 1
        }
        $target = $ready[0]
        if ($ready.Count -gt 1) { Say "Several phones are connected ($($ready -join ', ')). Using $target; choose another with -Device <id>." Yellow }
    } else {
        $target = $Device
        if ($ready -notcontains $target) { Say "Device $target is not a connected Android device. Connected: $($ready -join ', '). Run 'flutter devices' to see every device." Red; exit 1 }
    }
    $model = (& $adb -s $target shell getprop ro.product.model 2>$null | Out-String).Trim()
    $android = (& $adb -s $target shell getprop ro.build.version.release 2>$null | Out-String).Trim()
    & $adb -s $target reverse tcp:8000 tcp:8000 | Out-Null
    if ($LASTEXITCODE -ne 0) { Say "adb could not forward port 8000 to the phone." Red; exit 1 }
    Say "Phone $model (Android $android, $target): its localhost:8000 now leads to this computer's backend over USB."
    $flutterArgs = @("run", "-d", $target, "--no-pub", "--dart-define=API_BASE=http://localhost:8000/api")
}

# 3. Packages, only when they changed. "flutter pub get" leaves its files alone when nothing changed,
# so a stamp written after each successful run tells whether pubspec.yaml is newer.
$stamp = ".dart_tool\run_ps1_packages.stamp"
$stale = -not (Test-Path ".dart_tool\package_config.json") -or -not (Test-Path $stamp)
if (-not $stale) {
    $done = (Get-Item $stamp).LastWriteTime
    $stale = [bool](@("pubspec.yaml", "pubspec.lock") | Where-Object { (Test-Path $_) -and (Get-Item $_).LastWriteTime -gt $done })
}
if ($stale) {
    Say "Getting packages..."
    $output = & flutter pub get 2>&1
    if ($LASTEXITCODE -ne 0) { $output | ForEach-Object { Write-Host "$_" }; Say "flutter pub get failed." Red; exit 1 }
    Set-Content -Path $stamp -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Encoding Ascii
}

# 4. Run, showing the app's log and saving everything
New-Item -ItemType Directory -Force -Path "logs" | Out-Null
$log = Join-Path $PSScriptRoot ("logs\mobile-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($log, "Climate Dashboard phone app, flutter $($flutterArgs -join ' '), started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n", $utf8)
function Save-Line([string]$line) { [System.IO.File]::AppendAllText($log, $line + "`n", $utf8) }

if ($OnWeb) {
    Say "Starting the app on http://localhost:$Port ($Device). The first start compiles for about a minute."
    Say "Full output: $log"
    Say "Keys: r hot reload, R hot restart, q quit."
    if ($Device -eq "web-server") {
        Say "web-server mode: open the address in a browser yourself. The app's log then appears in that browser's developer console (F12), not here." Yellow
    }
    $ErrorActionPreference = "Continue"  # flutter writes some lines to stderr; they are output, not failures
    & flutter @flutterArgs 2>&1 | ForEach-Object {
        # Windows PowerShell wraps each stderr line in an error record, and an empty one reads
        # "System.Management.Automation.RemoteException": take the plain text
        $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
        if ($line -eq "System.Management.Automation.RemoteException") { $line = "" }
        Save-Line $line
        Show-Line $line
    }
    $code = $LASTEXITCODE
    Say "flutter run ended (exit code $code). Full output: $log"
    exit $code
}

# On a phone, "flutter run" is a child process, so that this window can do three things at once:
# pass your keys to it; show the app's log read straight from the phone (adb logcat), because
# flutter run does not forward it from every phone (a Galaxy S22 Ultra on Android 15 sent none);
# and put the USB forwarding back whenever the phone drops it, which Samsung phones do when
# debugging is first allowed and when the screen locks.
$AppId = "zw.ac.zchpc.climate_mobile"

function Start-Child([string]$file, [string]$arguments, [switch]$WithInput, [switch]$Utf8) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $file
    $info.Arguments = $arguments
    $info.WorkingDirectory = $PSScriptRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = [bool]$WithInput
    if ($Utf8) { $info.StandardOutputEncoding = [System.Text.Encoding]::UTF8 }
    return [System.Diagnostics.Process]::Start($info)
}

function New-Reader($stream) { [pscustomobject]@{ Stream = $stream; Task = $null; Done = $false } }

# The lines a stream has ready now, without waiting for more
function Read-Ready($reader) {
    $lines = New-Object System.Collections.Generic.List[string]
    while (-not $reader.Done) {
        if ($null -eq $reader.Task) { $reader.Task = $reader.Stream.ReadLineAsync() }
        if (-not $reader.Task.IsCompleted) { break }
        $line = $reader.Task.Result
        $reader.Task = $null
        if ($null -eq $line) { $reader.Done = $true } else { $lines.Add($line) }
    }
    return , $lines
}

# The app's lines (tag "flutter") from now on, read from the phone
function Start-PhoneLog {
    $now = ((& $adb -s $target shell date +%s 2>$null) | Out-String).Trim()
    $from = if ($now -match '^\d+$') { "-T $now.000" } else { "-T 1" }
    $process = Start-Child $adb "-s $target logcat -v tag $from -s flutter" -Utf8
    return [pscustomobject]@{ Process = $process; Reader = (New-Reader $process.StandardOutput) }
}

function Restore-Forwarding {
    $rules = (& $adb -s $target reverse --list 2>$null | Out-String)
    if ($rules -match 'tcp:8000\s+tcp:8000') { return "ok" }
    & $adb -s $target reverse tcp:8000 tcp:8000 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return "restored" } else { return "unreachable" }
}

function Test-AppAlive { return [bool]((& $adb -s $target shell pidof $AppId 2>$null | Out-String).Trim()) }

Say "Building and installing the app on the phone. The first build takes a few minutes; watch the phone in case it asks to allow the installation."
Say "Full output: $log"
Say "Keys: r hot reload, R hot restart, q quit (Ctrl+C quits too)."

$flutter = Start-Child $env:ComSpec ("/d /c flutter " + ($flutterArgs -join " ")) -WithInput
$readers = @((New-Reader $flutter.StandardOutput), (New-Reader $flutter.StandardError))
$phoneLog = Start-PhoneLog
$keys = $false
try { if (-not [Console]::IsInputRedirected) { [Console]::TreatControlCAsInput = $true; $keys = $true } } catch { }
$checked = [DateTime]::MinValue
$unreachableSaid = $false
$attached = $true  # flutter run still has its debug connection to the app
$stop = $false
$code = 0
try {
    while (-not $stop) {
        foreach ($reader in $readers) {
            foreach ($line in (Read-Ready $reader)) {
                Save-Line $line
                if ($line -match '^[VDIWEF]/flutter\s*\(') { continue }  # the app's lines come from the phone log below
                Show-Line $line
            }
        }
        foreach ($line in (Read-Ready $phoneLog.Reader)) {
            $line = $line -replace '^([VDIWEF])/flutter\s*:\s?', '$1/flutter (0): '
            Save-Line $line
            Show-Line $line
        }

        if ($keys) {
            while ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                $isCtrlC = $key.Key -eq 'C' -and ($key.Modifiers -band [ConsoleModifiers]::Control)
                $char = if ($isCtrlC) { 'q' } else { [string]$key.KeyChar }
                if ($attached -and -not $flutter.HasExited) {
                    if ($char -cmatch '^[rRqhcdvwtLSPpUiIabgoM]$') {
                        try { $flutter.StandardInput.Write($char); $flutter.StandardInput.Flush() } catch { }
                    }
                } elseif ($char -eq 'q') {
                    $stop = $true
                }
            }
        }

        if ($attached -and $flutter.HasExited -and -not ($readers | Where-Object { -not $_.Done })) {
            $attached = $false
            $code = $flutter.ExitCode
            if (Test-AppAlive) {
                Say "Flutter lost its debug connection to the phone (this happens when the screen locks or the cable moves). The app is still running: its log and the USB forwarding stay on here. Hot reload is off; press q to stop, or run this script again." Yellow
            } else {
                $stop = $true
            }
        }

        if (((Get-Date) - $checked).TotalSeconds -ge 4) {
            $checked = Get-Date
            switch (Restore-Forwarding) {
                "restored" {
                    Say "The phone had dropped the USB forwarding to the backend; restored it. (Samsung phones drop it when debugging is allowed and when the screen locks.)" Yellow
                    $unreachableSaid = $false
                }
                "unreachable" {
                    if (-not $unreachableSaid) { Say "The phone is not reachable over USB. Check the cable; the forwarding comes back when the phone does." Red; $unreachableSaid = $true }
                }
            }
            if ($phoneLog.Process.HasExited) { $phoneLog = Start-PhoneLog }
            if (-not $attached -and -not $stop -and -not (Test-AppAlive)) { Say "The app was closed on the phone."; $stop = $true }
        }
        Start-Sleep -Milliseconds 100
    }
} finally {
    if ($keys) { try { [Console]::TreatControlCAsInput = $false } catch { } }
    if (-not $phoneLog.Process.HasExited) { try { $phoneLog.Process.Kill() } catch { } }
    if (-not $flutter.HasExited) { & taskkill /PID $flutter.Id /T /F 2>$null | Out-Null }
}
Say "Session ended (flutter run exit code $code). Full output: $log"
exit $code
