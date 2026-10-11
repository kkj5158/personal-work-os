# CLOSEOUT — 나의 성향과 커리어 AUTHORING V1 (2026-10-11)

상태: **구현·DEV 검증·DEV/PROD 배포·PROD 인증 스모크 완료**

## 1. 승인된 원본

- Drive `100_PROPOSAL__CAREER_TEMPERAMENT_AUTHORING_V1` (`08_AUTHORING`, 문서 ID `1ASzBVDyAynC-XHY7pHd-j1dIyPfwS66vsIY6fQGPYxk`)
- 사용자 문안은 D장을 그대로 옮겼고, 선택지는 F장의 권장 기본값을 따랐다. 원본 문서는 수정하지 않았다.

| 결정 (G장) | 구현 |
| --- | --- |
| G-1 구조 | 6단계 + 마무리 |
| G-2 03 단계 | 이름과 문장 그대로. 진단명 없이 경험으로 묻는다 |
| G-3 마무리 | 선택 입력 세 개 (가장 먼저 해볼 일 / 다시 볼 시점 / 선택 앞에서 나에게 물을 질문) |
| G-4 제목·부제·카드 설명 | D장 문안 그대로 |
| G-5 위기 상황 연락처 | 넣지 않음 (원본에 문안이 없고, 기존 Topic과 같다) |
| G-6 작성 속도 | 공용 정책 그대로. 프로그램 안내에서만 며칠에 나눠 쓰기를 권장 |

## 2. 프로그램 식별

- program key: `career-temperament`
- definition version: `2026-10-11` (`backend/src/main/resources/authoring/career-temperament/2026-10-11.json`)
- 분류: TOPIC (주제 글쓰기 다섯 번째 카드)
- migration 없음, 새 질문 유형 없음

## 3. 구현 요약

- 01–06 단계는 각각 Main Question 하나, Guide 하나, 넓은 자유서술 Editor 하나(`FREE_TEXT`)다. Guide 항목마다 입력칸을 만들지 않았다.
- 03 단계의 고정 안내 문구는 Guide 바로 아래(Editor 위)에 항상 보인다.
- 프로그램 안내 다섯 문단은 첫 단계의 ‘프로그램 안내’와 전체 내용 보기에 표시된다.
- 마무리(07)는 선택 입력 세 개이며 필수 입력은 없다. 아무것도 쓰지 않아도 완료할 수 있다.
- 완료 대화상자는 D장의 자기 확인 문장 여섯 개를 보여준다.
- Report는 작성한 원문만 단계 순서대로 보여준다. 마무리 입력은 작성한 것만 나오고, 셋 다 비어 있으면 마무리 제목도 나오지 않는다.
- Library, 최근 작성, 변화와 방향 돌아보기(Review)의 원본 선택에 기존 방식 그대로 연결된다.
- LLM 호출, 점수, 유형, 적합도 판정은 없다. 작성 내용은 세션 JSONB에만 저장되고 log, URL에 들어가지 않는다.

### 원본과 다른 점 / 원본에 없어 정한 것

- Guide의 하위 항목(02의 세 구분, 05의 네 구분)은 `·` 기호와 줄바꿈 없는 공백 들여쓰기로 표시했다. 문장은 그대로다.
- 마무리는 기존 Topic(돈을 벌며 살아가는 방식)처럼 번호 07로 표시된다.
- 단계 제목 아래 Report 항목 제목으로 Main Question이 함께 표시된다 (기존 Report 형식).
- 카드 아이콘(서류가방)과 Library 표시(💼)는 원본에 없어 기존 관례에 맞춰 정했다.
- 공용 Report 화면에 한 가지를 바꿨다: 선택 입력만으로 이루어진 구역은 전부 비어 있으면 제목을 숨긴다. 기존 프로그램에는 이런 구역이 없어 기존 Report 표시는 달라지지 않는다.

## 4. 변경 파일

- backend: `AuthoringDefinitions.java`, `AuthoringService.java`, `authoring/career-temperament/2026-10-11.json`, `AuthoringServiceTest.java`, `AuthoringPostgresIntegrationTest.java`
- frontend: `AuthoringHome.tsx`, `SessionDocument.tsx`, `[program]/session/[sessionId]/[[...view]]/page.tsx`, `lib/authoring/types.ts`, `lib/globalTabs.ts`, 테스트 `CareerTemperamentSession.test.tsx`(신규), `ContentDefinitions.test.tsx`, `AuthoringHome.test.tsx`, `AuthoringLibrary.test.tsx`, `StructuredWriting.test.tsx`
- docs: `docs/AUTHORING_V2_IMPLEMENTATION.md`, 이 폴더

## 5. Git

- `37c9480` feat(authoring): add 나의 성향과 커리어 Topic program
- `118069e` docs(authoring): DEV evidence for 나의 성향과 커리어
- `db90a58` dev 병합 커밋. `prod`는 같은 커밋으로 fast-forward했다 (`6f4bb63` → `db90a58`)

## 6. 테스트

| 범위 | 결과 |
| --- | --- |
| backend `AuthoringServiceTest` | 28개 통과 (신규 1개 포함) |
| backend `AuthoringPostgresIntegrationTest` (공유 DEV DB) | 1개 통과 |
| frontend Authoring 테스트 5개 파일 | 24개 통과 (신규 3개 포함) |
| frontend eslint (`app/authoring`, `lib/authoring`, `lib/globalTabs.ts`) | 통과 |
| frontend `tsc --noEmit` | `app/layout.tsx`의 `LayoutProps` 오류 1건. 이번 변경과 무관하며 새 worktree에 Next 생성 타입이 없어 생긴 것이다 |

backend 전체 suite와 frontend build는 돌리지 않았다.

## 7. DEV 검증

- 로컬 frontend + feature backend(공유 DEV DB)에서 headless Chromium으로 58개 항목 통과: Home → 새 세션 → 작성 → 자동 저장 → 새로고침 → Home에서 이어쓰기 → 마무리 → 전체 내용 보기 → 완료 → Report → Library, 빈 세션 완료, Review 원본 선택, 390px 모바일, 완료 뒤 늦은 저장 거절, 요청 대상과 URL 점검.
- 다른 프로그램 다섯 개의 기존 완료 `[QA]` Report가 그대로 열리고 조회 전후 내용이 같았다.
- 호스티드 DEV (Railway Development): API `3e2fe16e-8a20-4458-9a04-0feb7e64e12c`, Web `f328e92a-bb05-427c-baa2-8a1e62d2395c`, 둘 다 `db90a58` SUCCESS. 로그인 없이 확인한 것: health 200, `/api/authoring/programs` 401, 로그인 화면, 번들에 새 program key 포함. **로그인한 화면 검증은 하지 못했다.**
- 화면 증거와 남겨둔 테스트 세션은 이 폴더의 `README.md`.

## 8. PROD 배포

- backend `60f0b03c-e350-46a4-9c40-3897a95c10b9`, frontend `0456d6d7-2b24-4f22-a96c-c49caceed8ae`, 둘 다 `db90a58` SUCCESS (2026-10-11 05:19 UTC 확인)
- 06:21 UTC에 다른 작업(몸·스타일 Topic 3종)이 `prod`를 `6da0951`로 다시 올렸다. `6da0951`은 `db90a58`을 포함한다. 그 배포는 backend `e0aded89-be34-43f7-8261-5fea5d1239e4`, frontend `e6fa073e-3a3e-4188-959f-0f60d4c0ad01`, 둘 다 SUCCESS (06:23 UTC 확인)
- 로그인 없이 확인한 것: `/actuator/health` 200, `/api/authoring/programs` 401, `/authoring` → 로그인 화면으로 이동, 배포 전에는 없던 새 program key가 배포 뒤 번들에 포함
- Web: https://personal-work-os-frontend-prod-production.up.railway.app/authoring

## 9. PROD 인증 스모크

**통과** (2026-10-11 06:19–06:24 UTC, 오너가 로그인한 내장 브라우저). 테스트 세션 하나만 만들었다: `career-temperament` `494767f2-a9d4-4d32-b8f6-7cf938f933cc`, 제목 `[QA] PROD smoke 2026-10-11 — 삭제 가능`.

| 확인 | 결과 |
| --- | --- |
| Home: 주제 글쓰기 다섯 번째 카드, 부제, 카드 설명 | 문안 일치 |
| 시작하기 → 새 세션, 단계 01–07, 01의 질문·Guide 7항목·프로그램 안내 5문단 | 정상 |
| 제목과 01 작성 → ‘자동 저장됨’ → 새로고침 뒤 그대로 | 정상 |
| 03: Editor 하나, 고정 안내 문구가 Guide 끝에 표시 | 정상 |
| 07: 선택 입력 세 개, 필수 표시 없음, ‘다시 볼 시점’만 작성 | 정상 |
| 전체 내용 보기: 7단계, 미작성 표시 | 정상 |
| 완료: 자기 확인 문장 6개, 02–06과 마무리 두 칸이 비어 있어도 막지 않음 | 정상 |
| Report: 7개 구역 순서, 01 원문 그대로, 마무리는 작성한 ‘다시 볼 시점’만 | 정상 |
| Library: 주제 글쓰기 아래 프로그램 블록(💼)과 완료 행 | 정상 |
| 기존 완료 Report(`present-future-identity` `3ee9bea1-…`, 10-01 `[QA]`)가 읽기 전용으로 열림 | 정상 |
| 가로 넘침, 브라우저 console 오류 | 없음 |

배포 시점: 작성부터 완료까지는 backend `60f0b03c`(`db90a58`)에서 진행됐다. 완료 직전인 06:21 UTC에 `6da0951` 배포가 시작되어, 마지막 Library·Home 확인 때 frontend는 어느 배포였는지 확정하지 못했다. `6da0951` 배포가 끝난 뒤 다시 확인했다: Home 프로그램 15개, 이 카드는 그대로 다섯 번째, 위 `[QA]` Report가 그대로 열린다.

하지 않은 것: PROD 모바일 화면, PROD에서 Review 세션 생성, 호스티드 DEV 로그인 화면 검증(그쪽은 로그인되지 않았다). 화면 캡처는 `PROD_01_COMPLETED_REPORT.jpg` 하나다.

## 10. 남은 일과 제한

- PROD에 `[QA]` 세션 하나를 남겼다 (9장). 삭제는 오너가 정한다.
- Drive `00_INDEX__POS__AUTHORING`, `60_CURRENT_POLICY__AUTHORING_V2`는 아직 프로그램 9개만 나열한다 (Present-Future Identity, Earning a Living, 이번 프로그램 미반영). Drive 연결로는 기존 문서를 고칠 수 없다.
- DEV에 `[QA]` 세션 세 개를 남겼다 (`README.md`에 ID).
- 01과 02의 경계, 04가 큰 말로 흐를 위험 등 원본 E장의 사용 확인 항목은 실제 사용 뒤 판단할 일이다.
