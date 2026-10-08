# POS LIFE OS / Sleep Web V1 — 구현·운영 인계

2026-10-08 UTC / 2026-10-08–09 KST. **V1 구현, DEV 검증, 동일 후보 PROD 승격, 정상 인증 smoke와 데이터 정리 완료.** 사용자 D01–D07 승인 및 업무 Drive 통합 지침을 실행 기준으로 사용했다. 추가 디자인 승인 없이 승인된 네 화면과 회상 낮잠 기록을 제공한다.

## 바로 사용

- [PROD 수면 개요](https://personal-work-os-frontend-prod-production.up.railway.app/life/sleep)
- [PROD 수면 기록](https://personal-work-os-frontend-prod-production.up.railway.app/life/sleep/records)
- 정상 POS 계정으로 로그인 → **기록 → 낮잠 추가** → 시작·종료의 날짜와 시각 입력 → 표시된 간격 확인 → 저장.
- 수정은 기록 선택 후 변경한 항목만 저장한다. 주수면 수정은 8초 Undo, 삭제는 확인 후 영구 삭제이며 Undo가 없다.
- 오프라인에는 입력을 보관한다. 온라인으로 돌아와 명시적으로 저장한다. 응답이 불명확하면 기존 요청을 그대로 재시도한다. 충돌에서는 서버 값과 입력을 비교하고 재적용한다.
- 확인되지 않은 요청이 있으면 결과를 먼저 확인해야 로그아웃·폐기할 수 있다. 일반 미저장 입력은 확인 후 폐기할 수 있다. 초안은 로그인 owner별로 분리하며 토큰은 저장하지 않는다.
- Web은 서버에 도착한 기록을 표시한다. Android의 미전송 outbox 내용까지 동기화됐다고 표시하지 않는다.

## 구현 범위

개요·기록·통계·설정 네 경로, 기존 POS shell/모바일 drawer/탭/이동 guard를 연결했다. LIFE OS는 표시명이며 기존 LIFE identity, 기본 진입 `/life/categories`, 사용자 탭 제목·pin·순서·storage version을 보존한다.

주수면은 기존 action envelope로 사후 생성·수정·삭제·Undo를 지원한다. 수정하지 않은 endpoint의 certainty/source/timezone/offset/초 단위 사실을 보존한다. 기록은 달력/목록, 날짜 이동, 기존 주수면과 별도 낮잠, 같은 날 여러 낮잠과 전체 cursor 조회를 제공한다. 낮잠은 양끝 날짜·시각으로 회상 기록하며 시작 endpoint 현지 날짜에 속한다.

주수면 기존 7/30일 지표·원형 시각·coverage·sample/baseline/null 상태와 낮잠 별도 집계를 표시한다. 설정은 공유 bedtime/wake 선호를 revision으로 저장하고 Android reminderDeviceId를 유지한다. 별도 장치 할당 API는 호출하지 않는다. 겹침은 양방향·OPEN·동시 쓰기에서 원자적으로 거절하며 인접 구간은 허용한다. 18h 이상은 확인하고 24h 초과도 허용한다. DST gap/fold와 서로 다른 endpoint 시간대를 처리한다.

Android 낮잠 UI/sync, Flip6 실기기 QA, Web live capture/알람, 드래그 편집, Usage 수집, AI/수면 점수, 자유기간 분석, bulk export/delete, 새 목표·서버 시간대 설정은 범위 밖이다. Flip6 QA는 계속 보류한다.

## 소스와 배포

기준 소스 `2004063443e7321b15dd8663f265e896133bd90e`에서 격리 작업했다. 최종 검증·배포한 애플리케이션 후보는 **`5a0e27eacf75fca57edaedd40c45205f3f9296a8`**다. 관련 커밋: `c639094` 구현, `44b85bf` context/표시 보완, `ce0def4` Android main snapshot 보호, `5a0e27e` 읽기 쉬운 충돌 비교.

| 환경 | Web | API |
|---|---|---|
| DEV | [DEV Web](https://workflow-web-development-development.up.railway.app/life/sleep) | [DEV health](https://workflow-api-development-development.up.railway.app/actuator/health) |
| PROD | [PROD Web](https://personal-work-os-frontend-prod-production.up.railway.app/life/sleep) | [PROD health](https://personal-work-os-prod-production.up.railway.app/actuator/health) |

동일 후보의 Railway 네 배포가 SUCCESS다. [배포 원본 요약](evidence/release-deployments.json):

| 환경/서비스 | deployment ID | SUCCESS 확인 UTC |
|---|---|---|
| DEV API | `812d8079-e324-43c6-9a4c-6b13ab970fa8` | 2026-10-08 13:48:33 |
| DEV Web | `ba785af6-e4fd-4300-ac85-4a879d457d1e` | 2026-10-08 13:47:46 |
| PROD API | `9e3479a3-7198-43d6-9ddc-a968e72f0f85` | 2026-10-08 13:52:01 |
| PROD Web | `417145b9-b6ce-446c-95e2-941eff280f7c` | 2026-10-08 13:52:34 |

최종 문서·읽기 전용 cleanup 검사 스크립트의 후속 커밋은 애플리케이션 소스를 바꾸지 않는다. 후속 Git HEAD/호스팅 receipt는 업무 Drive의 최종 release receipt에 별도로 기록해 문서 SHA를 문서 자체에 넣는 재귀 배포를 피한다. 앱 동작 검증 SHA는 위 후보로 고정한다.

## 마이그레이션·기존 데이터 보존

V77 head와 다른 작업의 예약을 재확인하고 release lock을 확보한 뒤 **V78__sleep_web_naps.sql**을 배정했다. DEV/PROD 정상 Flyway startup으로 적용, head V78 / rank 76 / checksum **1519532796**. V76 checksum **-1323816615**, V77 **-1186329994** 및 이전 history prefix가 그대로다. V70/V76 원본 파일은 변경하지 않았다.

V78은 낮잠 facts/events/tombstones 세 테이블만 추가한다. RLS enabled, 브라우저 정책 0개, 기존 owner 인증·서비스 경유이며 DB reset/repair/backfill/기존 사실 재분류는 없었다. [DB 체크포인트 요약](evidence/db-preservation.json)은 release-before/after-dev/after-prod/after-smoke 실제 읽기 전용 검사의 파생 자료다. 개인 행 key/hash는 비공개 로컬 증거에만 보존한다.

PROD 기존 settings 1, cycles 6, sessions 2, events 4, receipts 12, pending 8, main tombstones 2의 각 행 해시가 모두 유지됐다. 공용 context revision은 승인된 낮잠 쓰기의 조회 무효화 신호로 갱신한다. 기존 receipt 12개는 그대로이며 시험 쓰기 receipt 3개만 추가됐다.

정상 인증 smoke가 만든 유일한 낮잠 `be8d16f4-2df8-46a2-b125-47dfd29998b7`은 빈 과거 구간에 생성·수정한 뒤 삭제했다. 실제 PROD SQL에서 facts 0 / events 0 / 최소 tombstone 1 / redacted receipts 3 / private endpoint keys 0을 확인했다. DELETE receipt의 nap에는 id/revision/deleted만 남는다. [정리 검사](evidence/prod-cleanup-privacy.json)와 [인증 smoke](evidence/hosted-prod.json). 원래 사용자 기록은 삭제·수정하지 않았다.

## 실제 수행한 검증

| 검증 | 결과 |
|---|---|
| 기존 Sleep PostgreSQL/recorder/time + 보안 profile | 이번 초기 후보에서 58 executions / 고유 38개 통과. 최종 전체 58회를 반복했다고 주장하지 않는다 |
| 최종 낮잠 영속성·Android 계약 focused | 실제 PostgreSQL 13/13, skip 0; revision/replay/owner/RLS/delete redaction/겹침/OPEN/Undo/동시 쓰기/기존 V76 facts 보존/같은 UUID namespace/main snapshot |
| 실제 production security chain | 3/3. WebMvc JWT decoder는 테스트 대역, 운영 smoke는 실제 정상 JWT |
| frontend 모델·global tabs | 17/17 |
| Next production build / TypeScript | 성공, 네 경로 생성 |
| 실제 Playwright 전체 화면 시나리오 | 19/19; 마지막 충돌 표시 변경 전 전체 실행 |
| 마지막 충돌 표시·Android snapshot 시나리오 | 추가 2/2; 변경 후 실제 브라우저 실행 |
| hosted DEV/PROD 읽기 전용 보안 경로 | 각 10 checks PASS, health/401/invalid bearer/CORS/login gate |
| PROD 정상 Supabase 인증 smoke | 9/9, 낮잠 CRUD/replay/conflict/기존 metrics·설정 보존/LIFE·Calendar/네 화면/정리 |

세부 [QA_MATRIX](QA_MATRIX.md), XML/로그/JSON은 [evidence](evidence/README.md)에 연결했다. 초기 replay 숫자 타입 비교 실패, UI 배치/재적용 경쟁 및 시험 도구 대기 실패 로그는 비공개 로컬에 원본 보존했다. 최종 성공 결과로 덮어쓰지 않았다. 개인정보 검사 첫 쿼리는 최소 identity의 `nap` 키까지 endpoint로 잘못 세었고, 실제 endpoint 키와 최소 nap key 집합을 구분한 읽기 전용 검사로 수정했다. 애플리케이션 변경은 없었다.

실제 화면: [390px light](evidence/records-390-light.png), [1280px dark](evidence/records-1280-dark.png), [통계](evidence/statistics-desktop.png), [충돌 비교](evidence/main-nap-conflict.png). 320/390/1280px light/dark, keyboard Tab/ShiftTab/focus, 모바일 drawer를 확인했다. 200%는 headless **CSS content zoom**으로 확인했으며 OS 실기기 확대 결과가 아니다. 이 이미지는 소유한 합성 DEV fixture의 실제 구현 화면이며 기획 HTML mockup이나 임시 실패 화면과 구분한다.

DEV 정상 인증 smoke는 기존 owner Chrome 프로필에 DEV Supabase 로그인 세션이 없어 실행할 수 없었다. 서비스 토큰·가짜 JWT로 대체하지 않았다. DEV는 격리된 실제 DB QA와 hosted 보안 경로를 검증했고 PROD 정상 로그인으로 최종 기능을 검증했다. PROD Chrome 기본 Playwright 인자 종료 문제는 기존 POS native Chrome 절차로 해결했다. 토큰은 메모리에서만 사용했다.

## Android·로컬 작업 보호

Android checkout을 확인했고 소스·API envelope·물리 장치는 변경하지 않았다. 기존 Android CONFLICT operation/localDocument 보존을 유지하며 main→nap 충돌의 serverSnapshot은 **원래 main canonical**이다. 겹친 nap은 별도 conflictingSnapshot이다. 아직 없는 main은 snapshot을 생략해 기존 상세 조회/404 복구를 따른다. 같은 UUID를 가진 서로 다른 리소스에서도 nap을 main cache로 덮지 않는다.

본 POS checkout의 기존 설정 2개·staged authoring PNG 7개·감사 파일은 10개 SHA256 모두 그대로다. 격리 작업에서 만든 런타임만 종료했고, 사실 0을 확인한 소유 DEV QA schema 9개만 정리했다. [런타임 정리](evidence/runtime-cleanup.json). 전체 실패·진행·row-hash 증거는 `D:/DEV_SPACE/personal-work-os/.qa/evidence/sleep-web-v1-20261008`에 비공개로 보존한다. 기획 ZIP·통합 지침 전문·추출본은 `D:/DEV_SPACE/sleep-app/.local-dev/sleep-web-v1-planning`에 유지한다.

## Drive 게시·다음 사용 개선

업무 계정 Kafka_AI_WorkSpace / hello@studio-kafka.com의 [06_IMPLEMENTATION_EVIDENCE__SLEEP_WEB_V1_20261008](https://drive.google.com/drive/folders/1rnQczHha3FnSNcimaNsBAkAVXgRpkdxz)에 최종 문서와 검증 ZIP을 게시한다. 기존 Sleep INDEX의 과거 이력은 보존하고 최신 closeout을 추가한다. 원본 handoff ZIP은 47,697 bytes / SHA256 `60161576f4d012c99375c03ed31965ae8cbdc9f1574008eda503838f31a0c265`를 확인했다. 공개 공유 권한을 만들지 않았다.

[NEXT_ITERATION](NEXT_ITERATION.md)은 실제 사용의 불편·재현 조건·계약 영향·다음 focused 검증을 기록하는 후속 개선 인계다. 승인된 기본 기능은 완료했으며 사용 경험을 받으면 이 기록을 기준으로 작은 수정부터 이어간다.

QA 재실행은 Windows Node/Java 21/Chrome/PostgreSQL CLI와 기존 POS QA environment를 사용한다. `scripts/sleep-web-dev.mjs` 실행 전 8462/13027(초기 harness 13620 포함) 포트가 비어 있는지 확인하고 `.qa/sleep-web-v1`을 만든다. isolated schema와 owned process만 정리한다. `scripts/sleep-web-nap-qa.mjs`, browser 및 Android-contract browser scripts가 영향을 받는 검증이다. DB audit/cleanup audit은 기존 비공개 `.qa/prod-dev-refresh-20261002/common.mjs` 및 POS 환경 identity 검증에 의존하며 다른 장치에 자격증명 없이 바로 실행되는 독립 도구로 표현하지 않는다. 후속 smoke는 정상 owner 세션이 필요하며 `probe` 모드는 읽기만 한다.
