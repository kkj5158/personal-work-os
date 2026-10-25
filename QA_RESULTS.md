# QA 결과 — DIET NOTE 통합 / 2026-10-25

검증 범위: 제품 소스 POS `c9c460949ab020f97746f4981679f4706f574b4b`, 모바일 `c494f943d665a66a61ee45d25223b014eaa14692` (마지막 코드 `15dd9d6`). 기존 개발 브랜치의 unrelated Sleep 변경은 그대로 보존했습니다. 실제 PROD 사용자 데이터로 QA하지 않았습니다.

## 실행 환경과 판정

Windows / Node 24 계열 / Java 21 / PostgreSQL 18 / Next 16.3 / 실제 Tiptap, 실제 Expo V2 소스. 전용 loopback PostgreSQL `55453`, API `13453`, Web `13454`에서 합성 사용자만 사용했습니다. 모든 Flyway 마이그레이션과 V98은 이 전용 DB에만 적용했습니다. 공유 DEV와 PROD DB는 연결하지 않았습니다.

| 검사 | 결과 | 증거/정확한 범위 |
|---|---|---|
| 챌린지/체크리스트/날짜/일지/비교 편집기 자동 테스트 | PASS 37/37 | `.qa/frontend-final-tests.log`; 실제 React/Tiptap 테스트 포함 |
| 기존 NOTE 모델/Markdown/이미지/IME/직렬 autosave 회귀 | PASS | `npm run test:notes`; 두 검증 스크립트 |
| 영향 백엔드 검사 | PASS 68, 환경 조건 제외 23 | `gradlew test --tests com.kafka.backend.diet.* --tests com.kafka.backend.notesystem.* bootJar`; 전체 91 cases |
| 추가 보존/원본 Camera/DIET/본문 실제 DB 검사 | PASS 14/14 | Camera 1 + 기존 DIET 12 + 확장 JournalBridge 1. 앞선 Bridge 1과 중복이며 별도 14개 신규 테스트로 합산하지 않음 |
| 실 API 왕복 | PASS 7/7 | `api-results.json`; 실제 PNG 업로드/바이트, 본문·사진 순서, 충돌·삭제 버전·데이터 보존 |
| 웹 주요 브라우저 동작 | PASS 9/9 | `browser/results.json`; 마지막 runtime revision 필드는 시작 SHA, 실제 최종 코드/번들은 final-provenance 참조 |
| 운영 노트/기존 메뉴 추가 브라우저 | PASS 4/4 | `browser/operations-results.json`; 실제 pointer DnD, 실패 복원, 생성·이름/본문·휴지통, 기존 모든 노트/검색 |
| 모바일 코어/컴포넌트 | PASS 46 | 39 core + 기존 5 + 공유 이미지 컴포넌트 2 |
| 실제 모바일 앱 소스 UI 왕복 | PASS 6/6 | `mobile-live-results.json`; Chromium 430×932에서 실제 Expo V2 소스 실행. 단순 웹 목업/스텁 아님 |
| 모바일 타입/영향 lint/Expo config/웹 export/Android Hermes export | PASS | 모바일 인계 보고서·증거. 새 APK 설치/배포와 구분 |
| 프런트엔드 production build / TypeScript | PASS | 최종 build log, Next route type 생성 포함 |
| 새/변경 UI·어댑터 영향 lint | PASS | `frontend-affected-lint.log` |
| 기존 NoteEditor lint | 기존 부채 잔존 | 기준 10 errors/5 warnings → 최종 9 errors/5 warnings. refs/set-state-in-effect/기존 의존성 경고. 전체 lint PASS 아님 |
| PROD / 공유 DEV / 실제 Android / 새 APK | NOT RUN | 배포·실기기 승인/실행 범위와 분리. 구현 PASS로 승격하지 않음 |

환경 조건으로 끝까지 미실행한 기존 영역은 DietBoardIntegrationTest 2개와 DietMeasurementPostgresTest 8개입니다. Camera 1개와 DietIntegrationTest 12개는 추가로 실제 DB에서 실행했습니다. 측정의 UI 날짜·누락·구간 timestamp/단위는 37개 프런트엔드 검사 및 실제 브라우저/API에서 확인했습니다. Central Full QA는 실행하지 않았습니다.

## 수락 항목 상세

- PASS — 기존 유형/역할/상태, 미래 시작 표시, 실제 지표·unknown 상태, 생성/편집/초안/취소/모두 저장/부분 실패 보호. 기존 색상·항목 선택·메모·마일스톤 옵션 유지.
- PASS — 같은 공용 모달에서 저장·닫기·삭제. 실제 제목 확인, 삭제 실패 후 객체 유지·재시도, 기존 CAS 충돌 거절. 공유 일지/측정/체크 항목/체크 기록 보존.
- PASS — 실제 체크리스트 bulk API를 통한 check/uncheck/reload, 실패 rollback/retry, 네 상태와 CORE/SECONDARY/OPTIONAL, 미입력과 기록 못함 구분, 기존 성공률 계산.
- PASS — 선택일 측정 카드, 아침·취침 전 구간/시각 분리, 지원되지 않는 취침 체중 없음, 미측정 상태.
- PASS — 임베드 안에 중복 일지·textarea·두 번째 contenteditable 없음. 기존 본문은 임베드 밖에 유지.
- PASS — 모바일→웹, 웹→모바일 텍스트+NOTE 이미지+캡션, 날짜/사용자 일치, 원본 참조/순서/서식 유지, reload, 실제 409와 오프라인 초안 보존, 중복 첨부 방지.
- PASS — V98 삭제 tombstone의 단조 증가 버전, 삭제 후 오래된 version0/과거 version 재입력 거절, 최초 가상 빈 날짜 저장 경합, 원본 Camera 삭제/복원 및 공유 참조 보호.
- PASS — Workspace 명시적 변경 후 같은 사용자 공유 일지 이미지 접근, OFF 이후 기존 참조 읽기/편집 보존, 다른 사용자 미디어 접근 거절.
- PASS — 왼쪽 날짜/오른쪽 제목 목록, 드래그/키보드 순서 server roundtrip 및 reload, 순서 실패 UI 복구, 생성/이름/본문/휴지통. 중복 제목은 기존 NOTE 이름/별칭 제약으로 설명하고 거절.
- PASS — 기본 중앙 단일 Daily Note, 선택 시 중앙 좌/우 두 문서, 서로 다른 ID/저장, 각자 스크롤, 노트 교체·닫기·선택 해제, 날짜 변경 시 운영 편집기 유지, 실패 flush 시 이동 차단.
- PASS — 1920px에서 중앙 각 598px, 1440px에서 각 약 365px로 실제 side-by-side. 900/600px에서는 접근 가능한 stacked fallback, 문서 가로 overflow 없음. 새 운영 노트 생성 대화상자에 레이블/포커스/Tab/Escape 추가.
- PASS — 기존 모든 노트와 검색, NOTE Markdown/미디어/IME/포커스/독립 단축키 영향 회귀.

## 증거와 한계

전/후 비교의 전 자료는 사용자가 ZIP에 제공한 기존 UI 스크린샷이며 이번 세션에서 과거 버전을 다시 실행한 화면은 아닙니다. 최종 후 화면은 전용 합성 DEV에서 촬영했습니다. 승인 이미지의 날짜/체중/상태는 사용자 데이터에 넣지 않았습니다.

`final-provenance.json`은 실제 제품 소스 SHA, frontend/backend tree, Next build ID와 최종 layout 치수를 기록합니다. 초기 runtime owner 파일과 browser 결과의 bootstrap SHA는 실행 중 재빌드 이전 시작점입니다. 제품 변경 뒤 새 번들을 빌드하고 영향 검증을 다시 수행했습니다. 보고서 전용 후속 커밋은 제품 코드에 영향을 주지 않습니다.

공유 본문은 기존 모바일 20,000자 제한을 유지합니다. 초과 기존 본문을 잘라내지 않고 실패/초안 보존으로 처리합니다. 모바일 rich text는 Markdown 원본 보존과 이미지 읽기 투영이며 WYSIWYG가 아닙니다. 실제 Android 설치/오프라인·재시작/기기 화면 수락은 별도 확인해야 합니다.

발견 후 수정·재검증한 문제: Camera 날짜 SQL의 잘못된 컬럼 조건, MVC 테스트 의존성 fixture, 파생 대시보드 버전 충돌 시 안전한 재시도, fenced code 안의 예시 블록 보호, 삭제 후 최초 웹 저장 경합, 기존 수동 웹 본문 초기 호환, Workspace 변경 뒤 이미지 참조, 새 운영 노트 대화상자 접근성. 자동화 harness의 CSS 로딩/Node 경로/Markdown escape 비교 오류는 제품 결함과 분리해 수정했습니다.

## 정리/배포 판정

PROD 변경 **없음**. 공유 DEV 마이그레이션/Hosted DEV 배포 인증 **미수행**. 검토용 로컬 합성 DB/API/Web과 통합 작업트리는 의도적으로 유지합니다. 원래 사용자 변경은 보존하고 병렬 POS 작업트리 세 개를 정리했습니다. 모바일 임시 의존성 정션 삭제 1건은 자동 승인 검토가 `blocked by policy`로 거절해 작업트리 정리가 남았습니다. Drive 업로드는 구현/배포 승인 또는 실기기 PASS를 의미하지 않습니다.
