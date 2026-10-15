# Sleep Web V2 / LIFE OS 통합 캘린더 재개 검증 기록

2026-10-15 KST. **진행 중 — 공용 QA·배포 슬롯 인계 대기. 신규 수정의 PROD 반영 완료를 아직 선언하지 않는다.**

기존 Sleep V2는 후속 POS 배포에 포함되어 PROD에서 동작 중임을 실제 배포와 인증 API로 확인했다. 10월 13일 보고서의 ‘PROD 미반영’은 당시 상태이며 현재 배포 상태와 구분한다. 시작 시 DEV `1f323d4`, PROD `a105d2c`의 Sleep 핵심 다섯 파일은 승인 후보 `b123c59`와 같은 Git blob이었다. 이후 PROD는 DIET 변경 `07d2f83`으로 이동했다.

**구현 범위와 원본 API**

| 경로 | 확인한 동작 |
|---|---|
| `/life/sleep` | 주간 기본, 일별·주간·월간, 야간·낮잠, 추천·기록 상세 |
| `/life/sleep/records` | 기존 주소 호환 구현 유지 |
| `/life/sleep/statistics` | 기록된 야간 평균·낮잠 1회 평균, 기존 7/30일 지표 계약 유지 |
| `/life/sleep/settings` | 공유 알림 설정·기기 할당 계약 유지 |
| `/life/calendar` | 독립 LIFE OS 경로, Sleep·Nap·Exercise·Calendar SYS 합성 조회 |

Sleep/Nap은 원본 `/api/sleep/v1/intervals`, `/actions`, `/naps/actions`와 기존 UUID·revision·operationId를 사용한다. Exercise는 `/api/exercise/v1/state`, `/mutations` 원본 SAVE를 사용한다. Calendar SYS는 실제 `/api/calendar` 응답을 사용하며 통합 화면에서 읽기 전용이다. 캘린더용 수면·운동 사본이나 새 authoritative store를 만들지 않았다.

**이번에 확인해 수정한 결함**

- 96px 운동 카드 내부가 `scrollHeight109 / clientHeight94`로 잘렸다. 반복 안내 문장을 제거하고 글줄·간격을 조정해 실제 브라우저에서 잘림 해소를 확인했다. 시간 점유선과 공통 안내는 유지했다.
- 밀집 기록을 가로 스크롤하면 시간축이 사라졌다. 공유 시간축과 KST 머리글을 sticky로 고정했다. 최종 배포 버전의 수락 확인은 인계 후 수행한다.
- 실제 제품의 `LIFE OS` 표기와 달랐던 GlobalTabs 테스트의 오래된 `LIFE CODE` 기대값을 갱신했다.

변경 파일은 `frontend/components/life-calendar/TimeCalendar.tsx`, `calendar.css`, `frontend/components/GlobalTabs.test.tsx` 세 개다. 개발 통합 커밋은 `7b1b355`, `0fa0e62`; PROD `07d2f83` 기반 격리 후보는 `a06cf31`, `9a16bc0`이다. 최신 동시 작업을 보존하도록 배포 직전에 PROD head를 다시 확인해야 한다.

**검증 결과**

| 검사 | 결과와 범위 |
|---|---|
| 프론트 집중 회귀 | PASS 41/41, 실패·skip0; GlobalTabs 포함 |
| TypeScript / scoped ESLint / Next production build | PASS. 초기 생성 route 타입과의 경합은 최종 build 후 재검사에서 해소 |
| 현재 인증·owner 보안 회귀 | PASS 18/18, 실패·오류·skip0. JWT decoder/subject/identity mirror와 Sleep·Nap 권한 경로. 공유 DB 미사용 |
| Android JVM 회귀 | PASS 54/54, 실패·오류·skip0; Outbox18, Recorder7, Reminder4, SleepV2 13, SyncRecovery12 |
| 기존 서버 회귀 | 기존 증거 96건·추가 Exercise2건·통합 집중29건 재사용. 이번 UI 수정에서 서버·DB 계약 변경 없음 |
| 운동 실제 마우스 이동·양끝 조절 | PASS. 64px=60분 이동, 16px=15분 조절, 원본 ID·초·date·elapsedSeconds·memo·exercises 보존 |
| 운동 동시 수정 | PASS. 실제 원본 revision 선행 갱신 후 stale 저장409, 초안 유지, 최신 revision 비교·재적용 후 저장 |
| 수면 자정 경계 이동·시작 조절·Undo | PASS. 같은 원본 ID, 42/12초와 offset540 보존. Undo 원본 API200, revision4→5. 재조회 시 원본1건 |
| 낮잠 생성·수정·실패 복구 | PASS. revision1→2→3. 네트워크 실패2회 후 새로고침·재시도의 본문과 operationId가 동일함을 네트워크 원문 비교로 확인 |
| Calendar SYS | PASS. 실제 기존 persisted 계획·실행·상태 조회. QA 일정도 원래 `/api/planned-blocks`에 저장 후 합성 조회. 30px 카드, 실제90분 점유선96px, 편집 핸들·저장 버튼0, 필터 숨김 확인 |
| 화면 모드 | PASS. 일별1열, 주간7열, 월간42셀 전환 |
| 화면 캡처 | Sleep/통합 각각1600·1366·1024·390px, light/dark16장과 승인 V4 비교1장 저장. 이미지 크기·해시 보관 |
| PROD 인증 읽기 smoke | PASS. Sleep today/intervals/metrics/nap summary, Exercise state, Calendar 모두200. Sleep·Exercise 동일 owner, 실제 수면5·운동문서6·Calendar 실행31/상태2 조회. PROD 쓰기 요청0 |
| Flip6 실제 양방향 동기화 | NOT VERIFIED. 연결된 SM-F741N의 운영 앱0.3.1만 확인. 사용자가 DEV 전용 앱 없음과 검증 보류를 명시적으로 확인 |

브라우저는 기존 TEAM KAFKA Default와 공식 `team_kafka_playwright`0.0.83/확장0.4.0을 사용했다. 개인 Chrome과 무관한 사용자 탭·그룹은 제어하지 않았다. 공식 provider의 자동화 소유 탭 관리 예외를 적용했다. 기존 Codex 확장 전용 Phase2 검사는 공식 provider의 미노출 browser/instance ID를 수용하지 않아 `SUPPORTED_CONNECTION_REQUIRED`로 종료했다. 이를 PASS로 바꾸거나 식별자를 만들어 넣지 않았다. 별도로 실제 프로필 bootstrap, loopback relay `::1:8188`, 인증 조회·DOM·입력·네트워크·캡처 결과를 보관했다. tracing은 NOT VERIFIED다.

간헐적인 actionability/60초 transport timeout은 실패 이력으로 유지한다. 소유 탭 재선택·키보드 입력과 실제 후속 요청·DOM·파일 관찰로 복구한 검사는 제품 결과와 구분했다. 시간 측정 없는 도구 왕복 시간을 화면 성능으로 보고하지 않는다.

**배포와 동시 작업**

DEV 프론트 업로드 `e20ade52-f4ac-48c7-b568-dcfd41023937`은 성공했고 운동 가독성 수정이 실제 반영된 동안 검증했다. 후속 업로드는 `b73ca6b4-86b9-4d16-8b74-62c1666410b2`다. 이후 Money 후보 `0180a6b`가 DEV를 교체해 두 업로드는 REMOVED 상태가 됐다. 업로드 배포는 Railway metadata에 Git SHA가 노출되지 않아, 업로드한 소스 SHA와 Railway 배포 ID를 구분해 기록한다.

공용 `.git/pos-central-qa.lock`은 `money-acceptance-20261015 / PID18420`이 보유한다. 이 잠금을 뒤늦게 확인해 DEV 업로드가 동시 작업과 겹쳤다. 이후 공유 쓰기·배포를 중단했고, 사용자가 승인한 조율 메시지를 `Implement MONEY SYS UX/UI revisions` 채팅에 전송했다. 잠금을 삭제·탈취하거나 Money 후보·대기 설정을 덮어쓰지 않는다. 실제 PROD의 기존 Sleep V2와 이번 작은 수정의 PROD 승격을 혼동하지 않는다.

**데이터·정리와 남은 항목**

현재 Railway DB는 DEV `pos_dev_final`, PROD `pos_prod_final`이며, 둘 다 Flyway V83과 아홉 원본 테이블의 실제 column 계약을 READ ONLY 트랜잭션으로 확인했다. 원본 행 내용은 내보내지 않았다. 새 migration/table/backfill, Android 소스 수정, 운영 데이터 수정은 없다. 원본 API 검사용 DEV fixture는 수면1·낮잠1·운동8·Calendar 계획1건이다. timeout 후 재시도된 seed handler 두 개가 모두 실행돼 운동8건이 생겼으며 전부 새 QA ID로 등록했다. 기존 사용자 운동을 복제한 것은 아니다. 정확한 ID는 작업 전용 `.qa/resume-20261015/fixtures.json`에 보관했고, 슬롯 인계 후 해당 ID만 원래 DELETE/TRASH/PURGE API로 정리한다. 기존 데이터와 대기열은 삭제하지 않는다.

남은 작업은 정상 QA 슬롯 인계, 최종 배포 버전의 시간축/가독성 확인, 수면 종료 핸들의 최종 실제 pointer 검사·취소 확인, DEV fixture 정리, 최신 PROD를 보존한 수정 승격과 인증 smoke, 최종 증거 커밋·안전한 작업 공간 정리다. 승인 V4의 정보 계층과 실제 계약을 비교했고, 기존 POS shell·실제 지표 구성에 따른 간격 차이는 남는다. 픽셀 단위 일치를 주장하지 않는다. 시각 미지정/진행 중 운동은 원래 계약대로 미지정 목록·읽기 전용이며, 목업 전용14일 통계·삭제 Undo·휴대폰 후보 수집 기능은 추가하지 않았다.

반복 가능한 읽기 전용 viewport·테마·모드·원본 ID·가독성·시간축·SYS 검사 함수는 `qa/sleep-life-calendar-browser.mjs`에 준비했다. 배포 인계 후 실제 최종 버전에 실행한다.

상세 기계 증거는 `evidence/resume-20261015/acceptance.json`, `android-unit.json`, `browser-preflight.json`, `screenshots.json`에 있다. 보고서는 배포 인계 후 최종 상태로 갱신한다.
