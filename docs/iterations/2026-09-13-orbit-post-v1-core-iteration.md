# Orbit Post-V1 Core Iteration — Implementation Report

검증일: 2026-09-13. 구현·통합 검증 완료, Claude 독립 QA 전달용입니다.

## Git

- Baseline origin/dev: `523bbf19110207ffcebce53e817ec733cb280128`
- 확인한 origin/prod: `f5c87893ec85eeea34b2c6a6dd02a1ca79ac29f9`
- prod의 추가 7개 커밋은 promotion 이력이며 dev와 파일 트리가 같습니다. 종료 전 fetch에서도 기준 SHA가 동일했습니다.
- Feature branch: `feat/orbit/post-v1-core-iteration`
- Worktree: `C:/DEV_SPACE/personal-work-os-worktrees/orbit/post-v1-core-iteration`
- Feature branch를 origin에 push하고 upstream을 연결했습니다. 최종 보고서 커밋도 같은 브랜치로 전달합니다.
- **dev에 merge하지 않았습니다. PROD를 배포하지 않았습니다.**
- **`.claude/settings.local.json`은 변경하지 않았습니다.** 기존 사용자 dirty worktree를 보존했습니다.
- 구현 커밋은 아래 순서입니다. 이 보고서는 뒤따르는 문서 전용 커밋에 포함됩니다.

| Commit | Concern |
|---|---|
| cb3f716 | Shared Shell Global Tabs |
| 560df3a | LIFE CODE semantic hierarchy / management |
| 40c01f1 | Shared five-minute Actual timing / duration |
| d183b2d | Optional State description / observed-time validation |
| 2f8d911 | NOTE workspace reordering |
| 1d99929 | Safe login return context |
| 1be63a7 | WORK optional timing / parent selection |
| 93769f5 | PWA manifest / installation metadata |
| 31d34d7 | NOTE tab identity / autosave integration |
| 234ed17 | LIFE parent drag carries children |
| 78a8b1c | Orbit browser favicon |
| 432aa98 | Active LIFE assignment validation |
| 2a10a82 | Reflection PROD-security regression tests |
| f52ebf6 | Prevent context tests applying shared migrations |
| 446e2de | RGBA favicon compatibility |
| 86f6249 | Atomic, idempotent Reflection creation |
| b13199a | Calendar ↔ LIFE hierarchy / color integration |
| fea5ce0 | Nested navigation guards / modal stacking |
| 78657d3 | Reflection request dedupe / auth route retention |
| 85c99a3 | Shared SystemSwitcher background |
| d65bea9 | Calendar execution-first overview / Snapshot V2 |

## Calendar

| Requirement | Implementation / files | Tests and browser QA |
|---|---|---|
| SystemSwitcher appearance | `frontend/app/shell.css`: 공통 trigger 배경 transparent, 기존 hover/메뉴 스타일 유지 | 공통 메뉴 순서 테스트 통과. 브라우저 computed background `rgba(0,0,0,0)` 확인 |
| Execution-first | `CalendarToolbar.tsx`, `page.tsx`, `appearance.ts`: 실행→계획→비교, URL/저장 설정 우선, 유효한 설정 없으면 실행 | 기본값·설정 테스트와 모드 전환 브라우저 검증 통과 |
| Color Picker V2 | `CategoryColorPicker.tsx`, `CalendarRail.tsx`, `appearance.ts`: 12색 팔레트, 상속 복원, 선택 표시, 중복 제거 최근 8색; 직접 색상 지정…은 native color input 호출 | 팔레트 선택·최근 색상·새로고침 유지 확인. 상속/저장 규칙 테스트 통과. native 정밀 UI 자체의 OS별 동작은 아래 WARNING |
| State visibility | `page.tsx`, `appearance.ts`: 모드 독립 설정 저장; Compare에서는 Actual 측 표시 | Planning에서 State 유지, 모드 전환 후 ON 유지 확인 |
| State semantics/editor | `CalendarEditor.tsx`, `editorModel.ts`, `statePolicy.ts`: 제목 필수 제거, 타입/시간 필수, 한줄 설명·메모 선택; 안정/저하/과활성/혼재/애매 | 제목 없는 과거 State 허용; 미래 범위·1분 값 거부 테스트. 미래 날짜 rail 드래그 시 “미래의 상태는 기록할 수 없습니다.” 확인 |
| Day Compare | `TimeGrid.tsx`, `overview.ts`, `calendar.css`: 약 14시간 보이는 공통 축, 24시간 스크롤, 동일 scale/Y, Unscheduled 제외 | 같은 축·스크롤 확인, 긴 수면성 블록 제외 전략 테스트. 미지정 Actual이 Compare에서 빠지는 것 확인 |
| Week Compare | 동일 파일: PLAN 7일 왼쪽 / ACTUAL 7일 오른쪽, 좁은 열·최소 텍스트·정확한 tooltip | 개발/프로덕션 로컬 빌드 모두 각 7열, clientWidth=scrollWidth=289, 동일 scale=0.533095 확인. 수평 overflow 없음 |
| Reflection redirect | `ReflectionModal.tsx`, `lib/api/client.ts`, `lib/api/reflections.ts`, login/proxy와 backend Reflection | Calendar 안에서 열기·작성·완료·수정 확인. 오류 상태/로그인 복귀 및 동시 생성 테스트 통과 |
| Reflection Snapshot V2 | `ReflectionTimeline.tsx`, `ReflectionMetrics.tsx`: 구조화 데이터 기반 공통 14시간 축; PLAN/ACTUAL/강한 STATE rail; Calendar 카테고리 색상; 조건부 지표 | 계획 없는 날 “계획 없음”, 무의미한 차이 없음, 실제/업무/State 합계 확인. 완료·재열기 및 snapshot 텍스트 escaping 테스트 통과 |

위 표의 Calendar 파일 경로는 `C:/DEV_SPACE/personal-work-os-worktrees/orbit/post-v1-core-iteration/frontend/app/calendar` 기준입니다. 공통 파일은 표에 명시한 repository 경로를 사용합니다.

Active Day Window는 6시간 초과 또는 04:00 이전 시작 블록을 초기 창 결정에서 제외합니다. 나머지 시작 시각의 하위 사분위에서 한 시간을 빼고 00:00–10:00 사이 정시로 고정합니다. 기본은 07:00입니다. 이 선택은 표시 시작점만 바꾸며 저장 데이터나 24시간 접근을 줄이지 않습니다.

정밀 시간은 실제 브라우저에서도 검증했습니다. LIFE Actual `14:05–14:35`를 한 번 이동하면 `14:20–14:50`, 종료 핸들을 한 번 늘리면 `14:20–15:05`이며 새로고침 후 그대로 유지됐습니다. 빈 영역 드래그는 `10:00–10:30` 계획을 생성하고 제목 입력 후 자동 저장했습니다. 실제 시간 기준 WORK/LIFE 교차 overlap 및 잘못된 반쪽 시간쌍은 API에서 거부했습니다.

Reflection 조사 결과: 버튼은 Calendar 소유 모달을 여는 경로이며 WORK 소유 도메인이라는 이유로 worklog로 이동하지 않습니다. 401 복귀 경로가 query를 잃던 문제와 로그인 화면의 이미 로그인된 사용자 처리 경로를 수정했습니다. 누락된 Reflection의 정상 404가 PROD security에서 redirect/sendError로 변하지 않는지 테스트했습니다. 별도로 QA 중 동시 첫 생성의 409를 재현하여 frontend in-flight 공유 및 backend atomic insert로 해결했습니다. 다섯 동시 POST가 동일 ID/version을 반환하는 것을 확인했습니다. 모든 오류를 삼키는 catch는 추가하지 않았습니다. 과거 PROD 요청의 로그가 없으므로 당시 단일 원인을 확정했다고 주장하지 않습니다.

## Calendar "색상 및 표시 설정" Audit

**분류: B — controls additional settings.**

- Source: `frontend/app/calendar/CalendarRail.tsx`.
- 클릭은 `setSettings(!settings)`; 초기값은 `false`.
- DOM: 제목이 “내 캘린더” ↔ “색상 및 표시 설정”으로 바뀌고 helper text가 보입니다.
- 추가 기능: 명시적 child 색상이 있는 경우에만 기존 `↶` 상속 복원 버튼이 표시됩니다. 따라서 helper text만의 토글은 아닙니다.
- `settings` 자체는 저장하지 않는 임시 UI 상태입니다. 색상/visibility 변경은 기존 appearance preferences에 저장합니다.
- 별도 숨겨진 panel, 잘린 추가 설정, 이 컨트롤에 연결된 TODO/미구현 설정을 발견하지 못했습니다.
- 기존 category propagation 테스트 및 브라우저 제목/helper 표시·복귀 검증 통과.
- **이 컨트롤의 handler·조건·표시 토글 동작은 변경하지 않았습니다.** Color Picker V2는 개별 색상 컨트롤의 첫 단계 UI를 바꿉니다.

## WORK OS

- `WorkTimeEntryEditor.tsx`, `workTimeEntry.ts`, mapping/API 및 backend `WorkTimeEntryService` 수정.
- 시작/종료 모두 없으면 수동 duration이며 날짜별 Unscheduled Actual로 투영됩니다.
- 두 값이 있으면 같은 날의 5분 단위 값이어야 하며 duration을 자동 산출합니다. 한 값만 입력하면 저장 불가입니다.
- 기존 V28 시간 컬럼과 WorkTimeEntry ID를 재사용합니다. Calendar 전용 중복 Actual은 만들지 않습니다.
- `timingProvided:true`는 명시적 unschedule을 지원합니다. 오래된 요청이 두 시간 필드를 생략하면 기존 schedule을 보존합니다.
- 모든 active parent/child 선택 가능; 자식 선택은 “대분류로 기록” 상태로 생략할 수 있습니다.
- 합계는 parent 직접 기록+child 기록을 한 번씩 합산합니다.
- 브라우저 저장/재조회: 10:05–11:35=90분, 미지정35분, child13:05–13:35=30분, parent 미지정25분 → parent 합계180분 확인.
- 관련 backend 테스트와 frontend timing/roundtrip/aggregation 검증 통과. Attendance clock precision은 변경하지 않았습니다.

## LIFE CODE

- `frontend/app/life/categories/page.tsx`와 backend `lifecategory`: Shared Shell의 LIFE CODE, 메뉴 “카테고리” 하나.
- 기존 category identity를 유지하며 nullable parent로 2단계 의미 계층 추가. 이름·active 상태·parent/child 생성·정렬 지원.
- 형제 간 DnD, parent 카드와 children 동반 이동, 드롭 후 저장·실패 복구 구현.
- 동일 owner/active root 검증; 3단계, 잘못된 sibling 집합, 참조된 category 삭제 등 거부.
- Calendar tree/selectors에서 실제 parent 관계와 상속 색상 사용. 의미 계층은 LIFE, 색상은 Calendar 소유.
- 브라우저 생성·수정·active·root/child DnD·새로고침 검증 및 backend 계층/ownership 테스트 통과.

## NOTE SYS

- `WorkspaceOrderModal.tsx`, `NoteSystem.tsx`, API/service: active workspace만 나열하는 순서 변경 modal.
- Cancel은 저장하지 않으며 Save에서 정확한 owner workspace 집합을 검증하고 순서를 저장합니다.
- 현재 workspace/note context 유지; 생성 시 마지막 위치로 추가; 기존 순서는 migration으로 보존.
- 브라우저 Cancel/Save/DnD/새로고침·현재 workspace 유지 확인.
- workspace modal 테스트, NOTE 모델/graph/IME/autosave/retry/Reflection 및 rich Markdown roundtrip 회귀 통과.
- 두 NOTE 탭에서 다른 workspace/note가 유지되고 LIFE로 즉시 전환해도 autosave가 반영되는 것을 확인했습니다.

## Global Tabs

- `GlobalTabsProvider`가 root layout에서 단일 route tree를 감쌉니다. 탭별 live 화면 cache를 만들지 않습니다.
- `orbit.globalTabs.v1`: version, tab ID, system, route, title, context key, 순서, active ID만 저장. 문서 본문·cursor·hover는 저장하지 않습니다.
- WORK 기록/근태/체크리스트, NOTE workspace/note/module context, LIFE categories, Calendar date/view/mode 지원.
- 명시적 새 탭 및 Ctrl/Cmd navigation 지원; 같은 NOTE 문서 context는 기존 탭 focus; 일반 navigation은 active context 교체.
- DnD/close/이웃 선택/마지막 탭 fallback/URL deep link refresh restore 지원.
- Calendar 기존 Actual save/discard/continue와 Planning autosave를 연결. NOTE queue flush, Reflection 임시 flush guard 및 닫힌 후 하위 guard 복구.
- 모델·guard 테스트 통과. 브라우저 dirty Actual 탭 전환/닫기 차단, NOTE autosave, 다중 context restore 확인. 로컬 프로덕션 빌드에서도 탭 DnD 순서가 새로고침 후 유지되고 console error가 없었습니다.

## PWA

- `frontend/app/manifest.ts`: Orbit, id/scope `/`, start_url `/worklog`, `display:standalone`, light theme.
- 승인된 기존 crow asset에서 192/512 PNG, Apple180, favicon32를 생성했습니다. favicon 내부 PNG를 RGBA로 교정하여 Next decoder 오류를 해결했습니다.
- root metadata 연결; public 허용은 정확한 manifest/icon 경로에 한정하며 앱 경로 auth gate 유지.
- manifest/PNG 크기/ICO decode/proxy 범위 테스트 통과. 로컬 optimized server에서 manifest, favicon,192/512 icons 및 네 시스템 route 모두 HTTP200.
- 설치 전제의 metadata 및 경로를 검증했습니다. 실제 Windows 설치 메뉴 선택/standalone 창 실행은 수행하지 않았습니다.
- service worker, offline API cache, background sync, push subscription은 의도적으로 제외했습니다. Online persistence 유지.
- 공식 설치 조건 참조는 `docs/frontend/pwa.md`에 기록했습니다.

## Database / Flyway

| Migration | Purpose / preservation |
|---|---|
| V32__allow_optional_state_description.sql | 기존 `life_state_entries.label`의 NOT NULL만 완화. 기존 값 유지 |
| V33__life_category_hierarchy.sql | nullable parent_id, owner 복합 FK, 자기 참조 방지, index. 기존 category는 root 유지 |
| V34__note_workspace_order.sql | sort_order 추가, 기존 created_at/id 순서 backfill, index |

Shared DEV는 V34까지 적용되고 Flyway validation 및 Hibernate schema validation을 통과했습니다. 초기 subagent context test가 기본 DEV profile로 V32를 적용한 경로가 있었습니다. 이후 context smoke test의 Flyway와 absence scheduler를 비활성화하여 재발을 방지했고, 통합 backend 기동에서 V32 checksum을 검증한 뒤 V33/V34를 순차 적용했습니다.

**적용된 V1–V31을 수정하지 않았으며 데이터/컬럼을 삭제하지 않았습니다.** QA 전용 2020-01-03/04 record·plan·State·LIFE Actual·Reflection·WORK categories는 owner/정확한 ID/QA marker 및 참조 검증 후 한 transaction으로 정리했습니다. 알려진 WORK4건 외 추가 child가 없고 supplemental/checklist가 0인지 확인했습니다. 두 NOTE workspace와 네 LIFE category도 scoped API로 정리했습니다. 최종 API 확인에서 QA 기간 Calendar 배열은 모두 비었고 두 Reflection은404, LIFE category 수는 원래0, 기존 NOTE workspace 순서는 원래대로입니다.

## Validation

- Backend full suite: **447 tests, 0 failures/errors/skips**. 마지막 atomic Reflection 변경 후 관련 **8 tests** 재검증 통과.
- Frontend Calendar/context/lanes/GlobalTabs/API/date 집합: **32 test-runner cases 통과**. LIFE 통합 테스트 분리 후 해당 테스트 재실행 통과.
- 추가 manifest **2 cases**, login safe redirect **23 assertions**, WORK timing 및 NOTE workspace suites 통과.
- `npm run test:notes` 통과.
- TypeScript `tsc --noEmit` 및 production build 내 type checking 통과.
- 신규/변경된 주요 Calendar·shell·API 코드 lint 통과. legacy dialog 3개에 기존 lint error가 있어 전체 changed-file lint는 통과로 표시하지 않습니다.
- `npm run build` 통과, 14개 정적 페이지 생성. 검증 output directory 변경은 최종 tracked tsconfig에서 원복했습니다.
- 개발 브라우저 QA: Calendar 정밀 시간/State/Compare/Reflection, WORK 저장·재조회, LIFE/NOTE DnD·지속성, Global Tabs guard.
- 로컬 optimized build: 주요 경로/asset HTTP200, Week Compare 7+7열 정렬, 탭 DnD/refresh, console error 없음.
- `git diff --check` 통과; feature worktree의 구현 파일은 커밋됐습니다. PROD smoke/deploy는 요청 범위 밖이므로 수행하지 않았습니다.

## Remaining Issues

- **BLOCKER:** 없음.
- **WARNING:** 실제 Chrome/Edge Windows 설치와 standalone launch, native 정밀 색상 picker의 eyedropper/manual control 조작은 독립 QA에서 확인할 항목입니다. Manifest/asset/빌드 검증을 실제 설치 검증으로 대체해 주장하지 않습니다.
- **WARNING:** 기존 `BatchActualEditor.tsx:42`, `CalendarBlockEditDialog.tsx:67`, `LifeActualEditDialog.tsx:47`의 `react-hooks/set-state-in-effect` lint 오류와 `WorkLogModal.tsx:61`의 기존 unused-disable 경고가 남습니다. 이 파일의 작업 diff는 time step 또는 modal z-index로 제한됩니다.
- **WARNING:** 과거 PROD Reflection 장애의 요청 로그는 없어 당시 원인 확정은 제한됩니다. 확인한 auth return 경로와 동시 생성 문제는 수정·회귀 검증했습니다.
- **DEFERRED:** offline sync/service worker, full LIFE product, Month Workflow, recurring/AI planning, numeric adherence score, tab별 live process isolation.

## Final Verdict

READY FOR CLAUDE INDEPENDENT QA

