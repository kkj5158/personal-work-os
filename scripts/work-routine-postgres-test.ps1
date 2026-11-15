$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskData=Join-Path $taskRoot '.qa/work-routine/postgres'
$taskBin='C:\Program Files\PostgreSQL\18\bin'
if(Get-NetTCPConnection -LocalPort 55489 -State Listen -ErrorAction SilentlyContinue){throw 'QA port occupied; existing process preserved'}
New-Item -ItemType Directory -Path (Split-Path $taskData) -Force | Out-Null
if(!(Test-Path -LiteralPath (Join-Path $taskData 'PG_VERSION'))){
 & "$taskBin\initdb.exe" -D $taskData -U routine_test -A trust --no-locale -E UTF8
 if($LASTEXITCODE -ne 0){throw 'Isolated initdb failed'}
}
& "$taskBin\pg_ctl.exe" -D $taskData -l (Join-Path (Split-Path $taskData) 'postgres.log') -o '-h 127.0.0.1 -p 55489 -c max_connections=12' -w start
if($LASTEXITCODE -ne 0){throw 'Isolated PostgreSQL startup failed'}
try {
 & "$taskBin\createdb.exe" -h 127.0.0.1 -p 55489 -U routine_test routine_test
 $env:JAVA_HOME='C:\Program Files\Java\jdk-21'
 $env:WORK_ROUTINE_TEST_DB='jdbc:postgresql://127.0.0.1:55489/routine_test'
 Push-Location (Join-Path $taskRoot 'backend')
 try {& .\gradlew.bat test --tests 'com.kafka.backend.workflow.WorkRoutineTest' --rerun-tasks --max-workers=2 --console=plain; $taskCode=$LASTEXITCODE} finally {Pop-Location}
} finally {
 & "$taskBin\pg_ctl.exe" -D $taskData -m fast -w stop
 Remove-Item Env:WORK_ROUTINE_TEST_DB -ErrorAction SilentlyContinue
}
exit $taskCode
