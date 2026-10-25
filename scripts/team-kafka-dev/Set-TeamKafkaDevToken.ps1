#requires -Version 7.0
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'TeamKafkaRailway.psm1') -Force
$secret=Read-Host 'Paste only the Personal Work OS Development Project Token (hidden input)' -AsSecureString
try {$scope=Assert-TeamKafkaScope $secret;Protect-TeamKafkaToken $secret;Write-Output ('DEV_TOKEN_SECURED: '+$scope.environmentId)} finally {$secret.Dispose()}
