# POS Sleep 자동 동기화 · Calendar 일일 회고 구현 결과

2026-10-24, DEV 검증 완료. 제공된 구현 프롬프트의 제품 요구사항을 기존 POS와 별도 Sleep Android 저장소에 반영했다. Calendar 월 보기·주간/월간 회고 집계는 구현하지 않았다.

## 구현 결과

- **아침 자동 기록:** 기존 Android Usage 후보 엔진에 보수적인 자동 적용 정책을 추가했다. 05:00–11:59에 시작한, 종료가 관찰된 10분 이상 사용과 유일한 전날 저녁 취침 후보, 4–14시간 구간이 필요하다. 짧은 02시 사용은 최종 기상으로 처리하지 않는다. 불명확하거나 권한이 없는 경우 시간을 만들지 않는다. 추정 구간이며 실제 수면 측정으로 표시하지 않는다.
- **서버 기준 동기화:** protocolVersion 2, 영속 outbox와 동일 operation 재시도, 서버 receipt/history 및 owner lock을 사용한다. 수동 수정·삭제·새 사실이 자동 추정보다 우선한다. 동일 추정은 revision을 늘리지 않는다. 동시 수동 수정은 서버 직렬 수신 순서에 따라 touched field만 병합하며 이전 버전은 이력에 남긴다. 삭제/undo/exclude는 엄격한 revision 검증을 유지한다.
- **기존 미전송 데이터 정리:** Android 계정별 transaction marker로 구형 미전송 main/nap 쓰기, 후보, 관련 구형 동기화 메타데이터만 한 번 폐기한다. 서버 확인 cache/receipt, 설정과 새 v2 쓰기는 보존한다. 서버는 구형 main/nap action을 `409 SLEEP_PROTOCOL_UPGRADE_REQUIRED`로 차단한다. 날짜가 과거라는 이유로 새 수동 입력을 거부하지 않는다. 서버 사실 일괄 삭제는 하지 않았다.
- **Sleep 점수·메모:** 기존 main session에 선택적 0–100 점수와 한 줄 100자 메모를 추가했다. null과 0을 구분하며 자동 점수를 생성하지 않는다. 시간 endpoint와 별도 patch라 서로 덮어쓰지 않는다. Web 두 진입점과 Android가 같은 서버 모델을 사용한다. nap에는 점수를 적용하지 않는다.
- **Calendar 내부 3개 보기:** `일 / 주 캘린더 | 시간표 | 수면 시간표` 순서로 동일 `/calendar` 안에서 전환한다. 기존 Sleep Web과 진짜 공유하는 `SleepWeeklyTimetable` 및 데이터/actions를 사용한다. KST 월–일, 선택 주/날짜와 기존 Calendar 필터를 보존한다. 기존 시간표의 좌우 패널·목표/메모·Markdown 철학 편집기를 재사용했다.
- **일일 회고:** WORK_OS의 기존 `ReflectionEntry`와 NOTE provider/snapshot을 확장했다. 날짜별 제목 100자, 점수 0–100, 독립된 moodLevel 1–5, 여러 줄 메모 10,000자를 지원한다. 주 보기의 7개 작은 셀, 일 보기 패널, 점수 바로 옆 5개 이모지와 해제, autosave/retry/동시 수정 보호를 구현했다. native dialog 안의 Calendar 단축키를 차단하고 Escape 저장/닫기를 실제 브라우저에서 검증했다.
- **하단 정리:** 기본 Actual/Plan 시간 미지정 행을 제거했다. 과거 기록은 명시적으로 펼치는 `기존 시간 미지정 기록`에서 기존 상세 편집기로 접근한다. 기존 서버 이벤트를 삭제하지 않았다. Sleep DUE는 긴 배지 목록 대신 어제/오늘 최대 4 endpoint의 작은 요약으로 바꿨으며, 과거 미기록과 현재 조치 대상을 구분한다.

## 저장소·커밋·마이그레이션

| 대상 | 반영 상태 |
| --- | --- |
| POS `personal-work-os` | `origin/dev`에 통합·push. API 배포 코드 `3f9a9fb86533dbc805d8fc26f806b56e9f9147c9`, 최종 Web 코드 `334381284a40f6be61f60198a98a2d302fbd6074` |
| 주요 POS 통합 | `7514eb3` 공유 Calendar host, `e77cf29` 최종 migration 순번, `3826f78` 격리 검증 fixture, `3f9a9fb` embedded light theme, `3343812` Escape 처리 |
| Sleep Android `sleep-app` | 기본 `feat/pos/sleep-v0`에 push. 구현 `cb376e86e177ae5c7a8756f5d071417561bbf0b5`, APK/검증 근거 `a926665280ece197e6fbbc33999c57f90471ce61`, 현재 문서 `5fdbfef` |
| V95 | `V95__sleep_auto_sync_annotations.sql`, shared DEV checksum `-1408057407`, success=true |
| V96 | `V96__reflection_daily_annotations.sql`, shared DEV checksum `787826698`, success=true |

병행 시간표 작업의 V94가 먼저 DEV에 적용되어 해당 코드를 merge했다. 이번 변경은 아직 shared DEV에 적용하지 않았던 V92/V93을 V95/V96으로 옮겼으며, 이미 적용된 V94(checksum 294450930)는 수정하지 않았다. 최종 jar에 구형 V92/V93이 없는 것도 확인했다. 초기 격리 검증 번호와 최종 배포 번호를 구분한다.

제출 직전 origin/dev에 추가된 별도 시간표 그룹 드래그 `9a71346`/merge `f2ea845`도 fast-forward로 보존했다. 그 상태에서 Calendar 전환·회고·시간표 드래그 관련 11개 검사를 추가 통과했다(`frontend-closeout-tests.txt`). 위 184개 backend 및 hosted DEV 결과는 명시한 배포 SHA 시점의 근거이며, 별도 작업의 이후 backend 변경까지 재검증했다고 주장하지 않는다.

## 실행한 검증

| 검증 | 실제 결과·근거 |
| --- | --- |
| Backend + 실제 격리 PostgreSQL | **184 tests, 실패/오류/skip 0**. Sleep 자동/수동 우선, tombstone, idempotency, owner 분리, annotations, reflection/snapshot, 병행 시간표 회귀. `evidence/backend-summary.json`, `backend-checks.txt` |
| Android JVM | **92 tests, 실패/오류/skip 0**. 아침/야간/불확실 후보, 중복, outbox/restart, 일회 cutover 및 확인 데이터 보존. `android-junit-summary.json` |
| Android build/lint | debug 앱·androidTest APK build와 lint 성공. lint 0 errors/51 warnings. APK source stamp는 `cb376e8`, treeDirty=false. 서명 v2 및 기존 개인 배포와 같은 인증서 확인. `ANDROID_HANDOFF.md` |
| Frontend | 초기 관련 46개, 주석/회고 등 집중 37개, 시간표 통합 후 18개, 마지막 Escape 회귀 10개 통과. 집합이 겹치므로 합산하지 않는다. scoped ESLint, TypeScript/Next production build 성공. 마지막 Web SHA의 Railway production build도 성공. `frontend-*.txt` |
| 실제 HTTP smoke | 합성 owner, task 전용 loopback DB/API에서 5개 시나리오 통과. 자동 idempotency, 수동 우선/annotation 독립 병합, 잘못된 점수 거부, 구형 replay 차단, 미지정 기록 보존. `api-smoke.json` |
| 실제 TEAM KAFKA Chrome | 회고 0점·5단계 감정/해제·리로드·모드별 동일 날짜, 주7/일1 셀, 기존 미지정 상세, 동일 경로/탭 수와 주 경계, Sleep 양쪽 host 같은 저장 내용, 15초 동일 operation 자동 재시도, 회고 실패 후 초안/재시도 확인. 1366/960 폭에서 7열과 body overflow 없음. `browser-summary.json` |
| 최종 hosted DEV | Web `3343812`에서 회고 Escape 닫기, 7개 날짜·Sleep 열, 밝은 배경, 가로 body overflow 없음, DUE 배지 배열 제거/현재 endpoint 4개 확인. 이 검사는 읽기 전용이며 shared DEV 사용자 기록을 수정하지 않았다. |

검증 도중 D드라이브 initdb timeout, Next build 도중 runtime 시작, 초기 복사된 migration fixture 재사용 문제가 있었다. 실패를 PASS로 처리하지 않고 격리 runtime/fixture를 수정한 뒤 최종 184개 및 실제 브라우저 검증을 다시 수행했다. 없는 날짜 회고의 기존 GET 404와 의도적으로 중단한 저장 요청은 별도로 기록했다.

## DEV·APK·화면

- [DEV Calendar](https://workflow-web-development-development.up.railway.app/calendar)
- [DEV 수면 시간표](https://workflow-web-development-development.up.railway.app/calendar?tab=sleep)
- [DEV API health](https://workflow-api-development-development.up.railway.app/actuator/health): UP 확인.
- API deployment `a77a4479-a072-4911-a114-d6779ef75a28`, Web deployment `c9a69b87-3dc1-4d7f-bb16-8a16712a76e7`: SUCCESS. `evidence/dev-deployments.json`
- [Android 0.5.0 / code 9 DEV APK](https://drive.google.com/file/d/1SyWTBBamOiJkh6zOGRuwPG0u4WthUrqQ/view?usp=drivesdk): 26,238,405 bytes. 로컬 SHA256 `534cb43c9fc713f43aacf84f6cf1d9c24c533bd1fc5df82c0fe55b3bb1c3f9d3`. Drive 파일명·크기·부모 폴더를 connector readback으로 확인했다. 원격 hash 검증으로 표현하지 않는다.
- 이 APK는 **로컬 DEV `https://localhost:8451`용**이다. hosted DEV/PROD 폰 설치본으로 간주하면 안 된다.

변경 전 실제 화면에서는 미지정 셀 14개와 DUE 버튼 20개를 관찰했다. 프롬프트의 28개 스크린샷은 이번 대화에 별도 첨부되지 않아 동일 화면을 관찰했다고 주장하지 않는다.

| 화면 | 근거 |
| --- | --- |
| 변경 전 Calendar | `evidence/sleep-calendar-before.png` |
| 회고 편집기·저장된 주 보기 | `evidence/sleep-calendar-reflection-editor.png`, `sleep-calendar-week-after.png` |
| 1366 / 960 반응형 | `evidence/sleep-calendar-week-1366.png`, `sleep-calendar-week-960.png` |
| 최종 hosted 공유 Sleep | `evidence/hosted-sleep-final.png` |

## 남은 검증·배포 준비도

**DEV 구현·자동 검증은 완료했으며 PROD 승격 준비 완료로 선언하지 않는다.** `adb devices -l`에 연결 기기가 없어 실기기/에뮬레이터 설치 실행은 하지 않았다. 실제 OS Usage Access, 잠금 해제와 종료 세션, 앱 업그레이드 cutover, 재부팅·백그라운드/OEM 절전, 폰 오프라인→온라인과 hosted 서버 양방향 확인은 기기 검증이 남아 있다. 자동화 증거를 실제 아침 폰 동작 검증으로 대체하지 않는다.

실기기 검증 후 별도 명시적 PROD release 절차가 필요하다. 이 작업은 PROD 배포·PROD 기록 변경·서버 전역 정리를 수행하지 않았다. 다른 병행 작업의 PROD 배포 여부와 구분한다.

구형 main/nap action은 cutover 후 업그레이드 오류를 받는다. GET/settings는 유지한다. 서버 v2 → 새 Web/Android 순서로 배포하고, 구형 queue에 v2를 소급 부여하지 않는다. 수동 기록은 권한 누락 시에도 fallback으로 유지한다.

롤백 시 새 Android 자동 producer를 먼저 중단하고 v2 호환 Web/API를 사용한다. 필요하면 API 이전 기준 `6727184`를 검토하되, 구형 API가 새 AUTO/ANNOTATE action을 이해하지 못함을 고려해야 한다. V95/V96 컬럼·서버 사실·이력을 보존하고 down migration이나 삭제로 되돌리지 않는다. 폐기한 구형 미전송 backlog는 복구하지 않으며, 확인된 서버 사실을 다시 가져온다.

검증 runtime은 종료했으며 전용 PG/API/Web 포트 55445/13243/13242 해제와 disposable DB 제거를 확인했다(`evidence/cleanup.json`). 기존 POS checkout의 사용자 수정·로컬 Morning 커밋 및 Android의 기존 untracked QA 디렉터리는 보존했다. 하위 작업용 worktree 등록/branch는 제거했고, 최종 통합 worktree는 후속 검토용으로 보존했다. 검증·인수인계 사본은 `F:/artifacts/POS_SLEEP_CALENDAR_AUTO_REVIEW_20261024`에 보관한다. 자격 증명·원시 Usage·무관한 개인 로그는 인수인계에 포함하지 않는다.

관련 상세: `PREFLIGHT.md`, `ANDROID_HANDOFF.md`, `evidence/` 및 저장소 `qa/sleep-calendar-owned-runtime.mjs`, `qa/sleep-calendar-smoke.mjs`.

정리 제한: 하위 작업용 worktree 등록과 branch는 제거됐으나 `calendar-daily-reflection`, `sleep-auto-android` 디렉터리에 Windows 읽기 전용 파일이 남았다. 이 두 잔여 폴더의 검증된 경로 재귀 삭제는 자동 승인 검토가 `blocked by policy`로 거부해 그대로 보존했다. 데이터/소스 제출에는 영향이 없으며 강제 우회하지 않았다.

