param(
    [Parameter(Mandatory=$true)][string]$ConnectionFile,
    [Parameter(Mandatory=$true)][datetimeoffset]$ExpiresAt,
    [switch]$RegisterTask
)
$ErrorActionPreference='Stop'
if($ExpiresAt -le [datetimeoffset]::UtcNow -or $ExpiresAt -gt [datetimeoffset]::UtcNow.AddDays(8)){throw 'Invalid connection expiry'}
$credential=(Get-Content -LiteralPath $ConnectionFile -Raw).Trim()
if($credential -notmatch '^[A-Za-z0-9_-]{43}$'){throw 'Invalid scoped worker connection file'}
$root=Join-Path $env:LOCALAPPDATA 'TEAM_KAFKA/StudyWorkerProd'
$marker=Join-Path $root 'connection.json'
if((Test-Path -LiteralPath $root) -and !(Test-Path -LiteralPath $marker) -and (Get-ChildItem -LiteralPath $root -Force | Measure-Object).Count){throw 'Existing unrecognized destination preserved'}
New-Item -ItemType Directory -Path $root -Force | Out-Null
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $root /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Private directory protection failed'}
$source=Split-Path -Parent $PSScriptRoot
foreach($name in @('worker.mjs','adapters.mjs','schema.mjs')){Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $root $name) -Force}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Run-StudyProdWorker.ps1') -Destination (Join-Path $root 'Run-StudyProdWorker.ps1') -Force
[IO.File]::WriteAllText((Join-Path $root 'token.txt'),$credential)
$node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
if(!$node -or !(Test-Path -LiteralPath $node -PathType Leaf)){throw 'Installed Node executable required'}
$codex=(Get-Command codex -CommandType Application | Where-Object {$_.Source.EndsWith('.exe')} | Select-Object -First 1).Source
if(!$codex){throw 'Installed Codex executable required'}
[pscustomobject]@{ version=1; server='https://personal-work-os-prod-production.up.railway.app'; expiresAt=$ExpiresAt.ToUniversalTime().ToString('o'); node=$node; codexDirectory=(Split-Path -Parent $codex); codexHome=$env:CODEX_HOME; provider='codex'; paid='disabled' } |
    ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
$taskName='TEAM_KAFKA_STUDY_PROD_WORKER'
if($RegisterTask){
    $description='Owner-authorized POS STUDY production outbound Codex worker; interactive owner only; no password stored.'
    $existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if($existing -and $existing.Description -ne $description){throw 'Existing foreign scheduled task preserved'}
    $executable=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $action=New-ScheduledTaskAction -Execute $executable -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $root 'Run-StudyProdWorker.ps1')+'"') -WorkingDirectory $root
    $triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $identity),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)))
    $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description $description -Force | Out-Null
}
[pscustomobject]@{installed=$true;taskRegistered=[bool]$RegisterTask;taskName=$taskName;expiresAt=$ExpiresAt.ToUniversalTime().ToString('o');passwordStored=$false;inboundPort=$false;paid='disabled'}|ConvertTo-Json
