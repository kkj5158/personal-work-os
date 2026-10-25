#requires -Version 7.0
$ErrorActionPreference='Stop'
$target=Join-Path $env:LOCALAPPDATA 'TEAM_KAFKA\RailwayDev'
$null=New-Item -ItemType Directory -Force -Path $target
& npm.cmd install --prefix $target --save-exact '@railway/cli@5.71.0' --no-audit --no-fund
if($LASTEXITCODE -ne 0){throw 'RAILWAY_CLI_INSTALL_FAILED'}
foreach($name in @('TeamKafkaRailway.psm1','Deploy-TeamKafkaDev.ps1','Set-TeamKafkaDevToken.ps1','Use-TeamKafkaCliSession.ps1')){
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $target $name) -Force
}
& (Join-Path $target 'node_modules\.bin\railway.cmd') --version
Write-Output ('Installed dedicated DEV tooling: '+$target)
