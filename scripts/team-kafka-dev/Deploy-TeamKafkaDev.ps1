#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
 [Parameter(Mandatory)][string]$RepositoryPath,
 [Parameter(Mandatory)][string]$ValidationResult,
 [ValidateSet('Preflight','Deploy','Verify')][string]$Phase='Preflight'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'TeamKafkaRailway.psm1') -Force
$project='2b52b232-38b2-44b6-b97e-4caba54f90bc'
$environment='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c'
$services=@(@{id='eba7d263-7dc3-448a-a6b8-c2994721b597';name='workflow-api-development';root='/backend'},@{id='b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae';name='workflow-web-development';root='/frontend'})
function Invoke-ReleaseGit([string[]]$Arguments){$r=& git.exe -C $RepositoryPath @Arguments;if($LASTEXITCODE -ne 0){throw 'GIT_VALIDATION_FAILED'};return ($r -join "`n").Trim()}
if((Invoke-ReleaseGit -Arguments @('config','--get','remote.origin.url')) -notmatch 'github\.com[:/]kkj5158/personal-work-os(?:\.git)?$'){throw 'REPOSITORY_REJECTED'}
if((Invoke-ReleaseGit -Arguments @('rev-parse',($Commit+'^{commit}'))) -cne $Commit){throw 'COMMIT_NOT_FOUND'}
$null=Invoke-ReleaseGit -Arguments @('fetch','origin','dev')
$null=Invoke-ReleaseGit -Arguments @('merge-base','--is-ancestor',$Commit,'origin/dev')
$proof=Get-Content -LiteralPath $ValidationResult -Raw|ConvertFrom-Json
if($proof.revision -cne $Commit -or $proof.status -cne 'PASS' -or $proof.dirty -ne $false -or $proof.cleanup -cne 'PASS'){throw 'EXACT_COMMIT_VALIDATION_REQUIRED'}
foreach($name in @('backend-tests','real-api-browser')){if(!@($proof.checks|Where-Object {$_.name -ceq $name -and $_.status -ceq 'PASS'}).Count){throw ('MISSING_VALIDATION: '+$name)}}
$buildLog=Join-Path (Split-Path $ValidationResult) 'frontend-build.log'
if(!(Test-Path -LiteralPath $buildLog) -or !(Select-String -LiteralPath $buildLog -Pattern 'Compiled successfully' -Quiet)){throw 'FRONTEND_BUILD_EVIDENCE_REQUIRED'}
$migrationBlob=Invoke-ReleaseGit -Arguments @('rev-parse',($Commit+':backend/src/main/resources/db/migration/V100__money_unified_bookkeeping.sql'))
if($migrationBlob -cne '04240c87a965d0ecf7633fd528371c42dd4f47d6'){throw 'V100_CHANGED: migration review required before this workflow is updated'}
Write-Output ('LOCAL_PREFLIGHT_PASS '+$Commit+'; exact-commit tests and additive V100 verified')
$token=Get-TeamKafkaToken
$lock=$null
try {
 $scope=Assert-TeamKafkaScope $token
 $status=Invoke-TeamKafkaCli -Arguments @('status','--project',$project,'--environment',$environment,'--json') -Token $token
 $serialized=$status|ConvertTo-Json -Depth 100 -Compress
 foreach($service in $services){if(!$serialized.Contains($service.id) -or !$serialized.Contains($service.name)){throw 'DEV_SERVICE_IDENTITY_MISMATCH'}}
 $null=Invoke-TeamKafkaCli -Arguments @('link','--project',$project,'--environment',$environment,'--json') -Token $token
 $configuration=Invoke-TeamKafkaCli -Arguments @('environment','config','--environment',$environment,'--json') -Token $token
 foreach($service in $services){$current=$configuration.services.($service.id);if($current.source.repo -cne 'kkj5158/personal-work-os' -or $current.source.rootDirectory -cne $service.root){throw 'SOURCE_CONFIGURATION_MISMATCH'}}
 if($Phase -ceq 'Preflight'){Write-Output 'DEV_PREFLIGHT_PASS: authenticated project, fixed Development target and both GitHub services';return}
 $common=Invoke-ReleaseGit -Arguments @('rev-parse','--path-format=absolute','--git-common-dir')
 $lockPath=Join-Path $common 'pos-central-qa.lock'
 $lock=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read)
 $lockOwner=@{runId=[guid]::NewGuid().ToString();pid=$PID;worktree=$RepositoryPath;revision=$Commit;system='team-kafka-dev-release';startedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json
 $bytes=[Text.Encoding]::UTF8.GetBytes($lockOwner);$lock.Write($bytes);$lock.Flush()
 if($Phase -ceq 'Deploy'){
  $alreadyLive=$true
  foreach($service in $services){
   $currentDeployments=@(Invoke-TeamKafkaCli -Arguments @('deployment','list','--project',$project,'--environment',$environment,'--service',$service.id,'--limit','1','--json') -Token $token)
   if(!$currentDeployments.Count -or $currentDeployments[0].status -cne 'SUCCESS' -or $currentDeployments[0].meta.commitHash -cne $Commit){$alreadyLive=$false}
  }
  if($alreadyLive){Write-Output 'EXACT_COMMIT_ALREADY_LIVE: duplicate deployment skipped'}else{
  # Explicit patch only: preserve GitHub builds, roots, variables and all other environments.
  $patch=@{services=@{}}
  foreach($service in $services){$patch.services[$service.id]=@{source=@{repo='kkj5158/personal-work-os';branch='dev';commitSha=$Commit}}}
  $response=Invoke-TeamKafkaCli -Arguments @('environment','edit','--project',$project,'--environment',$environment,'--message',('TEAM KAFKA DEV '+$Commit),'--json') -Token $token -InputText ($patch|ConvertTo-Json -Depth 8 -Compress)
  if(!$response.committed -or $response.environmentId -cne $environment){throw 'DEV_COMMIT_NOT_CONFIRMED'}
  Write-Output ('DEV_DEPLOY_TRIGGERED '+$Commit)
  }
 }
 $final=@();$deadline=[DateTime]::UtcNow.AddMinutes(25)
 do {
  $final=@();$complete=$true
  foreach($service in $services){
   $deployments=Invoke-TeamKafkaCli -Arguments @('deployment','list','--project',$project,'--environment',$environment,'--service',$service.id,'--limit','10','--json') -Token $token
   $latest=@($deployments)
   if(!$latest.Count){$complete=$false;continue}
   $d=$latest[0]
   if(!($d.PSObject.Properties.Name -contains 'meta') -or !$d.meta -or !($d.meta.PSObject.Properties.Name -contains 'commitHash') -or $d.meta.commitHash -cne $Commit){
    if($Phase -ceq 'Verify'){throw ('LATEST_COMMIT_MISMATCH '+$service.name)}
    $complete=$false;continue
   }
   if($d.status -in @('FAILED','CRASHED','REMOVED','SKIPPED')){throw ('DEV_DEPLOYMENT_FAILED '+$service.name+' '+$d.id)}
   if($d.status -cne 'SUCCESS'){$complete=$false}
   $final+=@{service=$service.name;deploymentId=$d.id;status=$d.status;commit=$d.meta.commitHash}
  }
  if($complete){break}
  if([DateTime]::UtcNow -gt $deadline){throw 'DEV_DEPLOYMENT_MONITOR_TIMEOUT'}
  Write-Output ('DEV_BUILD_PENDING '+[DateTime]::UtcNow.ToString('o'));Start-Sleep -Seconds 15
 }while($true)
 $api=Invoke-RestMethod 'https://workflow-api-development-development.up.railway.app/actuator/health' -TimeoutSec 30
 if($api.status -cne 'UP'){throw 'DEV_API_UNHEALTHY'}
 $web=Invoke-WebRequest 'https://workflow-web-development-development.up.railway.app/login' -TimeoutSec 30
 if($web.StatusCode -ne 200){throw 'DEV_WEB_UNHEALTHY'}
 $report=@{at=[DateTime]::UtcNow.ToString('o');project=$project;environment=$environment;commit=$Commit;deployments=$final;apiHealth='UP';webHealth=200;prodTouched=$false;migration='Inspect Flyway runtime logs separately; health does not prove migration version'}
 $dir=Join-Path $PSScriptRoot 'reports';$null=New-Item -ItemType Directory -Force -Path $dir
 $report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $dir ($Commit+'.json'))
 $report|ConvertTo-Json -Depth 8
}finally{if($lock){$lock.Dispose();Remove-Item -LiteralPath $lockPath};$token.Dispose()}


