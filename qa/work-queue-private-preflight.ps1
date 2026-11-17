param([Parameter(Mandatory=$true)][ValidateSet('DEV','PROD')][string]$Environment,[Guid[]]$ExcludeIds=@())
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$envId=if($Environment-eq'DEV'){'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c'}else{'c2c20488-311f-4b9e-9ec9-d79508123176'}
$serviceId=if($Environment-eq'DEV'){'eba7d263-7dc3-448a-a6b8-c2994721b597'}else{'e46b58f4-e829-430f-a4c4-b27e24d46f19'}
$appRoot=Join-Path $env:LOCALAPPDATA 'com.studiokafka.workqueue'
$deviceBytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $appRoot ('credential-'+$Environment+'.bin'))),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$saved=@{}
try{
 $device=[Text.Encoding]::UTF8.GetString($deviceBytes)|ConvertFrom-Json
 $raw=& railway variable list -p '2b52b232-38b2-44b6-b97e-4caba54f90bc' -e $envId -s $serviceId --json
 if($LASTEXITCODE-ne0){throw 'PRIVATE_CONFIG_READ_FAILED'};$v=$raw|ConvertFrom-Json;$raw=$null
 if($v.RAILWAY_ENVIRONMENT_ID-ne$envId-or$v.RAILWAY_SERVICE_ID-ne$serviceId){throw 'ENVIRONMENT_IDENTITY_MISMATCH'}
 $prefix=$Environment
 $dbService=if($Environment-eq'DEV'){'0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9'}else{'e0b42e61-9207-4225-83ee-c516edc75202'}
 $dbRaw=& railway variable list -p '2b52b232-38b2-44b6-b97e-4caba54f90bc' -e $envId -s $dbService --json
 if($LASTEXITCODE-ne0){throw 'PRIVATE_DB_CONFIG_READ_FAILED'};$dbVars=$dbRaw|ConvertFrom-Json;$dbRaw=$null
 if($dbVars.RAILWAY_ENVIRONMENT_ID-ne$envId-or$dbVars.RAILWAY_SERVICE_ID-ne$dbService){throw 'DATABASE_IDENTITY_MISMATCH'}
 $databaseUri=[Uri]($v.($prefix+'_DB_URL').Substring(5))
 if($databaseUri.Host-ne$dbVars.RAILWAY_PRIVATE_DOMAIN-or$dbVars.RAILWAY_TCP_PROXY_DOMAIN-notmatch'^[a-z0-9.-]+\.rlwy\.net$'-or[int]$dbVars.RAILWAY_TCP_PROXY_PORT-lt1-or[int]$dbVars.RAILWAY_TCP_PROXY_PORT-gt65535){throw 'EXISTING_DATABASE_PROXY_REQUIRED'}
 $jdbc='jdbc:postgresql://'+$dbVars.RAILWAY_TCP_PROXY_DOMAIN+':'+$dbVars.RAILWAY_TCP_PROXY_PORT+$databaseUri.PathAndQuery
 $labels=@();$hashes=@()
 $keyFiles=@{TEAM_KAFKA=('producer-token-'+$Environment.ToLowerInvariant()+'.bin')}
 if($Environment-eq'PROD'){$keyFiles.CODEX_LEGACY='producer-token-prod-codex-misclassified-20261006.bin'}
 foreach($label in $keyFiles.Keys){$path=Join-Path $appRoot ('operational/'+$keyFiles[$label]);if(Test-Path $path){$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{$labels+=$label;$hashes+=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($clear)).ToLowerInvariant()}finally{[Array]::Clear($clear,0,$clear.Length)}}}
 $private=@{QA_WQ_DB_URL=$jdbc;QA_WQ_DB_USER=$v.($prefix+'_DB_USERNAME');QA_WQ_DB_PASSWORD=$v.($prefix+'_DB_PASSWORD');QA_WQ_OWNER=$device.ownerId;QA_WQ_KEY_LABELS=($labels-join'|');QA_WQ_KEY_HASHES=($hashes-join'|');QA_WQ_EXCLUDE_IDS=($ExcludeIds-join',')}
 foreach($key in $private.Keys){$saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$private[$key],'Process')}
 $jar=Get-ChildItem (Join-Path $env:USERPROFILE '.gradle/caches/modules-2/files-2.1/org.postgresql/postgresql/42.7.11') -Recurse -Filter '*.jar'|Select-Object -First 1 -ExpandProperty FullName
 $result=& 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot\bin\java.exe' -cp $jar (Join-Path $PSScriptRoot 'WorkQueuePrivatePreflight.java') 2>&1
 if($LASTEXITCODE-ne0){$safe=($result|Out-String);foreach($value in $private.Values){if($value-and$value.Length-gt3){$safe=$safe.Replace([string]$value,'[REDACTED]')}};$safe=[regex]::Replace($safe,'(?i)(?:jdbc:)?postgres(?:ql)?://\S+','[DB_URL]');Write-Output $safe.Substring(0,[Math]::Min(1500,$safe.Length));throw 'READ_ONLY_PREFLIGHT_FAILED'}
 [pscustomobject]@{environment=$Environment;observedAt=[DateTimeOffset]::UtcNow.ToString('o');readOnly=$true;facts=@($result|Where-Object {$_-match'^(COUNT|PRESERVATION|MIGRATION|KEY_MATCH)\|'});secretPrinted=$false}|ConvertTo-Json -Depth 4
}finally{foreach($key in $saved.Keys){[Environment]::SetEnvironmentVariable($key,$saved[$key],'Process')};[Array]::Clear($deviceBytes,0,$deviceBytes.Length);$device=$v=$private=$raw=$dbVars=$dbRaw=$null}
