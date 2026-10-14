# MONEY Financial Admission V2 Phase 1 — DEV Acceptance QA

2026-10-14 / Asia/Seoul. **최종 판정: BLOCKED, PROD 승인 요청 준비 미완료.** 브라우저 연결과 실제 인증 화면은 복구·확인했다. 그러나 동일 실행의 실제 알림 intake→판정→commit→브라우저 표시 전체 검증과 10초 성능 목표는 통과하지 못했다. API/단위/격리 DB 성공을 native E2E 성공으로 합산하지 않는다.

## 소스와 배포

| 항목 | 실제 근거 |
| --- | --- |
| DEV 배포 구현 SHA | `2d4759dd733546277e8cb39683e485d14e695348` |
| API deployment | `c96ebb99-3a34-4e76-9141-33488a0c8949`, SUCCESS |
| Web deployment | `0ee3f115-b6aa-421a-8e87-41184f5fe596`, SUCCESS |
| DEV environment | `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c`, 4 online / issues0 / pending0 |
| 이번 fresh backend QA SHA | `30d961987b143be576ad3636cdbcb3c03f360607`, clean, 123/123 PASS / skip0 |
| QA 시작 local dev | `eb6db5e92ce9d4d5d9adcd3eb32057b3fc3e193a` |
| 작업 중 들어온 별도 UX | `b0ab3dc134b9eb63617e3077333ee66643e39518`, frontend28개 파일 변경 |

Railway manual upload/redeploy metadata에는 commitHash가 없다. 소스 근거는 이전 clean2d4759d 직접 upload와 그 성공 build의 명시 재사용이다. 이번에는 배포·source 설정·auth 설정·migration·PROD 변경·Git dev push를 수행하지 않았다. backend production 소스가2d4759d와 동일한 것을 Git diff로 확인했다. 별도 UX 변경은 그대로 통합했지만, 이번 native 검증은 **배포된2d4759d UI**에 대한 것으로 새 local UX 검증을 대신하지 않는다.

원래 구현·정책은 [Phase1 보고서](2026-10-14-money-financial-admission-v2-phase1.md), [정책 명세](../contracts/money-financial-admission-v2.md)를 따른다. 이번 [sanitized evidence JSON](2026-10-14-money-admission-dev-acceptance-evidence.json)에 fresh XML hash, 실제 시각, DB 감사와 미검증 경계를 기록했다.

## 브라우저 연결 진단과 인증 QA

현재 [canonical browser policy](C:/Users/JIUU/.codex/browser/TEAM_KAFKA_BROWSER_POLICY.md)와 [bootstrap 절차](C:/Users/JIUU/.codex/browser/BOOTSTRAP_USAGE.txt)를 다시 읽었다. 승인 TEAM Default process를 재사용했다. 개인 Chrome 탭 목록/본문을 읽거나 Chrome restart·확장 재설치·새 debugging interface·Tab Group/nameSession 조작을 하지 않았다.

fresh CUA initial contract에는 metadata-only entry가 없었다. 설치된 공식 Playwright MCP registration/runtime/protected credential 파일 존재는 확인했으나 그 도구는 이 세션에 노출되지 않았다. 설치 사실을 연결 성공으로 간주하지 않았다. Native Computer Use는 창 metadata 대조에만 사용했고 다른 자동화 탭을 가져오지 않았다.

소유자가 제공한 탭 멘션은 local13240 Review였다. 첫 `getTab({mention})`는30초 timeout, 같은 승인 대상에 대한1회 retry는 title/URL 변경으로 stale mention을 반환했다. 이를 auth 실패나 영구 미지원으로 해석하지 않았다. 이후 실제 반환된 런타임 문서에 `listBrowsers({emit:false})`가 노출되어 fresh metadata를 읽고 TEAM extensionInstanceId를 해당 프로필 저장소와 exact match했다. 개인 탭 inventory는 출력하지 않았다. 선택한 TEAM 연결의 unclaimed task 후보가 없어 approved launcher로 ordinary hosted DEV 창을 열고 그 탭만 claim했다.

실제 hosted DEV Overview와 Bookkeeping에서 기존 로그인 세션·로그아웃 control·실제 MONEY 데이터 로딩을 확인했다. fresh Phase2 preflight는 `READY_ON_CALLER_OBSERVATIONS`였다. 이는 local identity/caller observation 검증이다. script의 direct connection/auth boolean이 false인 것은 문서화된 검증 경계이며 실제 도구 관찰의 실패를 뜻하지 않는다. 숨겨진 runtime session/claim/auth epoch를 발명하지 않았고 caller generation label로 명시했다.

첫 category click의 `Runtime.evaluate`와 후속 DOM의 `Emulation.setFocusEmulationEnabled` timeout은 ENVIRONMENT_ISSUE로 보존했다. 문서화된 screenshot 대안과 fresh DOM 재관찰 후 같은 binding에서 bounded retry가 성공했다. 인프라 변경 없이 다음 native 결과를 얻었다.

* 기존 picker 검색·이번 거래만 옵션은05:39:05.641→05:40:20.669 UTC, 약75초 동안 자동 polling을 거쳐 유지됐다.
* 기존 category parent/소분류 없음 선택은05:41:02.334→05:41:45.252 UTC 동안 유지됐다. 최신 버전 조회 후 Save가 활성화됐지만 **Save는 호출하지 않았다**.
* 기존 닫기 guard가 버리기/계속 편집을 제시했다. agent가 만든 draft만 버리고 재개 시 미분류·이번 거래만 해제 상태를 확인했다. 닫기1회가 즉시 완료되지 않아 fresh 상태 후1회 retry로05:43:57.298 UTC 닫힘을 확인했다. 이를 영구 product 결함으로 판정하지 않았다.
* screenshot 기능은 실제 성공했다. picker만 자른 JPEG는 private `F:/artifacts/money-admission-dev-acceptance-20261014-30d9619/native-category-picker.jpg`에 있다. 기존 raw/owner/account 식별자·금융 금액을 public artifact에 넣지 않았다.

native row eviction/remount, 실패 Save, 새 알림의 실시간 표시/자동 분류는 이번 브라우저에서 실행하지 않았다. 기존 자동 regression 결과와 구분한다.

## 시나리오 acceptance matrix

| 항목 | Fresh code/격리 DB | 실제 hosted 인증 브라우저 | 판정·범위 |
| --- | --- | --- | --- |
| 승인 TEAM 연결·기존 로그인 | preflight PASS | PASS | 수동 첫 tab mention 필요; fresh session 무인 자동 연결 성공 아님 |
| Overview/Bookkeeping 로딩 | source 확인 | PASS | 실제 배포 UI·기존 owner session |
| picker 선택·자동 갱신·명시 discard | 기존 회귀 + source 확인 | PASS | 기존 금융 Save 없이 native draft 유지/초기화 |
| 안전한 일반 입출금 자동 admission | PASS | BLOCKED | Fresh V2/ordinary/processing DB tests; live intake workflow 미실행 |
| 발생 시각60초 및 counterpart 차이 | PASS | BLOCKED | default5/10/30/59/60초와61초 Review, configurable window와 구분 |
| 금액·방향·통화·소유 계좌·identity | PASS | BLOCKED | registry/source/owner isolation + deployed read audit |
| exact replay·후발·취소/owner 확정 보호 | PASS | BLOCKED | canonical/source 불변과 새 fact0; historical backfill 없음 |
| 같은 금액 정상 반복/급여 | PASS | BLOCKED | 독립 source·balance flow를 보존; 새 personalized salary pattern engine은 Phase1 범위 밖 |
| 승인 rule+현재 권한의 자동 category | PASS | BLOCKED | classification/context35+5건 및 rule version guard; native live 자동 assignment 미실행 |
| 승인 없는 learned/provider autosave 금지 | PASS | BLOCKED | 추천만·owner Save 경계 유지; native 실제 provider 왕복 미실행 |
| ambiguity/unsafe Review 사유 | PASS | BLOCKED | competing graph, unresolved ownership, external route, gross/net, dedicated semantics; 과거 terminal Review 재처리 안 함 |
| source 중복·소유권·DB 금융 기록 보존 | PASS | PASS(읽기) | deployed audit0 violations·pre/post 동일; 브라우저에서 Save 안 함 |
| 수신→commit 10초 목표 | FAIL(측정) | BLOCKED | 실제 default Spring scheduler 표본3개 모두10초 초과; hosted 전체 latency는 미측정 |
| 수신→UI visibility/정확한 paint 시간 | BLOCKED | BLOCKED | live intake 표본0, 지원된 authenticated fixture write driver 미노출 |
| 격리 QA cleanup | FAIL | 해당 없음 | PG shutdown timeout; 재확인 process/port0, 폴더 삭제 auto-review 거절 |

현재 CUA `Playwright.evaluate`는 문서화된 **read-only page scope**이며 product UI에는 일반 RAW notification intake form이 없다. 실제 Android/기존 허용된 테스트 알림 입력도 이번 실행에서 확보하지 않았다. 쿠키/토큰 추출, 임의 POST 주입, 새 bridge credential 생성, 새 profile/debug endpoint로 이 경계를 우회하지 않았다. 따라서 전체 native notification E2E를 PASS로 표시할 수 없다.

## 실제 시간 측정

새 regression은 실제 Spring `@Scheduled`를 활성화하고 기본initial/fixed delay5000ms와 observation10000ms를 그대로 사용했다. clock 이동, RAW maturity SQL 변경, 수동 `runOwner` dispatch, DB polling loop는 없다. 합성 notification3개를 owned loopback PG에 service-ingest하고 projection을 한 번씩 읽었다. 이것은 HTTP/Android/hosted UI 입력이 아니다.

| 표본 | intake UTC | admission pass 시작 UTC | DB `created_at` UTC | commit 확인 UTC | 수신→commit 확인 |
| --- | --- | --- | --- | --- | ---: |
| 0 | 05:39:02.429627 | 05:39:12.4755344 | 05:39:12.475944 | 05:39:12.5124459 | 10,082.819ms |
| 1 | 05:39:02.726598 | 05:39:17.5172060 | 05:39:17.517757 | 05:39:17.5382328 | 14,811.635ms |
| 2 | 05:39:04.990386 | 05:39:17.5172060 | 05:39:17.517757 | 05:39:17.5382328 | 12,547.847ms |

같은 machine의 DB `received_at`와 JVM `Instant.now`를 사용했다. 평균12,480.767ms, p50 12,547.847ms, p95(nearest rank, n=3)14,811.635ms, min/max10,082.819/14,811.635ms. 작은 표본의 진단 결과이며 hosted SLA나 운영 분포로 일반화하지 않는다. service projection 최초 관찰은 각각36.302/5.151/3.943ms; **브라우저 visibility가 아니다**.

정확한 matcher decision instant는 별도 계측하지 않았으며 pass 시작과 commit 확인 사이에 있다. DB `created_at`는 PostgreSQL transaction-start 시각이므로 실제 durable commit/paint 시각으로 읽으면 안 된다. commit 확인은 transaction service return이 제공하는 상한이다. SDK intake와 projection read의 계측 overhead도 포함한다. 실제 UI visibility timestamp는 이 notification들에 대해 **NOT MEASURED**다.

DEV의 관련 환경 변수4개는 UNSET이며 검증 소스 기본값10초/60초/5초를 사용한다. 단일 observation은 최소10초 대기 후 처리·commit이 필요하고, due worker는 cadence 위상에 따라 추가 대기를 만든다. UI는 source3초 poll, source가 이미 사라진 conclusive admission은 canonical9초 fallback poll을 사용한다. 이 추가 비용은 코드상 경로이며 hosted 실측값으로 표시하지 않는다. 기본10초 관찰 자체를 보존하면서 총시간을 항상≤10초로 보장할 수 없다. 이를 임의의 즉시 승인/개인 급여 규칙으로 우회하지 않았다. **10초 observation 안전 정책과 end-to-end10초 목표의 budget을 먼저 명확히 해야 한다.**

실제 DEV DB에서 final API 성공 시각05:00:03.770 UTC 이후 신규 RAW/source/canonical timestamp 표본은0이었다. 따라서 actual hosted notification latency와 UI visibility 평균/percentile은 N/A다. 기존 unit/api 결과를 대체 숫자로 쓰지 않는다.

## DB integrity, 재현과 cleanup

DEV pos_dev_final의 read-only transaction에서 existing owner 존재·Flyway81/실패0/latest83·RAW의 다중 fact 연결0·source의 missing/cross-owner 참조0·canonical의 cross-owner account0을 확인했다. 05:39 이후 pre-QA cutoff snapshot과05:44:49.610 UTC post snapshot의 거래·계좌·대출·categories·overrides·classification state/events·registration events·source·immutable RAW·owner identity는 모두 동일했다. owner/count/digest와 raw payload는 ignored/private 영수증에만 남긴다. 실제 금융/identity/auth/rule 권한·schema를 바꾸지 않았다.

재현은 [기존 matrix 명령](2026-10-14-money-admission-test-matrix.md)의 owned runtime을 사용한다. 이번 run ID는 `admission-acceptance-scheduler`, port55467, source-launch classpath task만 실행했고 공유 DEV credentials를 test process에 상속하지 않았다. Explicit filters는 evidence JSON의8개 MONEY class다. 새 test `measureActualDefaultSchedulerAndCommittedPersistenceWithoutAdvancingClock`를 포함한 fresh XML123건 모두 PASS/skip0. Gradle test build는 성공했지만 runner 최종 exit는1이었다. **cleanup 실패를 포함한 전체 runner PASS는 아니다.**

읽기 감사 재현: 보호된 기존 `POS_MIGRATION_ARTIFACT_DIR=F:/artifacts/pos-db-migration-20261014`를 설정하고 repository root에서 `node qa/money-admission-dev-read-audit.mjs`. 기존 `qa/money-admission-preservation.mjs before/after`는 private snapshot을 기록한다. credentials를 명령 인수·Git·chat에 넣지 않는다.

PG fast-shutdown checkpoint가 완료되지 않아 `backend-postgres-stop:timeout`, 당시 port-not-released 오류가 기록됐다. 이후 fresh 관찰은 해당 owned root/direct child0·port55467 listener0이다. 원래 실패 영수증은 그대로 보존했다. 정확한 run-owned PG 폴더의 정리 요청은 자동 승인 검토가 **`blocked by policy`**로 거절했으며 다른 상세 사유는 없었다. 삭제/다른 helper/강제 worktree removal로 우회하지 않았다. 해당 합성 데이터 폴더와 QA worktree를 이 구체적인 failure 조사·cleanup 사유로 보존한다. 다른 PG process, shared DEV/PROD DB, unrelated worktree/lock은 건드리지 않았다.

이번 변경은 focused scheduler timing test, read-only audit와 보고서뿐이다. 확정된 금융 correctness defect가 없어 product repair·재배포는 하지 않았다. 단지 E2E 목표를 맞추기 위해 승인된10초 observation을 줄이거나 UI를 바꾸지 않았다.

## PROD 준비와 정확한 다음 단계

PROD는 **BLOCKED / NOT READY**다. 승인 요청이나 배포를 수행하지 않는다.

1. 기본10초 observation과 총10초 목표의 관계를 확인하고, 안전한 single-side/conclusive 경로별 latency budget을 확정한다. 이는 현재 정책·측정의 충돌 해결이며 임의의 안전 조건 완화를 뜻하지 않는다.
2. 기존 승인 TEAM 연결 범위에서 문서화된 disposable notification driver 또는 실제 허용된 테스트 intake를 확보한다. 동일한 hosted DEV에서 intake/decision/commit/UI timestamps와 duplicate·late·repeat·approved-category·failed Save를 실행하고 ID-scoped cleanup을 확인한다. 그룹·profile·debug 보안 우회는 하지 않는다.
3. intended combined UX/source SHA의 DEV 배포 상태를 다시 확인하고 그 정확한 UI로 native acceptance를 반복한다. 다른 chat의 UX QA를 이번 결과로 합산하지 않는다.
4. auto-review가 거절한 run-owned synthetic PG directory의 정상 cleanup이 가능해진 뒤 exact owner marker/process/port를 재확인하여 QA worktree/branch를 정리한다. 현재 자료는 보존한다.

실제 위 gate들이 통과하면 별도 소유자 PROD 승인을 요청할 수 있다. 기존 application rollback 계획은 [Phase1 보고서](2026-10-14-money-financial-admission-v2-phase1.md)의 exact DEV build를 따른다. 새 migration이 없어 DB restore/delete/backfill rollback은 없다.
