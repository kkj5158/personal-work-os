param(
  [ValidateSet('DEV','PROD','BOTH')][string]$Only='BOTH',
  [ValidateSet('PREFLIGHT','POST_MIGRATION','REMEDIATION','RELEASE_FINAL','RELEASE_SMOKE','POST_BACKLOG')][string]$Stage='PREFLIGHT'
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$evidenceRoot='D:\Planning_SPACE\WORK_QUEUE_PLANNING_20261004\09_IMPLEMENTATION\V2'
[IO.Directory]::CreateDirectory($evidenceRoot)|Out-Null
$project='2b52b232-38b2-44b6-b97e-4caba54f90bc'
$targets=@(
  @{name='DEV';environment='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c';service='eba7d263-7dc3-448a-a6b8-c2994721b597';prefix='DEV'},
  @{name='PROD';environment='c2c20488-311f-4b9e-9ec9-d79508123176';service='e46b58f4-e829-430f-a4c4-b27e24d46f19';prefix='PROD'}
)
$names=@('QA_DB_URL','QA_DB_USERNAME','QA_DB_PASSWORD','QA_ENVIRONMENT','QA_TOOL_ROOT','QA_MIGRATIONS','QA_EVIDENCE_FILE')
$previous=@{};foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
  foreach($target in $targets){
    if($Only -ne 'BOTH' -and $Only -ne $target.name){continue}
    $raw=& 'C:\Users\JIUU\AppData\Roaming\npm\railway.ps1' variable list --project $project --environment $target.environment --service $target.service --json 2>$null
    if($LASTEXITCODE -ne 0){throw ('RAILWAY_VARIABLES_INACCESSIBLE_'+$target.name)}
    $values=($raw -join "`n")|ConvertFrom-Json -AsHashtable
    if($values.RAILWAY_PROJECT_ID -ne $project -or $values.RAILWAY_ENVIRONMENT_ID -ne $target.environment -or $values.RAILWAY_SERVICE_ID -ne $target.service){throw ('RAILWAY_SCOPE_MISMATCH_'+$target.name)}
    $facts=@{};foreach($suffix in @('URL','USERNAME','PASSWORD')){$key=$target.prefix+'_DB_'+$suffix;$facts[$key]=[bool]$values[$key];if(-not $facts[$key]){throw ('DATABASE_VALUE_UNAVAILABLE_'+$target.name+'_'+$suffix)};[Environment]::SetEnvironmentVariable('QA_DB_'+$suffix,$values[$key],'Process')}
    if(-not $env:QA_DB_URL.StartsWith('jdbc:postgresql://')){throw 'INVALID_JDBC_URL'}
    $env:QA_ENVIRONMENT=$target.name;$env:QA_TOOL_ROOT=$taskRoot;$env:QA_MIGRATIONS=Join-Path $taskRoot 'backend/src/main/resources/db/migration'
    $env:QA_EVIDENCE_FILE=Join-Path $evidenceRoot ('ATTENTION_'+$target.name+'_'+$Stage+'_20261013.json')
    if(Test-Path -LiteralPath $env:QA_EVIDENCE_FILE){throw ('EVIDENCE_ALREADY_EXISTS_'+$target.name+'_'+$Stage)}
    Push-Location (Join-Path $taskRoot 'backend')
    try {$output=& .\gradlew.bat -I ../qa/attention-v2-preflight.init.gradle qaAttentionPreflight --no-daemon --console=plain --max-workers=2 2>&1;$code=$LASTEXITCODE}finally{Pop-Location}
    $sanitized=($output|ForEach-Object {$_.ToString()}) -join "`n"
    foreach($value in @($values.Values)|Where-Object {$_ -is [string] -and $_.Length -gt 4}){$sanitized=$sanitized.Replace($value,'[REDACTED]')}
    [IO.File]::WriteAllText((Join-Path $evidenceRoot ('ATTENTION_'+$target.name+'_'+$Stage+'_20261013.log')),$sanitized)
    if($code -ne 0){throw ('READ_ONLY_PREFLIGHT_FAILED_'+$target.name+' see sanitized local log')}
    $record=[IO.File]::ReadAllText($env:QA_EVIDENCE_FILE)|ConvertFrom-Json -AsHashtable
    $record.environmentScope=@{projectId=$project;environmentId=$target.environment;serviceId=$target.service;variableFacts=$facts}
    $inventory=@();foreach($file in Get-ChildItem -LiteralPath $env:QA_MIGRATIONS -Filter 'V*__*.sql'){$inventory+=@{name=$file.Name;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
    $record.candidateFiles=$inventory
    $record.sourceRevision=(& git -C $taskRoot rev-parse HEAD).Trim()
    if($Stage -eq 'POST_MIGRATION'){
      $baselinePath=Join-Path $evidenceRoot ('ATTENTION_'+$target.name+'_PREFLIGHT_20261013.json')
      $baseline=[IO.File]::ReadAllText($baselinePath)|ConvertFrom-Json -AsHashtable
      $comparison=@{};foreach($key in $baseline.fingerprints.Keys){$comparison[$key]=($record.fingerprints[$key] -eq $baseline.fingerprints[$key])}
      $record.baselineComparison=@{baselineFile=$baselinePath;baselineItemCount=$baseline.counts.attention_items;currentItemCount=$record.counts.attention_items;fingerprintsUnchanged=$comparison;interpretation='A mismatch may reflect concurrent user activity; no migration-loss inference is made from a hash mismatch alone.'}
    }
    $record|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $env:QA_EVIDENCE_FILE -Encoding utf8
    [pscustomobject]@{environment=$target.name;readOnly=$record.transactionReadOnly;flywayValidation=$record.flywayValidationSuccessful;pending=@($record.flywayInfo|Where-Object {$_.state -eq 'PENDING'}).Count;failed=@($record.appliedMigrations|Where-Object {-not $_.success}).Count;items=$record.counts.attention_items;lanes=$record.counts.attention_lanes;operations=$record.counts.attention_operations;evidence=$env:QA_EVIDENCE_FILE}
    $values=$null;$raw=$null
  }
} finally {foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}}
