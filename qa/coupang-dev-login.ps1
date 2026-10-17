# Normal DEV GoTrue login. Type credentials here; never paste them into chat.
$ErrorActionPreference = 'Stop'
$authOrigin = 'https://pos-auth-dev-development.up.railway.app'
$apiOrigin = 'https://workflow-api-development-development.up.railway.app'
$outDir = Join-Path $env:LOCALAPPDATA 'PersonalWorkOS-CoupangQA'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$tokenPath = Join-Path $outDir 'dev-access-token.txt'
$credential = Get-Credential -Message 'DEV POS 로그인 — PROD 계정/서버로 전송하지 않습니다'
if (-not $credential) { throw '로그인 입력이 취소되었습니다.' }
try {
  $headers = @{}
  if ($env:COUPANG_DEV_PUBLIC_API_KEY) { $headers.apikey = $env:COUPANG_DEV_PUBLIC_API_KEY }
  $body = @{ email=$credential.UserName; password=$credential.GetNetworkCredential().Password } | ConvertTo-Json -Compress
  $session = Invoke-RestMethod -Uri ($authOrigin + '/auth/v1/token?grant_type=password') -Method Post -ContentType 'application/json' -Headers $headers -Body $body
  if (-not $session.access_token) { throw 'access token이 발급되지 않았습니다.' }
  # The API verifies signature/issuer/owner. This read creates no fixtures.
  $null = Invoke-RestMethod -Uri ($apiOrigin + '/api/money/calendar/templates') -Headers @{Authorization=('Bearer ' + $session.access_token)}
  [IO.File]::WriteAllText($tokenPath, $session.access_token, [Text.UTF8Encoding]::new($false))
  $acl = [Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true,$false)
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','Allow'))
  Set-Acl -LiteralPath $tokenPath -AclObject $acl
  Write-Host 'DEV API 인증 읽기 성공. 비밀값은 출력하지 않았습니다.'
  Write-Host ('COUPANG_DEV_ACCESS_TOKEN_FILE=' + $tokenPath)
} catch {
  if (Test-Path -LiteralPath $tokenPath) { Remove-Item -LiteralPath $tokenPath -Force }
  Write-Host 'DEV 로그인/인증 검증 실패. 비밀 응답은 출력하지 않습니다. 기존 데이터를 변경하지 않았습니다.'
  exit 1
} finally { $body=$null; $credential=$null; $session=$null }
