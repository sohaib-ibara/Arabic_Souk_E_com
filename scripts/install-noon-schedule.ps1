<#
.SYNOPSIS
  Register (or remove) the daily noon sync in Windows Task Scheduler.

.DESCRIPTION
  Run once. No administrator rights needed — the task is registered for the
  current user, which is also required: the sync drives a HEADED browser, so it
  only works while that user is logged on.

    powershell -ExecutionPolicy Bypass -File scripts\install-noon-schedule.ps1
    powershell -ExecutionPolicy Bypass -File scripts\install-noon-schedule.ps1 -Remove

  Verify afterwards in Task Scheduler (taskschd.msc) under "Arabic Souk — noon
  sync", or with:

    Get-ScheduledTask -TaskName "Arabic Souk - noon sync"

.PARAMETER At
  Local time to run, 24h. Default 03:30 — outside working hours, and after
  noon's own overnight price updates.

.PARAMETER Remove
  Unregister the task instead of creating it.
#>
param(
    [string]$At = "03:30",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$TaskName = "Arabic Souk - noon sync"

if ($Remove) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Output "No task named '$TaskName' is registered."
    } else {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Output "Removed '$TaskName'."
    }
    return
}

$Root = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $Root "scripts\sync-noon.ps1"
if (-not (Test-Path $Script)) { throw "Cannot find $Script" }

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`"" `
    -WorkingDirectory $Root

$Trigger = New-ScheduledTaskTrigger -Daily -At $At

<#
  RunOnlyIfIdle is deliberately OFF: 03:30 is chosen precisely because nobody is
  using the machine, and an idle check would skip the run if anything happened
  to be active.

  StartWhenAvailable IS on, so a machine that was asleep at 03:30 catches up
  when it wakes rather than silently missing a day.

  The task does NOT wake the machine or run on battery — those are the
  user's own machine's business, and /admin/sync reports a missed run anyway.
#>
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

# Interactive, because the browser is headed. A task registered to run whether
# or not the user is logged on would run in session 0 with no desktop, and the
# browser would fail every night.
$Principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Refreshes noon prices, stock and delivery times into staging. Camoufox, headed — needs this user logged on. See docs/SUPPLIER_SYNC.md." `
    -Force | Out-Null

Write-Output "Registered '$TaskName', daily at $At."
Write-Output ""
Write-Output "  Runs as : $env:USERDOMAIN\$env:USERNAME (must be logged on)"
Write-Output "  Script  : $Script"
Write-Output "  Logs    : scripts\import\.sync-logs\"
Write-Output ""
Write-Output "Test it now without waiting:"
Write-Output "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Output ""
Write-Output "Then check /admin/sync in the app — that is the record that matters."
