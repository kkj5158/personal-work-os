param([Parameter(Mandatory=$true)][ValidateSet('DEV','PROD')][string]$Environment,[ValidateSet('TEAM_KAFKA','CODEX_LEGACY')][string]$Producer='TEAM_KAFKA')
$ErrorActionPreference='Stop'
if($Producer-eq'CODEX_LEGACY'-and$Environment-ne'PROD'){throw 'NO_DEV_CODEX_KEY_ASSUMED'}
$root=Split-Path $PSScriptRoot -Parent;$privateDir=Join-Path $root '.qa/producer-canaries';New-Item -ItemType Directory -Path $privateDir -Force|Out-Null
$devReceipt=Join-Path $privateDir 'DEV-TEAM_KAFKA-receipt.json'
if($Environment-eq'PROD'-and(!(Test-Path $devReceipt)-or(Get-Content $devReceipt -Raw|ConvertFrom-Json).status-ne'PASS')){throw 'ISOLATED_DEV_DELIVERY_REQUIRED_FIRST'}
$name=$Environment+'-'+$Producer;$requestPath=Join-Path $privateDir ($name+'-request.json');$receiptPath=Join-Path $privateDir ($name+'-receipt.json')
$namespace=if($Producer-eq'TEAM_KAFKA'){'team-kafka'}else{'codex-local'}
if(!(Test-Path $requestPath)){
 $event=[Guid]::NewGuid().ToString();@{operationId=[Guid]::NewGuid().ToString();id=[Guid]::NewGuid().ToString();action=('SYNTHETIC WORK QUEUE connection QA '+$Producer);source=@{kind=if($Producer-eq'TEAM_KAFKA'){'TEAM_KAFKA'}else{'CODEX_DESKTOP'};producer=$namespace;intent='RESPONSE_COMPLETED';generation=$event;reference=('work-queue-mcp-release-qa/'+$event);completionPolicy='ACK_ONLY'}}|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8NoBOM $requestPath
}
$secondaryPath=Join-Path $privateDir ($name+'-same-source-request.json')
if(!(Test-Path $secondaryPath)){$second=Get-Content $requestPath -Raw|ConvertFrom-Json;$second.operationId=[Guid]::NewGuid().ToString();$second.id=[Guid]::NewGuid().ToString();$second|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8NoBOM $secondaryPath}
$keyName=if($Producer-eq'TEAM_KAFKA'){'producer-token-'+$Environment.ToLowerInvariant()+'.bin'}else{'producer-token-prod-codex-misclassified-20261006.bin'}
Add-Type -AssemblyName System.Security
$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $env:LOCALAPPDATA ('com.studiokafka.workqueue/operational/'+$keyName))),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$priorToken=$env:WORK_QUEUE_PRODUCER_TOKEN;$priorEnvironment=$env:WORK_QUEUE_API_ENV
try{
 $env:WORK_QUEUE_PRODUCER_TOKEN=[Text.Encoding]::UTF8.GetString($clear);$env:WORK_QUEUE_API_ENV=$Environment.ToLowerInvariant();$results=@()
 foreach($path in @($requestPath,$requestPath,$secondaryPath)){
  $output=& 'C:\Users\JIUU\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:/DEV_Space/work-queue-worktrees/persistent-pairing-20261117/tools/agent-create.mjs' --request $path 2>&1|Out-String
  if($LASTEXITCODE-ne0){throw 'CANARY_DELIVERY_FAILED_OR_UNKNOWN_KEEP_ORIGINAL_REQUEST'};$results+=($output|ConvertFrom-Json)
 }
 if(@($results.itemId|Select-Object -Unique).Count-ne1-or@($results.sourceKey|Select-Object -Unique).Count-ne1-or$results[0].queueRevision-ne$results[1].queueRevision){throw 'CANARY_DEDUPE_FAILED'}
 $receipt=@{environment=$Environment;producer=$Producer;namespace=$namespace;status='PASS';observedAt=[DateTimeOffset]::UtcNow.ToString('o');itemId=$results[0].itemId;sourceKey=$results[0].sourceKey;identicalOperationReplay=$true;newOperationSameSourceDedupe=$true;automaticCollectorDelivery='NOT_PROVEN_BY_SCOPED_TRANSPORT_CANARY';cleanup='PENDING_EXACT_MCP_HIDE';secretPrinted=$false}
 $receipt|ConvertTo-Json|Set-Content -Encoding utf8 $receiptPath;$receipt|ConvertTo-Json
}finally{$env:WORK_QUEUE_PRODUCER_TOKEN=$priorToken;$env:WORK_QUEUE_API_ENV=$priorEnvironment;[Array]::Clear($clear,0,$clear.Length);$output=$null}
