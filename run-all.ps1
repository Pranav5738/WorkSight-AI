<#
  Unified development launcher for Cortexa Vision.
  - Ensures frontend dependencies (npm install if missing)
  - Ensures Python virtual env + installs backend requirements only if needed
  - Streams output from both processes with prefixes
  - Graceful Ctrl+C shutdown

  Parameters:
    -NoFrontend            Skip starting frontend
    -NoBackend             Skip starting backend
    -FrontendPort <port>   Override frontend port (default 5173)
    -BackendPort  <port>   Override backend port (default 8000)
    -UseNodeLauncher       Delegate to existing Node launcher (scripts/dev.js)

  Examples:
    ./run-all.ps1
    ./run-all.ps1 -NoBackend
    ./run-all.ps1 -FrontendPort 5174 -BackendPort 9001
    ./run-all.ps1 -UseNodeLauncher
#>

param(
  [switch]$NoFrontend,
  [switch]$NoBackend,
  [int]$FrontendPort = 5173,
  [int]$BackendPort = 8000,
  [switch]$UseNodeLauncher,
  [ValidateSet('3.10','3.11','3.12')][string]$PythonVersion = '3.12',
  # Vision/runtime tuning
  [switch]$RealFace = $true,
  [int]$FaceCtxId = -1,
  [double]$ConfidenceThreshold = 0.6,
  [switch]$DisableSimulation = $true,
  # Optional: trigger embedding after backend starts
  [switch]$EncodeAll,
  [string]$EncodeEmployee,
  # Optional auth for encode endpoints (default seeded admin)
  [string]$AdminUsername = '123',
  [string]$AdminPassword = '123'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $ProjectRoot 'Frontend'
$BackendDir  = Join-Path $ProjectRoot 'Backend'

Write-Host "Starting Cortexa Vision stack (Root: $ProjectRoot)" -ForegroundColor Cyan
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm not found in PATH.' }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Warning 'python not found – backend may fail.' }

if ($UseNodeLauncher) {
  $launcher = Join-Path $ProjectRoot 'scripts' 'dev.js'
  if (-not (Test-Path $launcher)) { throw "scripts/dev.js not found for node launcher." }
  Write-Host '[DELEGATE] Handing off to node scripts/dev.js' -ForegroundColor Cyan
  & node $launcher @()
  exit $LASTEXITCODE
}

# Frontend deps install (if node_modules missing)
if (-not $NoFrontend -and -not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
  Write-Host '[SETUP] Installing frontend dependencies...' -ForegroundColor Yellow
  Push-Location $FrontendDir
  npm install
  Pop-Location
}

function Ensure-Venv {
  param([string]$Dir,[string]$PyVer)
  # Map version -> venv folder
  $folder = if ($PyVer -eq '3.10') { '.venv310' } elseif ($PyVer -eq '3.11') { '.venv311' } else { '.venv' }
  $venvDir = Join-Path $Dir $folder
  $pyExe = Join-Path $venvDir 'Scripts' 'python.exe'
  if (-not (Test-Path $pyExe)) {
    Write-Host "[SETUP] Creating Python $PyVer venv ($folder)..." -ForegroundColor Yellow
    Push-Location $Dir
    $launcher = "py -$PyVer"
    try {
      & $launcher -m venv $folder
    } catch {
      Write-Warning "Failed invoking '$launcher'. Falling back to 'python' on PATH (may not be version $PyVer)."
      python -m venv $folder
    }
    Pop-Location
  }
  if (-not (Test-Path $pyExe)) { return 'python' }
  $reqFile = Join-Path $Dir 'requirements.txt'
  $marker  = Join-Path $venvDir '.deps_installed'
  $needsInstall = $true
  if ((Test-Path $marker) -and (Test-Path $reqFile)) {
    if ((Get-Item $marker).LastWriteTimeUtc -ge (Get-Item $reqFile).LastWriteTimeUtc) { $needsInstall = $false }
  }
  if ($needsInstall -and (Test-Path $reqFile)) {
    Write-Host '[SETUP] Installing backend dependencies...' -ForegroundColor Yellow
    & $pyExe -m pip install --upgrade pip | Out-Null
    & $pyExe -m pip install -r $reqFile
    if ($LASTEXITCODE -eq 0) { New-Item -Path $marker -ItemType File -Force | Out-Null } else { Write-Warning 'One or more backend dependencies failed to install.' }
  }
  return $pyExe
}

class ProcRef { [string]$Name; [System.Diagnostics.Process]$Process }
$procs = @()

function Start-Proc {
  param([string]$Name,[string]$Exe,[string[]]$Args,[string]$WorkingDir,[hashtable]$Env)
  Write-Host "[$Name] Launching: $Exe $($Args -join ' ')" -ForegroundColor Green
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = ($Args -join ' ')
  $psi.WorkingDirectory = $WorkingDir
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  if ($Env) {
    foreach ($k in $Env.Keys) { $psi.Environment[$k] = [string]$Env[$k] }
  }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  $null = $p.Start()
  Register-ObjectEvent -InputObject $p -EventName OutputDataReceived -Action { if ($EventArgs.Data) { Write-Host "[$Name] $($EventArgs.Data)" } } | Out-Null
  Register-ObjectEvent -InputObject $p -EventName ErrorDataReceived  -Action { if ($EventArgs.Data) { Write-Host "[$Name] $($EventArgs.Data)" -ForegroundColor Red } } | Out-Null
  $p.BeginOutputReadLine(); $p.BeginErrorReadLine()
  $pr = [ProcRef]::new(); $pr.Name = $Name; $pr.Process = $p; $procs += $pr
}

if (-not $NoFrontend) {
  # Pass VITE_API_URL so the dev server uses the correct backend
  $feEnv = @{ 'VITE_API_URL' = "http://localhost:$BackendPort" }
  Start-Proc -Name 'FRONTEND' -Exe 'npm' -Args @('run','dev','--','--port',"$FrontendPort") -WorkingDir $FrontendDir -Env $feEnv
}
if (-not $NoBackend) {
  $py = Ensure-Venv -Dir $BackendDir -PyVer $PythonVersion
  $beEnv = @{}
  if ($RealFace) { $beEnv['REAL_FACE'] = '1' } else { $beEnv['REAL_FACE'] = '0' }
  $beEnv['FACE_CTX_ID'] = [string]$FaceCtxId
  $beEnv['CONFIDENCE_THRESHOLD'] = [string]([math]::Round($ConfidenceThreshold, 3))
  $beEnv['RECOGNITION_SIMULATION'] = ($(if ($DisableSimulation) { '0' } else { '1' }))
  Start-Proc -Name 'BACKEND' -Exe $py -Args @('-m','uvicorn','main:app','--reload','--port',"$BackendPort") -WorkingDir $BackendDir -Env $beEnv
}

if ($procs.Count -eq 0) { Write-Warning 'Nothing to run (both disabled).'; exit 0 }

Write-Host '------------------------------------------------------------' -ForegroundColor DarkGray
if (-not $NoFrontend) { Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Cyan }
if (-not $NoBackend) { Write-Host  "Backend : http://127.0.0.1:$BackendPort (Python $PythonVersion)" -ForegroundColor Cyan }
Write-Host 'Press Ctrl+C to stop (graceful shutdown).' -ForegroundColor Yellow
Write-Host '------------------------------------------------------------' -ForegroundColor DarkGray

$script:stopping = $false
trap { Write-Warning "Unhandled error: $_" }

function Stop-All {
  if ($script:stopping) { return }
  $script:stopping = $true
  Write-Host 'Stopping processes...' -ForegroundColor Yellow
  foreach ($p in $procs) { try { if (-not $p.Process.HasExited) { $p.Process.Kill() } } catch {} }
  Write-Host 'Done.' -ForegroundColor Green
  exit 0
}

Register-EngineEvent -SourceIdentifier ConsoleCancelEvent -InputObject ([Console]::CancelKeyPress) -Action { Stop-All } | Out-Null

while (-not $script:stopping) {
  # After backend start, optionally trigger encode once when ready
  if (-not $NoBackend -and -not (Get-Variable -Name _encodeTriggered -Scope Script -ErrorAction SilentlyContinue)) {
    try {
      $ready = $false; $tries = 0
      while (-not $ready -and $tries -lt 40) {
        Start-Sleep -Milliseconds 500
        try {
          $rz = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:$BackendPort/readyz" -TimeoutSec 2
          if ($rz.ready -and $rz.details -and $rz.details.embedding_worker) { $ready = $true }
        } catch { }
        $tries++
      }
      if ($ready -and ($EncodeAll -or $EncodeEmployee)) {
        # Authenticate
        $loginBody = @{ username = $AdminUsername; password = $AdminPassword } | ConvertTo-Json
        try {
          $login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$BackendPort/auth/login" -ContentType 'application/json' -Body $loginBody -TimeoutSec 5
          $token = $login.access_token
        } catch { $token = $null }
        if ($token) {
          $hdr = @{ Authorization = "Bearer $token" }
          if ($EncodeAll) {
            try { Invoke-RestMethod -Method POST -Headers $hdr -Uri "http://127.0.0.1:$BackendPort/employees/encode_all" -TimeoutSec 10 | Out-Null } catch {}
          } elseif ($EncodeEmployee) {
            try { Invoke-RestMethod -Method POST -Headers $hdr -Uri "http://127.0.0.1:$BackendPort/employees/$EncodeEmployee/encode" -TimeoutSec 10 | Out-Null } catch {}
          }
        } else {
          Write-Warning 'Encode requested but admin login failed; check credentials.'
        }
      }
      Set-Variable -Name _encodeTriggered -Scope Script -Value $true -Force
    } catch { }
  }
  foreach ($p in $procs) {
    if ($p.Process.HasExited) {
      Write-Warning "Process $($p.Name) exited with code $($p.Process.ExitCode)"
      if ($p.Name -eq 'FRONTEND' -and -not $NoFrontend -and -not $script:stopping) { Write-Host 'Frontend exited early; stopping all.' -ForegroundColor Yellow; Stop-All }
      if ($p.Name -eq 'BACKEND'  -and -not $NoBackend  -and -not $script:stopping) { Write-Host 'Backend exited early; stopping all.'  -ForegroundColor Yellow; Stop-All }
    }
  }
  Start-Sleep -Milliseconds 700
}
