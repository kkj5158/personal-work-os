# 공유작업대 Web V1 결정 기록

기준: 2026-10-28 사용자의 구현 요청, Railway Bucket 추가 요청, 이후 Android 제외 지시. 최종 상태 갱신 2026-10-31. 원본 기획의 PROPOSAL 표기는 과거 범위이며 현재 구현 승인을 대신하지 않는다. 아래 값은 이번 요청이 지정한 구현 기본값이지 별도 SLA·무제한 비용 승인이 아니다.

| ID | 이번 적용 | 상태 |
|---|---|---|
| D01 | Railway private S3-compatible bucket. DEV `shared-desk-dev`, 물리 ams, SDK auto, virtual-host style. API 변수 참조 사용 | 사용자 추가 요청으로 확정, DEV 실제 검증 PASS. PROD 미생성 |
| D02 | 100 MiB/파일, 1 GiB/owner, 동시 활성 업로드 3개. 살아 있는 staging URL·검증 중 final 예약 포함 | 구현·동시성 시험 PASS |
| D03 | 7일 trash, 30일 delta/작업 결과. 만료 작업 ID/해시는 재실행 방지용 최소 기록 유지 | 구현·시간 제어 시험 PASS |
| D04 | foreground 10초 delta, focus/reconnect 재동기화 | Web 적용·오프라인 복귀 검증 PASS |
| D05 | Android 캐시·offline 정책 | 후속 사용자 지시로 이번 범위 제외 |
| D06 | 기존 GoTrue 사용자 JWT/owner 의미 재사용. 금융 앱 도메인 의존 없음 | Web/API 적용, Android 제외 |
| D07 | memo→clipboard 전용 전환은 P1. P0는 복사 후 새 클립 | 범위 유지 |
| D08 | APK/ZIP/PDF/MD/JSON/TXT/PNG/JPEG/WebP, attachment 다운로드 | 실제 9종 전송·해시 PASS. HTML/SVG/EXE 미허용 |
| D09 | 독립 Android applicationId·release signing·APK 배포 | 이번 범위 제외. 기존 앱 키 재사용/운영 APK 배포 없음 |
| D10 | CAS 409 + 초안 보존 + 새 사본. silent overwrite 없음 | API·브라우저 충돌 복구 PASS |
| D11 | quota·티켓 기반 egress 추정 경고·정리 실패 관측. RPO 24h/RTO 4h는 목표 | DEV 합성 DB+객체 복구 PASS. 운영 정기 백업·외부 복구 목적지·알림/비용 운영 검증 BLOCKED, PROD 보류 |

운영 재개에 필요한 최소 결정은 백업 저장 목적지, 실행 주체/스케줄, 보관·접근 정책과 비용/실패 알림 수신 경로다. 기존 승인된 자원이 있으면 재사용하되 다른 제품의 버킷이나 비밀키를 임의로 공유하지 않는다. 이후 실제 운영 백업과 격리 복원을 검증한 다음 PROD 버킷·변수·배포·인증 smoke를 순서대로 진행한다.
