# Sleep Android 자동 기록 · 2026-10-24

## 사전 확인

작업 기준은 별도 Android 저장소 `sleep-app`, 기준 커밋 `c6b7d55`,
작업 브랜치 `codex/sleep-auto-android`와 전용 worktree이다. 시작 시 변경 사항이 없었다.
개발 버전은 `0.5.0-sleep-auto-dev` / code 9로 올렸으며 기존 production release manifest는 바꾸지 않았다.
다른 Android worktree와 기본 체크아웃의 파일/기기/인증은 변경하지 않았다.
POS `agent/OPERATING_POLICY.md`, `GIT_WORKFLOW.md`(독립 worktree/11–12 병렬 작업),
`VALIDATION_POLICY.md`, `PRODUCTION_POLICY.md`, Android README, `docs/SLEEP_V3_DEV.md`,
SLEEP-09 recorder, 기존 SleepSetPolicy/UsageSuggestions/Room v1/outbox/동기화 테스트를 확인했다.
이 문서는 구현 보고서의 Android 근거이며 통합 담당자가 지정 Work Drive 보고서에 반영한다.

| 기존 구현 | 요청 변경 | 변경 소유/API/UI | 회귀 위험/대응 |
|---|---|---|---|
| SleepSetPolicy 후보 + 개별 검토 저장 | 충분한 아침 후보만 자동 적용 | Android eligibility / `/actions` AUTO_APPLY_SESSION | 밤중 사용 오인 방지, 불충분한 관찰은 보류 |
| Room v1 frozen outbox/수동 비교 | 신규 v2 무인 동기화 | Android outbox + Sleep 서버의 revision/provenance merge | 원래 요청 재전송, 서버 canonical ID로 미전송 후속 입력 연결 |
| 구형 미전송/실패 큐와 초안 선택 | 1회 소유자별 정리 | 기존 Room transaction + cutover marker | 확인된 main/nap cache/receipt와 설정 보존, 신규 v2 보존 |
| 시간만 편집 | 수면 점수/한 줄 메모 | ANNOTATE_SESSION, 상세 편집/일별/주간 | 변경한 annotation 필드만 전송, 시간/낮잠과 분리 |
| 앱 진입/기존 알림 | 아침 확인 기회 | 화면/잠금해제 관찰, WorkManager, 시작/재개/재부팅 | OS 권한·절전 제약을 우회하지 않음 |

## 결정적 자동 적용 정책

`MorningAutoPolicy`는 기존 `SleepSetPolicy`의 후보와 세그먼트에 적용하는 eligibility
정책이다. 별도 수면 추론 엔진, 실제 수면 측정 또는 예측 점수를 만들지 않는다.

- 현지 날짜 오전 05:00–11:59에 시작하고 종료까지 관찰된 연속 화면 이용이 **10분 이상**이다.
- 기상 후보는 기존 후보 집합에 있어야 하며 가장 이른 적격 아침 세션을 사용한다.
- 새로운 취침은 전날 18:00–당일 00:59의 기존 후보 중 하나로 유일하게 뒷받침되어야 한다.
- 취침·기상 간격은 **4–14시간**이다. 사이에 **2분 이상**의 다른 화면 이용이 있으면 새 취침 추정은 보류한다.
- 02:00의 1분 확인은 최종 기상이 되지 않는다. 밤중 긴 이용만으로도 최종 기상을 만들지 않는다.
- 기존 취침이 있으면 그 값을 보존하고 적격 아침 기상만 채울 수 있다. 수동 UNKNOWN도 보존한다.
- 이미 존재하는 기상/명시적 provenance/삭제/제외/미전송 후속 입력/동일 날짜의 복수 기록은 자동으로 덮어쓰지 않는다.
- 종료되지 않은 화면 이용은 일단 보류한다. 화면 꺼짐/다음 실행 기회에서 다시 평가한다.
- 이 수치는 보수적인 엔지니어링 수용 기준이며 임상적 정확도 보장이 아니다. 교대/늦은 생활 패턴은 수동 기록으로 남는다.

기본 자동 기능은 켜져 있고 기존 명시적 off 설정은 유지한다. Usage Access가 없으면
조회하지 않는다. 오늘 화면에 닫을 수 있는 1회 설명/권한 진입을 제공하며 설정에도
다시 진입할 수 있다. 원시 Usage timeline은 서버에 전송하지 않는다.
앱 프로세스가 살아 있는 동안 화면/잠금해제를 관찰한다. 15분 주기 WorkManager와
잠금해제 뒤 후속 실행, 앱 시작/재개 및 재부팅/시간대 변경은 최선형 기회이다.
강제 종료·OEM 절전·권한 철회에서 정시 실행을 보장하지 않으며 앱을 열면 다시 확인한다.

## 서버 계약 및 오프라인 동기화

신규 main/nap action envelope는 `protocolVersion: 2`를 포함한다.
`AUTO_APPLY_SESSION`은 기존 `/api/sleep/v1/actions`에 `payload.fields`의
`bedtimeIntentAt`/`wakeAt`, `fieldTimezones`, 정책 버전을 보낸다.
서버의 `USAGE_AUTO`/`ESTIMATED`, revision, tombstone, wake-day 단일성 및 수동 우선 규칙이 최종 권한이다.
새 세션 ID는 소유자·날짜로 결정하고 작업 ID는 설치 device ID도 포함하여 다른 기기의
독립적인 HTTP envelope가 같은 idempotency key로 충돌하지 않게 한다. 동일 관찰을 중복 적용하지 않는다.
Room 기록과 outbox는 함께 저장하고 frozen body 재전송 규칙을 유지한다.
같은 날짜의 서버 기록이 다른 ID로 존재하면 receipt의 canonical ID를 반영하며,
아직 전송되지 않은 후속 수동 수정/undo 초안도 같은 canonical ID로 연결한다.
이미 전송된 frozen body는 고치지 않는다.

`ANNOTATE_SESSION`의 `payload.fields`에는 실제로 바꾼 `sleepScore`/`sleepNote`만 포함한다.
점수 0–100/null, 메모 한 줄 100자/null을 검증한다. 빈 값은 자동으로 0이 되지 않는다.
자동 시간 갱신은 점수/메모를 계산하거나 지우지 않는다. main sleep에서만 편집하며
낮잠에 주수면의 점수/메모를 배정하지 않는다. 새 자동 추정이 서버 확인되기 전에는
annotation 저장을 잠시 막아, 서버가 보류한 추정에 annotation-only 404 큐가 생기지 않게 한다.
명시적인 수동 생성의 오프라인 점수/메모 입력은 유지한다.
주간 블록의 시간 기하를 유지하며 충분한 높이에만 점수/한 줄 메모를 표시한다.
상세 선택과 일별 카드에서 전체 내용을 편집한다. 통계는 기록/추정 간격이라고 표시하고
자동 추정과 수동 기록 건수를 구분한다.

서버는 v2의 비파괴 수동 endpoint 변경을 최신 기록의 touched field에 적용한다.
동시 수동 변경의 서버 직렬 순서/변경 이력은 서버 계약을 따른다.
삭제/되돌리기 등 의도적으로 파괴적인 작업은 기존 revision 보호를 유지한다.
진짜 기술 실패는 상세 동기화 화면에서 확인할 수 있다. 정상 전송의 기본 표시는
`동기화 중`/`동기화 완료`이며 자동 기록 승인 모달은 없다.

## 승인된 1회 로컬 정리의 정확한 범위

Room 버전을 올리거나 데이터베이스 전체를 지우지 않는다. 계정+API 환경별로 기존
`CachedView`의 `cutover:sleep-protocol-2` marker와 정리를 하나의 transaction에 기록한다.

- 지움: protocol 2 미만의 **미확인 main/nap Sleep action**, 실패/차단 재시도, 해당 action의 sync/undo/draft 메타데이터, 구형 usage/candidate view 및 기기 후보 선택/거절 메타데이터.
- 보존: ACKNOWLEDGED receipt/변경 이력, 확인된 main/nap cache, 사용자 설정/인증/기기 ID, reminder-settings 큐, 직접 입력한 독립 초안, 다른 계정, **모든 신규 protocol 2 action**.
- 미전송 변경이 확인된 cache를 가렸으면 마지막 확인된 receipt 또는 저장된 이전 snapshot을 복원한다. 구형 미전송 생성임이 이전 revision 0으로 확인된 로컬 임시 cache만 지운다. 출처가 불명확한 cache는 임의 삭제하지 않고 다음 서버 refetch로 회복한다.
- 서버 전체 Sleep 데이터/진짜 이력/확인된 낮잠/사용자 기록 날짜를 정리하지 않는다.
- 서버는 main/nap의 구형 protocol replay를 거부한다. 과거 날짜의 정당한 신규 수동 입력은 허용한다.
- marker에는 정리 건수만 저장하고 Usage 원문이나 note를 진단에 넣지 않는다.

## 검증 및 운영 경계

최종 시험/개발 APK 소스 커밋: **`cb376e86e177ae5c7a8756f5d071417561bbf0b5`**.
커밋 후 clean tree에서 JDK 21/API 36, Robolectric API 35로 실행했다.
`gradlew.bat testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug --console=plain --max-workers=2`
**PASS**, `BUILD SUCCESSFUL in 4m 6s`. JVM **92 tests, 0 failures, 0 errors, 0 skipped**이다.
신규 정책/Room 회귀 20건과 기존 outbox/recorder/Compose/설정 등 72건이 포함된다.
lint는 **0 errors, 51 warnings**이다. 경고를 0건이라고 주장하지 않는다.

새 시험은 02시 짧은 확인/오전 지속 이용/부족하거나 모순된 근거/중복 관찰/시간대 경계,
수동·UNKNOWN·삭제 보호, 오프라인·재시작·동일 요청 재시도, canonical ID와 수동 후속 수정/undo revision,
서버의 자동 추정 보류 시 임시 기록 제거, score/note touched-field 분리,
수면 점수 0/72/100/null/범위·메모 검증, 계정 분리, 구형 main/nap 미전송 정리,
확인된 main/nap cache·설정·신규 v2 보존과 반복 정리를 실제로 실행한다.

근거: [최종 Gradle 로그](sleep-auto-20261024/committed-source-validation.txt),
[JUnit 요약](sleep-auto-20261024/junit-summary.json),
[APK source/해시](sleep-auto-20261024/apk-source-evidence.json),
[서명 검증](sleep-auto-20261024/apk-signature.txt),
[lint 요약](sleep-auto-20261024/lint-summary.txt).

개발 APK `app/build/outputs/apk/debug/app-debug.apk`는 `0.5.0-sleep-auto-dev`/code 9,
26,238,405 bytes, SHA-256
`534cb43c9fc713f43aacf84f6cf1d9c24c533bd1fc5df82c0fe55b3bb1c3f9d3`이다.
APK 내부 `assets/sleep-source.json`을 ZIP readback하여 위 소스 SHA 및 **`treeDirty:false`**를 확인했다.
`apksigner verify --verbose --print-certs` PASS(v2), 인증서 SHA-256
`fe4bf29299e7a45c100017ef12d0981de7f93fca6ff81e10a5ac4c8a66667582`로
기존 기록된 개인 배포 인증서와 일치한다. 이는 실제 덮어 설치 시험을 대신하지 않는다.
개발 API는 기존 로컬 `https://localhost:8451`이며 배포/설치용 PROD 산출물이 아니다.

실기기 설치/권한/잠금해제/OEM 절전/실제 서버 왕복/네이티브 화면은 이 Android 하위 작업에서
실행한 것으로 주장하지 않는다. 서버 PostgreSQL/browser QA는 통합 담당자의 별도 근거이다.
이전 실기기 검증 대기/보호 기기 정책은 유지한다.
`Run-SleepV3NativeQA.ps1`의 기존 code8 byte-identical outbox fingerprint는 이전 기능의
이력 검증이며 승인된 code9 구형 미전송 정리의 수용 조건과 다르다. code9 전용 install-r/
cutover fixture와 실제 OS 백그라운드 검증은 후속 기기 QA 항목이다. 위 instrumentation APK
빌드 성공을 네이티브 실행 PASS로 세지 않는다.

PROD 배포나 앱 설치는 하지 않았다. 릴리스 전 v2 서버 → 대응 Web/Android 순서와
구버전 앱의 업그레이드 요구 상태를 조정해야 한다. 구버전 서버에는 새 자동 action을
먼저 배포하지 않는다. 코드 롤백은 표준 Git/배포 절차로 처리하되, 승인된 구형 미전송
데이터 정리는 복구를 의도하지 않는 1회 cutover이며 서버 확인 데이터는 refetch한다.
