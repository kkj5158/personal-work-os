param([string]$RunDirectory = ("F:/artifacts/sleep-auto-server-20261024-" + (Get-Date -Format "HHmmss")), [string[]]$TestFilters = @("com.kafka.backend.sleep.*"))
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$run = $RunDirectory
$pgBin = 'C:/Program Files/PostgreSQL/18/bin'
$port = 55449
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw 'Task PG port occupied; existing owner preserved' }
if (Test-Path -LiteralPath $run) { throw 'Fresh run directory required; existing artifacts preserved' }
New-Item -ItemType Directory -Path $run | Out-Null
$data = Join-Path $run 'pgdata'
& "$pgBin/initdb.exe" -D $data -U sleep_auto_qa --auth-local=trust --auth-host=trust --encoding=UTF8 --no-locale *> (Join-Path $run 'initdb.log')
if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
$server = Start-Process -FilePath "$pgBin/postgres.exe" -ArgumentList @('-D', $data, '-h', '127.0.0.1', '-p', "$port", '-c', 'max_connections=15') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run 'pg.stdout.log') -RedirectStandardError (Join-Path $run 'pg.stderr.log') -PassThru
$testExit = 1
try {
 for ($attempt=0; $attempt -lt 100; $attempt++) {
  & "$pgBin/pg_isready.exe" -h 127.0.0.1 -p $port -U sleep_auto_qa *> $null
  if ($LASTEXITCODE -eq 0) { break }
  if ($server.HasExited) { throw 'Task PG exited before readiness' }
  Start-Sleep -Milliseconds 200
 }
 $owner = [guid]::NewGuid().ToString()
 $sql = "create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('$owner');"
 $sql | & "$pgBin/psql.exe" -h 127.0.0.1 -p $port -U sleep_auto_qa -d postgres -v ON_ERROR_STOP=1 *> (Join-Path $run 'bootstrap.log')
 if ($LASTEXITCODE -ne 0) { throw 'Synthetic auth bootstrap failed' }
 $env:DEV_DB_URL = "jdbc:postgresql://127.0.0.1:$port/postgres"
 $env:DEV_DB_USERNAME = 'sleep_auto_qa'
 $env:DEV_DB_PASSWORD = ''
 $env:APP_DEV_USER_ID = $owner
 $env:JAVA_HOME = 'C:/Program Files/Eclipse Adoptium/jdk-21.0.12.8-hotspot'
 Push-Location (Join-Path $repo 'backend')
 try {
  $filterArgs = @(); foreach ($filter in $TestFilters) { $filterArgs += @('--tests', $filter) }
  & ./gradlew.bat test @filterArgs --max-workers=2 --console=plain *> (Join-Path $run 'tests.log')
  $testExit = $LASTEXITCODE
 } finally { Pop-Location }
} finally {
 $pidLines = Get-Content -LiteralPath (Join-Path $data 'postmaster.pid')
 if ([int]$pidLines[0] -ne $server.Id -or [int]$pidLines[3] -ne $port -or (Resolve-Path $pidLines[1]).Path -ne (Resolve-Path $data).Path) { throw 'Task PG identity mismatch; preserve external process' }
 & "$pgBin/pg_ctl.exe" -D $data -m fast -w -t 45 stop *> (Join-Path $run 'stop.log')
 if ($LASTEXITCODE -ne 0) { throw 'Task PG shutdown failed' }
 $counts = @{tests=0; failures=0; errors=0; skipped=0}
 Get-ChildItem -LiteralPath (Join-Path $repo 'backend/build/test-results/test') -Filter 'TEST-com.kafka.backend.sleep.*.xml' | ForEach-Object {
  [xml]$xml = Get-Content -LiteralPath $_.FullName -Raw
  foreach ($key in @('tests','failures','errors','skipped')) { $counts[$key] += [int]$xml.testsuite.GetAttribute($key) }
 }
 @{database='OWNED_LOOPBACK_SYNTHETIC'; sharedDatabase='NEVER_CONNECTED'; exitCode=$testExit; counts=$counts; postgresStopped=$server.HasExited; retainedData=$data} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $run 'result.json')
}
Get-Content -LiteralPath (Join-Path $run 'result.json')
exit $testExit
