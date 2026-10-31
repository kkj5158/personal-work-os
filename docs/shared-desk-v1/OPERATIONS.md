# 공유 작업대 Web V1 운영 인수인계

2026-10-31 KST 인계(구현 시작 10/28). Android는 사용자의 후속 지시로 이번 완료/배포 범위에서 제외했다.

## 환경 설정

`SHARED_DESK_ENABLED`, `SHARED_DESK_STORAGE_ENABLED`는 기본 false다. 파일 저장소 연결 실패가 텍스트·메모 startup을 막지 않도록 어댑터가 비활성 상태로 내려간다.

API에만 다음 참조를 둔다. Next public 변수나 브라우저에는 영구 자격증명을 넣지 않는다.

| API 변수 이름 | Railway 버킷 변수 이름 |
|---|---|
| SHARED_DESK_STORAGE_BUCKET | BUCKET |
| SHARED_DESK_STORAGE_ENDPOINT | ENDPOINT |
| SHARED_DESK_STORAGE_REGION | REGION |
| SHARED_DESK_STORAGE_ACCESS_KEY_ID | ACCESS_KEY_ID |
| SHARED_DESK_STORAGE_SECRET_ACCESS_KEY | SECRET_ACCESS_KEY |

추가: `SHARED_DESK_STORAGE_ENVIRONMENT`(DEV/PROD), `SHARED_DESK_STORAGE_PATH_STYLE`(현재 false), `SHARED_DESK_CLEANUP_INTERVAL_MS`(기본 3600000). 표시 이름 대신 실제 BUCKET 값을 사용한다. 현재 DEV는 물리 ams, SDK region auto, virtual-host 방식이다. PROD는 별도 버킷 인스턴스/자격증명/namespace를 검증하기 전 공유하지 않는다.

DEV bucket CORS는 현재 `https://workflow-web-development-development.up.railway.app` origin 하나만 허용한다. 로컬 검증용 origin을 제거한 뒤 DEV OPTIONS200 / 로컬 OPTIONS403을 실측했다. wildcard는 없다. 새로운 배포 origin을 추가할 때만 실제 서비스 identity와 서명 headers를 다시 확인한다.

## 정리·용량·장애

한 시간 간격 작업이 오래된 전송/검증, 7일 지난 휴지통, 30일 지난 변경 기록·작업 결과를 정리한다. 원래 작업 ID/해시는 만료 뒤에도 재실행 방지용으로 남긴다. 활성 목록 snapshot의 후속 버전이 2시간 이상 지난 경우 오래된 버전을 정리한다. 1시간 목록 커서보다 여유를 둔다.

정리 큐는 owner와 개별 객체 키, not-before, 시도 수를 기록한다. 유효 객체 여부를 다시 확인하고 객체 하나씩 지운다. prefix 전체 삭제는 하지 않는다. 전송 URL이 만료될 시간을 확보하며 삭제 확인 전 예약 용량을 풀지 않는다. provider 실패 시 큐와 예약을 유지하고 한 시간 뒤 재시도한다. 앱 재시작으로 큐가 사라지지 않는다.

`GET /api/shared-desk/usage`에서 READY/UPLOADING/VERIFYING/FAILED, 예약 포함 바이트, 1 GiB 한도, 정리 실패를 확인한다. 다운로드 티켓 발급 바이트는 실제 전송의 추정치이며 10 GiB 이상 warning을 반환한다. 청구 금액/실제 egress 측정치로 오인하지 않는다. 실제 정리 실패와 증가하는 예약량은 운영 점검 대상이다.

파일 장애는 먼저 연결/참조 변수 존재, endpoint/TLS, SDK region/URL style, CORS, 서비스 시간 오차, 티켓 만료, 검증 오류를 확인한다. secret이나 signed URL을 로그에 붙이지 않는다. credential 교체는 승인된 별도 절차로 수행하고 참조한 API를 재배포해 반영한다.

## 백업과 복구 gate

Railway 버킷의 native versioning, object lock, lifecycle, 자동 백업을 가정하지 않는다. 동일 exported snapshot으로 합성 DB dump와 객체 manifest를 만들고, 실제 객체 바이트를 복사한 뒤 격리 DB·새 객체 키에 복원하여 해시와 memo/file/reply 참조를 검증했다. 복구 drill 중 원본은 보존했다. 검증 뒤 별도의 승인된 fixture 정리에서 로컬 fixture 원본을 개별 삭제했다. 이는 운영 전체 백업과 정기 백업 스케줄이 준비됐다는 뜻이 아니다.

운영 활성화 전에는 승인된 별도 복구 목적지와 실행 주체로 DB 메타데이터 snapshot + 객체 manifest + 실제 바이트를 한 세트로 보관하고, 격리 DB/객체 namespace에 복원해 참조/owner/해시를 대조해야 한다. 운영 데이터나 키를 공개 보고서/Drive 증거 ZIP에 포함하지 않는다. RPO 24h/RTO 4h는 실측 전 목표다. 정기 백업과 실제 관계형+객체 복구 gate를 통과하지 못하면 PROD를 변경하지 않는다.

## 배포와 롤백

배포 직전 latest dev, 실제 Flyway 이력/체크섬, 소스 pin, 서비스 ID, 타 작업의 staged patch를 다시 확인한다. V101은 추가형이며 기존 migration을 수정하거나 repair하지 않는다. 타 작업의 pending patch를 일괄 accept하지 않는다. 10/31 PROD read-only audit에서 다른 릴리스가 적용한 V101/V102가 관찰되었지만 Shared Desk flag/전용 버킷은 없었다. 앱 코드·migration 존재와 기능 운영 활성화를 구분한다.

같은 검증 소스를 API → health/인증 smoke → Web 순서로 배포한다. 각 단계의 실제 deployment ID와 source SHA를 별도로 읽는다. 기능 flag를 먼저 비활성화해 쓰기/업로드를 제한할 수 있다. 이전 호환 앱 revision으로 돌아가도 V101 테이블과 저장된 객체를 유지한다. down migration, DB reset, 버킷 일괄 삭제는 하지 않는다.

## 반복 검사

- `pwsh -NoProfile -File scripts/shared-desk-test.ps1`: 루프백 전용 임시 PostgreSQL 55487에서 스키마/동시성/용량/권한 회귀 검사 후 서버 종료. 점유 포트는 임의 종료하지 않는다.
- Backend: `gradlew.bat test --tests com.kafka.backend.shareddesk.storage.*`; 실제 공급자 검사는 별도 명시적 opt-in과 승인된 DEV 자격증명 로더가 필요하다.
- Frontend: `npx tsx --test lib/shared-desk/*.test.ts lib/globalTabs.test.ts`; `npx tsc --noEmit`; 대상 ESLint; `npm run build -- --webpack`.
- 전용 TEAM KAFKA 브라우저만 사용한다. 원문·파일 fixture는 합성 자료만 쓰고, 로그인 자격증명이 담긴 snapshot은 증거에 넣지 않는다.

Windows 클립보드는 LF를 CRLF로 바꿀 수 있다. 서버 원문과 복사에 전달한 문자열은 유지하고, 바이트 그대로의 전달에는 UI의 원문 UTF-8 다운로드를 사용한다.
