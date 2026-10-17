#requires -Version 7.0
# Offline lifecycle/security tests. No network, real credentials, or application data.
$ErrorActionPreference = 'Stop'
$source = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'Invoke-CoupangDevSession.ps1')
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref] $null, [ref] $errors)
if ($errors.Count) { throw 'Helper parse failed' }
$http = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Invoke-DevHttp' }, $true)
$mock = @'
function Invoke-DevHttp([string] $Url, [string] $Method = 'GET', [string] $Body, [string] $Token, [string] $ApiKey) {
    if ($Url -match '/login$') { return '<script src="/_next/static/test.js"></script>' }
    if ($Url -match '/test.js$') { return 'https://pos-auth-dev-development.up.railway.app sb_publishable_OFFLINE_TEST' }
    if ($Url -match '/settings$') { return '{"external":{"email":true}}' }
    if ($Url -match '/token\?') {
        if ($script:scenario -eq 'auth401') { throw 'DEV_HTTP_401' }
        if (($Body | ConvertFrom-Json).password -ne 'OFFLINE_PASSWORD_SENTINEL') { throw 'TEST_PASSWORD_BODY' }
        return @{access_token=$script:fakeToken; refresh_token='OFFLINE_REFRESH_SENTINEL'; user=@{id=$script:owner}} | ConvertTo-Json
    }
    if ($Url -match '/user$') {
        return @{id=$script:owner; email=$(if($script:scenario -eq 'wrongUser'){'other@example.invalid'}else{'offline@example.invalid'})} | ConvertTo-Json
    }
    if ($Url -match '/templates$') {
        $script:templateCalls++
        if($script:scenario -eq 'templates401Persistent' -or ($script:scenario -eq 'templates401Transient' -and $script:templateCalls -eq 1)){throw 'DEV_HTTP_401'}
        return '[]'
    }
    throw 'UNEXPECTED_TEST_URL'
}
'@
$source = $source.Remove($http.Extent.StartOffset, $http.Extent.EndOffset - $http.Extent.StartOffset).Insert($http.Extent.StartOffset, $mock)
$source = $source.Replace('if ($failure) { exit 1 }', 'if ($failure) { throw $failure }')
$source = $source.Replace('Join-Path $PSScriptRoot', ("Join-Path '" + $PSScriptRoot.Replace("'", "''") + "'"))
function Get-Credential {
    param($Message)
    return [PSCredential]::new('offline@example.invalid', (ConvertTo-SecureString 'OFFLINE_PASSWORD_SENTINEL' -AsPlainText -Force))
}
function node {
    if (-not (Test-Path -LiteralPath $env:COUPANG_DEV_ACCESS_TOKEN_FILE)) { throw 'TEST_MISSING_TOKEN' }
    if ([IO.File]::ReadAllText($env:COUPANG_DEV_ACCESS_TOKEN_FILE) -ne $script:fakeToken) { throw 'TEST_BAD_TOKEN_FILE' }
    if ($env:COUPANG_DEV_EXPECTED_USER_ID -ne $script:owner) { throw 'TEST_BAD_OWNER' }
    $acl = Get-Acl -LiteralPath $env:COUPANG_DEV_ACCESS_TOKEN_FILE
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if($rule.IdentityReference -ne [Security.Principal.WindowsIdentity]::GetCurrent().User) { throw 'TEST_SHARED_TOKEN' }
    }
    $script:childCalled = $true
    $global:LASTEXITCODE = $(if($script:scenario -eq 'childFailure'){1}else{0})
}
$script:owner = '10000000-0000-4000-8000-000000000001'
$originalPath = $env:COUPANG_DEV_ACCESS_TOKEN_FILE
$originalOwner = $env:COUPANG_DEV_EXPECTED_USER_ID
$passed = @()
try {
    foreach ($script:scenario in @('validate','dryRun','closeout','childFailure','expired','wrongIssuer','wrongUser','auth401','templates401Transient','templates401Persistent')) {
        $script:childCalled = $false
        $script:templateCalls = 0
        $testRootName = 'PosDevAuth-OfflineTest-' + [Guid]::NewGuid().ToString('N')
        $testSource = $source.Replace('Kafka\PosDevAuth', ('Kafka\' + $testRootName))
        $testRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('Kafka\' + $testRootName)
        $payload = @{sub=$script:owner; email='offline@example.invalid'; role='authenticated'; aud='authenticated'; iss=$(if($script:scenario -eq 'wrongIssuer'){'https://prod.invalid/auth/v1'}else{'https://pos-auth-dev-development.up.railway.app/auth/v1'}); exp=[DateTimeOffset]::UtcNow.AddMinutes($(if($script:scenario -eq 'expired'){-1}else{60})).ToUnixTimeSeconds()} | ConvertTo-Json -Compress
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload)).TrimEnd('=').Replace('+','-').Replace('/','_')
        $script:fakeToken = 'eyJhbGciOiJFUzI1NiJ9.' + $encoded + '.OFFLINE_SIGNATURE'
        $env:COUPANG_DEV_ACCESS_TOKEN_FILE = 'prior-path'
        $env:COUPANG_DEV_EXPECTED_USER_ID = 'prior-owner'
        $failed = $false
        $captured = ''
        try { $captured = (& ([ScriptBlock]::Create($testSource)) -Workflow $(if($script:scenario -eq 'closeout'){'Closeout'}elseif($script:scenario -in @('dryRun','childFailure')){'CleanupDryRun'}else{'Validate'}) 6>&1 | Out-String) }
        catch { $failed = $true }
        $expectedFailure = $script:scenario -notin @('validate','dryRun','closeout','templates401Transient')
        if ($failed -ne $expectedFailure) { throw "Unexpected outcome: $script:scenario" }
        if ($captured.Contains($script:fakeToken) -or $captured -match 'OFFLINE_PASSWORD_SENTINEL|OFFLINE_REFRESH_SENTINEL') { throw 'Secret leaked to output' }
        if ($env:COUPANG_DEV_ACCESS_TOKEN_FILE -ne 'prior-path' -or $env:COUPANG_DEV_EXPECTED_USER_ID -ne 'prior-owner') { throw 'Environment not restored' }
        if (Get-ChildItem -LiteralPath $testRoot -Filter 'access-token.txt' -Recurse) { throw 'Token left behind' }
        $result = Get-Content -Raw -LiteralPath (Join-Path $testRoot 'last-result.json') | ConvertFrom-Json
        if (-not $result.temporaryTokenDeleted) { throw 'Cleanup evidence missing' }
        if ($script:scenario -in @('dryRun','childFailure') -and -not $script:childCalled) { throw 'Child lifecycle not tested' }
        # Only known test files and empty directories; no recursive deletion.
        Remove-Item -LiteralPath (Join-Path $testRoot 'last-result.json')
        [IO.Directory]::Delete($testRoot)
        $passed += $script:scenario
    }
} finally {
    $env:COUPANG_DEV_ACCESS_TOKEN_FILE = $originalPath
    $env:COUPANG_DEV_EXPECTED_USER_ID = $originalOwner
}
[string] $httpDefinition = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Invoke-DevHttp' }, $true).Extent.Text
. ([ScriptBlock]::Create($httpDefinition))
Add-Type -TypeDefinition @'
using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
public class PosDevOfflineHandler : HttpMessageHandler {
  public int Status = 200;
  public int Calls = 0;
  public bool FailNetwork = false;
  protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) {
    Calls++;
    if (FailNetwork) throw new Exception("OFFLINE_HTTP_SECRET_SENTINEL");
    return Task.FromResult(new HttpResponseMessage((HttpStatusCode)Status) {Content=new StringContent("OFFLINE_RESPONSE_SECRET_SENTINEL")});
  }
}
'@
$handler = [PosDevOfflineHandler]::new()
$client = [Net.Http.HttpClient]::new($handler)
$authBase = 'https://pos-auth-dev-development.up.railway.app'
$apiBase = 'https://workflow-api-development-development.up.railway.app'
$webBase = 'https://workflow-web-development-development.up.railway.app'
try {
    foreach($status in @(302,401,429,500)) {
        $handler.Status = $status
        $caught = ''
        try { $null = Invoke-DevHttp "$apiBase/api/money/calendar/templates" } catch { $caught = $_.Exception.Message }
        if($caught -ne "DEV_HTTP_$status") { throw 'Unsafe HTTP error' }
        $passed += "http$status"
    }
    $before = $handler.Calls
    foreach($url in @('https://prod.invalid/api/money/calendar/templates','http://workflow-api-development-development.up.railway.app/api/money/calendar/templates')) {
        $caught = ''
        try { $null = Invoke-DevHttp $url } catch { $caught = $_.Exception.Message }
        if($caught -ne 'NON_DEV_URL_REFUSED' -or $handler.Calls -ne $before) { throw 'Origin restriction failed' }
    }
    $passed += 'nonDevOriginsRefused'
    $handler.FailNetwork = $true
    $caught = ''
    try { $null = Invoke-DevHttp "$authBase/auth/v1/user" } catch { $caught = $_.Exception.Message }
    if($caught -ne 'DEV_NETWORK_FAILURE') { throw 'Raw network error exposed' }
    $passed += 'networkErrorRedacted'
} finally { $client.Dispose() }
[ordered]@{offlineTests='PASS';count=$passed.Count;scenarios=$passed;realNetwork=$false;realCredentials=$false} | ConvertTo-Json
