$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$evidenceRoot='D:\Planning_SPACE\WORK_QUEUE_PLANNING_20261004\09_IMPLEMENTATION\V2'
$names=@('QA_DB_URL','QA_DB_USERNAME','QA_DB_PASSWORD','QA_TOOL_ROOT','QA_EVIDENCE_FILE');$previous=@{};foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
  $raw=& 'C:\Users\JIUU\AppData\Roaming\npm\railway.ps1' variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service eba7d263-7dc3-448a-a6b8-c2994721b597 --json 2>$null
  if($LASTEXITCODE -ne 0){throw 'DEV_VARIABLES_INACCESSIBLE'};$values=($raw -join "`n")|ConvertFrom-Json -AsHashtable
  if($values.RAILWAY_PROJECT_ID -ne '2b52b232-38b2-44b6-b97e-4caba54f90bc' -or $values.RAILWAY_ENVIRONMENT_ID -ne '9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c' -or $values.RAILWAY_SERVICE_ID -ne 'eba7d263-7dc3-448a-a6b8-c2994721b597'){throw 'DEV_SCOPE_MISMATCH'}
  foreach($suffix in @('URL','USERNAME','PASSWORD')){if(-not $values['DEV_DB_'+$suffix]){throw ('DEV_DATABASE_VALUE_UNAVAILABLE_'+$suffix)};[Environment]::SetEnvironmentVariable('QA_DB_'+$suffix,$values['DEV_DB_'+$suffix],'Process')}
  if(-not $env:QA_DB_URL.StartsWith('jdbc:postgresql://')){throw 'INVALID_JDBC_URL'}
  $env:QA_TOOL_ROOT=$taskRoot;$env:QA_EVIDENCE_FILE=Join-Path $evidenceRoot 'DEV_ATTENTION_DATABASE_LATENCY_SAMPLE_20261013.json'
  if(Test-Path -LiteralPath $env:QA_EVIDENCE_FILE){throw 'EVIDENCE_ALREADY_EXISTS'}
  Push-Location (Join-Path $taskRoot 'backend');try{$output=& .\gradlew.bat -I ../qa/attention-latency-inspect.init.gradle qaAttentionLatencyInspect --no-daemon --console=plain --max-workers=2 2>&1;$code=$LASTEXITCODE}finally{Pop-Location}
  $sanitized=($output|ForEach-Object {$_.ToString()}) -join "`n";foreach($value in @($values.Values)|Where-Object {$_ -is [string] -and $_.Length -gt 4}){$sanitized=$sanitized.Replace($value,'[REDACTED]')};[IO.File]::WriteAllText((Join-Path $evidenceRoot 'DEV_ATTENTION_DATABASE_LATENCY_SAMPLE_20261013.log'),$sanitized)
  if($code -ne 0){throw 'READ_ONLY_METRICS_FAILED see sanitized local log'}
  $record=[IO.File]::ReadAllText($env:QA_EVIDENCE_FILE)|ConvertFrom-Json -AsHashtable
  $facts=@{};foreach($key in $values.Keys|Where-Object {$_ -match '^SPRING_DATASOURCE_HIKARI_(MAXIMUM_POOL_SIZE|MINIMUM_IDLE|CONNECTION_TIMEOUT|IDLE_TIMEOUT|MAX_LIFETIME)$'}){$facts[$key]=if($values[$key] -match '^\d+$'){$values[$key]}else{'CONFIGURED_NONNUMERIC'}}
  $record.explicitRailwayPoolSettings=$facts;$record.sourceRevision=(& git -C $taskRoot rev-parse HEAD).Trim();$record|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $env:QA_EVIDENCE_FILE -Encoding utf8
  $record|ConvertTo-Json -Depth 8
}finally{foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}}
