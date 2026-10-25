#requires -Version 7.0
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach($name in @('Deploy-TeamKafkaDev.ps1','Set-TeamKafkaDevToken.ps1','Install-TeamKafkaDev.ps1','TeamKafkaRailway.psm1')){
 $parseErrors=$null
 $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$null,[ref]$parseErrors)
 if($parseErrors){throw ('SYNTAX_FAILED '+$name)}
}
Import-Module (Join-Path $PSScriptRoot 'TeamKafkaRailway.psm1') -Force
$module=Get-Module TeamKafkaRailway
$dir=Join-Path ([IO.Path]::GetTempPath()) ('team-kafka-guard-'+[guid]::NewGuid())
$secret=ConvertTo-SecureString 'NON_SECRET_GUARD_FIXTURE' -AsPlainText -Force
try {
 & $module {param($file) $script:Secret=$file} (Join-Path $dir 'fixture.dpapi')
 Protect-TeamKafkaToken $secret
 $cipher=Get-Content -LiteralPath (Join-Path $dir 'fixture.dpapi') -Raw
 if($cipher.Contains('NON_SECRET_GUARD_FIXTURE')){throw 'DPAPI_PLAINTEXT_LEAK'}
 $roundtrip=Get-TeamKafkaToken
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($roundtrip)
 try{if([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -cne 'NON_SECRET_GUARD_FIXTURE'){throw 'DPAPI_ROUNDTRIP_FAILED'}}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$roundtrip.Dispose()}
 if(!(Get-Acl -LiteralPath $dir).AreAccessRulesProtected){throw 'SECRET_DIRECTORY_INHERITANCE_NOT_DISABLED'}
 if(!(Get-Acl -LiteralPath (Join-Path $dir 'fixture.dpapi')).AreAccessRulesProtected){throw 'SECRET_FILE_INHERITANCE_NOT_DISABLED'}
 & $module {function script:Invoke-TeamKafkaGraphql {return @{projectToken=@{projectId='2b52b232-38b2-44b6-b97e-4caba54f90bc';environmentId='PRODUCTION_GUARD_FIXTURE'}}}}
 $denied=$false;try{$null=Assert-TeamKafkaScope $secret}catch{if($_.Exception.Message -like 'TOKEN_SCOPE_REJECTED*'){$denied=$true}else{throw}}
 if(!$denied){throw 'PROD_SCOPE_WAS_NOT_REJECTED'}
 & $module {function script:Invoke-TeamKafkaGraphql {return @{projectToken=@{projectId='UNRELATED_PROJECT';environmentId='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c'}}}}
 $denied=$false;try{$null=Assert-TeamKafkaScope $secret}catch{if($_.Exception.Message -like 'TOKEN_SCOPE_REJECTED*'){$denied=$true}else{throw}}
 if(!$denied){throw 'UNRELATED_PROJECT_WAS_NOT_REJECTED'}
 $denied=$false;try{$null=Invoke-TeamKafkaCli -Arguments @('status','--project','2b52b232-38b2-44b6-b97e-4caba54f90bc','--environment','PRODUCTION_GUARD_FIXTURE','--json') -Token $secret}catch{if($_.Exception.Message -like 'RAILWAY_COMMAND_SCOPE_REJECTED*'){$denied=$true}else{throw}}
 if(!$denied){throw 'PROD_COMMAND_WAS_NOT_REJECTED'}
 $denied=$false;try{$null=Invoke-TeamKafkaCli -Arguments @('delete','--yes') -Token $secret}catch{if($_.Exception.Message -like 'RAILWAY_COMMAND_SCOPE_REJECTED*'){$denied=$true}else{throw}}
 if(!$denied){throw 'DESTRUCTIVE_COMMAND_WAS_NOT_REJECTED'}
 [ordered]@{status='PASS';checks=@('PowerShell syntax','DPAPI ciphertext and conversion roundtrip','restricted secret-directory/file ACL','reject PROD token scope','reject unrelated project token scope','reject PROD target command before process launch','reject destructive command before process launch');networkMutations=0;credentialFixture='nonsecret'}|ConvertTo-Json
}finally{
 $secret.Dispose()
 if((Split-Path $dir) -eq [IO.Path]::GetTempPath().TrimEnd('\') -and (Split-Path $dir -Leaf) -like 'team-kafka-guard-*'){Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue}
 Remove-Module TeamKafkaRailway
}
