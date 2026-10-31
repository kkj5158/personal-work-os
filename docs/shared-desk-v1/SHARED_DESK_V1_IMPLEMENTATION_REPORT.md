# 공유작업대 Web V1 구현 보고서

작업 시작 2026-10-28, 재개·인계 2026-10-31 KST. 최종 판정: **PARTIAL / PRODUCTION BLOCKED**. Web/API/DB/실제 파일 저장소는 DEV에서 구현·배포했고 코드·빌드·인증 API 검사를 통과했다. 최종558 Web의 브라우저 재검증은 전용 연결/자동 승인 검토 문제로 차단됐다. 이전 실제 UI 검사와 구분한다. 사용자의 후속 지시에 따라 Android 구현·서명·배포는 이번 완료 범위에서 제외했다. 운영 정기 백업과 PROD 복구·운영 알림 검증이 남아 있어 이번 작업은 PROD 설정·배포를 실행하지 않았다. 세션 중단 중 다른 릴리스가 PROD에 V101 포함 소스를 반영한 상태는 별도로 기록한다.

## 구현 결과 — DONE

- 기존 WORK FLOW shell의 SHARED SPACE > 공유작업대와 `/workflow/shared-desk`. 클립보드·파일·메모채팅, 검색/핀/동일 owner Project 선택 연결, 7일 휴지통, 한 단계 답글과 파일 참조를 구현했다.
- Spring Boot 기존 GoTrue JWT/CurrentUserProvider를 유지했다. 별도 integration credential에 사용자 파일 접근을 주지 않는다. owner 직렬화, 필수 expectedRevision CAS, durable operation journal, 같은 operationId 재실행, 목록 snapshot/owner·환경별 delta cursor와 만료 후 재동기화를 구현했다.
- 같은 owner Project 삭제는 항목을 보존하고 연결 해제 revision/delta를 발행한다. 기존 Workflow/Project 양쪽 삭제 경로를 처리했다.
- Web의 IndexedDB 초안·outbox·cache는 owner/API/환경별로 분리한다. 전송 전에 작업을 저장하고 불확실한 응답은 상태 조회 후 같은 작업을 재시도한다. 409에서는 원문을 보존하며 사본 ACK 이후 해당 충돌 작업만 제거한다. foreground polling, focus/reconnect, 응답 역전 방지를 적용했다.
- provider-neutral `ObjectStorage`와 Railway S3 adapter. 인증 티켓 → private staging direct PUT → 예측 불가 final 키 copy → 실제 final 바이트를 제한된 메모리로 검증 → READY → owner 인증 후 60초 GET 티켓이다. 재사용 가능한 staging URL로 final을 덮어쓸 수 없다.
- 100 MiB/파일, 1 GiB/owner, 동시 3개. 취소/실패/만료 staging과 검증 final 예약은 실제 삭제 ACK까지 계산한다. 10분 PUT, 7일 trash, 재시작 가능한 개별 객체 정리 큐와 시간 단위 maintenance를 구현했다. prefix 일괄 삭제는 없다.
- Web 파일 해시는 조각 단위 SHA-256, XHR에는 원본 File을 전달한다. 다운로드도 수신 중 해시를 계산한다. 브라우저 Blob 저장 fallback은 검증된 최대 100 MiB와 브라우저 복사 오버헤드를 메모리에 유지할 수 있다. 다운로드 전체를 두 번째 arrayBuffer로 읽지는 않는다.

구현 경로: `backend/src/main/java/com/kafka/backend/shareddesk/`, `backend/src/main/resources/db/migration/V101__shared_desk_v1.sql`, `frontend/app/workflow/shared-desk/page.tsx`, `frontend/lib/shared-desk/`. 계약은 `API.md`, 운영 절차는 `OPERATIONS.md`, 결정은 `OWNER_DECISION_REGISTER.md`에 있다.

## 실제 환경·배포

Railway project `2b52b232-38b2-44b6-b97e-4caba54f90bc` (Kafka's Projects).

| 구분 | 관찰된 상태 |
|---|---|
| DEV environment | `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c` |
| DEV API service | `eba7d263-7dc3-448a-a6b8-c2994721b597` |
| DEV API source / 성공 배포 | `558e44aab25ede324bcd811505fced776ea22c8c` / `224364d5-245a-4c1a-b46d-3e3bc2a54be0` SUCCESS |
| DEV Web service | `b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae` |
| DEV Web source / 성공 배포 | `558e44aab25ede324bcd811505fced776ea22c8c` / `f1c79731-b193-462c-b060-40c1527723db` SUCCESS |
| DEV bucket instance | `c96af38e-73ad-49c2-813d-747b8f893ba9`, `shared-desk-dev`, private, ams / SDK auto / virtual-host |
| DEV migration | 현재 V103(MONEY preference) checksum `-1330974876` 성공. V101 checksum `1353152953` 유지, Shared Desk 테이블 11개. 적용 후 migration 수정/repair 없음 |
| PROD environment | `c2c20488-311f-4b9e-9ec9-d79508123176` |
| PROD API service / 현재 관찰 배포 | `e46b58f4-e829-430f-a4c4-b27e24d46f19` / `28a3460f-6019-4279-a207-440cb8562178` |
| PROD Web service / 현재 관찰 배포 | `5818a578-b7a2-443a-aaad-ce10f6bb708c` / `867c7ae5-a282-4a5d-acf5-a1cf208826b5` |
| PROD source | API/Web `3029de43e47a95bc0eeda4efad3da9cb820af872`, 다른 MONEY 릴리스가 10/29 배포. 이번 Shared Desk 운영 활성화와 구분 |
| PROD DB/storage | 10/31 read-only 재조회: V102, V101 checksum `1353152953` 성공 및 테이블 11개. 전용 버킷 0, Shared Desk 변수·활성 flag 없음(소스 기본 disabled) |

DEV Web: https://workflow-web-development-development.up.railway.app/workflow/shared-desk

DEV API: https://workflow-api-development-development.up.railway.app

API에만 `SHARED_DESK_STORAGE_{BUCKET,ENDPOINT,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`를 버킷의 해당 변수 이름으로 참조했다. public frontend에 영구 저장소 자격증명을 넣지 않았다. `SHARED_DESK_ENABLED`, `SHARED_DESK_STORAGE_ENABLED`, `SHARED_DESK_STORAGE_ENVIRONMENT`, `SHARED_DESK_STORAGE_PATH_STYLE`를 사용한다. 실제 공급자 credentials 값은 기록하지 않는다.

10/28 DEV Web에 타 작업 staged patch `bb55d5d0-4814-4b53-867e-00919480a518` 4건이 있어 일괄 accept하지 않았다. 세션 재개 후 10/31 inventory에는 patch `75ca1e4d` 1건이 관찰되었으며 보존했다. source 설정과 실제 배포 메타데이터가 다를 수 있어 실제 배포 SHA를 따로 읽었다. 다른 작업이 변경한 staged 항목을 이 작업의 변경으로 세지 않는다.

첫 DEV API 검증 source `f082d9b...` / 배포 `9dcb6c14...`는 10/28 SUCCESS였다. 10/31에는 타 작업 source `3029de43...`의 API `70f31a67...`, Web `92cef1dd...`가 실제 서비스 중이었다. Shared Desk backend와 V101은 내용이 동일함을 대조하고 최신 `origin/dev e0c71f4`를 병합해 `558e44aab25ede324bcd811505fced776ea22c8c`를 최종 검사했다. 상속된 MONEY preference 변경 때문에 최종 API/Web을 호환되는 같은 source로 검사·배포한다.

이전 API 배포 `b3e1753b-1185-4906-b69d-cf03fd3b8164`는 Railpack의 `frontend grpc server closed unexpectedly`로 앱 컴파일 전에 실패했다. 이후 배포가 성공했고 최종558 배포는 별도로 SUCCESS와 인증 API 검사를 확인했다. 병합 전 로컬 Web build는 최신 dev를 통합하기 위해 중단했으며 최종 병합 build PASS와 구분했다.

## 검증 결과 — VERIFIED

| 대상 | 결과와 근거 |
|---|---|
| Backend/DB 핵심·기존 Project | **PASS 56**, 실패/skip 0. DeskService 13, DeskFiles 14, WorkflowService 27, ProjectDeletion 2. owner/CAS/operation replay·만료/cursor/동시성/할당·정리/trash·restore/Project 연결 해제 검증. `BACKEND_TEST_SUMMARY.json` |
| 최종 병합 Backend 558 | **PASS 68 unique**, 위 56 + MONEY security 8 + preference 4. 처음 preference 4개는 로컬 fixture의 anon/authenticated 역할 부재로 실패, 격리 fixture만 보완하고 해당 4개 재실행 PASS. 공유 DB 수정 없음. `FINAL_MERGED_BACKEND_QA.json` |
| Storage 단위 | **PASS 16**, FilePolicy 7 + S3ObjectStorage 9 |
| 실제 DEV provider | **PASS**, signed PUT/GET, final 불변성, 변조 거부, anonymous/다른 owner 접근 거부, 타입 위장 거부, 개별 cleanup HEAD404. 광고된 S3 호환성만으로 통과 처리하지 않음 |
| 실제 DEV API 최종 f082 | **PASS 28**, 정상 GoTrue password 세션 두 개. exact 원문, lost response replay, CAS409, foreign owner/cursor/Project/첨부 거부, 파일 PUT→READY→GET→SHA, memo/reply, trash/restore, Project 삭제 delta. `DEV_FINAL_API_SMOKE.json` |
| 실제 최종 배포 API 558 | **PASS 28 재검증**, 실제 GoTrue·DEV DB·private bucket. `DEV_558_API_SMOKE_20261031.json` |
| 취소 파일 최종 f082 | **PASS 6**, CANCELLED metadata trash→같은 ID/state 복원→재티켓→cleanup. `DEV_FINAL_CANCELLED_FILE_SMOKE.json` |
| 실제 9종 파일 | **PASS 45**, APK/ZIP/PDF/MD/JSON/TXT/PNG/JPEG/WebP 실제 업·다운로드 SHA. APK는 테스트 데이터이며 Android 납품 아님. `DEV_FILE_TYPES.json` |
| 실제 용량 경계 | **PASS**, 100 MiB PUT→서버 실제 바이트 검증→GET→SHA. 100 MiB+1 요청은 413. `DEV_FILE_BOUNDARY.json` |
| 실제 Web/CORS | **PASS**, DEV Web origin에서 signed PUT/GET·무결성 다운로드. 직접 S3 전송 사용, backend proxy fallback 불필요. direct GET은 attachment/octet-stream/private no-store. 공급자 응답에 nosniff 없음; 존재한다고 주장하지 않음 |
| Web 브라우저 | **PASS**, 정상 로그인, 한글·JSON·공백·끝 LF, pin/search, clipboard 허용/거부 fallback, stale409 초안·사본, memo/reply/파일첨부, 복수 업로드, 취소→같은 ID 재시도, file trash/restore, offline reload 초안·queue→reconnect 정확히 한 건 |
| Web 응답 순서·답글 | **PASS**, 의도적 지연 응답에서 tab/trash 로딩 초기화·다른 tab 덮어쓰기 방지, 실제 101개 답글 100→101 unique chronological pagination. `WEB_FINAL_PATCH_QA.json` |
| Web responsive/기존 shell | **PASS**, 1440/1280/768/390 overflow 없음, 기존 navigation/support/GlobalTabs 회귀 검사 |
| Web 최종 streaming source 558 | **PASS 33** focused, **PASS 86** 최신 MONEY calendar 회귀, full TypeScript·scoped ESLint·webpack build PASS(44 routes). 100 MiB stream SHA를 Node crypto 및 고정 oracle와 대조하고 block boundary/abort/취소/잘못된 길이/두 번째 arrayBuffer 금지를 검사. `WEB_STREAMING_AND_INTEGRATION_20261031.json` |
| 최종 배포 Web 558 브라우저 재검증 | **BLOCKED / NOT RUN**. 기존 다른 탭이 CDP Page/Runtime/Network 초기화에 응답하지 않아 전용 MCP 연결 실패. 기본10초·새 guarded client30초 재연결 실패. 독립 DEV 창 실행은 자동 승인 검토가 `blocked by policy`로 거부(상세 사유 미제공). 우회하지 않음. 최신 Web의 small/100 MiB UI 전송·rapid tab 재검증은 수행하지 않았다. 기존 실제 UI 검증과 100 MiB 실제 API 검증을 이 검사로 바꿔 계산하지 않는다. `FINAL_BROWSER_BLOCKED_20261031.json` |
| 인접 변경 회귀 | **PASS 24**, 합쳐진 dev의 GoogleSleepPostgresTest, 별도 로컬 스키마. `INTEGRATION_NEIGHBOR_TESTS.json` |
| DEV 합성 DB+객체 복구 | **PASS**, 동일 exported snapshot으로 pg_dump+manifest; 167 tables/170 rows digest, 1914 constraints/FKs, 실제 객체 2개 88 bytes 해시, memo→file와 reply 복원. 27초 샘플. `RECOVERY_DRILL.json` |

Windows clipboard readText는 LF를 CRLF로 정규화할 수 있다. 서버 저장 및 clipboard API에 전달한 원문은 일치한다. OS clipboard 바이트 동일성을 주장하지 않으며 원문 UTF-8 다운로드 기능을 제공한다. 이 버튼의 최종 OS 저장 바이트는 별도 재검증하지 않았다.

초기 검증 JSON은 당시 source/runtime 및 NOT YET TESTED를 남긴 시간순 기록이다. 후속 보고서가 offline/queue/cancel/reply 검증을 보완한다. 모든 로컬 검사가 최종 배포에서 반복됐다는 뜻은 아니다. recovery runtime은 `8094d5...` 기반 dirty source였으며 운영 복구 실적으로 바꿔 부르지 않는다.

## 정리·보존

- 로컬 fixture owner 두 개에 속한 객체 키 6개만 개별 삭제하고 HEAD404를 확인했다. 그 뒤 해당 로컬 Shared Desk row만 정리했다. 복구 drill 중에는 원본을 보존했고 이후 별도 fixture teardown에서 제거했다. 실제 공유 DEV/PROD DB를 이 로컬 정리에 사용하지 않았다.
- 로컬 Web/API/PG runtime을 종료하고 3187/8187/55487/55488 포트 해제를 확인했다. 타 worker의 node_modules junction은 자체 ignored QA 경로에 보존하고 이 worktree에 독립 npm ci를 수행했다. 타 worker dependency를 수정하지 않았다.
- 클라우드에서는 서버 fixture flag와 저장된 합성 identity가 일치한 owner 두 개의 항목만 정상 API로 trash 처리해 활성 항목 0을 확인했다. 객체/metadata는 7일 복구 정책을 따른다. 계정 2개는 reversible ban readback 및 새 password login 거부를 검증했다. hard delete 또는 일반 owner 계정 변경은 하지 않았다.
- DEV CORS에서 임시 localhost origin을 제거했다. cloud DEV origin OPTIONS200, 제거된 localhost OPTIONS403, wildcard 없음이 확인됐다. 원래 허용 methods/headers는 보존했다.
- 생성된 브라우저 텍스트 artifact 33개에서 fixture password 두 값의 정확한 문자열만 검사했으며 남아 있는 일치 0이었다. 원래 도구 출력에 노출된 합성 password를 실제 계정 차단으로 무효화했고 raw snapshots/logs는 납품에서 제외했다. 이미 발급된 JWT의 즉시 취소를 주장하지 않는다.
- 10/28 정상 owner DEV 브라우저 QA에서 만든 클립·파일·메모 각1개는 해당 ID만 정상 trash 처리했다. 10/31 최종 브라우저 연결은 작업 전 차단되어 새 항목을 만들지 않았다. 준비한100 MiB TXT는 ignored 로컬 fixture일 뿐 새 업로드 성공으로 세지 않는다.
- 소유한 공유 DEV deployment lock은 정상 release하고 부재를 확인했다. 브라우저 launcher의 시험적 CDP timeout 변경은 원래10000ms로 되돌렸고 자체 helper 연결만 종료했다. `FINAL_CLEANUP.json`과 최종 브라우저 차단 기록을 참조한다.

작업 worktree와 feature branch는 배포 source pin·인계 재현 및 보류된 운영 작업을 위해 유지한다. Android 작업물/개발 키는 무시된 로컬 영역 또는 미추적 mobile에 보존하며 Git/Drive 납품에서 제외했다. 다른 작업자의 primary dirty 파일, 서비스, 세션, staged 변경을 보존했다.

## 미완료 — BLOCKED / NOT TESTED

- **BLOCKED: 운영 정기 백업.** 승인된 durable backup 목적지, 실행 주체/스케줄·보관/접근 정책, 실패·비용 알림 경로를 정하고 실제 snapshot+객체 바이트 백업과 격리 복원을 검증해야 한다. RPO24h/RTO4h는 목표이며 보장하지 않는다. DEV 복구 샘플 27초는 운영 SLA가 아니다.
- **BLOCKED: Shared Desk PROD 활성화.** 위 gate 전에는 이번 작업에서 PROD 버킷/변수/배포/인증 smoke를 수행하지 않는다. V101은 다른 릴리스가 이미 적용했으므로 다시 실행·수정하지 않는다. 현재 사용자 Web 요청을 마쳤다고 운영 출시 완료로 표기하지 않는다.
- **BLOCKED: 최종558 Web 브라우저 재검증.** 전용 브라우저의 기존 비응답 탭을 보존했고 자동 승인 검토가 독립 DEV 창 실행을 거부했다. 연결 복구/허용이 가능해진 뒤 정상 세션에서 최신 UI의 파일 전송·다운로드 SHA와 빠른 탭 전환을 확인해야 한다. 개인 Chrome을 대체 경로로 사용하지 않았다.
- **NOT TESTED: 물리 노트북↔데스크톱 두 기기 여정**, 장시간 실제 사용·브라우저 강제 종료, 모든 IME/Escape/focus/TalkBack·스크린리더 조합, 전체 인접 제품의 완전 회귀. 실제 Web/독립 API 세션과 reload/오프라인 검증을 수행했다.
- **EXCLUDED: Android** signing/PROD APK/배포·OEM QA와 Android가 포함된 A/B/D/E 여정. 이전 개발 산출물을 Web 완료의 근거로 계산하지 않는다.
- **P1/P2:** memo→clipboard 전용 변환, SSE/push, multipart/resumable transfer, 운영 비용·알림 dashboard는 이번 P0 납품 범위 밖이다.

## 재실행과 다음 배포

`scripts/shared-desk-test.ps1`은 임시 루프백 PostgreSQL을 사용하고 종료한다. Frontend는 `npx tsx --test lib/shared-desk/*.test.ts lib/globalTabs.test.ts`, `npx tsc --noEmit`, 대상 ESLint, `npm run build -- --webpack`으로 검사한다. 실제 provider 검사는 명시적 DEV opt-in만 사용하며 영구 비밀을 파일/출력에 남기지 않는다.

운영 준비가 끝나면 최신 dev/환경/patch/DB migration을 다시 대조하고 정확히 검증된 API/Web source를 순서대로 배포한다. 장애 시 flag와 이전 호환 앱 revision으로 쓰기/업로드를 제한하며 V101 metadata/객체를 보존한다. down migration, repair, DB reset, 버킷 일괄 삭제는 하지 않는다.

## 전달 자료

기존 Kafka_AI_WorkSpace / 10_POS / [05_WORK_FLOW](https://drive.google.com/drive/folders/13aljVawi5PZhN5UKQGN1oFgOFGuCFKYv)에 보고서·인계·API·운영·결정 문서를 개별 저장한다. 파일 ID/부모/크기 metadata 재조회 결과는 `DRIVE_PUBLICATION.json`에 기록한다.

[2026-10-31 증거 ZIP](https://drive.google.com/file/d/1fkOzrGUUwPj3urc1HFrJYfl7naQRAjk6/view?usp=drivesdk): 551002 bytes, SHA-256 `a62f403b9a00cd516d96225357cb752db1d4c469b7cc312e3b078585ee1e875c`. QA JSON과 합성 로컬 owner screenshot 등35개 파일 및 manifest만 포함한다. raw DB dump, 비밀·토큰, raw 브라우저 로그, Android 키/소스/APK는 제외했다. ZIP은 metadata/객체를 복원하는 운영 백업이 아니다.
