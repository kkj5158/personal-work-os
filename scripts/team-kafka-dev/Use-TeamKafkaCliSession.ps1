#requires -Version 7.0
$ErrorActionPreference='Stop'
$cli=Join-Path $PSScriptRoot 'node_modules\@railway\cli\bin\railway.exe'
if(!(Test-Path -LiteralPath $cli)){throw 'Run Install-TeamKafkaDev.ps1 first, then use the installed copy of this script.'}
$identityRaw=& $cli api 'query { me { id } }' --compact 2>$null
if($LASTEXITCODE -ne 0){throw 'CLI_LOGIN_REQUIRED: complete the official railway login browserless flow.'}
$identity=$identityRaw|ConvertFrom-Json
$statusRaw=& $cli status --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --json 2>$null
if($LASTEXITCODE -ne 0){throw 'CLI_DEV_PROJECT_ACCESS_REQUIRED'}
$status=$statusRaw|ConvertFrom-Json
if(!$identity.data.me.id -or $status.id -cne '2b52b232-38b2-44b6-b97e-4caba54f90bc'){throw 'CLI_IDENTITY_OR_PROJECT_MISMATCH'}
$dir=Join-Path $env:USERPROFILE '.railway'
$file=Join-Path $dir 'config.json'
foreach($path in @($dir,$file)){if((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CLI_CONFIG_REPARSE_POINT_REJECTED'}}
& cipher.exe /E /B $dir|Out-Null
if($LASTEXITCODE -ne 0){throw 'EFS_DIRECTORY_REQUIRED: use a scoped DPAPI project token on unsupported Windows editions'}
(Get-Item -LiteralPath $file).Encrypt()
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
& icacls.exe $dir /inheritance:r /grant:r ('*'+$sid.Value+':(OI)(CI)(F)') '*S-1-5-18:(OI)(CI)(F)' /Q|Out-Null
if($LASTEXITCODE -ne 0){throw 'CLI_DIRECTORY_ACL_FAILED'}
& icacls.exe $file /inheritance:r /grant:r ('*'+$sid.Value+':(F)') '*S-1-5-18:(F)' /Q|Out-Null
if($LASTEXITCODE -ne 0){throw 'CLI_FILE_ACL_FAILED'}
$allowed=@($sid.Value,'S-1-5-18')
foreach($path in @($dir,$file)){foreach($rule in (Get-Acl -LiteralPath $path).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.IdentityReference.Value -notin $allowed){throw 'CLI_UNEXPECTED_ACL: preserve existing rule and inspect before proceeding'}}}
@{mode='CliSessionEfs';userId=$identity.data.me.id;projectId='2b52b232-38b2-44b6-b97e-4caba54f90bc';environmentId='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'auth-mode.json') -Encoding UTF8
Write-Output 'EXPLICIT_CLI_SESSION_CONFIGURED: owner identity bound; EFS and user/SYSTEM ACL protected'
