# 공유작업대 Web 운영 배포 — 2026-11-10

사용자 요청: Android를 제외한 공유작업대를 운영까지 배포해 실제 사용 가능하게 한다. 이번 실행은 이전 DEV 구현의 운영 전환이며, 이전 보고서의 브라우저·정기 백업·복구 보류 항목을 실제 검증으로 해소한다.

## 최종 상태

**PROD_CORE_DEPLOYED / WEB VERIFIED / OPERATIONS PARTIAL — 자동 알림 전달 게이트 BLOCKED**. [운영 공유작업대](https://kafka-sys.life/workflow/shared-desk)는 활성화됐고 핵심 사용·파일 무결성과 실제 복원 검증을 통과했다. 자동 실패/비용 알림 수신 경로와 임시 복원 서비스·볼륨 삭제 승인은 남았다. Android는 제외다.

## 검증한 코드와 환경

실제 배포 소스 `7abf420bf720de51542813133329e40421820df2`. 기존 dev와 PROD의 공통 기반을 보존하고 Web 스트리밍 해시, 파일 수명 주기, API cleanup/backup coordination 및 백업 작업을 통합했다. frontend는 실제 DEV 브라우저로 검증한558과 동일하고, Java runtime은 실제 DEV57개 테스트와28개 인증 API 검사를 통과한7c77과 동일한 바이트다. Python 작업은28개 검사와 실제 원격 백업·복원으로 검증했다. 비교한 Git tree/blob은 SOURCE_EQUIVALENCE.json에 기록했다.

구현 위치는 backend의 `shareddesk/DeskFiles.java`, `DeskMaintenance.java`, `storage/SharedDeskStorageConfiguration.java`와 `S3ObjectStorage.java`, frontend의 `lib/shared-desk/files.ts`, 백업의 `ops/shared-desk-backup/{runner.py,entrypoint.sh,Dockerfile}`다. provider-neutral 어댑터·quota 예약/검증·불변 final copy·짧은 다운로드 ticket·7일trash/정리 및 읽기 권한은 기존 API 계약을 유지한다. 원본 입력은 첨부 구현 프롬프트와 Railway Bucket 추가 요청이며, 후속 Android 제외·운영 배포 지시를 적용했다. 저장소의 agent 운영/검증/Git/PROD 정책과 전용 TEAM KAFKA 브라우저 정책을 적용했다.

| 환경 | 확인 내용 |
|---|---|
| Railway project | `2b52b232-38b2-44b6-b97e-4caba54f90bc` Personal Work OS |
| DEV environment | `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c` |
| PROD environment | `c2c20488-311f-4b9e-9ec9-d79508123176` |
| Migration | 신규 migration 없음. 양 환경 V101 SharedDesk checksum1353152953 및 V103 상태를 read-only 대조 |
| API/파일 기본값 | 기존 GoTrue 사용자 JWT/owner 분리, 파일100MiB/개·owner1GiB·동시3개, 휴지통7일 |
| 기존 PROD | e0c71f4 기반 정상 서비스와 기존 사용자 데이터·서명키·개인 브라우저 세션 보존 |

| 실제 PROD 자원 | 관찰 결과 |
|---|---|
| API | `e46b58f4-e829-430f-a4c4-b27e24d46f19`, 배포 `ffc2f5f7-917b-4788-ab8f-d91fa6b96138` SUCCESS, source7abf420 |
| Web | `5818a578-b7a2-443a-aaad-ce10f6bb708c`, 배포 `48fd7038-31a3-4015-b866-c255092859b8` SUCCESS, source7abf420 |
| 데이터 버킷 | `1933a1f5-af1c-41f1-a1bc-b8e805993740`, `shared-desk-prod`, sin |
| 백업 버킷 | `7a8659e0-4e77-4392-9a6c-f43ed3da2850`, `shared-desk-prod-backup`, ams |
| 백업 cron | `234e7ddc-da3e-4aba-8b28-f2c4345603aa`, 배포 `e25d7ec4-d64d-45e1-bb88-dc46b42d1e9e` SUCCESS, source7abf420 |
| 복원 검증 버킷 | `0d4ae28c-2f6d-49f0-9c1e-b7c904b0294e`, `shared-desk-restore-prod`, ams. 원본과 다른 빈 버킷 사용 |

실제 API `SHARED_DESK_ENABLED`·`SHARED_DESK_STORAGE_ENABLED`는 true다. API의 `SHARED_DESK_STORAGE_{ENDPOINT,REGION,BUCKET,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`는 모두 `shared-desk-prod` 변수 참조이며 `ENVIRONMENT=PROD`, `PATH_STYLE=false`다. SDKregion은 공급자가 제공하는 auto이며, 물리 리전 sin과 구분한다. 브라우저에는 영구 키를 보내지 않는다. 백업 서비스는 별도 DB/data/backup 참조와 환경별 AES 키를 사용한다.

직전 PROD e0c71f4를 포함한 후보만 배포했다. 그 사이 dev에 통합된 별도 ORBIT79d11ad는 확인 후 이번 운영 범위에서 제외했다. dev 이력은 덮어쓰지 않는다. PROD pending patch는 없었고 DEV에 있던 다른 작업의 pending patch는 적용하지 않았다.

## 검증

- **PASS Backend57**: 기존56개 + 실제 PostgreSQL advisory lock을 통한 backup/cleanup 상호 배제. 새로운 스키마를 만들지 않는다.
- **PASS Python28**: 암호화 프레임·HMAC·변조/잘림·retention·실행 제한과 실제 PG snapshot/dump/restore. 검토 중 발견한 무한 대기와 큰 digest 배치 문제를 수정했다.
- **PASS DEV 인증 API28**: 실제 GoTrue 두 사용자, 원문·CAS·중복 처리·Project 연결 해제 delta·소유자 분리·실제 private 파일 업/다운로드·trash/restore. guard 배포 후 재검증했다.
- **PASS DEV 실제 브라우저**: 정상 로그인 후 session/JWT/API owner를 합성 fixture와 대조. 클립 원문 한글·빈 줄·끝 LF, 전체 복사, 메모/답글, 빠른 탭 이동, 파일 복구, 1440/1280/768/390 화면에서 수평 overflow 없음.
- **PASS DEV 실제50B·100MiB 파일**: 브라우저 File streaming hash와 직접 XHR PUT→서버 READY→클라이언트 무결성 다운로드→실제 저장 파일을 별도 Node streaming SHA-256으로 대조. 100MiB SHA `cee41e98d0a6ad65cc0ec77a2ba50bf26d64dc9007f7f1c7d7df68b8b71291a6`.
- **검증 환경**: 기존 정상 사용자가 쓰는 창과 로그인은 보존했다. 전용 guard 검증 후 별도 임시 incognito 컨텍스트를 사용하는 pinned Playwright로 테스트했다. 파일 선택의50MiB 전송 도구 제한은 같은 컴퓨터의 실제 file input 경로로 해결했으며 앱의 업로드·hash 코드를 모의 처리하지 않았다.

**PASS PROD 실제 격리 복원**: run20261109T153438Z_f174850c72b047289b23b36c7bde3577의 암호화 artifact4개를 먼저 인증하고 full compressed PG435,949,764B를 별도 PG17.11/Vault0.3.1 서버에 복원했다.11테이블77행의 count/digest·FK·owner와 실제2파일99B multipart복원/GET SHA가 일치했다. 원본 객체 재읽기SHA도 같았으며 대상2키 DELETE/HEAD404·빈 버킷·임시 DBdrop을 확인했다. 전체650초(복원 단계642초), SLA가 아닌 해당 자료/연결의 측정이다. fixture 정리·ban 후 최종 정상 백업을 추가 실행하며 최신 run과 당일 교체 결과는 PROD_BACKUP_AFTER_CLEANUP.json에 별도 기록한다. 이 후속 세트를 다시 복원했다고 주장하지 않는다.

- **PASS PROD API28**: 실제 운영 GoTrue 사용자 JWT 두 개로 원문·동시성·idempotency·Project 연결 해제와 owner 분리, 실제 private 파일 PUT/GET/hash, 휴지통/복구를 확인했다. 기존 실제 사용자 자료는 테스트에 쓰지 않았다.
- **PASS PROD 실제 Web**: 운영 도메인에서 일반 비밀번호 로그인 후 session/JWT/API owner와 PROD환경을 대조했다. 한글·빈 줄·끝LF 원문/클립보드, 메모·답글, 빠른 탭 전환, 1440/1280/768/390화면을 확인했다. 50B 파일은 브라우저 직접 PUT→서버READY→무결성 다운로드 후 독립 파일SHA `31f20dfa17c827d9a42e2db2acf7db13923e661ae2b5fa518c5e02038363d69b`와 일치했다. sidebar의 공유작업대 진입점도 실제 화면에 있다.
- **PASS PROD 새 클라이언트/용량 관측**: 새 비밀번호 세션 두 개에서 서버 원문·revision 일치와 브라우저가 올린 READY 파일을 확인했다. 사용량 API의 1GiB/100MiB/7일 및 정리 실패0을 확인했다. 실제 두 번째 물리 기기를 쓴 시험으로 계산하지 않는다.
- **PASS PROD 첫 백업/후속 백업**: 기능 활성화 전 full compressed DB435,942,281B/파일0 baseline을 원격 HMAC으로 확인했다. 실제 smoke 뒤 백업은 DB435,949,764B, SharedDesk11테이블77행, READY파일2개99B, pending0을 포함하고 원격 인증·SHA를 통과했다. producer211초, 완료run `20261109T153438Z_f174850c72b047289b23b36c7bde3577`이다.
- **PASS 정리 후 최종 백업/retention**: 합성 계정 ban·정리 뒤 run `20261109T155626Z_19306c63face4b9ca0dd762c0661a5ed`가15:59:35Z에 HMAC SUCCESS로 완료됐다. source7ab, producer194초, full compressed DB435,951,520B,11테이블90행, READY/trash2파일99B, pending0이다. 같은 UTC 날짜 최신 완료 세트1개를 남기고 복원 시험에 쓴 이전 세트의6개 archive key가 HEAD404임을 확인했다. 앞의650초 복원 증거는 교체 전 세트의 역사적 검증이며 이 최신 세트를 재복원했다고 계산하지 않는다. ban의 백업 포함은 ban 이후 coherent full snapshot 순서에 따른 추론이며 auth 행을 별도 열람하지 않았다.

## 백업·복구 운영

전용 cron 서비스가 매일03:00KST(18:00UTC)에 실행된다. 동일 exported PostgreSQL snapshot의 full logical dump와 Shared Desk manifest, 실제 READY 파일 바이트(휴지통 포함)를 한 세트로 보관한다. API 정리 작업은 shared advisory lock, 백업은 exclusive lock을 사용해 백업 중의 물리 삭제를 막는다. 정상 사용자 쓰기는 계속 가능하다.

DB/파일은 AES-256-GCM으로 조각 암호화하고, 각 원격 artifact를 다시 받아 복호화·SHA를 확인한 후 HMAC 완료 marker를 마지막에 기록한다. 백업 자격증명과32바이트 암호화 키는 백업·상태 감시 서비스의 보호된 Railway 변수 참조로 둔다. API에는 데이터 버킷 참조만 준다. plaintext dump·키·토큰·개인 자료는 Git/Drive에 저장하지 않는다.

최근7개 UTC 날짜의 최신 완료 세트를 유지한다. 불완전 세트는 복원 후보로 삼지 않으며 인증된 inventory의 개별 객체만 삭제한다. 최상위 실행은1시간 후 TERM, 추가30초 후 KILL로 제한한다. 실패는 비밀을 제거한 상태·종료 코드와 서명된 상태 파일로 관측하며 `status` 명령은26시간을 넘은 백업을 불건강으로 판정한다. 외부 이메일/메신저 알림 전달을 검증했다고 주장하지 않는다.

별도 감시 cron shared-desk-backup-watch-prod(f7c00bfc-dc0d-45a3-a63d-ec69bb0be864)는 같은7ab 이미지의 /app/entrypoint.sh status를 UTC 15 0-17,19-23 * * *에 실행한다. 백업 시간18UTC를 제외한 매시15분 검사이며300초/0.25CPU/0.5GB 한도다. 배포bc801a4a-84d4-4070-841e-e2dd2f55f403과 실제 수동 cron bcc20739-e3cb-4201-a544-f38e8a75df0f의5초 정상 종료·native succeeded를 확인했다. 실제 원격 상태에 대한 로컬 실행도 HEALTHY/exit0, 잘못된 key ID의 읽기 전용 probe는 FAILED/KEY_ID/exit1이며 원격 상태 바이트와 실제 키는 바뀌지 않았다. native cron 실패나 실제26시간 시간 경과를 주입한 검사는 아니다.

자동 실패·비용 알림의 최종 수신은 BLOCKED다. 프로젝트에 기존 webhook·monitor·notification rule·workspace usage limit가 없었으며 본인 알림 조회도 NotAuthorized였다. 사용자 channel은 기본 이메일 발송 가능성이 있어 수신 설정을 추정하지 않았다. 승인 수신 경로를 사용자에게 요청했다. 다른 계정·토큰·endpoint로 우회하지 않았고 외부 메시지를 발송하지 않았다. 사용량 API의10GiB 경고는 누적 발급 ticket 바이트 추정이며 실제 월별 청구 경고나 자동 전달 완료로 계산하지 않는다. 따라서 전체 운영 게이트 완료로 판정하지 않는다.

실제 원본 DB에는 Windows PostgreSQL에 없는 supabase_vault0.3.1 확장이 있어 첫 로컬 복원은 실패했다. 대상 객체·DB·로컬 WAL을 정리했다. 호환 PG17/TLS 대상의 두 번째 시도는 CIPHER_AUTH로 표시됐지만 이전 예외 처리 때문에 실제 하위 원인을 기록하지 못했다. 전송/파이프 문제라는 설명은 가설이다. 최종 수정은 InvalidTag만 인증 오류로 구분하고 원격 암호문을 완전히 인증한 로컬 캐시에서 plaintext를 파이프로 전달한다. 이 수정으로 DEV full DB174,250,085B와4파일104,857,748B의 실제 복원이 성공했다. 전체1013초,11테이블402행 digest/FK/owner/파일 실제GET SHA와 원본 보존, 대상4키 HEAD404·DBdrop까지 확인했다. 오류를 무시하거나 스키마를 생략하지 않았다.

양 환경 Vault secret count는 read-only로0을 확인했으며, Vault 키/secret을 읽거나 복호화 성공으로 계산하지 않았다. 이 논리 백업은 cluster role/password·volume의 외부 Vault 키·PITR/다른 제품 전체 복구 보장을 대신하지 않는다. 선택한 완료 세트가 보존 정책으로 정리되지 않도록 복원과 새 백업을 직렬화한다.

RPO24h/RTO4h는 설계 목표이며 SLA가 아니다. 실제 관측한 복구 소요 시간과 대상은 증거에 별도 기록한다. 수동 cron 실행과 저장된 스케줄을 검증하며, 미래의 매일 실행 성공을 미리 완료했다고 표기하지 않는다.

## 정리와 롤백

DEV·PROD 각각 flag/email/ID로 확인한 합성 계정2개씩만 대상으로 지원 API를 통해 활성 항목을7일 휴지통으로 이동하고 활성0을 확인했다. 계정4개의 ban readback 및 올바른 비밀번호 로그인 거절을 확인했고 활성 DPAPI 경로를 환경별 retired 파일로 바꿨다. 암호화 파일의 보존은 secure erasure를 뜻하지 않는다. 실제 사용자 항목·계정·서명키·브라우저 세션과 미추적 mobile 작업물은 보존했다. 복원된 대상 키는 개별 DELETE·HEAD404, 대상 버킷 빈 상태와 임시 DBdrop을 확인했다.

임시 Railway 서비스/볼륨은 삭제 승인 대기다. DEV 서비스6a836803-7f46-4c11-ac5e-4fa3346a6ef3·볼륨9f761baa-e15e-4c5c-a120-e902cb1e78a3(1GB), PROD 서비스d8e1a410-1f35-41d5-9783-7f37f09aa0ef·볼륨efbcf730-9509-4eae-a0c6-e526c6d0aeff(4GiB)을 이번에 생성했다. DEV delete_service는 자동 승인 검토에서 “Cancelled — the user did not approve this action. No changes were made.”로 거절됐다. CLI 삭제로 우회하지 않았다. 복원 DB는 drop했지만 볼륨의 WAL·시험 복원 흔적을 완전히 없앴다고 주장하지 않는다. 해당 임시 자원은 남아 비용이 발생할 수 있다. 0-replica 축소도 connector의 최소1 검증으로 적용되지 않았다.

전용 임시 브라우저 컨텍스트·보조 프로세스를 종료했고 배포 lock을 해제했다. 다른 작업의 DEV pending patch와 기존 로그인은 보존했다. 미추적 mobile/private signing 자료가 있어 원래 작업 worktree는 강제 삭제하지 않았다.

장애 시 Shared Desk flag로 새 쓰기·업로드를 중단하고 compatible 이전 앱 또는 roll-forward로 복구한다. V101을 수정/repair/down-migrate하거나 기존 사용자 파일·버킷을 지우지 않는다. 백업 키를 교체할 때는 기존7일 세트의 키를 먼저 보존해야 한다.

## 전달

최종 보고서·인계·릴리스 노트·감시 증거·백업 실행 문서와 비밀을 제거한 증거 ZIP의 대상은 Kafka_AI_WorkSpace(hello@studio-kafka.com) / 10_POS / [05_WORK_FLOW](https://drive.google.com/drive/folders/13aljVawi5PZhN5UKQGN1oFgOFGuCFKYv)다. 로컬 사본도 유지한다. 실제 업로드 ID·parent·크기·링크는 게시 후 DRIVE_DELIVERY_RECEIPT_20261110.json과 native WORK_FLOW index에 기록하며, 파일 내용의 상태와 업로드 성공을 구분한다.
