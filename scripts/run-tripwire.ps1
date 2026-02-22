<#
.SYNOPSIS
  Run the Security Regression Tripwire against your Supabase project.

.DESCRIPTION
  Reads SECURITY_REGRESSION_TRIPWIRE.sql from this repo, executes it via
  the Supabase REST SQL endpoint, and reports PASS / FAIL for each check.

  Requires:
    - SUPABASE_DB_URL  env var (PostgreSQL connection string)
      OR
    - psql on PATH + SUPABASE_DB_URL

  If neither is available, falls back to printing instructions.

.EXAMPLE
  # Set your DB connection string (Settings → Database → Connection string → URI)
  $env:SUPABASE_DB_URL = "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
  .\scripts\run-tripwire.ps1
#>

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Get-Location }

# Resolve the SQL file
$sqlFile = Join-Path $scriptDir "SECURITY_REGRESSION_TRIPWIRE.sql"
if (-not (Test-Path $sqlFile)) {
  $sqlFile = Join-Path (Get-Location) "SECURITY_REGRESSION_TRIPWIRE.sql"
}
if (-not (Test-Path $sqlFile)) {
  Write-Error "Cannot find SECURITY_REGRESSION_TRIPWIRE.sql. Run from the repo root."
  exit 1
}

$sql = Get-Content $sqlFile -Raw
Write-Host "`n=== Security Regression Tripwire ===" -ForegroundColor Cyan
Write-Host "SQL file: $sqlFile" -ForegroundColor DarkGray

# --- Method 1: psql ---
$dbUrl = $env:SUPABASE_DB_URL
if ($dbUrl -and (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Host "Running via psql..." -ForegroundColor Yellow
  $result = $sql | psql $dbUrl -t -A -F "|" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Error "psql failed: $result"
    exit 1
  }

  $pass = 0; $fail = 0; $total = 0
  foreach ($line in ($result -split "`n")) {
    $line = $line.Trim()
    if (-not $line) { continue }
    $parts = $line -split "\|"
    if ($parts.Count -ge 2) {
      $checkName = $parts[0].Trim()
      $status = $parts[1].Trim()
      $total++
      if ($status -eq "PASS") {
        Write-Host "  PASS  $checkName" -ForegroundColor Green
        $pass++
      } else {
        Write-Host "  FAIL  $checkName" -ForegroundColor Red
        $fail++
      }
    }
  }

  Write-Host "`n--- Results: $pass/$total PASS" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
  if ($fail -gt 0) {
    Write-Host "    $fail check(s) FAILED — investigate immediately!" -ForegroundColor Red
    exit 1
  } else {
    Write-Host "    All checks passed. Security posture intact." -ForegroundColor Green
    exit 0
  }
}

# --- Fallback: instructions ---
Write-Host ""
Write-Host "No psql + SUPABASE_DB_URL found." -ForegroundColor Yellow
Write-Host ""
Write-Host "Option A: Set up psql" -ForegroundColor White
Write-Host '  $env:SUPABASE_DB_URL = "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"' -ForegroundColor DarkGray
Write-Host "  .\scripts\run-tripwire.ps1" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Option B: Paste manually" -ForegroundColor White
Write-Host "  1. Open Supabase SQL Editor" -ForegroundColor DarkGray
Write-Host "  2. Paste contents of SECURITY_REGRESSION_TRIPWIRE.sql" -ForegroundColor DarkGray
Write-Host "  3. Expect 22 rows, all PASS" -ForegroundColor DarkGray
Write-Host ""
exit 1
