# MONEY SYS P0 hotfix — 수동 분류 우선권·색상 즉시 저장

상태: **HOTFIX A/B 구현·검증·DEV→PROD 배포 완료**. 2026-10-15 KST. Calendar 릴리스 소유자가 사용자 승인에 따라 정상적으로 우선권을 양도했고, 공용 잠금을 우회하거나 강제 삭제하지 않았다. 이후 도구의 배포 실행 취소에 대해 사용자의 명시적 실행 재승인을 받아 진행했다.

| 환경 | 실제 성공 배포 SHA | 웹 / API deployment ID |
| --- | --- | --- |
| DEV | `8b4672626d4c11ae7dfdeb26b2c7ada30eb35360` | `b1b83803-77d7-4d29-9e4e-9b9959c7a66c` / `fd1c675f-6881-475a-88bb-29f54ba02250` |
| PROD | `95c0e54afd7c4bc97f8cd223607a1b5c05a74e3c` | `28903abb-9f5b-4e7e-b4b3-d898018b7c13` / `f351cdc8-3d5e-46e7-a717-9d615dad010a` |

PROD는 기존 운영 `116b355` 위에 hotfix 두 건만 적용한 좁은 릴리스다. Calendar 코드와 V84는 포함하지 않았다. DEV에 이미 적용된 Calendar 변경과 그 테스트 자료는 보존했다. PROD 웹·API는 기존 방식대로 정확한 커밋에 고정되어 있으며, 최종 source branch는 둘 다 `prod`다. Git push만으로 운영 반영을 추정하지 않고 실제 deployment metadata와 health를 확인했다.

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

## 자동 검증

| 대상 | 결과 |
| --- | --- |
| DEV 통합 코드의 MONEY backend | 79/79 PASS (Recommendation 36, Classification 35, Hierarchy 8) |
| 실제 PROD 후보 `95c0e54`의 동일 회귀 | 별도 owned PostgreSQL에서 79/79 PASS |
| 프런트엔드 실제 편집 컴포넌트·주변 로직 | DEV·PROD 후보 각각 23/23 PASS |
| TypeScript / 변경 파일 ESLint | PASS |
| Next production build / Gradle bootJar | DEV·PROD 후보 모두 PASS |
| 소유한 회귀 DB 정리 | 두 최종 실행 모두 PASS; schema·프로세스·포트·데이터 디렉터리 제거 |

테스트는 공유 금융 DB 대신 owned loopback PostgreSQL 55442를 사용했다. 최초 HEAD 변경 gate 실패와 PROD 후보 initdb 시간 초과는 최종 PASS에 합산하지 않았다. 고정 커밋으로 재실행한 `money-hotfix-final` 및 `money-hotfix-prod-final`의 성공 영수증을 보존했다.

## 실제 인증 DEV 검증

TEAM KAFKA 기존 Default와 공식 Playwright MCP 0.0.83을 사용했다. 합성 fixture에만 UI/API 쓰기를 수행했다.

- 실제 category drawer: 세 색상을 순서대로 선택하자 color-only API가 각각 200으로 저장했다. `expectedColor`가 이전 확정 색상을 이어갔고 의미 버전은 0으로 유지됐다. 편집 중 이름은 서버에 저장되지 않았다.
- 일시적 503을 주입하자 실패 안내와 재시도가 표시됐고, fault 해제 후 실제 API 재시도 200으로 저장됐다. 이후 이름의 수동 Save도 기존 버전 0으로 성공해 버전 1이 됐다.
- 실제 category popup: 최신 값과 원래 AI 초안 모두 미분류이고 AI stamp가 오래된 상태에서 직접 선택·이번 거래만 반영·명시적 Save를 수행했다. draftId/revision 없이 현재 stamp로 저장됐으며 DIRECT 보호와 거래만 반영 제외 상태가 유지됐다.
- 실제 서버 커밋 후 브라우저 응답만 유실시켰다. 원래 요청 조회는 동일 operation/event를 반환했고, DB에 이벤트 1개·저장 시도 1회만 남았다. 예전 초안은 SAVED, 원래 리비전 1개는 보존됐다. 새로고침 후 분류와 DIRECT 상태도 동일했다. 원장 transactionVersion은 0으로 유지됐다.
- 합성 fixture를 정리했으며, 기존 DEV 금융 사실의 행별 hash가 모두 동일했다. 다른 Calendar fixture에는 손대지 않았다.

브라우저 viewport가 0×0인 상태에서 일부 정상 click/key activation이 timeout 됐다. DEV의 복구 Close/Discard/Lookup은 표시된 UI handler를 DOM으로 활성화해 검증했다. 이후 문서화된 resize/bringToFront로 1440×1000을 복구했고 PROD smoke는 정상 Playwright click으로 수행했다. 이 제한은 증거 JSON에 별도 기록했다.

## PROD smoke와 데이터 보존

- 인증된 categories GET 및 최신 거래 상태 GET이 200이었다.
- 기존 색상 `#e1a34a`를 그대로 재선택해 자동 저장 endpoint의 200·성공 안내를 확인했다. 색상과 의미 버전 4는 그대로였고 backend no-op 경로만 실행됐다.
- 실제 수동 분류 popup에서 유효한 선택 후 Save 활성화를 확인하고 선택을 버렸다. classification write request는 0건이다. 이 PROD 대상에는 AI 초안이 없었다.
- PROD에서 새 색상/거래 분류를 변경하는 시험은 하지 않았다. 새 값의 영속성과 오래된 초안 충돌은 실제 인증 DEV fixture 및 backend 회귀로 검증했다. 미실행 범위를 PROD 실제 변경 PASS로 표시하지 않는다.
- 최종 PROD 행별 hash 대조: 거래 187건·계좌 9개·분류 70개 모두 동일, 신규 행 0개. 공유 데이터 마이그레이션·보정·금융 사실 수정 없음.

## 증거와 정리

영구 증거: `F:/artifacts/money-priority-color-hotfix-20261015`.

- `dev-browser-evidence.json`, `dev-persistence.json`, `dev-cleanup.json`
- `prod-browser-evidence.json`, `prod-preservation-after.json`, `final-deployments.json`
- `owned-backend-runtime.json`, `prod-candidate-owned-backend-runtime.json`, 각 XML
- `frontend-final-tests.log`, `hotfix-dev-manual-save-enabled.png`
- `cleanup.json`: 임시 worktree·로컬/원격 branch 및 공용 lock 정리 결과

소스는 origin/dev와 origin/prod에 안전하게 통합됐다. 주 작업 공간의 원래 미커밋·스테이징 변경을 보존했다. 릴리스 소유권은 완료 후 정상 해제하고, Calendar 채팅에는 hotfix 완료와 최신 DEV/PROD 확인 필요를 전달한다. 기능·배포의 남은 blocker는 없다.
