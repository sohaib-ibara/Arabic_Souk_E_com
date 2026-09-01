<#
.SYNOPSIS
  Run the noon supplier sync. Intended for Windows Task Scheduler.

.DESCRIPTION
  noon cannot be synced from the cloud. Chrome is refused from every IP we have
  tried, and Camoufox, which does get through, is refused from datacentre IPs.
  Both conditions have to hold at once, and CI can only ever fix the browser.
  So noon runs here, on a machine with a residential connection.

  Two consequences worth knowing before scheduling this:

  * The browser is HEADED. A Firefox window will open and close on its own.
    That means the task must run with the user logged on; it cannot run as a
    service or on the lock screen.

  * A missed run is invisible from here. That is what /admin/sync is for: it
    reads sync_runs and shows "Overdue" when nothing has reported in 30 hours,
    so a machine left switched off shows up as a problem rather than as silence.

  Defaults seed and then maintain, without needing to be changed. While the 301
  live products are still being mirrored into staging they arrive as new, so
  NewLimit does the seeding; once they are all staged there are no new ones and
  only the refresh runs.

.PARAMETER NewLimit
  Most products to add to staging per run. Paces the initial seed.

.PARAMETER RefreshLimit
  How many already-staged products to re-check per run, stalest first.

.PARAMETER DelayMs
  Pause between page loads. Do not lower this. A fast 800-page crawl in July is
  what got this IP flagged by Akamai in the first place.

.NOTES
  Keep this file ASCII-only. Windows PowerShell 5.1 reads a .ps1 with no BOM as
  cp1252, so a UTF-8 em dash arrives as three bytes ending in 0x94 - a curly
  closing quote, which PowerShell honours as a string delimiter. One em dash in
  a string inverts every quote in the rest of the file, and it still parses.
#>
param(
    [int]$NewLimit = 100,
    [int]$RefreshLimit = 60,
    [int]$DelayMs = 4000
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "scripts\import\.sync-logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

$Stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$Log = Join-Path $LogDir "noon-$Stamp.log"

function Write-Log($Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
    Write-Output $line
    Add-Content -Path $Log -Value $line -Encoding utf8
}

# A run can outlast its own schedule; the seed passes take half an hour. Two
# Camoufox instances against the same source would double the request rate at
# the retailer and race on the same staging rows.
$Lock = Join-Path $LogDir "noon.lock"
if (Test-Path $Lock) {
    $age = (Get-Date) - (Get-Item $Lock).LastWriteTime
    if ($age.TotalHours -lt 6) {
        Write-Log "A sync started $([int]$age.TotalMinutes) min ago is still running. Skipping."
        exit 0
    }
    Write-Log "Stale lock from $([int]$age.TotalHours)h ago; a previous run died. Continuing."
    Remove-Item $Lock -Force
}
New-Item -ItemType File -Path $Lock -Force | Out-Null

try {
    Set-Location $Root

    # Task Scheduler does not always inherit an interactive PATH.
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($null -eq $npm) {
        Write-Log "npm is not on PATH for this task's user. Set the task to run as your own account, or add Node to the system PATH."
        exit 1
    }

    Write-Log "noon sync starting (new<=$NewLimit refresh<=$RefreshLimit delay=${DelayMs}ms)"

    $env:SITE = "noon"
    $env:CONFIRM_SYNC = "1"
    $env:NEW_LIMIT = "$NewLimit"
    $env:REFRESH_LIMIT = "$RefreshLimit"
    $env:DELAY_MS = "$DelayMs"

    # stderr is captured for us; redirecting a native command's stderr inside
    # PowerShell 5.1 wraps each line in an ErrorRecord and would make a clean
    # run look failed.
    #
    # Not Tee-Object: it writes UTF-16 and takes no -Encoding, so interleaving
    # it with Write-Log's UTF-8 produces a log no tool can read back.
    npm run sync | ForEach-Object {
        $line = [string]$_
        Write-Output $line
        Add-Content -Path $Log -Value $line -Encoding utf8
    }
    $code = $LASTEXITCODE

    if ($code -eq 0) {
        Write-Log "Finished cleanly."
    } else {
        Write-Log "Sync exited $code. The run is recorded in sync_runs; /admin/sync will show it."
    }

    # Keep a fortnight. The database is the real record; these are for reading
    # a stack trace when something breaks.
    Get-ChildItem $LogDir -Filter "noon-*.log" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 14 |
        Remove-Item -Force -ErrorAction SilentlyContinue

    exit $code
}
finally {
    Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}
