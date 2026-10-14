# MONEY Financial Admission V2 Phase 1 — 환경 사전 확인

2026-10-14 12:38~12:40 KST 관찰. DB·배포·인증 설정을 수정하지 않았고 migration/QA lock을 취득·제거하지 않았다.

## 현재 상태

- 작업 시작 기준은 `6cfdff7e7d74caf584f227bc56f69fdf51fb8b97`이다. Railway의 DEV/PROD API와 웹 최신 성공 배포는 더 최신인 `c2679e201b87e7fe8ee301bc7ea994bc007cf996`이다. 최종 통합 전 최신 dev를 반영해야 한다.
- Railway 프로젝트 `2b52b232-38b2-44b6-b97e-4caba54f90bc`의 DEV/PROD pending patch는 모두 없다. API·웹·Auth·PostgreSQL의 최신 배포는 SUCCESS였다.
- 실제 활성 DB는 Railway PostgreSQL 17.11의 `pos_dev_final` / `pos_prod_final`이다. DEV profile은 `hosted-dev`, PROD는 `prod`이고 인증은 Railway GoTrue다. 양쪽 `APP_AUTH_MIRROR_ENABLED=false`를 확인했다.
- 실제 DB 연결에서 `REPEATABLE READ READ ONLY` 트랜잭션으로 Flyway history를 읽었다. 양쪽 성공 81개, 최종 V83, 실패 0개이며 로컬 81개 SQL 파일의 checksum과 모두 일치했다. CRC32 줄 단위 비교이며, 프로젝트의 실제 Flyway `validate()` 실행은 별도 QA gate다.
- 등록된 전체 worktree의 migration 파일명을 읽기 전용으로 조사했으며 V84 이상 후보는 발견하지 못했다. 새 migration 작성/적용 직전에는 다시 조사해야 한다.
- invalid index 0, 이전용 fence trigger 0. 양쪽의 미검증 check constraint 1개는 기존 `realtime.messages.messages_payload_exclusive`이며 MONEY 테이블이 아니다. 이 작업에서 검증/수정하지 않았다.
- 정본 이전 완료 기록은 `docs/infra/POS_RAILWAY_MIGRATION_20261014.md`다. 보호된 DEV acceptance receipt는 08:56:41, PROD는 09:32:04 KST PASS이며 정상 쓰기 ENABLED였다. 과거 미확인 컷오버 메모를 현재 상태로 사용하지 않는다. 이번 확인은 새 owner login UI 검증을 반복하지 않았다.

## 자원 소유권과 DEV gate

첫 DB 관찰 중 `pos-central-qa.lock`이 존재했다. 소유자는 `money-inspection-2b45abc5-d0a5-4ffc-98ce-e4d5687bdc7d`, PID 60864, `money-approved-ux-20261014`, SHA `3dc12839d4b8a14d4e4d4e02a4b82288897c6274`였다. 살아 있는 Node process를 확인했고 건드리지 않았다. 두 번째 관찰에서는 lock이 없어져 있었다.

따라서 지속적인 migration 충돌은 현재 확인되지 않았다. 최종 DEV 배포/공유 QA 직전 lock과 최신 dev·Flyway를 다시 확인하고 단일 소유자 critical section에서 진행해야 한다. 다른 MONEY UX 작업의 파일·worktree·프로세스는 보존한다. PROD 배포는 이번 작업에 포함되지 않는다.

## 격리 백엔드 검증

`qa/money-backend-owned-runtime.mjs`는 PG18 실행 파일 `C:/Program Files/PostgreSQL/18/bin`을 사용한다. 새 `.qa/runs/<run-id>` 아래 데이터 디렉터리, synthetic owner, loopback 55442, MONEY 전용 schema, fresh XML을 소유한다. DEV 자격 증명을 읽지 않고 공유 DB에 연결하지 않는다. 전체 MONEY 및 production-security/owner isolation 테스트와 cleanup 증거를 제공한다. 기존 프로세스가 포트를 사용하면 보존하고 block한다.

실행하려면 run-id와 자신의 run directory를 설정하고 자신의 빌드에서 생성된 audit classpath 파일을 전달한다. classpath를 얻기 위해 `qaDatabaseAudit`를 실행하면 공유 DB와 central lock을 사용하는 전체 harness 경로에 진입하므로 무심코 실행하지 않는다. 필요한 runtime classpath만 격리 Gradle task로 출력하거나, 검증한 자신의 기존 classpath를 사용한다.

`qa/money-transfer-owned-runtime.mjs`는 별도 loopback 55441에서 기존 39-case transfer harness를 실행한다. 원본은 `D:/Planning_SPACE/MONEY_WEB_POST_RELEASE_NON_AI_REVISION_20261006/03_TRANSFER_QA/harness/TransferPlanningHarness.java`에 의존한다. 이 문서는 새 테스트 실행의 PASS를 주장하지 않는다.

## 브라우저 제한

정본은 `C:/Users/JIUU/.codex/browser/TEAM_KAFKA_BROWSER_POLICY.md`와 `BOOTSTRAP_USAGE.txt`다. 기존 TEAM KAFKA Default profile의 fresh process/extension identity 일치와 연결/claim/capability/auth 관찰을 각각 확인해야 한다. 일반 task tab은 허용되며 Tab Group 변경·personal profile·새 debugging interface는 금지다.

현재 `qa/playwright/config.mjs`는 새 headless Chromium을 기본으로 띄운다. 기존 검증된 TEAM profile을 재사용하는 설정이 아니므로 해당 browser stage를 그대로 실행할 수 없다. 현재 fresh `cua_repl` 최초 호출 계약에는 metadata-only `listBrowsers`가 노출되지 않는다. 개인 탭을 출력하는 `getState`나 미확인 Chrome 연결로 대체해서는 안 된다. 기존 승인 연결을 문서화된 metadata-only 경로로 식별하거나 exact TEAM identity가 알려진 문서화된 다른 경로가 확보될 때만 browser 검증을 진행한다. 이번 감사는 브라우저에 연결하지 않았다.

## 재현

```powershell
$env:POS_MIGRATION_ARTIFACT_DIR='F:/artifacts/pos-db-migration-20261014'
node qa/money-admission-environment-preflight.mjs
```

자격 증명은 기존 보호된 Railway CLI 경로에서 메모리로만 읽는다. 결과는 자신의 ignored `.qa/money-admission-preflight/environment.json`에 저장된다. SQL은 읽기 전용으로 강제되며 원본 DB 복원·freeze·repair·credential 변경을 호출하지 않는다. Railway 배포 inventory는 연결된 connector의 `describe-environment` 및 `list-deployments`를 사용했다.
