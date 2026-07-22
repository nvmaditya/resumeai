# Start backend (uvicorn) + frontend (vite). Close each window to stop.
$Root = $PSScriptRoot
$Py = Join-Path $Root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
    Write-Error "Missing backend\.venv - create it first (see README)."
    exit 1
}

$be = Join-Path $env:TEMP "resumeai-start-backend.ps1"
$fe = Join-Path $env:TEMP "resumeai-start-frontend.ps1"

$backendScript = @'
Set-Location '__ROOT__\backend'
$env:PYTHONPATH = (Get-Location).Path
if (-not $env:JWT_SECRET) { $env:JWT_SECRET = 'dev-only-change-me' }
if (-not $env:DATA_DIR) { $env:DATA_DIR = (Join-Path (Get-Location) 'data') }
if (-not $env:DATABASE_URL) {
  $db = (Join-Path (Get-Location) 'data\app.db') -replace '\\', '/'
  $env:DATABASE_URL = "sqlite:///$db"
}
if (-not $env:CORS_ORIGINS) { $env:CORS_ORIGINS = 'http://localhost:5173' }
if (-not $env:SCORE_BACKEND) { $env:SCORE_BACKEND = 'hiring_agent' }
if (-not $env:COACH_BACKEND) { $env:COACH_BACKEND = 'ollama' }
if (-not $env:OLLAMA_MODEL) { $env:OLLAMA_MODEL = 'gemma3:4b' }
& '__PY__' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
'@
$backendScript = $backendScript.Replace('__ROOT__', $Root).Replace('__PY__', $Py)
[System.IO.File]::WriteAllText($be, $backendScript)

$frontendScript = @'
Set-Location '__ROOT__\frontend'
npm run dev -- --host 127.0.0.1 --port 5173
'@
$frontendScript = $frontendScript.Replace('__ROOT__', $Root)
[System.IO.File]::WriteAllText($fe, $frontendScript)

Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $be)
Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $fe)

Write-Host "Backend  http://127.0.0.1:8000"
Write-Host "Frontend http://127.0.0.1:5173"
