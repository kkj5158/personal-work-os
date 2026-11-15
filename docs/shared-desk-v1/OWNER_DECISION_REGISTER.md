# 공유작업대 Web V1 결정 기록

기준: 2026-10-28 구현 요청·Railway Bucket 추가 요청·Android 제외 지시, 2026-11-10 운영 배포 요청. 최종 상태 갱신 2026-11-10 KST. 아래 값은 이번 요청의 구현 기본값이며 SLA·무제한 비용 승인이 아니다. 현재 배포와 미완료 운영 항목은 [최신 보고서](release-20261109/RELEASE_REPORT_KO.md)를 따른다.

| ID | 이번 적용 | 상태 |
|---|---|---|
| D01 | Railway private S3-compatible bucket. DEV `shared-desk-dev` ams, PROD `shared-desk-prod` sin. SDK auto/virtual-host style, API 변수 참조 | 환경별 별도 자격증명·실제 Web PUT/GET/SHA 및 exact-origin CORS PASS. PROD 배포·활성화 확인 |
| D02 | 100 MiB/파일, 1 GiB/owner, 동시 활성 업로드 3개. 살아 있는 staging URL·검증 중 final 예약 포함 | 구현·동시성 시험 PASS |
| D03 | 7일 trash, 30일 delta/작업 결과. 만료 작업 ID/해시는 재실행 방지용 최소 기록 유지 | 구현·시간 제어 시험 PASS |
| D04 | foreground 10초 delta, focus/reconnect 재동기화 | Web 적용·오프라인 복귀 검증 PASS |
| D05 | Android 캐시·offline 정책 | 후속 사용자 지시로 이번 범위 제외 |
| D06 | 기존 GoTrue 사용자 JWT/owner 의미 재사용. 금융 앱 도메인 의존 없음 | Web/API 적용, Android 제외 |
| D07 | memo→clipboard 전용 전환은 P1. P0는 복사 후 새 클립 | 범위 유지 |
| D08 | APK/ZIP/PDF/MD/JSON/TXT/PNG/JPEG/WebP, attachment 다운로드 | 실제 9종 전송·해시 PASS. HTML/SVG/EXE 미허용 |
| D09 | 독립 Android applicationId·release signing·APK 배포 | 이번 범위 제외. 기존 앱 키 재사용/운영 APK 배포 없음 |
| D10 | CAS 409 + 초안 보존 + 새 사본. silent overwrite 없음 | API·브라우저 충돌 복구 PASS |
| D11 | quota·누적 다운로드 티켓 바이트 추정 경고·정리 실패 관측. 매일03:00KST 암호화 metadata+실제파일 백업,7 UTC 완료 날짜 보존. RPO24h/RTO4h는 목표 | DEV·PROD 실제 full DB+객체 복원 PASS. PROD 별도 hourly freshness cron 정상 실행 PASS. 자동 실패/비용 알림 전달은 승인 수신 경로·계정 수신 조회 권한이 없어 BLOCKED. 월별 실제 청구 경고로 계산하지 않음 |

운영 Web/API와 별도 데이터·백업 버킷을 구성하고 실제 인증 smoke·백업·격리 복원을 검증했다. 남은 운영 결정은 승인된 실패/비용 알림 수신 경로다. 현재 Railway 본인 알림 조회도 NotAuthorized여서 기본 이메일 설정을 추정해 발송하지 않았다. 검증용 임시 DB 서비스/볼륨 삭제는 자동 승인 검토 거절 후 사용자 승인 대기다. 다른 제품의 버킷·비밀·자료는 공유하거나 정리하지 않는다.
