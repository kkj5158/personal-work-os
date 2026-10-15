# MONEY SYS P0 hotfix — 수동 분류 우선권·색상 즉시 저장

상태: **구현·자동 검증 완료 / DEV 통합·DEV 및 PROD 배포 BLOCKED**. 2026-10-15 12:43 KST 기준. 배포 완료나 실제 hotfix 브라우저 E2E 통과를 의미하지 않는다.

구현 커밋: `3949df033a55fc5280e7e13333f01d49b5e513ca`. 원격 보존 브랜치: `codex/money-priority-color-hotfix`. 최신 Calendar DEV `8da70cb1541980ec09d81c93481adcb2974bda02` 위에 충돌 없이 반영했다. 주 작업 공간의 미커밋·스테이징 변경은 건드리지 않았다.

## 구현

- **HOTFIX A: Implemented.** 기존 색상 팔레트에서 선택 즉시 표시·저장한다. 전용 color API는 이름·상위·종류·아이콘·보관 상태를 저장하지 않는다. 직렬화·최신 선택 병합으로 마지막 선택이 남는다. 저장 실패 안내, 재시도·확정 색상 복원, 정확히 일치하는 커밋 후 응답 유실 복구를 제공한다. 목록은 실패 시 확정 색상으로 돌아온다.
- 색상은 `expectedVersion`과 `expectedColor`를 검사하고 owner lock 안에서 저장한다. 색상 전용 저장은 의미 버전을 올리지 않아 AI fingerprint나 남은 수동 편집을 무효화하지 않는다. 의미 있는 기존 카테고리 변경의 버전 검사는 유지한다. 스키마 변경은 없다.
- **HOTFIX B: Implemented.** 직접 선택과 수동 일괄 분류는 현재 거래 stamp를 사용하는 독립적인 수동 명령이다. 저장 직전 최신 거래를 재조회한다. AI draftId·revision·conflict는 수동 저장 조건이 아니다. 실제 거래·재무 적격성·소유권·활성 분류·동시 수동 편집·미확인 저장 결과 검사는 유지한다.
- 명시적 성공 저장은 DIRECT 보호와 기존 SAVED 초안 상태를 사용한다. 과거 추천 리비전·감사 이력은 남고, 늦은 AI 응답은 최신 거래 stamp를 통과할 수 없다. AI 초안 채택 경로는 엄격한 리비전·맥락 검사를 유지한다. 저장 전 선택은 학습하지 않으며, 이번 거래만 반영·기존 저장 idempotency를 유지한다.

원인: 프런트엔드가 직접 선택에도 AI 초안의 conflict/stamp를 저장 차단 조건으로 사용하고 초안 stamp를 보냈다. 백엔드도 draft가 있는 거래의 직접 저장을 초안 상태·리비전 검토에 종속시켰다. 일반 카테고리 버전은 추천 사전에 포함되므로 색상만 저장해도 이를 올리는 기존 경로는 거짓 충돌을 유발할 수 있었다.

## 변경 파일

- `backend/src/main/java/com/kafka/backend/money/MoneyCategories.java`
- `backend/src/main/java/com/kafka/backend/money/MoneyProductService.java`
- `backend/src/main/java/com/kafka/backend/money/MoneyController.java`
- `backend/src/main/java/com/kafka/backend/money/MoneyRecommendationService.java`
- `backend/src/test/java/com/kafka/backend/money/MoneyRecommendationPostgresTest.java`
- `frontend/app/money/MoneyEditors.tsx`
- `frontend/app/money/MoneyCategoryColors.tsx`
- `frontend/app/money/MoneyBookkeepingRecommendations.tsx`
- `frontend/app/money/MoneyCategoryColorAutosave.test.tsx`
- `frontend/app/money/MoneyCategoryPopupDraft.test.tsx`
- `docs/contracts/money-bookkeeping-ai-v2.md`, `docs/contracts/money-v6-integrated.md`

## 실행 검증

| 검증 | 결과·경계 |
| --- | --- |
| MoneyRecommendationPostgresTest | 36/36 PASS, hotfix 신규 4개 포함 |
| MoneyClassificationPostgresTest | 35/35 PASS |
| MoneyCategoryHierarchyTest | 8/8 PASS |
| 백엔드 실행기·정리 | PASS. 커밋 a5f2a830 고정, owned loopback PostgreSQL 55442, 공유 DB 미접속. schema·프로세스·포트·데이터 디렉터리 정리 PASS. 이후 backend 소스 동일 확인 |
| 프런트엔드 집중 회귀 | 23/23 PASS. 실제 CategoryEditor와 category popup을 JSDOM에 마운트; API mock 사용. 실제 hosted E2E와 구분 |
| TypeScript·변경 파일 ESLint | PASS |
| Next production build | PASS, 최종 코드 타입 검사 포함 |
| Gradle bootJar | PASS |

신규 회귀는 색상 연속 선택·실패·재시도·응답 유실·미저장 이름 보존·남은 폼 버전, 오래된 충돌 초안과 직접 선택, 실제 동시 수동/금융 변경, 늦은 AI 응답, 저장 재호출·거래만 반영·원장 사실 보존을 검증한다. 기존 금융/학습/Undo 관련 35개 테스트도 통과했다.

처음 백엔드 실행은 테스트 79개 자체가 통과했지만 cleanup 중 HEAD 변경으로 실행기가 FAIL 처리했다. 이 결과를 최종 gate로 사용하지 않았다. 고정 커밋으로 재실행한 `money-hotfix-final`이 PASS다. 최초 standalone TypeScript의 Next 생성 타입 누락과 lint ref 오류는 해결 후 재검증했다.

## 실제 브라우저·배포 상태

TEAM KAFKA 기존 Default, 공식 Playwright MCP 0.0.83 / 확장 0.4.0, loopback relay를 확인했다. 현재 소유 탭에서 정상 로그인된 DEV MONEY 메뉴·로그아웃·분류 관리 접근을 확인했다. 한 번의 tool call 60초 timeout 이후 공식 own-tab list/select로 복구하고 DOM 재확인에 성공했다. 개인 프로필·새 CDP·다른 탭/그룹은 사용하지 않았다.

**hotfix 자체의 인증된 DEV drawer/popup 영속성 E2E와 PROD hotfix smoke는 UNTESTED**다. 아래 활성 릴리스 잠금 때문에 hotfix를 배포하지 않았으며, 준비한 DEV 합성 fixture 스크립트도 실행하지 않았다. 공유 DEV/PROD 금융 사실·과거 기록에는 쓰기 작업을 하지 않았다. 자동 테스트는 소유한 로컬 합성 DB에서만 실행했다.

| 환경 | 현재 확인된 배포 SHA | hotfix 상태 |
| --- | --- | --- |
| DEV web / API | `8da70cb1541980ec09d81c93481adcb2974bda02` | 미배포 |
| PROD web | `116b355305b199450d9e28002fa4a5e31bc225a8` | 미배포 |
| PROD API | `0180a6b1889a9425af2b34b8ade9c55f13091fec` | 미배포, 기존 isolated release source |

양쪽 `/actuator/health`는 UP. Railway DEV/PROD staged patch는 null이다. 이 상태는 hotfix 배포 증거가 아니다.

## 정확한 차단 사유와 재개 지점

2026-10-15 12:42:46 KST에 공용 잠금 획득이 `QA_LOCK_OCCUPIED:inspect owner; no automatic stale lock reclamation`으로 거절됐다. 12:43:11 KST에 owner PID 생존·시작 시각을 재확인했다.

- 잠금: `D:/DEV_SPACE/personal-work-os/.git/pos-central-qa.lock`
- owner: `calendar-release-1565aef2-ddb5-4d1c-ba75-60389b2f66f3`, PID `81348`
- owner 작업 공간: `D:/DEV_SPACE/personal-work-os-worktrees/money-calendar-web-v1`
- owner 시작: `2026-10-15T03:17:58.817Z`

활성 잠금을 삭제하거나 다른 릴리스의 배포 설정을 바꾸지 않았다. 해당 owner가 릴리스 임계 구역을 종료하면 같은 잠금을 획득하고 최신 origin/dev·origin/prod를 확인한다. hotfix 통합·DEV 배포 → 실제 인증된 drawer/popup 및 backend persistence 검증 → PROD 승격·smoke·SHA/health 확인 순으로 재개해야 한다. 현재 요청의 배포 승인은 유효하며 별도 재승인을 요구할 필요는 없다.

검증 결과와 재개용 스크립트는 `F:/artifacts/money-priority-color-hotfix-20261015` 및 작업 공간 `.qa/hotfix`, `.qa/runs/money-hotfix-final`에 보존한다. 아직 미통합·미배포이므로 hotfix 작업 공간·로컬/원격 브랜치를 유지한다. 완료 후 Git 정책에 따라 정리한다.
