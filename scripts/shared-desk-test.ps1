$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskData=Join-Path $taskRoot '.qa/shared-desk/postgres'
$taskBin='C:\Program Files\PostgreSQL\18\bin'
if(Get-NetTCPConnection -LocalPort 55487 -State Listen -ErrorAction SilentlyContinue){throw 'Test port occupied; existing process preserved'}
New-Item -ItemType Directory -Path (Split-Path $taskData) -Force | Out-Null
'allprojects { layout.buildDirectory.set(file(rootProject.projectDir.toPath().resolve("../.qa/core-build").toFile())) }' | Set-Content -LiteralPath (Join-Path (Split-Path $taskData) 'core-build.init.gradle') -Encoding utf8
if(!(Test-Path -LiteralPath (Join-Path $taskData 'PG_VERSION'))){& "$taskBin\initdb.exe" -D $taskData -U desk_test -A trust --no-locale -E UTF8; if($LASTEXITCODE -ne 0){throw 'Isolated initdb failed'}}
& "$taskBin\pg_ctl.exe" -D $taskData -l (Join-Path (Split-Path $taskData) 'postgres.log') -o '-h 127.0.0.1 -p 55487 -c max_connections=12' -w start
if($LASTEXITCODE -ne 0){throw 'Isolated PostgreSQL startup failed'}
try{
 $env:JAVA_HOME='C:\Program Files\Java\jdk-21';$env:SHARED_DESK_TEST_DB='jdbc:postgresql://127.0.0.1:55487/postgres'
 Push-Location (Join-Path $taskRoot 'backend')
 try{& .\gradlew.bat -I ..\.qa\shared-desk\core-build.init.gradle test --tests 'com.kafka.backend.shareddesk.DeskServicePostgresTest' --tests 'com.kafka.backend.shareddesk.DeskFilesPostgresTest' --console=plain; $taskCode=$LASTEXITCODE}finally{Pop-Location}
}finally{& "$taskBin\pg_ctl.exe" -D $taskData -m fast -w stop;Remove-Item Env:SHARED_DESK_TEST_DB -ErrorAction SilentlyContinue}
exit $taskCode
