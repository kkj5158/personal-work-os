Set-StrictMode -Version Latest
$script:Project='2b52b232-38b2-44b6-b97e-4caba54f90bc'
$script:Environment='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c'
$script:Secret=Join-Path $PSScriptRoot 'secrets\development-project-token.dpapi'
$script:SessionMode=$false
function Protect-TeamKafkaToken([Security.SecureString]$Value) {
 $dir=Split-Path $script:Secret
 $null=New-Item -ItemType Directory -Force -Path $dir
 if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'SECRET_DIRECTORY_REPARSE_POINT_REJECTED'}
 $acl=Get-Acl -LiteralPath $dir
 $acl.SetAccessRuleProtection($true,$false)
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
 $acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('SYSTEM','FullControl','ContainerInherit,ObjectInherit','None','Allow')))
 Set-Acl -LiteralPath $dir -AclObject $acl
 $Value|ConvertFrom-SecureString|Set-Content -LiteralPath $script:Secret -Encoding UTF8
 $fileAcl=New-Object Security.AccessControl.FileSecurity
 $fileAcl.SetAccessRuleProtection($true,$false)
 $fileAcl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
 $fileAcl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('SYSTEM','FullControl','Allow')))
 Set-Acl -LiteralPath $script:Secret -AclObject $fileAcl
}
function Invoke-TeamKafkaGraphql([string]$Query,[Security.SecureString]$Token) {
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Token)
 try {
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  try {$r=Invoke-RestMethod -Uri 'https://backboard.railway.com/graphql/v2' -Method Post -ContentType 'application/json' -Headers @{'Project-Access-Token'=$plain} -Body (@{query=$Query}|ConvertTo-Json -Compress) -TimeoutSec 45} catch {throw 'Railway API authentication/transport failed; secret suppressed.'}
  if($r.PSObject.Properties.Name -contains 'errors'){throw 'Railway GraphQL returned errors; raw response suppressed.'}
  return $r.data
 } finally {$plain=$null;[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
}
function Assert-TeamKafkaScope([Security.SecureString]$Token) {
 if($script:SessionMode){
  $mode=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'auth-mode.json') -Raw|ConvertFrom-Json
  $identity=Invoke-TeamKafkaCli -Arguments @('api','query { me { id } }','--compact') -Token $Token
  if(!$mode.userId -or $identity.data.me.id -cne $mode.userId){throw 'CLI_SESSION_IDENTITY_REJECTED'}
  $status=Invoke-TeamKafkaCli -Arguments @('status','--project',$script:Project,'--environment',$script:Environment,'--json') -Token $Token
  if($status.id -cne $script:Project){throw 'CLI_SESSION_PROJECT_REJECTED'}
  return @{projectId=$script:Project;environmentId=$script:Environment;credential='Owner-authorized CLI OAuth session; EFS protected; wrapper DEV scope'}
 }
 $scope=(Invoke-TeamKafkaGraphql 'query { projectToken { projectId environmentId } }' $Token).projectToken
 if($scope.projectId -cne $script:Project -or $scope.environmentId -cne $script:Environment){throw 'TOKEN_SCOPE_REJECTED: only this project Development token is allowed.'}
 return $scope
}
function Get-TeamKafkaToken {
 $script:SessionMode=$false
 if(!(Test-Path -LiteralPath $script:Secret)){
  $modePath=Join-Path $PSScriptRoot 'auth-mode.json'
  if(!(Test-Path -LiteralPath $modePath)){throw 'DEV_AUTH_NOT_CONFIGURED: complete approved Railway authentication; no implicit fallback.'}
  $mode=Get-Content -LiteralPath $modePath -Raw|ConvertFrom-Json
  if($mode.mode -cne 'CliSessionEfs' -or $mode.projectId -cne $script:Project -or $mode.environmentId -cne $script:Environment){throw 'AUTH_MODE_REJECTED'}
  $script:SessionMode=$true
  return (ConvertTo-SecureString 'CLI_SESSION_HANDLE_NO_TOKEN' -AsPlainText -Force)
 }
 if((Get-Item -LiteralPath $script:Secret).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'SECRET_FILE_REPARSE_POINT_REJECTED'}
 return ((Get-Content -LiteralPath $script:Secret -Raw).Trim()|ConvertTo-SecureString)
}
function Invoke-TeamKafkaCli([string[]]$Arguments,[Security.SecureString]$Token,[string]$InputText='') {
 $ok=$false
 if($Arguments.Count -eq 3 -and $Arguments[0] -ceq 'api' -and $Arguments[1] -ceq 'query { me { id } }' -and $Arguments[2] -ceq '--compact'){$ok=$true}
 if($Arguments.Count -eq 6 -and $Arguments[0] -cin @('status','link') -and $Arguments[1] -ceq '--project' -and $Arguments[2] -ceq $script:Project -and $Arguments[3] -ceq '--environment' -and $Arguments[4] -ceq $script:Environment -and $Arguments[5] -ceq '--json'){$ok=$true}
 if($Arguments.Count -eq 5 -and ($Arguments[0..2] -join ' ') -ceq 'environment config --environment' -and $Arguments[3] -ceq $script:Environment -and $Arguments[4] -ceq '--json'){$ok=$true}
 if($Arguments.Count -eq 11 -and ($Arguments[0..2] -join ' ') -ceq 'deployment list --project' -and $Arguments[3] -ceq $script:Project -and $Arguments[4] -ceq '--environment' -and $Arguments[5] -ceq $script:Environment -and $Arguments[6] -ceq '--service' -and $Arguments[7] -cin @('eba7d263-7dc3-448a-a6b8-c2994721b597','b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae') -and $Arguments[8] -ceq '--limit' -and $Arguments[9] -cin @('1','10') -and $Arguments[10] -ceq '--json'){$ok=$true}
 if($Arguments.Count -eq 9 -and ($Arguments[0..2] -join ' ') -ceq 'environment edit --project' -and $Arguments[3] -ceq $script:Project -and $Arguments[4] -ceq '--environment' -and $Arguments[5] -ceq $script:Environment -and $Arguments[6] -ceq '--message' -and $Arguments[8] -ceq '--json'){
  $patch=$InputText|ConvertFrom-Json
  $keys=@($patch.PSObject.Properties.Name)
  $serviceKeys=@($patch.services.PSObject.Properties.Name)
  if($keys.Count -ne 1 -or $keys[0] -cne 'services' -or $serviceKeys.Count -ne 2 -or @($serviceKeys|Where-Object {$_ -cnotin @('eba7d263-7dc3-448a-a6b8-c2994721b597','b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae')}).Count){throw 'RAILWAY_PATCH_SCOPE_REJECTED'}
  $commits=@()
  foreach($id in $serviceKeys){$entry=$patch.services.$id;$source=$entry.source;if(@($entry.PSObject.Properties.Name).Count -ne 1 -or @($source.PSObject.Properties.Name).Count -ne 3 -or $source.repo -cne 'kkj5158/personal-work-os' -or $source.branch -cne 'dev' -or $source.commitSha -cnotmatch '^[0-9a-f]{40}$'){throw 'RAILWAY_PATCH_SCOPE_REJECTED'};$commits+=$source.commitSha}
  if($commits[0] -cne $commits[1]){throw 'RAILWAY_PATCH_COMMIT_MISMATCH'}
  $ok=$true
 }
 if(!$ok){throw 'RAILWAY_COMMAND_SCOPE_REJECTED: only fixed DEV read/source-pin operations are supported.'}
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Token)
 try {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=Join-Path $PSScriptRoot 'node_modules\@railway\cli\bin\railway.exe'
  if(!(Test-Path -LiteralPath $info.FileName)){throw 'PINNED_RAILWAY_BINARY_MISSING'}
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.RedirectStandardInput=$true
  $info.WorkingDirectory=Join-Path $PSScriptRoot 'context'
  $null=New-Item -ItemType Directory -Force -Path $info.WorkingDirectory
  foreach($arg in $Arguments){$null=$info.ArgumentList.Add($arg)}
  $info.Environment.Remove('RAILWAY_API_TOKEN')|Out-Null
  $info.Environment.Remove('RAILWAY_TOKEN')|Out-Null
  if($script:SessionMode){
   $authDir=Join-Path $env:USERPROFILE '.railway'
   foreach($file in @($authDir,(Join-Path $authDir 'config.json'))){
    $item=Get-Item -LiteralPath $file
    if(!($item.Attributes -band [IO.FileAttributes]::Encrypted) -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'CLI_CREDENTIAL_EFS_REQUIRED'}
    $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')
    foreach($rule in (Get-Acl -LiteralPath $file).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.IdentityReference.Value -notin $allowed){throw 'CLI_CREDENTIAL_ACL_REJECTED'}}
   }
  }else{$info.Environment['RAILWAY_TOKEN']=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
  $p=New-Object Diagnostics.Process;$p.StartInfo=$info;$null=$p.Start()
  $stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
  if($InputText){$p.StandardInput.Write($InputText)};$p.StandardInput.Close()
  if(!$p.WaitForExit(120000)){$p.Kill();throw 'RAILWAY_COMMAND_TIMEOUT'}
  $output=$stdout.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
  if($p.ExitCode -ne 0){throw ('RAILWAY_COMMAND_FAILED: '+($Arguments[0..([Math]::Min(1,$Arguments.Length-1))] -join ' ')+'; raw output suppressed')}
  return ($output|ConvertFrom-Json -Depth 100)
 } finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
}
Export-ModuleMember -Function Protect-TeamKafkaToken,Invoke-TeamKafkaGraphql,Assert-TeamKafkaScope,Get-TeamKafkaToken,Invoke-TeamKafkaCli
