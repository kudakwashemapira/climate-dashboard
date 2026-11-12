<#
.SYNOPSIS
  Build the Climate Dashboard Android app for a phone on the same Wi-Fi as this computer, and offer it
  for download from the dashboard's nginx: http://<this computer>/downloads/climate-dashboard.apk

.DESCRIPTION
  Run from any folder, with the Docker stack running ("docker compose up -d" in the project folder):
    .\mobile\build-apk.ps1                            this computer's address on its network
    .\mobile\build-apk.ps1 -HostAddress 192.168.1.20  an address of your choice

  1. Finds this computer's address (the network adapter with a default gateway), unless -HostAddress
     names it.
  2. Builds a release APK whose API is http://<address>/api, through nginx on port 80. A release
     build with an http:// API_BASE allows plain HTTP (android/app/build.gradle.kts); one built for
     https://dcces-inst.zchpc.ac.zw/api does not.
  3. Copies it to downloads\climate-dashboard.apk in the project folder, which nginx serves in
     development (docker-compose.override.yml, backend/deploy/nginx/downloads.dev.conf).
  4. Checks what the phone needs to reach this computer: nginx serving the file, the address in
     ALLOWED_HOSTS (.env) and the inbound firewall rule for port 80. It says what to change; it
     changes none of them.

  The address is built into the app. When this computer gets another address (another Wi-Fi), run
  this again and install the new APK over the old one; the phone keeps the app's data.

.PARAMETER HostAddress
  The address the phone uses to reach this computer. Default: the IPv4 address of the network
  adapter that has a default gateway.
#>
param([string]$HostAddress)

Set-Location -Path $PSScriptRoot
$Project = Split-Path -Parent $PSScriptRoot
$FirewallRule = "Climate Dashboard phone app (HTTP 80)"

function Say([string]$text, [string]$color = "Cyan") { Write-Host "[build-apk] $text" -ForegroundColor $color }

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    Say "Flutter is not on the PATH. Install it (https://docs.flutter.dev/get-started/install) and open a new terminal." Red
    exit 1
}

# 1. This computer's address
if (-not $HostAddress) {
    $network = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } | Select-Object -First 1
    if (-not $network) {
        Say "No network with a gateway. Connect to the Wi-Fi the phone uses, or name the address: -HostAddress <address>" Red
        exit 1
    }
    $HostAddress = $network.IPv4Address.IPAddress | Select-Object -First 1
    Say "This computer: $HostAddress on $($network.InterfaceAlias) ($((Get-NetConnectionProfile -InterfaceAlias $network.InterfaceAlias).Name))"
}
$Api = "http://$HostAddress/api"
$Url = "http://$HostAddress/downloads/climate-dashboard.apk"

# 2. The build
Say "Building the release APK for $Api (about a minute and a half; the first build on a computer takes longer)"
flutter build apk --release "--dart-define=API_BASE=$Api"
if ($LASTEXITCODE -ne 0) { Say "The build failed (above)." Red; exit 1 }

# 3. Where nginx serves it
$downloads = Join-Path $Project "downloads"
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
$apk = Join-Path $downloads "climate-dashboard.apk"
Copy-Item -Path "build\app\outputs\flutter-apk\app-release.apk" -Destination $apk -Force
Say ("Built: {0} ({1:N0} MB)" -f $apk, ((Get-Item $apk).Length / 1MB)) Green

# 4. What the phone needs
$ready = $true
try {
    Invoke-WebRequest -Uri "http://localhost/downloads/climate-dashboard.apk" -Method Head -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
    Say "nginx does not serve the file yet. Start or update the stack in the project folder: docker compose up -d" Yellow
    $ready = $false
}
$hosts = (Get-Content (Join-Path $Project ".env") | Where-Object { $_ -match '^ALLOWED_HOSTS=' }) -replace '^ALLOWED_HOSTS=', ''
if (($hosts -split ',' | ForEach-Object { $_.Trim() }) -notcontains $HostAddress) {
    Say "ALLOWED_HOSTS in .env lacks $HostAddress, so the API would refuse the phone (HTTP 400). Add it, then: docker compose up -d" Yellow
    $ready = $false
}
if (-not (Get-NetFirewallRule -DisplayName $FirewallRule -ErrorAction SilentlyContinue)) {
    Say "Windows Firewall blocks the phone. In PowerShell as administrator, once:" Yellow
    Write-Host "  New-NetFirewallRule -DisplayName '$FirewallRule' -Direction Inbound -Protocol TCP -LocalPort 80 -RemoteAddress LocalSubnet -Profile Private -Action Allow"
    Say "The rule is for Private networks; mark the Wi-Fi as Private in Windows settings if it is Public." Yellow
    $ready = $false
}

Write-Host ""
if ($ready) { Say "Ready for the phone." Green }
Say "On the phone, on the same Wi-Fi as this computer:"
Write-Host "  1. Open $Url in the browser."
Write-Host "  2. Open the downloaded file. When asked, allow the browser to install unknown apps, then Install."
Write-Host "     (Replacing an app installed over USB by run.ps1 works: both are signed with the same debug key.)"
Write-Host "  3. Open Climate Dashboard and sign in. The Docker stack must be running on this computer."
