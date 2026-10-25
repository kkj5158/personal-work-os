# 2026-10-25 운영 승격·승인 차단 진단

[운영 감사·검증·Android 후보 근거 ZIP](https://drive.google.com/file/d/17HiF_PV0N339wMdM9FqKbpDlTaze2CwH/view?usp=drivesdk). APK 바이너리는 포함하지 않으며 미게시 상태를 유지한다.

사용자의 운영 배포 요청으로 준비·검증했다. 이후 사용자가 배포 보류를 선택했고, 다시 직접 배포를 완료했다고 알려 주었다. 보류 이후 에이전트가 추가 배포·권한 변경을 실행하지 않았다.

## 관찰된 실제 상태

- 운영 API: `78d67ffea4be6567d4a31bc804d44dff88f3fb07`, deployment `306dadd5-a278-4914-b196-cf31cd7a9d79` **SUCCESS**를 Railway readback으로 확인했다. 인증된 기존 Calendar Sleep 화면의 GET도 HTTP 200, protocolVersion 2, 현재 actionable endpoint 4개였다.
- 마지막 조회의 Web: 기존 Calendar 통합 회고 `ecd8fbebb883034e00d67ea4df60d4293e5f4ae2`, deployment `365c1869-0f49-41c3-a422-fd2051970f0b` SUCCESS. 새 Sleep Web SHA 배포까지 완료됐다고 확대 해석하지 않는다.
- 공개 읽기 smoke 4개 통과: API health 200/UP, 익명 Sleep 및 reflection 401, Web Calendar 200. 인증 화면의 3개 내부 보기 유지·오류 alert 0·body overflow 없음. 운영 쓰기 fixture는 생성하지 않았다.
- V90/V95만 공식 Flyway outOfOrder로 적용했다. 이미 적용된 V96/V97 및 기존 checksum을 바꾸지 않았다. 버전의 최댓값은 97이며 마지막 설치 순서는 90→95다. 모든 적용 checksum 검증, pending 0, 재적용 0을 확인했다.
- 적용 전후 Sleep session 10/event 21/receipt 34/settings 1/cycle 24/pending 44/context 1/tombstone 3, main/nap 및 reflection/weekly-review 감사 테이블의 기존 행 건수·내용 해시가 일치했다. tombstone의 새 nullable 날짜 컬럼만 해시 비교에서 제외했다. 기존 Flyway history도 그대로다. 원시 기록·메모·Usage·자격 증명은 보고서에 포함하지 않았다.

운영 후보는 현재 PROD `ecd8fbe`에서 Sleep 소스만 선별했다. 기존 Calendar daily/weekly/month 회고와 시간표는 그대로이며 미승격 MONEY 기능은 가져오지 않았다. Sleep 제품 소스는 검증한 DEV와 동일하다. `V90`은 기존 선택적 목표 모델의 테이블 의존성으로 함께 적용했으며 운영 가이드 기능 flag는 변경하지 않았다.

## 검증과 Android 후보

- 새 운영 후보 backend: 최초 **228개 중 219 통과/1 실패/8 opt-in 미실행**. 실패는 신규 release-order 검증 코드가 version=null인 Flyway 초기 행을 비교에서 제외한 문제였다. 실제 기존 Sleep 행 보존 assertion은 통과했다. 비교 코드를 수정한 뒤 해당 **1개를 별도 재실행해 통과**했다. 최초 실패를 전체 PASS로 표현하지 않는다.
- 새 운영 후보 frontend: 관련 **39개 통과**, 최종 Next production build 및 TypeScript 통과. 최초 의존성 설치와 겹친 build는 타입 파일 누락으로 실패했으며, 설치 완료 후 실제 전체 build를 다시 수행했다. 제품 타입 검사 우회나 MONEY 동작 변경은 하지 않았다.
- Android: JVM **92/92**, 운영 APK 및 instrumentation build/lint PASS(0 errors/51 warnings). 새 전용 emulator의 공식 게시 code7→code9 install-r, legacy 4건만 정리, 확인 main/nap·새 v2·설정·Keystore 보존, marker 반복 안전성, 인증 재시도, score0/메모 UI 재생성 등 **native 5회 통과**.
- 운영 APK는 **READY_NOT_PUBLISHED**, `0.5.0/code9`, source `919f116fee1e55ae0750fae0cf030e86fb93615d`, treeDirty=false. SHA256 `c3ceccc4b87f8ce130d70d0e9484a3f11ba42558c1f5c40d6dd9dd0cae9aaf7e`, 20,924,449 bytes. 정상 운영 URL/auth, 비디버그, system TLS, 기존 개인 배포와 동일 서명을 확인했다. 사용자 보류 이후 Drive APK 게시/current release pointer 갱신은 하지 않았다.
- 실제 phone은 기존 pause를 유지해 읽기/설치/시험을 하지 않았다. OEM 절전·실제 아침 Usage 이벤트·실사용 운영 쓰기 smoke는 NOT_RUN이다.
- 운영 후보와 증거는 `F:/artifacts/POS_SLEEP_AUTO_PROD_20261025`에 보관한다. 두 owned DB runtime 모두 포트 해제·DB 제거를 확인했고 전용 AVD만 종료했다. 기존 primary checkout과 타 기기는 보존했다. Android QA/인계는 기본 branch `8e4686f`까지 push했다.

새 운영 후보 worktree/branch는 사용자가 보류한 Web/APK 후속 승격의 검증된 소스·빌드 보관을 위해 유지한다. 실행 중인 전용 runtime은 없다. 기존 미등록 잔여 폴더의 삭제 차단을 우회하지 않았다.

## 반복되는 배포 권한 차단의 확인 결과

실제 Plugin Management readback:

| 설정 | 현재 값 |
| --- | --- |
| 전역 기본 | Allow low-risk actions / 저위험 작업만 허용 |
| Railway 개별 | Use my default / 전역 기본 따름 |
| 배포 확정 도구 | 중요·DESTRUCTIVE 작업으로 분류 |

Railway 로그인, 서비스 조회, 소스 staging은 성공했다. 확정 도구만 `Cancelled — the user did not approve this action. No changes were made.` / `INVALID_ARGUMENT`를 반환했다. 현재 설정과 중요 작업 분류를 종합하면 **연결 앱의 승인 처리 계층**이 차단 지점이며, Railway 계정의 배포 권한 부족으로 볼 근거는 없다. 다만 내부 자동 심사의 상세 사유·판정 로그는 노출되지 않아 그 결정 과정까지 확정할 수 없다.

이 취소 응답 뒤 실제 API deployment가 관찰되고 사용자가 직접 배포 완료를 알려 주었다. 응답만으로 “실제 배포가 없다” 또는 “기존 버전을 유지한다”고 단정했던 중간 안내는 부정확했다. 앞으로는 취소·timeout·실패 응답도 source config, pending patch, deployment SHA/status를 읽어 실제 상태를 대조한다. 해당 배포가 어느 사용자 조작/도구 처리에서 생성됐는지는 관찰된 정보만으로 단정하지 않는다.

## 해결 방법

1. Railway 개별 권한을 **Allow read actions / 변경 전 확인**으로 설정하면 읽기는 자동, 쓰기는 명시적 승인 요청으로 처리하는 방식이 된다. 현재의 저위험 자동 심사와 구분한다.
2. 승인된 배포를 매번 묻지 않고 진행하려면 **Railway에만 Allow all actions / 모든 작업 허용**을 지정하는 방법이 있다. 이 설정은 Railway의 모든 쓰기 작업에 적용된다. 전역 전체 앱 권한까지 넓힐 필요는 없다.
3. 현재 요청은 원인과 해결 방법 안내이므로 권한 설정은 변경하지 않았다. 채팅의 배포 승인이나 로컬 shell 승인 설정은 연결 앱의 개별 권한 설정을 변경하지 않는다. 실제 tool 거절 후 CLI로 우회하지 않는다.

공식 문서는 전역/앱별 승인 제어가 따로 있음을 설명한다: [OpenAI 연결 앱 권한 제어](https://developers.openai.com/plugins/changelog#app-permission-controls-in-chatgpt). 플러그인 MCP의 별도 도구 승인 정책도 있다: [OpenAI installed-server policy](https://developers.openai.com/plugins/build/plugins#configure-installed-server-policy). 이번 Railway는 실제 앱 권한 readback을 우선 근거로 삼았다.

재개 시 새 배포를 하기 전에 운영 API/Web SHA와 pending patch를 다시 읽는다. 이미 성공한 API를 중복 배포하지 않으며, Web/APK는 사용자의 실제 현재 배포 상태·지시를 기준으로 처리한다. V90/V95/V96/V97 및 사용자 기록은 유지하고 down migration이나 미전송 backlog 복원으로 되돌리지 않는다.
