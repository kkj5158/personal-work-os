# 공유작업대 Web 운영 인계 — 2026-11-10

운영 주소는 [공유작업대](https://kafka-sys.life/workflow/shared-desk)다. 기존 POS/GoTrue 계정으로 로그인하며, 같은 계정의 기기 사이에서 클립·파일·메모를 이어 쓴다. 다른 사용자의 자료를 공개하는 공유 링크는 제공하지 않는다. Android는 사용자의 후속 지시로 이번 범위에서 제외했다.

**최종 운영 확인: PROD_FINAL_PENDING.** 아래 DEV 검증은 완료됐지만, 운영 복원·인증 화면·정리 결과는 최종 증거를 반영한 뒤 확정한다.

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
| API 배포 ID | `ccc13a9a-267a-41a0-96f0-15bd56a4833e` — 최종 상태 PROD_FINAL_PENDING |
| Web 배포 ID | `48fd7038-31a3-4015-b866-c255092859b8` — 최종 상태 PROD_FINAL_PENDING |
| 백업 배포 ID | `e25d7ec4-d64d-45e1-bb88-dc46b42d1e9e` — 실제 백업·상태 확인 PROD_FINAL_PENDING |

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

서명된 상태 파일과 native cron 실패 상태는 관측 수단이다. 독립된 주기 감시나 이메일·메신저 알림 전달은 아직 검증하지 않았다. 첫 수동 cron 성공과 저장된 일정도 미래의 매일 실행 성공을 보장하지 않는다. 첫 시간 기반 실행 확인은 `PROD_FINAL_PENDING`에 최종 기록한다.

## 복원 절차

세부 명령과 변수 이름은 [백업 실행 문서](../../../ops/shared-desk-backup/README.md)를 따른다. 실제 서비스에 연결되지 않은 별도 DB와 별도 **빈** private 버킷을 준비한다. DB 이름과 격리 확인 문자열의 안전장치를 해제하지 않는다.

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
| PROD 인증 화면·API·파일 | PROD_FINAL_PENDING |
| PROD 원격 백업·격리 복원 | PROD_FINAL_PENDING |
| PROD 합성 항목·계정·임시 자원 정리 | PROD_FINAL_PENDING |

RPO 24h/RTO 4h는 목표다. Android와 물리 기기 간 전체 여정, 장기 실사용, 외부 알림·키 escrow·PITR은 이번 검증 완료 항목으로 세지 않는다. 최종 운영 판정은 [릴리스 노트](RELEASE_NOTES_20261110.md)와 실제 최종 증거를 확인한다.

## 장애와 전달

파일 저장소 장애에서는 `SHARED_DESK_STORAGE_ENABLED=false`로 파일 작업을 제한하고 원문·메모 기능을 유지할 수 있다. 전체 기능에 문제가 있으면 `SHARED_DESK_ENABLED`와 호환 앱 revision을 검토한다. 신규 테이블·사용자 원문·객체·백업 세트를 보존하며 복구한다. 임의 DB 초기화나 기존 사용자 자료 정리는 하지 않는다.

최종 합성 항목 정리, 배포 lock 해제, 임시 복원 자원 정리는 `PROD_FINAL_PENDING`이다. 다른 작업자의 소스·브라우저 로그인·개인 세션과 미추적 Android 작업물은 보존한다.

최종 보고서·이 인계·릴리스 노트·비밀을 제거한 증거는 기존 Kafka_AI_WorkSpace / 10_POS / [05_WORK_FLOW](https://drive.google.com/drive/folders/13aljVawi5PZhN5UKQGN1oFgOFGuCFKYv)에 개별 저장하고 metadata를 확인한다. 게시 파일 링크와 실제 최종 증거는 `PROD_FINAL_PENDING`에 반영한다. raw dump·키·토큰·브라우저 저장소를 Drive에 올리지 않는다.
