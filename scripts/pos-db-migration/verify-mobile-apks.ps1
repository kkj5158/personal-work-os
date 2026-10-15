param([Parameter(Mandatory=$true)][ValidateSet('money','money-dev','sleep','diet','diet-note')][string]$App)
$ErrorActionPreference='Stop'
$artifactRoot='F:\artifacts\pos-db-migration-20261014'
$specs=@{
 money=@{repo='money-sys-mobile';relative='app/build/outputs/apk/production/app-production.apk';package='com.kafka.money.notificationpoc';code='12';version='2.0.1';label='MONEY-2.0.1-prod.apk';dev=$false}
 'money-dev'=@{repo='money-sys-mobile';relative='app/build/outputs/apk/dev/app-dev.apk';package='com.kafka.money.notificationpoc.dev';code='12';version='2.0.1-dev';label='MONEY-2.0.1-dev.apk';dev=$true}
 sleep=@{repo='sleep-app';relative='app/build/outputs/apk/production/app-production.apk';package='com.kafka.sleep';code='6';version='0.3.1';label='SLEEP-0.3.1-prod.apk';dev=$false}
 diet=@{repo='diet-sys-mobile';relative='android/app/build/outputs/apk/release/app-release.apk';package='com.kafka.dietsys';code='3';version='0.2.1';label='DIET-0.2.1-prod.apk';dev=$false}
 'diet-note'=@{repo='diet-note-sys-mobile';relative='android/app/build/outputs/apk/release/app-release.apk';package='com.kafka.dietnote.dev';code='4';version='0.2.2';label='DIET-NOTE-0.2.2-prod.apk';dev=$false}
}
$spec=$specs[$App];$apk=Join-Path ('D:\DEV_SPACE\'+$spec.repo) $spec.relative;$baseline=Join-Path (Join-Path ($artifactRoot+'\mobile-before-auth-update') $spec.repo) $spec.relative
if($App -eq 'money'){$apk=Join-Path ($artifactRoot+'\money-production-update') $spec.relative}
$sdk='C:\Users\JIUU\AppData\Local\Android\Sdk\build-tools\36.0.0';$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot'
function Certificate([string]$file){$cert=& ($sdk+'\apksigner.bat') verify --print-certs $file 2>&1;if($LASTEXITCODE -ne 0){throw 'APK signing verification failed'};$m=[regex]::Match(($cert -join "`n"),'certificate SHA-256 digest: ([a-f0-9]+)');if(!$m.Success){throw 'Signing digest absent'};return $m.Groups[1].Value}
$beforeCert=Certificate $baseline;$afterCert=Certificate $apk;if($beforeCert -ne $afterCert){throw 'Installed baseline signing certificate changed'}
$badging=& ($sdk+'\aapt2.exe') dump badging $apk;if($LASTEXITCODE -ne 0){throw 'APK manifest inspection failed'};$packageLine=$badging|Where-Object {$_ -like 'package:*'}|Select-Object -First 1
if($packageLine -notmatch ("name='"+[regex]::Escape($spec.package)+"'.*versionCode='"+$spec.code+"'.*versionName='"+[regex]::Escape($spec.version)+"'")){throw 'Package/version mismatch'}
if(!$spec.dev -and ($badging -join "`n") -match 'application-debuggable'){throw 'Production APK is debuggable'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($apk);$newAuth=$false;$oldAuth=$false;$newApi=$false;$developmentApi=$false;$privilegedKey=$false
$authHost=if($spec.dev){'pos-auth-dev-development.up.railway.app'}else{'pos-auth-prod-production.up.railway.app'}
$apiHost=if($spec.dev){'workflow-api-development-development.up.railway.app'}else{'personal-work-os-prod-production.up.railway.app'}
try{foreach($entry in $zip.Entries|Where-Object {$_.FullName -match '^classes\d*\.dex$|^assets/index.android.bundle$'}){$stream=$entry.Open();$memory=[IO.MemoryStream]::new();try{$stream.CopyTo($memory);$text=[Text.Encoding]::UTF8.GetString($memory.ToArray());$newAuth=$newAuth -or $text.Contains($authHost);$oldAuth=$oldAuth -or $text.Contains('rmfgyrimubaxdptwqiqq.supabase.co') -or $text.Contains('yhxhvpvocsestxhoqtwa.supabase.co');$newApi=$newApi -or $text.Contains($apiHost);$developmentApi=$developmentApi -or $text.Contains('workflow-api-development-development.up.railway.app');$privilegedKey=$privilegedKey -or [regex]::IsMatch($text,'sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN PRIVATE KEY-----\s*[A-Za-z0-9+/]{40,}')}finally{$stream.Dispose();$memory.Dispose()}}}finally{$zip.Dispose()}
if(!$newAuth -or !$newApi -or $oldAuth -or $privilegedKey -or (!$spec.dev -and $developmentApi)){[ordered]@{newAuth=$newAuth;newApi=$newApi;oldAuth=$oldAuth;privilegedKey=$privilegedKey;developmentApi=$developmentApi}|ConvertTo-Json;throw 'Embedded production API/Auth isolation check failed'}
$deliver=Join-Path $artifactRoot 'apk';[IO.Directory]::CreateDirectory($deliver)|Out-Null;$target=Join-Path $deliver $spec.label;Copy-Item -LiteralPath $apk -Destination $target
$report=[ordered]@{at=[DateTimeOffset]::UtcNow.ToString('o');app=$App;package=$spec.package;version=$spec.version;versionCode=[int]$spec.code;file=$target;sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $target).Length;signingSha256=$afterCert;sameSigningAsExistingApk=$true;railwayAuthEmbedded=$newAuth;expectedApiEmbedded=$newApi;oldSupabaseAuthEmbedded=$oldAuth;privilegedSigningOrServiceKeyEmbedded=$privilegedKey;productionNonDebuggable=!$spec.dev;localDataDeletionCodeChanged=$false;physicalDeviceVerification='NOT PERFORMED';pass=$true}
$report|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $artifactRoot ($App+'-apk-verification.json')) -Encoding utf8
$report|ConvertTo-Json -Depth 5
