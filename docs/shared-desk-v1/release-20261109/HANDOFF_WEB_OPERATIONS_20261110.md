# 공유작업대 Web 운영 인계 — 2026-11-10

운영 주소는 [공유작업대](https://kafka-sys.life/workflow/shared-desk)다. 기존 POS/GoTrue 계정으로 로그인하며, 같은 계정의 기기 사이에서 클립·파일·메모를 이어 쓴다. 다른 사용자의 자료를 공개하는 공유 링크는 제공하지 않는다. Android는 사용자의 후속 지시로 이번 범위에서 제외했다.

**최종 상태: PROD_CORE_DEPLOYED / WEB VERIFIED / OPERATIONS PARTIAL — 자동 알림 전달 게이트 BLOCKED.** 운영 Web/API·실제 인증 사용·파일 무결성·격리 복원은 PASS다. 알림 수신 경로와 임시 자원 삭제 승인 대기가 남았다.

## 일반 사용

1. 클립보드에서 원문을 저장하고 전체 복사한다. 제목과 Project 연결은 선택 사항이다. 한글·빈 줄·끝 개행을 보존한다. Windows 클립보드의 LF→CRLF 정규화가 문제인 바이트 단위 전달에는 원문 UTF-8 저장을 사용한다.
2. 파일을 선택하거나 놓고 전송 진행과 서버 검증 완료를 기다린다. **READY 상태에서만 다운로드**한다. 만료된 다운로드 주소는 화면에서 다시 발급받는다. APK나 ZIP을 자동 실행·설치·압축 해제하지 않는다.
3. 메모 채팅에서 메모를 쓰고 한 단계 답글로 이어 간다. 같은 계정의 READY 파일을 연결할 수 있다.
4. 다른 기기와 동시에 수정해 충돌이 나면 보존된 초안을 확인하고 새 사본으로 저장한다. 전송 대기·오류와 서버 저장 완료 표시를 구분한다. 오프라인 초안·대기 작업은 계정과 환경별로 분리되며, 전체 파일의 오프라인 복제를 뜻하지 않는다.
5. 삭제한 항목은 7일 휴지통에서 복구한다. 보관 기간 이후에는 서버 정리 작업이 실제 바이트를 제거한다.

| 기본값 | 적용 |
|---|---|
| 파일 하나 | 100 MiB, 104,857,600 bytes |
| 계정별 보관량 | 1 GiB. READY·휴지통과 아직 삭제 확인되지 않은 예약 바이트 포함 |
| 동시 활성 업로드 | 계정당 3개 |
| 허용 파일 | APK, ZIP, PDF, MD, JSON, TXT, PNG, JPEG, WebP |
| 전송 주소 | PUT 기본 10분, GET 기본 60초 |
| 삭제 복구 | 7일 |

업로드 취소 직후에도 만료 전 PUT 주소의 예약량이 남을 수 있다. URL 만료와 개별 객체 삭제 확인 전에는 용량을 바로 반환하지 않는다. 같은 파일 재시도는 기존 파일 항목에서 진행한다. 다운로드는 수신 중 SHA-256을 대조하며, 브라우저 Blob 저장은 최대 100 MiB와 브라우저 복사 오버헤드를 메모리에 유지할 수 있다.

## 소스와 환경

검증·배포 대상 제품 소스는 `7abf420bf720de51542813133329e40421820df2`다. 문서 커밋과 실제 배포 소스는 별도로 기록한다. 최신 dev의 별도 ORBIT 기능은 이번 운영 전환에 포함하지 않는다. 후보는 기존 PROD `e0c71f4`의 기능을 보존한다.

Railway project: `2b52b232-38b2-44b6-b97e-4caba54f90bc`.

| 구분 | 식별자·위치 |
|---|---|
| DEV 환경 | `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c` |
| PROD 환경 | `c2c20488-311f-4b9e-9ec9-d79508123176` |
| PROD API 서비스 | `e46b58f4-e829-430f-a4c4-b27e24d46f19` |
| PROD Web 서비스 | `5818a578-b7a2-443a-aaad-ce10f6bb708c` |
| PROD 데이터 버킷 | `1933a1f5-af1c-41f1-a1bc-b8e805993740`, `shared-desk-prod`, sin |
| PROD 백업 버킷 | `7a8659e0-4e77-4392-9a6c-f43ed3da2850`, `shared-desk-prod-backup`, ams |
| PROD 백업 서비스 | `234e7ddc-da3e-4aba-8b28-f2c4345603aa`, `shared-desk-backup-prod` |
| API 배포 ID | `ffc2f5f7-917b-4788-ab8f-d91fa6b96138` — SUCCESS |
| Web 배포 ID | `48fd7038-31a3-4015-b866-c255092859b8` — SUCCESS |
| 백업 배포 ID | `e25d7ec4-d64d-45e1-bb88-dc46b42d1e9e` — 실제 HMAC 백업 SUCCESS |

버킷 ID·일정은 2026-11-10 KST 조회 기준이다. DEV와 PROD의 데이터·백업 버킷 및 자격증명을 분리한다. API에는 해당 환경의 데이터 버킷 참조만 두고, 백업 서비스에 DB·데이터·백업 참조와 암호화 키를 둔다. 브라우저에 영구 저장소 키를 전달하지 않는다.

신규 migration은 없다. 적용된 V101 checksum `1353152953`과 V103 이력을 보존하며 수정·repair·down migration을 하지 않는다. PROD CORS는 `https://kafka-sys.life` 하나를 허용했고 DEV origin 거부를 확인했다. 새 도메인은 자동 허용되지 않는다.

## 일일 백업 점검

일정은 매일 **03:00 KST**, cron 표현식은 `0 18 * * *` UTC다. 백업 서비스의 실행 명령은 `/app/entrypoint.sh backup` 또는 동일한 Docker 기본값이어야 한다. `python runner.py backup`으로 바꾸면 최상위 실행 시간 제한을 건너뛴다.

백업은 동일 PostgreSQL exported snapshot의 full logical dump, Shared Desk manifest, READY 파일의 실제 바이트를 한 세트로 보관한다. READY 파일은 휴지통에 있어도 포함한다. API cleanup과 백업은 advisory lock으로 물리 삭제를 조정하고 일반 사용자 쓰기는 계속 허용한다.

각 artifact를 AES-256-GCM으로 조각 암호화하고 원격 바이트를 다시 받아 인증·SHA를 확인한 뒤 HMAC 완료 marker를 기록한다. 임시 디스크에는 암호문만 쓴다. 최근 **7개 UTC 날짜의 최신 완료 세트**를 유지하며 같은 날짜의 추가 완료 세트는 교체된다. 불완전 세트는 복원 후보로 삼지 않는다. 데이터 버킷의 prefix 일괄 삭제는 하지 않는다.

운영자는 적어도 매일 다음을 확인한다.

1. Railway의 `shared-desk-backup-prod` cron 실행 이력에서 최근 실행과 종료 결과를 본다.
2. 같은 고정 이미지·백업 서비스 환경에서 `/app/entrypoint.sh status`로 서명된 상태를 확인한다. 완료 백업이 없거나 마지막 완료가 26시간보다 오래됐거나 최근 작업이 실패했으면 비정상이다.
3. 실패 시 비밀이 제거된 종료 코드와 상태를 확인하고 원인을 고친 뒤 정해진 백업 명령을 다시 실행한다. 단순 재배포 성공을 백업 완료로 계산하지 않는다.

서명된 상태 파일과 native cron 실패 상태는 관측 수단이다. 독립 freshness 감시 cron은 추가해 정상 수동 실행을 확인했다. 이메일·메신저·owner INAPP 전달은 권한/수신 경로가 없어 BLOCKED다. 첫 수동 cron 성공과 저장된 일정도 미래의 매일 실행 성공을 보장하지 않는다. 첫 시간 기반 실행은 아직 관찰하지 않았다.

별도 감시 cron shared-desk-backup-watch-prod(f7c00bfc-dc0d-45a3-a63d-ec69bb0be864)는 같은7ab 이미지의 /app/entrypoint.sh status를 UTC 15 0-17,19-23 * * *에 실행한다. 백업 시간18UTC를 제외한 매시15분 검사이며300초/0.25CPU/0.5GB 한도다. 배포bc801a4a-84d4-4070-841e-e2dd2f55f403과 실제 수동 cron bcc20739-e3cb-4201-a544-f38e8a75df0f의5초 정상 종료·native succeeded를 확인했다. 실제 원격 상태에 대한 로컬 실행도 HEALTHY/exit0, 잘못된 key ID의 읽기 전용 probe는 FAILED/KEY_ID/exit1이며 원격 상태 바이트와 실제 키는 바뀌지 않았다. native cron 실패나 실제26시간 시간 경과를 주입한 검사는 아니다.

자동 실패·비용 알림의 최종 수신은 BLOCKED다. 프로젝트에 기존 webhook·monitor·notification rule·workspace usage limit가 없었으며 본인 알림 조회도 NotAuthorized였다. 사용자 channel은 기본 이메일 발송 가능성이 있어 수신 설정을 추정하지 않았다. 승인 수신 경로를 사용자에게 요청했다. 다른 계정·토큰·endpoint로 우회하지 않았고 외부 메시지를 발송하지 않았다. 사용량 API의10GiB 경고는 누적 발급 ticket 바이트 추정이며 실제 월별 청구 경고나 자동 전달 완료로 계산하지 않는다. 따라서 전체 운영 게이트 완료로 판정하지 않는다.

## 복원 절차

세부 명령과 변수 이름은 [백업 실행 문서](https://github.com/kkj5158/personal-work-os/blob/7abf420bf720de51542813133329e40421820df2/ops/shared-desk-backup/README.md)를 따른다. 실제 서비스에 연결되지 않은 별도 DB와 별도 **빈** private 버킷을 준비한다. DB 이름과 격리 확인 문자열의 안전장치를 해제하지 않는다.

1. 복원할 세트가 retention 중 삭제되지 않도록 백업 실행과 복원을 직렬화한다. 필요하면 cron을 잠시 중지하고, 끝나면 같은 일정을 복원한다.
2. 원본과 호환되는 `infra/railway-postgres17` 서버와 필요한 역할·확장을 준비한다. 현재 프로젝트의 `supabase_vault 0.3.1` 확장이 없는 서버에서 오류를 무시하거나 해당 스키마를 빼고 성공 처리하지 않는다.
3. 같은 고정 백업 이미지·키로 `/app/entrypoint.sh restore --run-id ID`를 실행한다. 명령 인자나 보고서에 자격증명을 넣지 않는다.
4. 모든 artifact 인증이 먼저 통과한 뒤, 암호화 메타데이터 캐시에서 `pg_restore --single-transaction --exit-on-error`로 복원한다. Shared Desk 11개 테이블 digest/FK·owner/file 참조와 대상 객체의 실제 GET SHA가 일치해야 한다.
5. 검증을 마쳐도 자동으로 운영에 연결하지 않는다. 실패한 대상은 분리해 두고 조사한다. 실제 전환은 인증·owner·파일 검증과 직렬화된 배포 절차로 진행한다.
6. 검증 자료를 남긴 후 이번에 만든 대상 키만 개별 삭제·HEAD404 확인하고, 명시적으로 소유한 임시 DB·서비스를 정리한다.

UPLOADING/VERIFYING 메타데이터는 snapshot에 남지만 미공개 바이트를 복구 완료 파일로 표시하지 않는다. 실제 전환 전에 업로드를 다시 발급해야 한다. 이 논리 백업은 cluster-global 역할·비밀번호·외부 Vault 볼륨 키·PITR을 복구한다고 보장하지 않는다. Shared Desk는 Vault를 사용하지 않으며 기존 Vault secret count는 2026-11-09 read-only 점검에서 양 환경 모두 0이었다.

암호화 키는 보관 세트를 복구하는 데 필수다. Railway의 해당 비밀과 key ID를 소유자가 복구 가능하게 유지한다. 외부 독립 키 escrow는 완료하지 않았다. 이전 세트가 필요한 동안 키를 삭제·교체하지 않는다. 키 교체는 별도 조정 작업이다.

## 검증과 남은 확인

| 대상 | 관찰 결과 |
|---|---|
| Backend/cleanup guard | 57개 PASS |
| Python 암호화·보존·복원 | 28개 PASS, 실제 격리 PostgreSQL 및 멈춘 dump 종료·캐시 정리 포함 |
| DEV 인증 API | 28개 PASS, guard 배포 후 재검증 |
| DEV 실제 Web | 정상 로그인·owner 대조·클립 원문·메모/답글·빠른 이동·trash/restore·1440/1280/768/390 확인 |
| DEV 실제 파일 | 50 B·100 MiB 브라우저 업로드→READY→다운로드 후 독립 streaming SHA 일치 |
| DEV 원격 백업·복원 | 174,250,085-byte compressed DB dump와 READY/trash 4개, 104,857,748 bytes 복원 PASS. 11개 테이블/FK/owner/실제 GET SHA 일치, 원본 보존·대상 객체 정리 확인 |
| DEV 복원 측정 | 전체 helper 1,013초. 해당 데이터·public TLS 연결의 측정값이며 RTO 보장 아님 |
| PROD 인증 화면·API·파일 | API28 및 실제 Web 로그인·복사·메모/답글·50B direct upload/verified download SHA,4화면폭 PASS. 새 독립 로그인 세션에서 서버 자료·usage 확인 PASS |
| PROD 원격 백업·격리 복원 | full compressed DB435,949,764B +2파일99B,11테이블77행/FK/owner/SHA/원본 보존/대상 정리 PASS. 전체650초 |
| PROD 합성 항목·계정·임시 자원 정리 | fixture2계정 활성0·7일trash·ban/password거절·DPAPIretirement PASS. 임시 서비스/볼륨 삭제는 승인 대기 |

RPO 24h/RTO 4h는 목표다. Android와 물리 기기 간 전체 여정, 장기 실사용, 외부 알림·키 escrow·PITR은 이번 검증 완료 항목으로 세지 않는다. 최종 운영 판정은 [릴리스 노트](RELEASE_NOTES_20261110.md)와 실제 최종 증거를 확인한다.

## 장애와 전달

파일 저장소 장애에서는 `SHARED_DESK_STORAGE_ENABLED=false`로 파일 작업을 제한하고 원문·메모 기능을 유지할 수 있다. 전체 기능에 문제가 있으면 `SHARED_DESK_ENABLED`와 호환 앱 revision을 검토한다. 신규 테이블·사용자 원문·객체·백업 세트를 보존하며 복구한다. 임의 DB 초기화나 기존 사용자 자료 정리는 하지 않는다.

DEV·PROD 각각 flag/email/ID로 확인한 합성 계정2개씩만 대상으로 지원 API를 통해 활성 항목을7일 휴지통으로 이동하고 활성0을 확인했다. 계정4개의 ban readback 및 올바른 비밀번호 로그인 거절을 확인했고 활성 DPAPI 경로를 환경별 retired 파일로 바꿨다. 암호화 파일의 보존은 secure erasure를 뜻하지 않는다. 실제 사용자 항목·계정·서명키·브라우저 세션과 미추적 mobile 작업물은 보존했다. 복원된 대상 키는 개별 DELETE·HEAD404, 대상 버킷 빈 상태와 임시 DBdrop을 확인했다.

임시 Railway 서비스/볼륨은 삭제 승인 대기다. DEV 서비스6a836803-7f46-4c11-ac5e-4fa3346a6ef3·볼륨9f761baa-e15e-4c5c-a120-e902cb1e78a3(1GB), PROD 서비스d8e1a410-1f35-41d5-9783-7f37f09aa0ef·볼륨efbcf730-9509-4eae-a0c6-e526c6d0aeff(4GiB)을 이번에 생성했다. DEV delete_service는 자동 승인 검토에서 “Cancelled — the user did not approve this action. No changes were made.”로 거절됐다. CLI 삭제로 우회하지 않았다. 복원 DB는 drop했지만 볼륨의 WAL·시험 복원 흔적을 완전히 없앴다고 주장하지 않는다. 해당 임시 자원은 남아 비용이 발생할 수 있다. 0-replica 축소도 connector의 최소1 검증으로 적용되지 않았다.

배포 lock과 임시 브라우저 helper는 해제·종료했다. 다른 작업자의 소스·브라우저 로그인·개인 세션과 미추적 Android 작업물은 보존한다.

최종 보고서·이 인계·릴리스 노트·비밀을 제거한 증거는 기존 Kafka_AI_WorkSpace / 10_POS / [05_WORK_FLOW](https://drive.google.com/drive/folders/13aljVawi5PZhN5UKQGN1oFgOFGuCFKYv)에 개별 저장하고 metadata를 확인한다. 실제 게시 링크·metadata는 DRIVE_DELIVERY_RECEIPT_20261110.json과 native WORK_FLOW index에서 확인한다. raw dump·키·토큰·브라우저 저장소를 Drive에 올리지 않는다.
