#requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet('Validate', 'CleanupDryRun', 'Closeout')]
    [string] $Workflow = 'Validate'
)

# Fixed DEV origins. No credential, token, environment or endpoint override parameters.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$authBase = 'https://pos-auth-dev-development.up.railway.app'
$apiBase = 'https://workflow-api-development-development.up.railway.app'
$webBase = 'https://workflow-web-development-development.up.railway.app'
$root = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Kafka\PosDevAuth'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$run = $null
$lock = $null
$tokenPath = $null
$client = $null
$session = $null
$credential = $null
$failure = $null
$oldTokenPath = $env:COUPANG_DEV_ACCESS_TOKEN_FILE
$oldOwner = $env:COUPANG_DEV_EXPECTED_USER_ID
$evidence = [ordered]@{ environment = 'DEV'; workflow = $Workflow; startedUtc = [DateTime]::UtcNow.ToString('o'); status = 'STARTED'; financialLedgerWrites = $false; syntheticCleanupAttempted = $false }

function Assert-LocalPath([string] $Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.StartsWith('\\') -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))).DriveType -ne 'Fixed') { throw 'LOCAL_FIXED_DISK_REQUIRED' }
    $cursor = $full
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -Force -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'REPARSE_PATH_REFUSED' }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
}

function Protect-Directory([string] $Path) {
    Assert-LocalPath $Path
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    $dir = [IO.DirectoryInfo]::new($Path)
    if ($dir.Exists) { [IO.FileSystemAclExtensions]::SetAccessControl($dir, $acl) }
    else { [IO.FileSystemAclExtensions]::Create($dir, $acl) }
    $actual = [IO.FileSystemAclExtensions]::GetAccessControl($dir)
    if (-not $actual.AreAccessRulesProtected) { throw 'PRIVATE_ACL_REQUIRED' }
    foreach ($rule in $actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.IdentityReference -ne $sid -or $rule.AccessControlType -ne 'Allow') { throw 'PRIVATE_ACL_REQUIRED' }
    }
}

function Invoke-DevHttp([string] $Url, [string] $Method = 'GET', [string] $Body, [string] $Token, [string] $ApiKey) {
    $uri = [Uri] $Url
    if ($uri.Scheme -ne 'https' -or $uri.GetLeftPart([UriPartial]::Authority) -notin @($authBase, $apiBase, $webBase)) { throw 'NON_DEV_URL_REFUSED' }
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $uri)
    $response = $null
    try {
        if ($Token) { $request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Token) }
        if ($ApiKey) { [void] $request.Headers.TryAddWithoutValidation('apikey', $ApiKey) }
        if ($Body) { $request.Content = [Net.Http.StringContent]::new($Body, [Text.Encoding]::UTF8, 'application/json') }
        try { $response = $client.SendAsync($request).GetAwaiter().GetResult() }
        catch { throw 'DEV_NETWORK_FAILURE' }
        if (-not $response.IsSuccessStatusCode) {
            # Do not read/log error bodies, headers, or raw exceptions.
            throw ('DEV_HTTP_' + [int] $response.StatusCode)
        }
        return $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    } finally {
        if ($response) { $response.Dispose() }
        $request.Dispose()
    }
}

function Read-Claims([string] $Jwt) {
    $parts = $Jwt.Split('.')
    if ($parts.Count -ne 3) { throw 'INVALID_SESSION' }
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
}

function Assert-SessionFresh {
    if ([DateTimeOffset]::FromUnixTimeSeconds([long] $claims.exp) -lt [DateTimeOffset]::UtcNow.AddMinutes(5)) { throw 'SESSION_EXPIRES_SOON_REAUTHENTICATE' }
}

try {
    if (-not $IsWindows) { throw 'WINDOWS_REQUIRED' }
    Assert-LocalPath $root
    [void] [IO.Directory]::CreateDirectory((Split-Path $root))
    Protect-Directory $root
    # Recover orphaned files after a killed process. Active sessions hold an exclusive lock.
    foreach ($orphan in Get-ChildItem -LiteralPath $root -Directory -Filter 'run-*') {
        Assert-LocalPath $orphan.FullName
        $orphanLock = $null
        try { $orphanLock = [IO.File]::Open((Join-Path $orphan.FullName 'session.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
        catch { continue }
        try { Remove-Item -LiteralPath (Join-Path $orphan.FullName 'access-token.txt') -Force -ErrorAction SilentlyContinue }
        finally { $orphanLock.Dispose() }
        Remove-Item -LiteralPath (Join-Path $orphan.FullName 'session.lock') -Force
        # Empty directory only; never recursive deletion.
        if (-not (Get-ChildItem -Force -LiteralPath $orphan.FullName)) { [IO.Directory]::Delete($orphan.FullName) }
    }
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)

    # Derive ONLY the deployed app's public configuration; never read Railway secrets.
    $html = Invoke-DevHttp "$webBase/login"
    $candidates = @{}
    $source = $null
    foreach ($match in [regex]::Matches($html, 'src="([^"\s]+\.js[^"\s]*)"')) {
        $url = [Uri]::new([Uri] $webBase, $match.Groups[1].Value)
        if ($url.GetLeftPart([UriPartial]::Authority) -ne $webBase) { continue }
        $js = Invoke-DevHttp $url.AbsoluteUri
        if ($js.Contains($authBase)) {
            foreach ($key in [regex]::Matches($js, 'sb_publishable_[A-Za-z0-9_-]+')) { $candidates[$key.Value] = $url.AbsoluteUri }
        }
    }
    if ($candidates.Count -ne 1) { throw 'PUBLIC_CONFIG_AMBIGUOUS_REVIEW_APPROVED_APP_CONFIG' }
    $publicKey = @($candidates.Keys)[0]
    $source = $candidates[$publicKey]
    $keyHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($publicKey))).ToLowerInvariant()
    $evidence.publicKeySha256 = $keyHash
    $evidence.publicKeySource = $source
    $settings = Invoke-DevHttp "$authBase/auth/v1/settings" -ApiKey $publicKey | ConvertFrom-Json
    if (-not $settings.external.email) { throw 'PASSWORD_LOGIN_UNAVAILABLE_REVIEW_INTERACTIVE_PROVIDERS' }
    Write-Host 'DEV POS login only. Enter credentials in this local prompt; never paste them into chat.'
    $credential = Get-Credential -Message 'DEV POS / GoTrue (password is not saved)'
    if (-not $credential -or -not $credential.UserName) { throw 'LOGIN_CANCELLED' }
    $email = $credential.UserName.Trim()
    $body = $null
    $plain = $null
    try {
        $plain = $credential.GetNetworkCredential().Password
        $body = @{ email = $email; password = $plain } | ConvertTo-Json -Compress
        $session = Invoke-DevHttp "$authBase/auth/v1/token?grant_type=password" 'POST' -Body $body -ApiKey $publicKey | ConvertFrom-Json
    } finally { $plain = $null; $body = $null; $credential.Password.Dispose(); $credential = $null }
    $claims = Read-Claims $session.access_token
    if ($claims.iss -ne "$authBase/auth/v1" -or 'authenticated' -notin @($claims.aud) -or $claims.role -ne 'authenticated') { throw 'WRONG_SESSION_ENVIRONMENT' }
    $owner = [Guid]::Parse($claims.sub).ToString()
    Assert-SessionFresh
    # Claims parsing alone is not verification. GoTrue and the API validate the real session.
    $user = Invoke-DevHttp "$authBase/auth/v1/user" -Token $session.access_token -ApiKey $publicKey | ConvertFrom-Json
    if ($user.id -ne $owner -or $session.user.id -ne $owner -or $user.email -ine $email) { throw 'AUTHENTICATED_USER_MISMATCH' }
    $evidence.userHttpStatus = 200
    $evidence.authenticatedUserId = $owner
    $evidence.loginEmailMatched = $true
    $evidence.expiresUtc = [DateTimeOffset]::FromUnixTimeSeconds([long] $claims.exp).ToString('o')
    # DEV can transiently return 401 when its own JWKS fetch times out.
    # Retry only this read using the same already GoTrue-verified session.
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $evidence.apiReadAttempts = $attempt
        try {
            $null = Invoke-DevHttp "$apiBase/api/money/calendar/templates" -Token $session.access_token | ConvertFrom-Json
            break
        } catch {
            if ($_.Exception.Message -ne 'DEV_HTTP_401' -or $attempt -eq 3) { throw }
            Write-Host 'DEV API 401 after successful GoTrue verification; retrying read-only templates GET with the same session.'
            Start-Sleep -Seconds $attempt
        }
    }
    $evidence.templatesHttpStatus = 200
    Write-Host "DEV templates HTTP 200; server-verified user UUID: $owner"
    # Refresh tokens are never persisted, passed to children, or used for hidden retries.
    $accessToken = $session.access_token
    $session = $null
    $run = Join-Path $root ('run-' + [Guid]::NewGuid().ToString('N'))
    Protect-Directory $run
    $lock = [IO.File]::Open((Join-Path $run 'session.lock'), 'CreateNew', 'ReadWrite', 'None')
    $tokenPath = Join-Path $run 'access-token.txt'
    [IO.File]::WriteAllText($tokenPath, $accessToken, [Text.UTF8Encoding]::new($false))
    $accessToken = $null
    $env:COUPANG_DEV_ACCESS_TOKEN_FILE = $tokenPath
    $env:COUPANG_DEV_EXPECTED_USER_ID = $owner
    $evidence.tokenFileAclUserOnly = $true
    if ($Workflow -ne 'Validate') {
        Assert-SessionFresh
        $cleanup = Join-Path $PSScriptRoot 'coupang-dev-fixture-cleanup.mjs'
        $fixtureEvidence = Join-Path $root 'fixture-review.json'
        $reviewFlags = @()
        if ($Workflow -eq 'Closeout') { $reviewFlags = @('--reviewed') }
        & node $cleanup @reviewFlags --evidence $fixtureEvidence
        $evidence.fixtureReviewFile = $fixtureEvidence
        if ($LASTEXITCODE -ne 0) { throw 'CLEANUP_DRY_RUN_FAILED_NO_MUTATIONS' }
        $evidence.cleanupDryRun = 'PASS'
        if ($Workflow -eq 'Closeout') {
            Assert-SessionFresh
            $cleanupResult = Join-Path $root 'cleanup-result.json'
            $evidence.syntheticCleanupAttempted = $true
            & node $cleanup --reviewed --execute --result $cleanupResult
            if ($LASTEXITCODE -ne 0) { throw 'CLEANUP_STOPPED_REVIEW_PARTIAL_STATE_NO_BLIND_RETRY' }
            $evidence.cleanup = 'API_SOFT_CLEANUP_COMPLETE'
            $evidence.independentBearerReplay = 'PASS'
            $evidence.cleanupResultFile = $cleanupResult
        }
    }
    $evidence.status = 'PASS'
} catch {
    # Use only controlled error identifiers. Raw .NET/HTTP errors may contain credentials.
    $code = [string] $_.Exception.Message
    if ($code -notmatch '^[A-Z][A-Z0-9_]+$') { $code = 'SAFE_STOP_REVIEW_LOCAL_SETUP' }
    $failure = $code
    $evidence.status = $code
    Write-Host "Stopped: $code. No automatic credential retry or cleanup retry."
} finally {
    $env:COUPANG_DEV_ACCESS_TOKEN_FILE = $oldTokenPath
    $env:COUPANG_DEV_EXPECTED_USER_ID = $oldOwner
    $session = $null
    $accessToken = $null
    if ($credential) { $credential.Password.Dispose() }
    if ($client) { $client.Dispose() }
    if ($tokenPath -and (Test-Path -LiteralPath $tokenPath)) { Remove-Item -LiteralPath $tokenPath -Force }
    if ($lock) { $lock.Dispose() }
    if ($run -and (Test-Path -LiteralPath $run)) {
        Remove-Item -LiteralPath (Join-Path $run 'session.lock') -Force -ErrorAction SilentlyContinue
        if (-not (Get-ChildItem -Force -LiteralPath $run)) { [IO.Directory]::Delete($run) }
    }
    $evidence.temporaryTokenDeleted = (-not $tokenPath -or -not (Test-Path -LiteralPath $tokenPath))
    $evidence.finishedUtc = [DateTime]::UtcNow.ToString('o')
    if (Test-Path -LiteralPath $root) { $evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'last-result.json') -Encoding utf8 }
}
if ($failure) { exit 1 }
