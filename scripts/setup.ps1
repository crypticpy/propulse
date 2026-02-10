#Requires -Version 5.1
<#
.SYNOPSIS
    ProPulse Setup Assistant — installs and configures the Propulse ecosystem on Windows.
.DESCRIPTION
    Interactive installer that sets up Node.js, Bridge server, Hamlib, and
    configures WSJT-X/DX Cluster integration for the ProPulse ham radio
    propagation dashboard.

    Run from the Propulse project root:
        .\scripts\setup.ps1

    Or from anywhere with the project cloned:
        cd C:\path\to\propulse
        .\scripts\setup.ps1
.NOTES
    Requires PowerShell 5.1+ (ships with Windows 10/11).
    Elevated (admin) privileges are only needed for scheduled task creation.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

# Check execution policy before anything else
$currentPolicy = Get-ExecutionPolicy -Scope CurrentUser
if ($currentPolicy -eq "Restricted" -or $currentPolicy -eq "AllSigned") {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "  ║  PowerShell is blocking scripts from running.               ║" -ForegroundColor Red
    Write-Host "  ║                                                              ║" -ForegroundColor Red
    Write-Host "  ║  To fix this, run the following command first:               ║" -ForegroundColor Yellow
    Write-Host "  ║                                                              ║" -ForegroundColor Red
    Write-Host "  ║  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser         ║" -ForegroundColor Cyan
    Write-Host "  ║                                                              ║" -ForegroundColor Red
    Write-Host "  ║  Then re-run this setup script.                              ║" -ForegroundColor Red
    Write-Host "  ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Write-Info($msg)    { Write-Host "  -> " -NoNewline -ForegroundColor Cyan; Write-Host $msg }
function Write-Success($msg) { Write-Host "  OK " -NoNewline -ForegroundColor Green; Write-Host $msg }
function Write-Warn($msg)    { Write-Host "  !  " -NoNewline -ForegroundColor Yellow; Write-Host $msg }
function Write-Err($msg)     { Write-Host "  X  " -NoNewline -ForegroundColor Red; Write-Host $msg }

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor White -BackgroundColor DarkGray
    Write-Host ("  " + ([string]::new([char]0x2500, 40))) -ForegroundColor DarkGray
}

function Prompt-YesNo {
    param(
        [Parameter(Mandatory)][string]$Question,
        [bool]$Default = $true
    )
    $suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }
    $response = Read-Host "  $Question $suffix"
    if ([string]::IsNullOrWhiteSpace($response)) { return $Default }
    return $response -match '^[Yy]'
}

# ─── Platform Detection ──────────────────────────────────────────────────────

function Get-SystemInfo {
    $script:Arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $script:WinVersion = [System.Environment]::OSVersion.Version
    $script:HasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
    $script:HasChoco  = $null -ne (Get-Command choco  -ErrorAction SilentlyContinue)

    Write-Info "Windows $($script:WinVersion.Major).$($script:WinVersion.Minor) ($script:Arch)"
    if ($script:HasWinget) { Write-Info "Package manager: winget" }
    elseif ($script:HasChoco) { Write-Info "Package manager: Chocolatey" }
    else { Write-Info "Package manager: none detected" }
}

# ─── Dependency Discovery ────────────────────────────────────────────────────

function Test-NodeJS {
    $script:NodeOk = $false
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $version = (node -v) -replace '^v', ''
        $major = [int]($version.Split('.')[0])
        if ($major -ge 18) {
            Write-Success "Node.js v$version (>= 18 required)"
            $script:NodeOk = $true
            return $true
        } else {
            Write-Warn "Node.js v$version found but v18+ required"
            return $false
        }
    }
    Write-Info "Node.js not found"
    return $false
}

function Test-Hamlib {
    $script:HamlibOk = $false
    $rigctld = Get-Command rigctld -ErrorAction SilentlyContinue
    if ($rigctld) {
        Write-Success "Hamlib rigctld found at $($rigctld.Source)"
        $script:HamlibOk = $true
        return $true
    }
    # Check common install locations
    $commonPaths = @(
        "$env:ProgramFiles\Hamlib\bin\rigctld.exe",
        "${env:ProgramFiles(x86)}\Hamlib\bin\rigctld.exe",
        "$env:APPDATA\Hamlib\bin\rigctld.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            Write-Success "Hamlib found at $p"
            $script:HamlibOk = $true
            return $true
        }
    }
    Write-Info "Hamlib (rigctld) not found"
    return $false
}

function Test-WSJTX {
    $script:WsjtxOk = $false
    $paths = @(
        "$env:ProgramFiles\wsjtx\wsjtx.exe",
        "$env:LOCALAPPDATA\WSJT-X\wsjtx.exe",
        "${env:ProgramFiles(x86)}\wsjtx\wsjtx.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Write-Success "WSJT-X found at $p"
            $script:WsjtxOk = $true
            return $true
        }
    }
    # Also check PATH
    if (Get-Command wsjtx -ErrorAction SilentlyContinue) {
        Write-Success "WSJT-X found in PATH"
        $script:WsjtxOk = $true
        return $true
    }
    Write-Info "WSJT-X not found (optional)"
    return $false
}

function Test-Bridge {
    $script:BridgeOk  = $false
    $script:BridgeDir = $null

    # Look relative to script location and current directory
    $candidates = @(
        (Join-Path $PSScriptRoot "..\bridge"),
        (Join-Path (Get-Location) "bridge")
    )
    foreach ($d in $candidates) {
        $pkgJson = Join-Path $d "package.json"
        if (Test-Path $pkgJson) {
            $script:BridgeDir = (Resolve-Path $d).Path
            if (Test-Path (Join-Path $d "node_modules")) {
                Write-Success "Bridge dependencies installed ($($script:BridgeDir))"
                $script:BridgeOk = $true
                return $true
            } else {
                Write-Info "Bridge found at $($script:BridgeDir) but dependencies not installed"
                return $false
            }
        }
    }
    Write-Info "Bridge directory not found (run from Propulse root)"
    return $false
}

# ─── Installation Functions ──────────────────────────────────────────────────

function Install-NodeJS {
    Write-Header "Installing Node.js"

    if ($script:HasWinget) {
        Write-Info "Installing via winget..."
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    } elseif ($script:HasChoco) {
        Write-Info "Installing via Chocolatey..."
        choco install nodejs-lts -y
    } else {
        Write-Warn "No package manager found (winget or Chocolatey)."
        Write-Info "Install Node.js manually from: https://nodejs.org/en/download/"
        Write-Info "Then re-run this script."
        return
    }

    # Refresh PATH so the current session picks up newly-installed binaries
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")

    if (Test-NodeJS) {
        Write-Success "Node.js installed successfully"
    } else {
        Write-Warn "Node.js installation may need a terminal restart to take effect"
        Write-Info "Close this terminal, open a new one, and re-run the script"
    }
}

function Install-Hamlib {
    Write-Header "Installing Hamlib"

    $hamlibVersion = "4.5.5"
    $zipName = "hamlib-w64-$hamlibVersion.zip"
    $zipUrl  = "https://github.com/Hamlib/Hamlib/releases/download/$hamlibVersion/$zipName"
    $destDir = "$env:APPDATA\Hamlib"
    $zipPath = "$env:TEMP\$zipName"

    Write-Info "Downloading Hamlib $hamlibVersion..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-Err "Download failed: $_"
        Write-Info "Install manually from: https://hamlib.github.io/"
        return
    }

    Write-Info "Extracting to $destDir..."
    if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $destDir -Force
    Remove-Item $zipPath -Force

    # Add bin directory to user PATH if not already present
    $binDir   = Join-Path $destDir "bin"
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$binDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
        $env:Path += ";$binDir"
        Write-Info "Added $binDir to user PATH"
    }

    Write-Success "Hamlib installed to $destDir"
    Write-Info "List supported models:  rigctld -l"
    Write-Info "Example:  rigctld -m 3085 -r COM3 -s 38400"
}

function Install-Bridge {
    Write-Header "Installing Bridge Dependencies"

    if (-not $script:BridgeDir) {
        $candidates = @(
            (Join-Path $PSScriptRoot "..\bridge"),
            (Join-Path (Get-Location) "bridge")
        )
        foreach ($d in $candidates) {
            if (Test-Path (Join-Path $d "package.json")) {
                $script:BridgeDir = (Resolve-Path $d).Path
                break
            }
        }
    }

    if (-not $script:BridgeDir) {
        Write-Err "Bridge directory not found."
        Write-Info "Make sure you're running this from the Propulse project root."
        Write-Host ""
        Write-Info "  git clone https://github.com/crypticpy/propulse.git"
        Write-Info "  cd propulse"
        Write-Info "  .\scripts\setup.ps1"
        return
    }

    Write-Info "Installing in: $($script:BridgeDir)"
    Push-Location $script:BridgeDir
    try {
        npm install
        if (Test-Path "node_modules") {
            Write-Success "Bridge dependencies installed"
            $script:BridgeOk = $true
        } else {
            Write-Err "Bridge setup failed. Check your internet connection and try again."
            Write-Info "If the problem persists, install manually:  cd bridge && npm install"
        }
    } catch {
        Write-Err "Bridge setup failed. Check your internet connection and try again."
        Write-Info "If the problem persists, install manually:  cd bridge && npm install"
        Write-Info "Error details: $_"
    } finally {
        Pop-Location
    }
}

# ─── Configuration Functions ─────────────────────────────────────────────────

function Set-WSJTXConfig {
    Write-Header "WSJT-X Configuration"
    Write-Host ""
    Write-Info "To connect WSJT-X to Propulse, enable UDP reporting:"
    Write-Host ""
    Write-Info "  1. Open WSJT-X"
    Write-Info "  2. Go to File -> Settings -> Reporting tab"
    Write-Info "  3. Check 'Accept UDP requests'"
    Write-Info "  4. Set UDP port to: 2237 (default)"
    Write-Info "  5. Click OK"
    Write-Host ""
    Write-Info "The bridge will automatically listen for WSJT-X on this port."
    Write-Host ""

    if (Prompt-YesNo "Have you configured WSJT-X?") {
        Write-Success "WSJT-X configuration noted"
    } else {
        Write-Info "You can configure this later -- no worries."
    }
}

function Set-AutoStart {
    Write-Header "Auto-Start Configuration"

    if (-not $script:BridgeDir) {
        Write-Warn "Bridge directory not found. Skipping auto-start setup."
        return
    }

    if (-not $script:NodeOk) {
        Write-Warn "Node.js not available. Install Node.js first."
        return
    }

    # Build bridge for production
    Write-Info "Building bridge for production..."
    Push-Location $script:BridgeDir
    try { npm run build } finally { Pop-Location }

    $serverJs = Join-Path $script:BridgeDir "dist\server.js"
    if (-not (Test-Path $serverJs)) {
        Write-Err "Build output not found at $serverJs"
        Write-Info "You can start the bridge manually:  npm run bridge"
        return
    }

    # Create a Windows Scheduled Task that runs the bridge at login
    $taskName = "ProPulse Bridge"
    $nodeExe  = (Get-Command node).Source

    $action   = New-ScheduledTaskAction `
                    -Execute $nodeExe `
                    -Argument "`"$serverJs`"" `
                    -WorkingDirectory $script:BridgeDir
    $trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet `
                    -AllowStartIfOnBatteries `
                    -DontStopIfGoingOnBatteries `
                    -ExecutionTimeLimit (New-TimeSpan -Hours 0)

    try {
        Register-ScheduledTask `
            -TaskName $taskName `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Description "ProPulse Bridge WebSocket Server (ws://127.0.0.1:9867)" `
            -Force | Out-Null
        Write-Success "Scheduled task '$taskName' created (runs at login)"
        Write-Info "Manage via Task Scheduler or:  Get-ScheduledTask '$taskName'"
    } catch {
        Write-Warn "Could not create scheduled task (may need admin): $_"
        Write-Info "You can start the bridge manually:  npm run bridge"
    }
}

# ─── Connectivity Test ───────────────────────────────────────────────────────

function Test-Connectivity {
    Write-Header "Connectivity Test"

    # Test bridge WebSocket port (default 9867)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcp.BeginConnect("127.0.0.1", 9867, $null, $null)
        $connected = $asyncResult.AsyncWaitHandle.WaitOne(3000, $false)
        if ($connected -and $tcp.Connected) {
            Write-Success "Bridge server reachable at ws://127.0.0.1:9867"
        } else {
            Write-Warn "Bridge not responding on port 9867"
            Write-Info "Start it with:  npm run bridge  (from propulse root)"
        }
        $tcp.Close()
    } catch {
        Write-Warn "Could not test bridge connection"
    }

    # Test rigctld TCP port (default 4532)
    if ($script:HamlibOk) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $asyncResult = $tcp.BeginConnect("127.0.0.1", 4532, $null, $null)
            $connected = $asyncResult.AsyncWaitHandle.WaitOne(2000, $false)
            if ($connected -and $tcp.Connected) {
                Write-Success "rigctld reachable on port 4532"
            } else {
                Write-Info "rigctld not running (start with: rigctld -m MODEL -r COMx)"
            }
            $tcp.Close()
        } catch {
            Write-Info "rigctld not running"
        }
    }
}

# ─── Main Interactive Flow ───────────────────────────────────────────────────

function Main {
    Clear-Host
    Write-Host ""
    Write-Host "  +==========================================+" -ForegroundColor Cyan
    Write-Host "  |  ProPulse Setup Assistant                |" -ForegroundColor Cyan
    Write-Host "  |  The ionosphere, visualized              |" -ForegroundColor DarkCyan
    Write-Host "  +==========================================+" -ForegroundColor Cyan
    Write-Host ""

    Get-SystemInfo
    Write-Host ""

    # ── Discovery ─────────────────────────────────────────────────────────────
    Write-Header "Checking installed components"
    Test-NodeJS  | Out-Null
    Test-Hamlib  | Out-Null
    Test-WSJTX   | Out-Null
    Test-Bridge  | Out-Null
    Write-Host ""

    # ── Task selection ────────────────────────────────────────────────────────
    Write-Header "What would you like to set up?"

    $tasks = @()

    if (-not $script:NodeOk) {
        if (Prompt-YesNo "Install Node.js >= 18?") { $tasks += "node" }
    }

    if (Prompt-YesNo "Install/update bridge dependencies?") { $tasks += "bridge" }

    if (-not $script:HamlibOk) {
        if (Prompt-YesNo "Install Hamlib (for radio CAT control)?") { $tasks += "hamlib" }
    }

    if ($script:WsjtxOk) {
        if (Prompt-YesNo "Configure WSJT-X integration?") { $tasks += "wsjtx" }
    }

    if (Prompt-YesNo "Set up bridge to auto-start at login?" -Default $false) {
        $tasks += "service"
    }

    Write-Host ""

    # ── Execute ───────────────────────────────────────────────────────────────
    if ($tasks.Count -eq 0) {
        Write-Info "Nothing to do! Everything looks good."
    } else {
        Write-Header "Installing selected components"

        foreach ($task in $tasks) {
            switch ($task) {
                "node"    { Install-NodeJS  }
                "bridge"  { Install-Bridge  }
                "hamlib"  { Install-Hamlib  }
                "wsjtx"   { Set-WSJTXConfig }
                "service" { Set-AutoStart   }
            }
            Write-Host ""
        }
    }

    # ── Optional connectivity check ──────────────────────────────────────────
    if (Prompt-YesNo "Run connectivity test?") {
        Test-Connectivity
    }

    # ── Wrap up ───────────────────────────────────────────────────────────────
    Write-Host ""
    Write-Header "Setup Complete"
    Write-Host ""
    Write-Success "You're all set! Here's what to do next:"
    Write-Host ""
    Write-Info "  1. Start the bridge:  npm run bridge   (from propulse root)"
    Write-Info "  2. Open Propulse:     npm run dev       (from propulse root)"
    Write-Info "  3. Check status:      Look for the green dot in the header"
    Write-Host ""
    Write-Info "  Full health dashboard:  http://localhost:5173/health"
    Write-Info "  Bridge details:         http://localhost:5173/bridge"
    Write-Info "  Setup guide:            http://localhost:5173/setup"
    Write-Host ""
}

Main
