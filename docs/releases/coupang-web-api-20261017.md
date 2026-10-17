# 쿠팡 근무 달력 Web · 공유 API — Task 1

작성일: 2026-10-17 KST. 구현·DEV 검증 진행 중이며, 아직 `WEB_API_READY`를 선언하지 않았다. Android 구현과 PROD 배포는 이 작업 범위가 아니다.

## 감사 기준선

- 승인 실행 명세: `01_COUPANG_WEB_BACKEND_IMPLEMENTATION_20261017.md`와 `Coupang_Work_Confirmed_Handoff_20261017.zip`. 최신 사용자 지시인 양수 일급 입력 시 미저장 입금 ON, 수동 OFF 우선 규칙을 적용한다.
- 원격 DEV 및 실제 성공 배포 Web/API: `b389c1440dc102c53ed39e02de0dbd51e2402e8b`.
- 원격 PROD 및 실제 성공 배포 Web/API: `6830c5bfaa16a942ccae773ddc1e6040d372f23c`.
- DEV API 배포 `cdbcfb0e-d34a-4d96-bd73-2b8f69af5c38`, Web 배포 `217d3044-b1d3-4c65-8769-437cc12964b7`. Railway 소스는 `dev` 브랜치이고 대기 중인 설정 변경은 없었다.
- PROD API 배포 `77964206-b7e8-4cb5-873e-17c5a60be7f2`, Web 배포 `ef1c672e-4901-4c84-8ed1-4b0ce446304e`. 소스는 별도 `prod` 브랜치이다. 이 작업에서 변경하지 않는다.
- DEV 시작 로그: PostgreSQL 17.11, `pos_dev_final`, Flyway public V87, up-to-date. 이 작업은 새 마이그레이션을 추가하거나 기존 마이그레이션을 수정하지 않는다.
- 로컬 기존 기본 작업본은 `D:/DEV_Space/personal-work-os`, 오래된 `main`의 `bcf12c518f2c953578b31f2e67d1e2e88bbfc74d`. 기존 `.claude/settings.local.json`, `frontend/package-lock.json` 수정과 미추적 `AGENTS.md`를 보존하고 별도 워크트리를 사용했다. 열린 원격 PR 검색 결과는 0건이었다.
- 이 작업 팀 외의 관련 로컬 활성 구현 작업은 확인되지 않았다. 설정된 주 데스크톱 SSH는 연결 timeout으로 그 호스트의 미커밋 워크트리를 직접 감사하지 못했다. 원격 dev를 통합 직전에 다시 확인한다.

## 구현 계약

기존 `/earnings-records/{id}`를 `contractVersion:4`로 하위 호환 확장한다. 미확정 null 저장, 서버 프리셋 버전 검증·예상액 스냅샷, 날짜 없는 입금 상태·정정 이력을 기존 work JSONB에 원자적으로 저장한다. 기존 V2/V3와 FIX-001/002, 일–토 주급 및 포함 인센 규칙을 유지한다. 기존 payment 배열 교체 함수를 새 입금 토글에서 호출하지 않으며 금융 원장·WORK OS 근태를 생성하지 않는다.

Web은 날짜를 한 번 선택해 편집 대화상자/좁은 화면 시트를 연다. 완료 근무는 확정 일급과 입금 토글을 우선 표시한다. 유효한 양수 일급의 직접 입력 이벤트에만 미저장 ON을 적용하며 수동 OFF는 같은 편집 세션에서 유지한다. 서버 저장 성공값으로 초안과 합계를 갱신한다.

정확한 DTO·인증·오류·예제·호환·안전한 테스트 데이터 정리는 [ANDROID_API_HANDOFF.md](../../ANDROID_API_HANDOFF.md)에 있다.

## 검증 상태

감사 기준선의 기존 frontend `npm run test:money-calendar`: 64/64 PASS. 이는 변경 전 회귀 기준선이며 새 동작의 검증 수치와 합산하지 않는다.

현재 DEV 접근 확인: health 200, JWT 없는 templates 요청 401, DEV 공개 JWKS 200. Chrome의 실제 인증 세션으로 근무 달력 읽기 및 월·주 요약 표시를 확인했다. 변경 후 저장·재조회와 아래 인수 검증 결과는 완료 후 기록한다.

별도 DEV API 토큰/DB 환경 파일은 없으며 연결 도구의 Railway OAuth는 변수 이름만 제공한다. 실제 운영 데이터의 DB 전체 해시 비교를 실행했다고 주장하지 않는다. 실제 DB 접속 없이 로컬 PostgreSQL 전용 인스턴스와 합성 owner/schema에서 payment `ctid`·JSON 원행 보존 및 원장 비생성 회귀를 검증한다.

## 남은 완료 게이트

- 구현 커밋 통합, frontend production build, 변경 후 테스트 최종 결과.
- 인증된 DEV 배포 후 날짜·프리셋·미확정·입금 ON/OFF·정정·충돌·주급·좁은 화면 저장/재조회 검증.
- A01–A15/A18/A19 수행 증거 및 테스트 fixture 정리.
- A16 Android↔Web, A17 Android 기기 검증은 Task 2 게이트로 유지.

`WEB_API_READY`: **아직 아님**.
