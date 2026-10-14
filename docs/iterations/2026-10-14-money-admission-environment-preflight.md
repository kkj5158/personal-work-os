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

## DEV 한정 수동 배포 준비 — 미실행

설치 CLI는 Railway 5.62.1이다. 기존 DEV API service는 root `/backend`, build `bash ./gradlew bootJar -x test`, start `java -jar build/libs/backend-0.0.1-SNAPSHOT.jar`, health `/actuator/health`다. DEV web은 root `/frontend`, build `npm run build`, start `npm run start -- --hostname 0.0.0.0 --port 3000`, health `/login`이다.

사용자 범위는 테스트 후 DEV 배포를 허용하며 PROD를 금지한다. 현재 PROD Auth도 source branch `dev`이고 설정의 commitSha는 `34aad8bffcecfe51e4be84d38c1f04e0c31ddca8`다. `git push origin dev`가 PROD에 절대 영향을 주지 않는다고 추정하지 않는다. 아래 명시적 DEV service upload는 Git push나 source 설정 변경 없이 검증한 clean candidate를 배포하는 경로다. `redeploy` connector는 기존 build만 재사용하며 새 구현 배포에 적합하지 않다. `create_deployment` connector는 새 service 생성이므로 사용하지 않는다.

검증한 clean candidate repository root에서 SHA를 실제 full SHA로 바꿔 실행한다:

```powershell
railway up --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service eba7d263-7dc3-448a-a6b8-c2994721b597 --detach --message 'MONEY admission Phase1 <full-SHA>'
railway deployment list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service eba7d263-7dc3-448a-a6b8-c2994721b597 --limit 5 --json
railway up --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae --detach --message 'MONEY admission Phase1 <full-SHA>'
railway deployment list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae --limit 5 --json
```

각 upload 후 해당 deployment ID의 SUCCESS와 실제 HTTP health를 확인한다. `--detach` 반환만으로 배포 성공을 주장하지 않는다. 최신 dev 포함 여부, clean Git 상태, 해당 SHA의 테스트 증거, archive에 들어갈 tracked 파일, 현재 lock 소유권과 pending deployment를 직전 확인한다. migration lock을 취득/제거/탈취하지 않으며 다른 Integration/QA 소유자가 있으면 대기한다. 신규 schema 변경이 없으면 Flyway startup이 기존 history를 유지하는지 확인한다. 배포 기록에는 source SHA, upload message, 실제 deployment ID와 timestamp를 함께 남긴다. local upload에서 Git commit metadata가 없으면 source SHA를 배포 API가 보증했다고 표현하지 않는다.

추가 읽기 전용 DEV 확인: API `/actuator/health` 200, web `/login` 200, Auth `/health` 200, 인증 없는 `/api/money/accounts` 401. Railway environment status는 4개 service Online, 최근 실패 0, issue 0, pending work 0이었다. 이것은 인증 없는 availability/접근 차단 검증이다. 현재 승인된 browser handle이 없어 authenticated DEV smoke는 미검증이며 token/cookie를 추출하거나 login/refresh/auth fixture를 생성하지 않았다.

## 테스트 적용 범위

기존 `qa/money-backend-owned-runtime.mjs`의 `com.kafka.backend.money.*`와 production-security 3개 filter는 재실행한 fresh XML을 수집한다. V6 registration, owner review, review batch, ordinary admission, classification의 PostgreSQL/단위 suites가 포함된다. 새 Phase 1 transfer/duplicate/timing/processing projection 시나리오를 이 테스트 집합에 추가하여 기존 금융 assertion을 약화하지 않는다.

공유 DEV 쓰기 검증은 reviewed adapter의 run-owned schema만 사용한다. `WebFixture.java`가 schema 이름과 ownership comment를 검증하고 explicit table allowlist + RESTRICT로 cleanup하며 원래 public 금융 기록은 fixture가 아니다. schema가 달라도 같은 owner advisory lock을 공유하므로 financial write suites와 browser writes를 직렬화한다. central harness의 strict read-only Flyway audit 및 Git revision gate를 건너뛰어 공유 fixture를 직접 만들지 않는다. 이번 작업에서 shared fixture/write test는 실행하지 않았다.
