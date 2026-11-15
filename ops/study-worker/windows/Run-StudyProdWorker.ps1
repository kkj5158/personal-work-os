$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $root 'connection.json') -Raw | ConvertFrom-Json
$statusPath = Join-Path $root 'status.json'
function Save-Status($state, $events = @()) {
    [pscustomobject]@{ observedAt=[datetimeoffset]::UtcNow.ToString('o'); state=$state; events=$events } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding utf8
}
if ($config.server -ne 'https://personal-work-os-prod-production.up.railway.app') { Save-Status 'CONFIGURATION_REJECTED'; exit 43 }
if ([datetimeoffset]::Parse($config.expiresAt) -le [datetimeoffset]::UtcNow) { Save-Status 'RECONNECT_REQUIRED'; exit 42 }
$connection = Join-Path $root 'token.txt'
if (!(Test-Path -LiteralPath $connection)) { Save-Status 'CONNECTION_FILE_MISSING'; exit 42 }
$env:STUDY_SERVER_URL=$config.server
$env:STUDY_WORKER_TOKEN_FILE=$connection
$env:STUDY_PROVIDER='codex'
$env:STUDY_MAX_JOBS='7'
$env:PATH=$config.codexDirectory+';'+$env:PATH
if($config.codexHome){$env:CODEX_HOME=$config.codexHome}
Remove-Item Env:STUDY_WORKER_TOKEN -ErrorAction SilentlyContinue
Save-Status 'RUNNING'
$events=@()
try {
    # Only allowlisted receipts are retained. Raw CLI/provider diagnostics are discarded.
    $lines = & $config.node (Join-Path $root 'worker.mjs') 2>$null
    $result = $LASTEXITCODE
    foreach($line in $lines) { try { $item=$line | ConvertFrom-Json; if($item.state){ $events += [pscustomobject]@{ id=$item.id; kind=$item.kind; state=$item.state } } } catch {} }
    if($result -ne 0){Save-Status 'WORKER_FAILED_CHECK_OWNER_UI' $events;exit 1}
    Save-Status 'COMPLETED' $events
} catch { Save-Status 'WORKER_FAILED_CHECK_OWNER_UI'; exit 1 }
