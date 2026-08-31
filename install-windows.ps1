<#
.SYNOPSIS
    NexusPanel Installer for Windows
.DESCRIPTION
    Installs NexusPanel on Windows Server 2019/2022 or Windows 10/11.
    Uses Chocolatey/WinGet for dependencies, NSSM for service management.
.PARAMETER LicenseKey
    NexusPanel license key
.PARAMETER Domain
    Domain name for the panel
.PARAMETER Port
    Panel port (default: 3443)
.PARAMETER AdminUser
    Admin username (default: admin)
.PARAMETER AdminPass
    Admin password
.PARAMETER InstallDir
    Installation directory (default: C:\Program Files\NexusPanel)
.PARAMETER WithDocker
    Install Docker Desktop
.PARAMETER WithPostgres
    Install PostgreSQL
.PARAMETER Silent
    Non-interactive mode
.PARAMETER DryRun
    Simulate installation only
#>

param(
    [string]$LicenseKey = "",
    [string]$Domain = "",
    [int]$Port = 3443,
    [string]$AdminUser = "admin",
    [string]$AdminPass = "",
    [string]$InstallDir = "$env:ProgramFiles\NexusPanel",
    [switch]$WithDocker = $false,
    [switch]$WithPostgres = $false,
    [switch]$Silent = $false,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"
$VERSION = "2.0.0"
$LOG_DIR = "$env:ProgramData\NexusPanel\logs"
$DATA_DIR = "$InstallDir\data"

# ─── Colors ───────────────────────────────────────────
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Warning($msg) { Write-Host "[WARNING] $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ─── Admin Check ──────────────────────────────────────
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Error "Administrator privileges required"
    Write-Host "Please run PowerShell as Administrator and try again"
    exit 2
}

# ─── Banner ───────────────────────────────────────────
function Show-Banner {
    Write-Host @"

    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
         NexusPanel — VPS Control Center
         Windows Installer v$VERSION
"@ -ForegroundColor Cyan
}

# ─── Pre-installation Checks ──────────────────────────
function Test-Prerequisites {
    Write-Info "Running pre-installation checks..."

    # Disk space (C: drive)
    $drive = Get-PSDrive -Name C
    $freeGB = [math]::Round($drive.Free / 1GB, 1)
    if ($freeGB -lt 2) {
        Write-Error "Insufficient disk space: ${freeGB}GB free (need 2GB)"
        exit 6
    }
    Write-Info "Disk space: ${freeGB}GB free"

    # Memory
    $os = Get-CimInstance Win32_OperatingSystem
    $totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    if ($totalGB -lt 1) {
        Write-Error "Insufficient memory: ${totalGB}GB (need 1GB)"
        exit 7
    }
    Write-Info "Memory: ${totalGB}GB"

    # Internet
    try {
        $null = Invoke-WebRequest -Uri "https://github.com" -TimeoutSec 10 -UseBasicParsing
        Write-Info "Internet connectivity: OK"
    } catch {
        Write-Warning "Internet connectivity check failed"
    }

    # Port check
    $tcpConnection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($tcpConnection) {
        Write-Warning "Port $Port is already in use by $($tcpConnection.OwningProcess)"
    }

    # Node.js check
    try {
        $nodeVer = node --version
        Write-Info "Node.js: $nodeVer"
    } catch {
        Write-Info "Node.js not found — will install"
    }

    # Existing installation
    if (Test-Path "$InstallDir\.env") {
        if (-not $Silent) {
            $upgrade = Read-Host "Existing installation detected. Upgrade? (Y/n)"
            if ($upgrade -ne "" -and $upgrade -ne "Y") {
                Write-Error "Installation cancelled"
                exit 12
            }
        }
    }

    Write-Success "Pre-installation checks passed"
}

# ─── Dependency Installation via Chocolatey ───────────
function Install-ChocoPackage($name, $params) {
    if ($DryRun) {
        Write-Info "[DRY-RUN] Would install: $name"
        return
    }
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Info "Installing Chocolatey..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    }

    $installed = choco list --local-only --exact $name 2>$null
    if ($installed -match $name) {
        Write-Info "$name already installed"
        return
    }

    choco install $name -y --no-progress $params
}

function Install-Dependencies {
    Write-Info "Installing dependencies..."

    # Install NSSM (Non-Sucking Service Manager)
    Install-ChocoPackage "nssm" ""

    # Install Node.js
    try {
        $null = node --version
    } catch {
        Install-ChocoPackage "nodejs" "--version=20.11.0"
        # Refresh PATH
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    }

    # Install Git
    try {
        $null = git --version
    } catch {
        Install-ChocoPackage "git" ""
    }

    # Optional: Docker Desktop
    if ($WithDocker) {
        Install-ChocoPackage "docker-desktop" ""
    }

    # Optional: PostgreSQL
    if ($WithPostgres) {
        Install-ChocoPackage "postgresql16" ""
    }

    Write-Success "Dependencies installed"
}

# ─── Firewall Configuration ───────────────────────────
function Configure-Firewall {
    Write-Info "Configuring Windows Firewall..."

    if ($DryRun) {
        Write-Info "[DRY-RUN] Would create firewall rules"
        return
    }

    $ruleName = "NexusPanel (TCP $Port)"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
            -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
        Write-Success "Firewall rule created for port $Port"
    } else {
        Write-Info "Firewall rule already exists"
    }

    if ($Domain) {
        $httpRule = "NexusPanel HTTP (TCP 80)"
        $httpsRule = "NexusPanel HTTPS (TCP 443)"
        $existingHttp = Get-NetFirewallRule -DisplayName $httpRule -ErrorAction SilentlyContinue
        if (-not $existingHttp) {
            New-NetFirewallRule -DisplayName $httpRule -Direction Inbound `
                -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
            New-NetFirewallRule -DisplayName $httpsRule -Direction Inbound `
                -Protocol TCP -LocalPort 443 -Action Allow | Out-Null
        }
    }
}

# ─── Application Installation ─────────────────────────
function Install-Application {
    Write-Info "Installing NexusPanel..."

    if ($DryRun) {
        Write-Info "[DRY-RUN] Would install to $InstallDir"
        return
    }

    # Create directories
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    New-Item -ItemType Directory -Force -Path $DATA_DIR | Out-Null
    New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null

    # Create upload staging directory with permissive ACLs for Two-Tier IPC
    $uploadDir = "$env:TEMP\nexus-uploads"
    New-Item -ItemType Directory -Force -Path $uploadDir | Out-Null
    try {
        $acl = Get-Acl $uploadDir
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule("Everyone", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.AddAccessRule($rule)
        Set-Acl $uploadDir $acl
    } catch {
        Write-Warning "Could not configure custom ACL on $uploadDir: $_"
    }

    # Clone repo
    $repoDir = "$env:TEMP\nexuspanel-repo"
    if (Test-Path $repoDir) {
        Remove-Item -Recurse -Force $repoDir
    }
    git clone -b main --single-branch "https://github.com/xuspanel/NexusPanel.git" $repoDir 2>$null
    if (Test-Path "$repoDir\nxApp") {
        Copy-Item "$repoDir\nxApp\*" $InstallDir -Recurse -Force
    }
    Remove-Item -Recurse -Force $repoDir -ErrorAction SilentlyContinue

    # npm install
    Push-Location $InstallDir
    npm install --production 2>&1 | Out-Null
    Pop-Location
}

# ─── Service Creation via NSSM ────────────────────────
function Create-Service {
    Write-Info "Creating Two-Tier Windows services (Daemon + Web)..."

    if ($DryRun) {
        Write-Info "[DRY-RUN] Would create services: NexusPanel-Daemon and NexusPanel-Web"
        return
    }

    $nodeExe = "C:\Program Files\nodejs\node.exe"
    if (-not (Test-Path $nodeExe)) {
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        if ($nodeCmd) { $nodeExe = $nodeCmd.Source }
    }

    # Cleanup legacy single service if exists
    nssm stop NexusPanel 2>$null
    nssm remove NexusPanel confirm 2>$null

    # 1. Root Daemon Service (NexusPanel-Daemon)
    nssm stop NexusPanel-Daemon 2>$null
    nssm remove NexusPanel-Daemon confirm 2>$null

    nssm install NexusPanel-Daemon $nodeExe "$InstallDir\src\daemon\server.js"
    nssm set NexusPanel-Daemon AppDirectory $InstallDir
    nssm set NexusPanel-Daemon DisplayName "NexusPanel Root Daemon"
    nssm set NexusPanel-Daemon Description "NexusPanel Privileged Background Daemon"
    nssm set NexusPanel-Daemon Start SERVICE_AUTO_START
    nssm set NexusPanel-Daemon AppStdout "$LOG_DIR\daemon-stdout.log"
    nssm set NexusPanel-Daemon AppStderr "$LOG_DIR\daemon-stderr.log"
    nssm set NexusPanel-Daemon AppRotateFiles 1
    nssm set NexusPanel-Daemon AppRotateSeconds 86400
    nssm set NexusPanel-Daemon AppRotateBytes 10485760

    # 2. Web Tier Service (NexusPanel-Web)
    nssm stop NexusPanel-Web 2>$null
    nssm remove NexusPanel-Web confirm 2>$null

    nssm install NexusPanel-Web $nodeExe "$InstallDir\server.js"
    nssm set NexusPanel-Web AppDirectory $InstallDir
    nssm set NexusPanel-Web DisplayName "NexusPanel Web Tier"
    nssm set NexusPanel-Web Description "NexusPanel VPS Control Panel Web Interface"
    nssm set NexusPanel-Web Start SERVICE_AUTO_START
    nssm set NexusPanel-Web AppStdout "$LOG_DIR\web-stdout.log"
    nssm set NexusPanel-Web AppStderr "$LOG_DIR\web-stderr.log"
    nssm set NexusPanel-Web AppRotateFiles 1
    nssm set NexusPanel-Web AppRotateSeconds 86400
    nssm set NexusPanel-Web AppRotateBytes 10485760
    nssm set NexusPanel-Web AppEnvironmentExtra "NODE_ENV=production"
    nssm set NexusPanel-Web DependOnService "NexusPanel-Daemon"

    # Start services
    nssm start NexusPanel-Daemon
    nssm start NexusPanel-Web
    Write-Success "Dual services created and started: NexusPanel-Daemon, NexusPanel-Web"
}

# ─── Environment Configuration ────────────────────────
function New-EnvFile {
    $envFile = "$InstallDir\.env"
    if ($DryRun) {
        Write-Info "[DRY-RUN] Would create $envFile"
        return
    }

    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})

    @"
# NEXUSPANEL CONFIGURATION
# Generated: $(Get-Date -Format 'o')

LICENSE_KEY=$LicenseKey
LICENSE_DOMAIN=$Domain
LICENSE_SERVER_URL=https://nxl.xus.me/api
JWT_SECRET=$jwtSecret
PORT=$Port
NODE_ENV=production
ADMIN_USER=$AdminUser
ADMIN_PASS=$AdminPass
DB_TYPE=sqlite
DB_PATH=$DATA_DIR\nexuspanel.db
LOG_DIR=$LOG_DIR
"@ | Out-File -FilePath $envFile -Encoding ASCII

    Write-Info "Configuration written to $envFile"
}

# ─── Verification ─────────────────────────────────────
function Test-Installation {
    Write-Info "Verifying installation..."
    $passed = 0
    $failed = 0

    # Daemon Service
    $daemonSvc = Get-Service -Name "NexusPanel-Daemon" -ErrorAction SilentlyContinue
    if ($daemonSvc -and $daemonSvc.Status -eq "Running") {
        Write-Success "Daemon Service (NexusPanel-Daemon) is running"
        $passed++
    } else {
        Write-Error "Daemon Service (NexusPanel-Daemon) is NOT running"
        $failed++
    }

    # Web Service
    $webSvc = Get-Service -Name "NexusPanel-Web" -ErrorAction SilentlyContinue
    if ($webSvc -and $webSvc.Status -eq "Running") {
        Write-Success "Web Service (NexusPanel-Web) is running"
        $passed++
    } else {
        Write-Error "Web Service (NexusPanel-Web) is NOT running"
        $failed++
    }

    # Port
    $listener = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Success "Port $Port is listening"
        $passed++
    } else {
        Write-Error "Port $Port is NOT listening"
        $failed++
    }

    # HTTP
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Success "Health check passed"
            $passed++
        }
    } catch {
        Write-Error "Health check failed"
        $failed++
    }

    Write-Host ""
    if ($failed -eq 0) {
        Write-Success "All $passed checks passed!"
    } else {
        Write-Warning "$passed passed, $failed failed"
    }
}

# ─── Summary ──────────────────────────────────────────
function Show-Summary {
    Write-Host @"

============================================================
  [SUCCESS] NexusPanel Installation Complete!
============================================================

  URL:        http://localhost:$Port
  Username:   $AdminUser
  Config:     $InstallDir\.env
  Logs:       $LOG_DIR

  Manage:     nssm {start|stop|restart} NexusPanel-Daemon
              nssm {start|stop|restart} NexusPanel-Web
"@ -ForegroundColor Green
}

# ─── Main ─────────────────────────────────────────────
function Main {
    Show-Banner
    Test-Prerequisites
    Install-Dependencies

    if (-not $Silent) {
        if (-not $LicenseKey) {
            $LicenseKey = Read-Host "License Key [NX-XXXX-XXXX-XXXX]"
        }
        if (-not $Domain) {
            $Domain = Read-Host "Domain (leave empty for localhost)"
        }
        if (-not $AdminPass) {
            $securePass = Read-Host -AsSecureString "Admin password"
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
            $AdminPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        }
    }

    Install-Application
    New-EnvFile
    Create-Service
    Configure-Firewall
    Start-Sleep -Seconds 2
    Test-Installation
    Show-Summary
}

Main
