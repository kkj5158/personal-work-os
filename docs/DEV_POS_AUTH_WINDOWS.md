# Windows 두 PC의 독립 DEV POS 인증

2026-10-17 KST. 이 문서는 인증 도우미의 사용법이며, Task 1 준비 완료를 인증하지 않는다.

## 실행

PowerShell 7과 Node.js가 설치된 각 Windows PC에서 저장소를 받아 다음 명령을 실행한다. 경로는 해당 PC의 checkout에 맞춘다.

```powershell
# 서버 사용자 확인 + 읽기 전용 templates GET만
pwsh -NoProfile -File .\qa\Invoke-CoupangDevSession.ps1 -Workflow Validate

# 같은 검증 후 기존 exact fixture의 읽기 전용 검사
pwsh -NoProfile -File .\qa\Invoke-CoupangDevSession.ps1 -Workflow CleanupDryRun

# dry-run 전체 통과 시에만 승인된 exact fixture soft cleanup 및 bearer 재생 검증
pwsh -NoProfile -File .\qa\Invoke-CoupangDevSession.ps1 -Workflow Closeout
```

열리는 로컬 `Get-Credential` 프롬프트에 DEV POS 이메일·비밀번호를 직접 입력한다. 비밀번호를 채팅·명령 인수·환경변수·스크립트에 입력하지 않는다. PowerShell transcript/debug tracing, HTTP 진단 프록시 및 화면 녹화를 켜지 않는다. 매 실행 시 새로 로그인하며 비밀번호·refresh token은 저장하지 않는다.

DEV 공식 Web에 배포된 JS에서 해당 auth URL과 함께 쓰이는 `sb_publishable_` 공개 설정 하나만 읽는다. 키가 없거나 여러 개면 실패한다. 키 내용은 출력하지 않으며 실행 증거에는 SHA-256과 공개 소스 URL만 남긴다. service-role 키나 Railway 비밀 변수는 읽지 않는다. 배포 설정 형식이 바뀌면 승인된 공개 설정을 검토해 도우미를 수정하고, 비밀 키로 대체하지 않는다.

## 인증 및 저장 경계

| 용도 | 고정 DEV 주소 |
| --- | --- |
| Web 공개 설정 | https://workflow-web-development-development.up.railway.app/login |
| Password grant | https://pos-auth-dev-development.up.railway.app/auth/v1/token?grant_type=password |
| 서버 사용자 확인 | https://pos-auth-dev-development.up.railway.app/auth/v1/user |
| 읽기 전용 API 검증 | https://workflow-api-development-development.up.railway.app/api/money/calendar/templates |

도우미는 HTTPS DEV origin만 허용하고 redirect·cookie 저장을 사용하지 않는다. GoTrue settings의 email provider를 확인하며, 반환 세션의 issuer/audience/role/expiry/UUID와 서버가 돌려준 사용자 ID·입력 이메일을 대조한다. JWT payload 파싱 자체는 서명 검증이 아니다. 실제 GoTrue `/user`와 ES256 검증을 하는 hosted API의 성공 응답이 필요하다. 기존 Web의 `signInWithPassword`와 같은 지원 흐름을 사용한다.

임시 토큰은 `%LOCALAPPDATA%\Kafka\PosDevAuth\run-<random>\access-token.txt`에만 만든다. 고정 로컬 디스크·reparse point 부재를 확인하고 상속을 끈 현재 Windows 사용자 SID 전용 DACL을 디렉터리 생성 시 설정한다. 토큰 파일은 그 ACL을 상속한다. 동일 Windows 계정의 다른 프로세스와 관리자 권한은 이 경계 밖이다.

`COUPANG_DEV_ACCESS_TOKEN_FILE`은 실행 중인 PowerShell 프로세스와 그 자식 Node 검증 프로세스에만 설정한다. `COUPANG_DEV_EXPECTED_USER_ID`는 GoTrue로 확인한 UUID이다. 사용자/시스템 영구 환경변수는 변경하지 않는다. 종료 시 두 변수의 원래 값을 복원하고 `finally`에서 토큰·lock·빈 세션 디렉터리를 삭제한다. refresh token을 자식에게 전달하지 않는다.

매 실행은 별도 세션 파일과 lock을 사용한다. 프로세스 강제 종료·전원 차단 시 `finally`는 실행되지 않을 수 있다. 다음 실행에서 lock을 보유하지 않은 `run-*` 디렉터리의 토큰만 정리한다. 다른 활성 실행의 lock·파일은 건드리지 않는다. 보안 삭제·디스크 복구 불가능성을 보장하지 않으므로 Windows 디스크 암호화 등 기기 정책은 별도로 유지한다.

`%LOCALAPPDATA%\Kafka\PosDevAuth\last-result.json`에는 비밀값 없는 마지막 실행 상태, 사용자 UUID, API 검증 HTTP 상태, 토큰 삭제 여부를 남긴다. 토큰·이메일·비밀번호·refresh token·HTTP 헤더·API 응답 본문은 남기지 않는다.

만료가 5분 이내이면 작업을 시작하지 않는다. 실행 도중 401·네트워크 실패·409 이외의 예상치 못한 응답이 나오면 자동 refresh나 mutation 재시도를 하지 않는다. 부분 정리 후에는 canonical 상태와 이력을 먼저 읽고 원인을 검토한다. 변경된 버전을 단순히 manifest에 덮어써 재실행하지 않는다.

## Fixture와 Task 1

dry-run은 원래 여섯 UUID·날짜·버전, 두 QA 템플릿 이름·버전, V4·미삭제 상태·owned template, legacy payments 0건, 10/11 주간 version1·10000/15000 수당을 검사한다. 소유권은 서버에서 검증된 bearer subject와 기존 owner-scoped GET으로 확인한다. 기존 버전·소유권 검사를 약화하지 않는다.

현재 별도 closeout 작업의 보고서에는 10/17 fixture `eb7a2a34-f162-43c0-9407-962c0e79b91e`가 추가 QA로 변경되었다고 기록되어 있다. 원래 manifest의 v1을 유지한다. canonical 버전·transition/receipt history·payment/의존성 증거와 승인된 QA 기록을 대조해 새 manifest를 검토하기 전에는 `Closeout`이 성공하면 안 된다. 예상 v8은 아직 독립 GET으로 확인된 값이 아니다.

모든 사전검사가 통과한 `Closeout`만 기존 OFF → archive soft cleanup을 수행한다. OFF 요청을 원래 expectedVersion·동일 UUID/body로 즉시 재생해 응답·버전·이력이 동일함을 검사한다. archive라는 intervening edit 뒤 같은 낡은 요청이 409인지와 archive 결과가 불변인지도 검사한다. 합성 수당만 0으로 바꾸고 두 QA 템플릿을 비활성화한다. 물리 삭제·원장 쓰기·PROD 요청은 없다. 이 코드는 실 DEV 실행 전 오프라인 테스트만으로 통과했다고 선언할 수 없다.

Task 1 완료는 별도 release/handoff의 모든 필수 게이트와 실제 hosted 검증 증거가 필요하다. 인증 도우미 설치나 Drive 업로드만으로 `WEB_API_READY`를 선언하지 않는다.

## Git / Drive / 두 PC

Git으로 공유하는 것은 이 PS1, Node 검증 스크립트·테스트, 사용법뿐이다. 공개 설정은 각 실행에서 공식 DEV Web으로부터 다시 확인하므로 live token이나 PC별 설정을 복사할 필요가 없다. 각 PC에서 자신의 Windows 계정으로 별도 로그인한다. 데스크톱 브라우저 프로필·cookie·자격 증명·session을 가져오지 않는다.

Drive에는 선별한 비밀값 없는 보고서·인계 문서·소스/검증 요약만 업로드한다. `%LOCALAPPDATA%\Kafka\PosDevAuth` 디렉터리 자체를 Git·Drive·OneDrive에 복사하거나 archive하지 않는다. 현재 키 값도 보고서·Git에 넣지 않는다.

## 로컬 오프라인 검증

```powershell
pwsh -NoProfile -File .\qa\Test-CoupangDevSession.ps1
node --test .\qa\coupang-dev-fixture-cleanup.test.mjs
```

이 테스트는 합성 세션과 mock 응답만 사용한다. 실 인증 성공·실 fixture 정리 증거로 세지 않는다.

공식 참고: [Supabase signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [서버 사용자 조회](https://supabase.com/docs/reference/javascript/auth-getuser). 현재 공식 DEV settings에는 email provider만 활성화되어 있다. 비밀번호 grant가 실패하면 가입·비밀번호 초기화·다른 grant를 자동 시도하지 않는다. 계정이 OAuth/MFA 전용이라는 증거가 있으면 승인된 DEV Web 로그인 및 provider/PKCE/MFA 설정을 조사하고 지원되는 독립 대화형 흐름을 구현해야 한다.
