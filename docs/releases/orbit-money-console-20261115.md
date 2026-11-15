# ORBIT × MONEY SYS 구현·배포 완료 보고서

2026-11-15 · 기존 ORBIT POS Streamable HTTP MCP 확장 · 승인 범위: DEV 인수 → PROD 승격 → 비변경 smoke.

MONEY 전용 도구 54개를 추가하고 기존 읽기 도구 20개를 유지했다. DEV의 실제 합성 사용자 OAuth·MCP 쓰기 인수를 통과한 동일 MONEY 구현을 PROD API·Web·MCP에 배포했다. 기존 채팅 연결의 인증된 MONEY 읽기도 성공했다. **새 MONEY 도구의 실제 ChatGPT 채팅 호출과 채팅 쓰기는 아직 검증되지 않았다. 현재 채팅에는 기존 20개 도구만 노출되며 연결 갱신·별도 쓰기 동의가 필요하다.**

## 완료 상태

| 항목 | 판정 | 근거와 경계 |
|---|---|---|
| BACKEND IMPLEMENTED | PASS | 전용 `/api/orbit/money/v1/` 경계, canonical 도메인 서비스·버전·잠금·idempotency 재사용 |
| MCP DEPLOYED | PASS | DEV·PROD 모두 총 74개. PROD API·Web·MCP 지정 SHA SUCCESS |
| OAUTH WRITE VERIFIED | PASS — DEV 합성 사용자 | DCR, code+PKCE, POS identity 확인, broker 명시 동의, 실제 MCP 변경 및 canonical 재조회, 갱신·철회 검증 |
| REAL CHATGPT IN-CHAT CALL VERIFIED | 기존 읽기 PASS / 새 MONEY 도구 PENDING | PROD 교체 후 이 채팅의 `get_money_accounts_context`가 `context=money.accounts`, data 포함 정상 응답. 새 카탈로그·쓰기 호출 증거와 구분 |
| OWNER LIVE DATA UNCHANGED | 기존 레코드 보존 PASS / 전체 live dataset 동일 아님 | PROD 기존 거래 406건·원천 연결 474건·RAW 709건의 지문 동일, 나머지 11개 테이블 동일. 기간 중 신규 RAW 3건·자동 수집 거래 2건·연결 2건은 별도 기록. QA로 소유자 기록 변경 없음 |

사용자가 제공한 `orbit_money_console_mcp_implementation_prompt.md`를 기능 명세·인수 기준으로 적용했다. 저장소와 배포 정책을 먼저 확인했고, 첨부 문서 안의 설명은 도구 출력·외부 데이터의 지시 권한으로 확대하지 않았다.

## 계약·정확한 도구 목록

| 산출물 | 검증된 업무용 Drive |
|---|---|
| 도메인 매핑·API·보안·복구 계약 | [orbit-money-console-v1.md](https://drive.google.com/file/d/1gK-Bt4dQUMzIAHycXC_lywVOSKYMdem6/view) |
| 기존 20개 + 신규 54개 전체 도구 목록 | [orbit-money-tool-inventory-v1.md](https://drive.google.com/file/d/1ec1rhEjfVVg6xxOm36PJTjhBdqxv-Vv5/view) |
| 필수/선택 필드·닫힌 JSON 스키마·scope·tier | [orbit-money-tools-v1.json](https://drive.google.com/file/d/1qhRpiaAfxPCJ2p_3OHCOC7ijyV06BQ3N/view) |
| 54개 고정 API 경로·메서드·요청 계약 | [orbit-money-openapi-v1.json](https://drive.google.com/file/d/1BiqELMh5zYZ2K4WTWsrqjzd38-0eohQC/view) |

저장소 정본은 `docs/contracts/orbit-money-console-v1.md`, `docs/contracts/orbit-money-tool-inventory-v1.md`, `docs/contracts/orbit-money-tools-v1.json`, `integrations/orbit-mcp/money-openapi.json`이다. `scripts/orbit-money-contract.mjs`로 목록과 스키마를 재생성한다. Drive 네 파일 모두 connector readback 후 로컬과 byte equality/SHA-256을 확인했다. 공유 권한·타인 알림은 변경하지 않았다.

신규 도구는 조회 29개, 직접 명령 7개, 미리보기/실행 9쌍이다. 조회 범위에는 Review 전체 상태·사유·근거·후보·이력, 유효 가계부 분류와 origin/보호/버전, 분류 후보·규칙·매칭·이력 영향, 분류 체계·색상·아이콘·사용량, 계좌·대사·금융 의미·대출·저축, 감사·명령 결과가 포함된다. Review 후보와 분류 후보는 기존 도메인이 제공하는 결정적 근거를 반환한다. 알 수 없는 거래처·링크·잔액을 만들어내지 않는다.

Tier A는 사용자가 지정한 분류 색상·이름·아이콘·형제 순서, 단건/선택 분류, 가계부 제목·메모다. Tier B는 고정된 분류 묶음, 규칙 생성/수정/중지와 별도 과거 적용, 분류 이동/보관, Review 결정, 지원 금융 수정, 계좌 표시/포함 설정, 지원 분류 undo다. 미리보기는 변경안·근거 fingerprint·10분 TTL·고정 ID를 저장하며 실행 입력으로 대상을 추가할 수 없다. 색상 계획은 모두 성공하거나 모두 rollback한다. Review는 기존 독립 per-item transaction 결과를 유지한다.

지원 금융 수정은 기존 unified-bookkeeping 명령의 유형 확인, 근거 있는 계좌 정정, 이체 링크/해제·지원 복구, 환불 연결과 대출 분할 범위다. 원금·이자·수수료·연결·소스·버전 조건은 기존 canonical 서비스가 검사한다. 금융 미리보기는 그 명령을 rollback-only transaction에서 실제 검증하고 실행 전에 근거를 재검사한다. 기존 현금 효과를 한 번 유지한다.

RAW 수정/삭제, 임의 금액·일시 변경, 계좌·거래·대출 삭제, 임의 잔액 체크포인트, 분류 병합, 무제한 재처리·소유자 backlog 자동 정리는 노출하지 않는다. 계층 이동은 기존 도메인이 지원하는 활성 동일-kind 부모 간 자식 이동이며, 루트 승격이나 분류 kind 변경으로 확대하지 않는다. 규칙 저장은 미래 적용이며 과거 적용은 별도 확인 흐름이다.

## 인증·명령 안전성

- `orbit:read`를 보존하고 `orbit:write:money`를 별도 동의 scope로 추가했다. 쓰기 도구는 두 scope가 모두 필요하다. AS/resource metadata, DCR, tool securitySchemes, 동의 화면, access/refresh grant에 반영했다. 기존 읽기 grant가 쓰기로 바뀌지 않는다.
- upstream native POS OAuth는 기존 `openid` 사용자 JWT를 유지한다. 인식된 ORBIT native client라도 일반 `/api/money/**` 접근은 계속 거부한다. 신규 경계의 고정 route+method만 허용한다.
- broker는 현재 grant의 소유자·client·scope를 요청마다 검증하고, 발급 직전에도 철회를 재확인한다. 별도 서명 proof는 30초 TTL이며 issuer/API audience·환경·subject·native/downstream client·grant·upstream token hash·정확한 method/path/query/body hash에 묶인다. 모델이 scope 문자열이나 헤더를 넣어 권한을 만들 수 없다. 잔여 철회 전파 한계는 proof 수명 30초다.
- 소유자 advisory lock, 금융/override/projection/classification 버전과 canonical fingerprint를 보존한다. bulk·과거 규칙은 직접 보호 분류를 덮어쓰지 않는다. 동일 requestId+body는 재생하고 다른 body 재사용은 거부한다. 응답 유실 시 원래 requestId로 `money_get_operation_outcome`을 조회한다.
- 감사 receipt는 canonical 기록을 가리키며 별도 금융 장부를 만들지 않는다. UNKNOWN/PARTIAL/NOT_APPLIED를 성공으로 합치지 않는다. 지원 undo도 현재 버전·의존성·fingerprint가 맞을 때만 실행한다.
- 원문 payload·notification body·장치/계좌 힌트·토큰·이미지를 제거한다. 업무 제목/메모는 비신뢰 데이터로 취급한다. 고정 HTTPS upstream, redirect 차단, no-store, 요청 64KiB/응답 256KiB, 조회·batch 상한과 기존 rate limit을 유지한다.
- Spring 7의 기존 JPA transaction 안에서 MONEY JDBC nested command/savepoint가 작동하도록 `MoneyJdbcSavepointJpaDialect`를 구성했다. Hibernate 시작/종료는 위임하며 JDBC-only nested scope에서만 savepoint를 사용한다. HTTP rollback·재조회와 전체 도메인 회귀로 검증했다.

## 검증 결과

| 검증 | 결과 | 근거 범위 |
|---|---|---|
| 전체 backend 회귀 | 196 suite / 1,756 total, 1,513 실행 성공, 243 조건부 skip, 실패·오류 0 | 초기 통합 구현, 폐기 가능한 loopback PostgreSQL. 최종 전체 재실행으로 표기하지 않음 |
| 최종 PROD 후보 집중 검증 | 8 suite / 135 성공, skip·실패·오류 0 | `orbit-a4a55c63-66c6-43f9-a67b-d45ecbb42369`, 실제 JWT HTTP·owner 격리·proof·CAS·idempotency·stale 금융 근거·rollback·한 번 posting·보호 분류·원천 필드 제거·ISO 날짜 보존 |
| MCP/OAuth/공식 Inspector 로컬 | 15 성공 | catalog/schema·read/write scope·DCR/PKCE/consent/refresh·transport·origin·토큰 보안 |
| hosted DEV 최종 인수 | 96개 확인 PASS, cleanup 전체 PASS | `564f6dcf-803a-400b-807b-5b5e671f6227`, 2026-11-15 13:28:20–13:30:50 KST |
| 프런트엔드 | 초기 관련 27개 성공, 후속 관련 13개 성공 | 색상 autosave·순서·아이콘·차트·분류·Review·대사 관련 회귀. 두 실행에 중복이 있으므로 40개 고유 테스트로 합산하지 않음 |
| 정적/빌드 | consent ESLint, 정상 Next build·타입 검사 성공 | 최초 단독 tsc의 미생성 Next LayoutProps는 정상 build 후 해소. PROD 실제 Web build도 성공 |
| 실제 브라우저 합성 E2E | PASS | 승인 TEAM KAFKA Playwright, loopback 합성 사용자: inline 분류 실제 저장+재조회, 색상 autosave+semantic version 불변, Review 분리, unknown 잔액, 390px 가계부 |
| PROD smoke | PASS — 비변경 | API health UP, MCP 74, OAuth scopes, 익명 MCP/API 401, 기존 서명 키 지문 동일, 기존 실제 채팅 읽기, 인증된 가계부 DOM/table·overflow 없음 |

Hosted DEV 인수는 실제 GoTrue 폐기 사용자 생성·일반 password 로그인·DCR·PKCE·native identity 확인·broker 쓰기 명시 동의·SDK/공식 Inspector를 사용했다. 기존 20개 도구 호출, 읽기 grant 쓰기 거부, 무인증/잘못된 서명/origin 차단, 새 카테고리·CAS·replay·결과 복구·분류·금융 dry run/실행, 색상 계획·이름/순서·미래 규칙·별도 과거 적용·보호 분류·계좌 표시 변경, 상세 조회를 검증했다. 갱신 토큰 회전과 grant 철회 후 거부도 확인했다. 토큰·비밀번호·서명 개인 키는 로그나 보고서에 저장하지 않았다.

확장 인수의 초기 빠른 실행은 60회/분 제한으로 중단됐다. 서버 제한을 낮추지 않고 호출을 pacing하여 최종 96개 확인을 통과했다. 테스트 정리 목록에 생성 규칙을 추가하고 초기 정리 실패 계정도 정확한 run/email/qaRunId fence로 제거한 뒤 auth GET 404를 확인했다. 초기 broker 재배포 중 transport 중단도 안정 배포 후 재실행으로 해소했다. 중간 실행 1회에서는 guarded 금융 실행이 적용되지 않아 테스트를 중단하고 fixture를 정리했다. 그 실행은 상세 거부 사유가 수집되지 않아 원인을 단정하지 않는다. QA는 이후 거부 사유를 기록하고 명확한 PREVIEW_STALE일 때만 새 계획을 받도록 개선했다. 최종 96개 실행에는 거부나 재시도가 없었다. 이 실패들을 최종 PASS 실행과 구분한다.

브라우저는 기존 TEAM profile/PID를 재사용했고 새 디버그 인터페이스·개인 Chrome·Computer Use를 사용하지 않았다. Playwright provider는 숨은 browser/claim/extension ID를 노출하지 않으므로 legacy Phase 2 schema의 `INVALID_EXTENSION_INSTANCE` 한계를 별도 기록했다. Codex 확장 ID를 대입하지 않았다. 승인된 provider 예외 안에서 실제 navigation/DOM/interaction을 관찰했으며 tracing이나 미노출 runtime identity 검증까지 성공했다고 주장하지 않는다. 작업 탭은 닫았다.

## 실제 배포

Railway 프로젝트: `2b52b232-38b2-44b6-b97e-4caba54f90bc`. 공식 CLI Kafka 계정 확인 후 환경별 staged diff를 검토·commit했다. 원격 `accept-deploy`의 알려진 cancellation 경로는 재시도하지 않았다. 공통 release lock을 보유했고 잠금을 삭제·우회하지 않았다.

| 환경 | 서비스 | 실제 deployment ID | SHA | 결과 |
|---|---|---|---|---|
| DEV | API | `2cc9b8ae-328c-4913-9940-eb0c662afdec` | `77898a0b5ff0584a220d59a20df303eb34801765` | SUCCESS, hosted-dev |
| DEV | Web | `f1a9747f-1def-40d7-ad4e-6ce631aafb74` | `c6e4053c0e690df03456620560cc96483da3df4c` | SUCCESS — 본 작업의 검증 배포 |
| DEV | MCP | `1c16afa3-9a44-431d-930b-345f1cb220b4` | `c6e4053c0e690df03456620560cc96483da3df4c` | SUCCESS |
| PROD | API | `2c26d572-a515-4749-af04-04bac2dee03f` | `1d8a1af9f6a889be1093d27f5485ab65562f2ad2` | SUCCESS, prod |
| PROD | Web | `3c2e0a06-fab4-43ef-aae8-34553c7cb8e0` | `05cb7ad2b684b335349159edd614be590a76506f` | SUCCESS |
| PROD | MCP | `82122b93-31c8-43ce-aa8d-b70838563cec` | `05cb7ad2b684b335349159edd614be590a76506f` | SUCCESS |

DEV와 PROD의 ORBIT 전용 구현 소스는 diff가 없다. PROD는 기존 `6727836734fd9d591d8ff09ee119e6773fb2116a`에서 ORBIT 작업만 선별해 구성했다. DEV에 동시에 통합된 별도 STUDY 및 MONEY Review 변경은 이번 PROD로 승격하지 않았다. API 자동 배포 branch-following 정책을 유지했고 Web/MCP는 환경 범위의 exact SHA로 고정했다. 최초 API `eb30280e-a348-49e5-bd34-e81344019c1a`의 SUCCESS·profile·DB·health 후 Web/MCP를 적용했다. 최종 금융 상세·후보·날짜 필터 보완은 API만 변경하며 이미 검증한 Web/MCP 운영 코드는 그대로다. 이 보고서를 넣는 후속 커밋은 문서/증거만 변경하며 위 기능 배포 SHA와 구분한다. 동시 DEV 작업의 별도 배포를 본 작업의 Web 검증 배포와 혼동하지 않는다.

PROD API는 최초 13:02:52 KST, 최종 조회 보완 배포는 13:33:07 KST에 prod profile로 시작했다. 두 배포 모두 Flyway 기존 99개/latest 105를 검증하고 추가 migration 없이 up-to-date였다. DEV는 기존 101개/latest 106을 유지했다. 이 기능은 migration·backfill이 없다. PROD 환경 전체 8개 서비스가 정상이며 최근 실패·남은 staged/applying 작업은 없었다. OAuth `/data` 기존 volume과 master key를 보존했고 공개 JWKS 지문 및 최종 API 교체 후 13:34 KST의 기존 grant 채팅 읽기 성공으로 연속성을 확인했다.

## 데이터 보존과 남은 소유자 단계

DEV 기존 소유자 14개 테이블의 행 수·정렬된 행 지문과 Flyway 이력이 모두 일치했다. PROD의 13:34 최종 비교에서는 RAW 709→712, 거래 406→408, 원천 연결 474→476으로 증가했다. 나머지 11개 테이블은 완전히 일치했다. 기준 시각 이전 RAW 709개 행, 생성 시각 이전 거래 406개 행, 기존 RAW/거래를 잇는 연결 474개 행을 별도 재해시한 결과도 모두 일치했다.

새 RAW 3건은 12:30:40–13:08:44 KST에 수신됐으며, 새 거래 2건은 13:07:38–13:08:59 KST에 생성됐다. 두 거래 모두 manual=false이고 각각 신규 RAW 원천 연결을 가진다. 모두 최종 조회 보완 API 배포 생성 13:31:23/기동 13:33:07보다 앞선다. 기존 수집 흐름의 신규 기록과 기존 레코드 보존을 구분하며, 전체 live dataset을 완전히 동일하다고 표기하지 않는다. 운영 데이터 수정·삭제나 QA용 소유자 금융 쓰기는 실행하지 않았다.

1. ORBIT POS 연결/도구 목록을 새로고침한다. 여전히 20개만 보이면 같은 PROD [MCP 주소](https://orbit-pos-mcp-prod-production.up.railway.app/mcp)로 재연결한다.
2. 기존 POS 계정을 확인하고 broker에서 `orbit:read orbit:write:money`에 명시 동의한다. 읽기만 원하면 기존 `orbit:read` 연결을 유지한다. 기존 grant를 새 scope로 자동 확대하지 않는다.
3. 채팅에서 `money_get_console_capabilities`, `money_list_categories` 또는 `money_get_attention_summary`를 요청해 새 카탈로그·인증된 읽기·현재 scope를 확인한다.
4. 실제 쓰기는 소유자가 원래 의도한 구체적 변경을 요청할 때 수행한다. 운영 금융 기록을 바꾸는 QA는 하지 않는다. 위험 작업은 정확한 미리보기와 확인 후 실행하고, receipt와 canonical 재조회로 검증한다. 이 단계의 실제 채팅 쓰기 성공은 현재 보고서에서 PENDING이다.

명령 응답을 잃으면 새 requestId로 재시도하지 않는다. 원래 requestId의 결과를 먼저 조회하고 UNKNOWN이면 기존 canonical outcome을 조사한다. stale plan은 새로 미리보기하고 다시 확인한다.

## 롤백·유지보수

애플리케이션 rollback은 새 MONEY 도구/쓰기 사용을 먼저 중지하고 broker를 이전 검증 소스로 되돌린 뒤 API를 되돌린다. 구 backend에 새 쓰기 grant를 사용하는 혼합 상태를 만들지 않는다. 이전 PROD API/Web SHA는 `6727836734fd9d591d8ff09ee119e6773fb2116a`, 이전 MCP SHA는 `c9240a20dda680fa2788db642bd5855538b49257`이다. source 변경은 환경별 staged diff 검토 후 공식 CLI로 적용하고 API-before-Web 게이트를 따른다.

금융 DB·OAuth vault를 과거 백업으로 덮어쓰거나 command/audit 기록을 삭제하지 않는다. DB migration rollback은 필요 없다. 지원 undo는 분류와 canonical unlink recovery 범위만 사용한다. 소유자의 주 작업 디렉터리 기존 변경과 다른 작업 worktree는 보존한다. QA 증거는 별도 로컬 artifact 보관 후 이번 임시 worktree/branch·소유 프로세스·lock을 정리한다.

기계 판독 검증 증거: `docs/releases/evidence/orbit-money-console-20261115/verification.json` / [Drive 검증 증거](https://drive.google.com/file/d/124y9TTx0vnqAFywyO8WQYp3sOyG45fL8/view). 민감 원문·인증 값·무관한 사용자 자료는 포함하지 않는다. 로컬 보조 산출물과 전체/최종 테스트 XML은 `F:\artifacts\orbit-money-console-20261115`에 보관한다. 합성 fixture·자체 브라우저 탭·소유 테스트 DB/포트는 정리됐다. 공통 release lock과 임시 worktree는 문서 통합 및 Drive 검증을 마친 뒤 이번 작업 종료 전에 반납한다.

## 이후 동시 통합 관찰

위 기능 승격·13:34 보존 검증 후, 보고서 통합을 위한 fetch에서 별도 MONEY Review 작업의 `44f045027379ed1dbfc254aed4f246066d0e9c3a`가 이미 `origin/prod`에 있음을 확인했다. 이를 fast-forward로 보존하고 보고서/증거 두 파일만 추가한 커밋은 `dd8e08e4276b6766ef6abe868dad7c554ec5a276`이다. 그 두 커밋 사이 backend/frontend/MCP 운영 코드 diff는 없다. 이 별도 Review 승격을 이번 작업의 승인·135개 격리 후보 검증으로 대신 인증하지 않는다.

문서 커밋의 자동 API 배포 `2ea49198-67dd-4fa8-a183-5084c84b1661`도 SUCCESS였고, 이후 기존 인증된 채팅 MONEY 읽기를 다시 확인했다. ORBIT 전용 구현과 MCP 도구는 유지된다. 이 추가 관찰은 DEV의 정본 문서와 같은 Drive 파일 ID에 갱신하며 별도 PROD 애플리케이션 변경은 추가하지 않는다. 데이터 보존 수치의 관찰 범위는 앞서 명시한 13:34–13:35 검증 시점이다.
