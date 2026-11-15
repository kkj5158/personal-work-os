# 공유작업대 Web 릴리스 노트 — 2026-11-10

운영 주소: [kafka-sys.life/workflow/shared-desk](https://kafka-sys.life/workflow/shared-desk).

사용자 요청은 공유작업대를 Web에서 실제 사용할 수 있도록 운영 전환하는 것이다. 기존 POS/GoTrue 로그인과 WORK FLOW shell을 유지하고, Android는 이번 범위에서 제외했다.

**최종 상태: PROD_CORE_DEPLOYED / WEB VERIFIED / OPERATIONS PARTIAL — 자동 알림 전달 게이트 BLOCKED.** 운영 웹 핵심 사용은 검증됐고 활성화돼 있다. 알림 수신 경로와 임시 자원 삭제 승인이 남아 전체 운영 절차 완료로 표기하지 않는다.

## 제공 동작

- 클립보드 원문 저장·전체 복사, 선택 제목·Project 연결, 검색·핀·7일 휴지통.
- 같은 owner의 파일 업로드·검증된 다운로드와 취소·재시도. 파일당 100 MiB, 계정당 1 GiB, 동시 활성 업로드 3개. 허용 파일은 APK/ZIP/PDF/MD/JSON/TXT/PNG/JPEG/WebP다.
- 메모와 한 단계 답글, 같은 owner의 READY 파일 첨부.
- owner/API/환경별 초안·대기 작업 보존, 충돌 시 초안과 새 사본 처리. 서버 저장 완료와 전송 대기 상태를 구분한다.

데이터는 private bucket에 보관한다. 인증된 소유자에게 짧은 객체별 URL을 발급하며, Web·서버·다운로드에서 실제 크기와 SHA-256을 확인한다. 다운로드 Blob 저장은 최대 100 MiB와 브라우저 오버헤드를 사용할 수 있다. Windows 클립보드의 개행 정규화가 허용되지 않는 전달에는 원문 UTF-8 저장을 사용한다.

## 이번 운영 전환

제품 후보는 `7abf420bf720de51542813133329e40421820df2`다. 기존 PROD `e0c71f4`를 보존하면서 검증된 Web 스트리밍 해시와 백업·정리 조정을 포함한다. 별도 ORBIT 기능은 이 배포 대상에 넣지 않았다. 배포된 제품 소스와 후속 문서 커밋은 구분한다.

PROD 데이터 버킷은 sin, 별도 private 백업 버킷은 ams에 있다. DEV 데이터·백업·자격증명과 분리하며 API에는 PROD 데이터 버킷 참조만 준다. PROD CORS는 `https://kafka-sys.life`만 허용했고 DEV origin 거부를 확인했다. 신규 DB migration은 없고 기존 V101/V103 이력을 보존한다.

| 실제 배포 식별자 | 최종 확인 |
|---|---|
| API `ffc2f5f7-917b-4788-ab8f-d91fa6b96138` | SUCCESS, PROD profile/healthUP |
| Web `48fd7038-31a3-4015-b866-c255092859b8` | SUCCESS, 실제 운영 UI PASS |
| 백업 `e25d7ec4-d64d-45e1-bb88-dc46b42d1e9e` | HMAC SUCCESS, 실제 복원 PASS |

## 백업과 검증

매일 03:00 KST(18:00 UTC)에 동일 exported PostgreSQL snapshot의 full logical dump·manifest·실제 READY/trash 바이트를 암호화해 보관하도록 설정했다. 각 원격 artifact를 인증·해시 검증한 후 완료 marker를 기록하고 최근 7개 UTC 날짜의 최신 완료 세트를 유지한다. API cleanup과 백업의 advisory lock은 백업 중 물리 삭제를 막는다.

멈춘 dump와 DB 호출에 전체 실행 제한을 두고, 암호화 메타데이터 캐시로 긴 SQL 복원 중 원격 연결이 대기하는 경로를 분리했다. 임시 디스크에는 암호문만 쓴다. 서명된 상태 파일과 cron 종료 상태는 운영자가 확인해야 하며, 별도 주기 freshness 감시의 정상 수동 실행은 PASS다. 자동 알림 전달은 수신 경로/권한 부족으로 BLOCKED다.

| 검증 | 결과 |
|---|---|
| Backend/cleanup guard | 57 PASS |
| Python 암호화·실행 제한·보존·복원 | 28 PASS |
| DEV 실제 인증 API | 28 PASS, guard 배포 후 재검증 |
| DEV 실제 Web | 정상 로그인/owner 대조, 클립·메모/답글·빠른 이동·복원, 네 화면 폭 확인 |
| DEV 브라우저 파일 | 50 B·100 MiB 실제 업로드→READY→다운로드와 독립 SHA 대조 PASS |
| DEV durable 복원 | full compressed DB 174,250,085 bytes + 실제 READY/trash 4개 104,857,748 bytes. 11개 Shared Desk 테이블/FK/owner/객체 SHA PASS |
| PROD 실제 인증·파일·기존 기능 smoke | API28+실제 로그인·원문복사·메모/답글·50B파일 hash·4화면폭·새 로그인 서버 재읽기 PASS |
| PROD durable 백업·격리 복원 | compressed DB435,949,764B +2파일99B/11테이블77행/FK/owner/실제SHA/원본보존 PASS,650초 |
| PROD 합성 자료·계정·임시 자원 정리 | 합성2계정 활성0·trash·ban·로그인거절·DPAPIretirement PASS. 임시 자원 삭제 승인 대기 |

DEV 복원 helper의 성공 측정은 1,013초다. 이전 확장 누락·복원 실패 시도는 증거에 보존했다. 현재 DB가 요구하는 `supabase_vault 0.3.1`을 지원하는 호환 PG17 서버에서 다시 검증했으며, 확장 오류를 무시하거나 스키마를 생략하지 않았다.

## 운영상 경계

RPO 24h/RTO 4h는 목표이며 SLA가 아니다. 저장된 일정과 수동 cron 성공은 첫 시간 기반 일일 실행과 구분한다. 첫 timed trigger는 아직 관찰하지 않았다. 감시 일정과 알림 수신 권한의 상세 한계는 운영 인계와 감시 증거를 따른다.

이 논리 백업은 cluster-global 역할·비밀번호, 볼륨의 외부 Vault 키, PITR 또는 다른 제품 전체 복구를 보장하지 않는다. 암호화 키의 외부 독립 escrow는 완료하지 않았다. 필요한 이전 세트가 남은 동안 키를 삭제·교체하지 않는다. Android·장기 실사용·물리 기기 전체 여정은 이번 완료 범위가 아니다.

장애 시 파일 flag 또는 호환 앱 revision으로 제한·복구하되 DB metadata·사용자 객체·백업을 보존한다. 적용 migration 수정/repair/down migration과 버킷 일괄 삭제는 하지 않는다.

자세한 사용·점검·복원 순서는 [운영 인계](HANDOFF_WEB_OPERATIONS_20261110.md), 실제 판정은 최종 `RELEASE_REPORT_KO.md`와 배포/QA 증거를 확인한다. Drive 최종 파일 링크·metadata는 DRIVE_DELIVERY_RECEIPT_20261110.json과 native WORK_FLOW index를 따른다. 임시 Railway 서비스/볼륨은 삭제 승인 대기다. DEV 서비스6a836803-7f46-4c11-ac5e-4fa3346a6ef3·볼륨9f761baa-e15e-4c5c-a120-e902cb1e78a3(1GB), PROD 서비스d8e1a410-1f35-41d5-9783-7f37f09aa0ef·볼륨efbcf730-9509-4eae-a0c6-e526c6d0aeff(4GiB)을 이번에 생성했다. DEV delete_service는 자동 승인 검토에서 “Cancelled — the user did not approve this action. No changes were made.”로 거절됐다. CLI 삭제로 우회하지 않았다. 복원 DB는 drop했지만 볼륨의 WAL·시험 복원 흔적을 완전히 없앴다고 주장하지 않는다. 해당 임시 자원은 남아 비용이 발생할 수 있다. 0-replica 축소도 connector의 최소1 검증으로 적용되지 않았다.
