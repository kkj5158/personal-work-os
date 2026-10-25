# MONEY SYS 통합 가계부 운영 배포 — 2026-10-25 KST

소유자의 “운영 배포 진행해” 요청에 따라 운영 API·Web 배포와 읽기 전용 검증을 완료했다.

## 배포 결과

- 운영 주소: https://kafka-sys.life/money/bookkeeping
- 배포 SHA: `5146fa41f13f9ec2d284ac78b19a6ed24dae9d5d`.
- API: `1400d692-80df-4c7f-b127-d9b74883b4e4`, SUCCESS, `/actuator/health` UP.
- Web: `d80eafd9-8620-414c-860a-14f0f7eb45b0`, SUCCESS, custom-domain `/login` HTTP 200.
- 환경: Railway production `c2c20488-311f-4b9e-9ec9-d79508123176`.
- 서비스: API `e46b58f4-e829-430f-a4c4-b27e24d46f19`, Web `5818a578-b7a2-443a-aaad-ce10f6bb708c`.
- GitHub source는 두 서비스 모두 `prod` 브랜치와 위 SHA로 고정했다. `/backend`, `/frontend` root와 source 외 build/deploy/network 설정은 전후 동일하다. 변수·자격 증명·인프라 설정 변경은 없다. staged 변경은 남지 않았다.

## 운영 후보 범위

DEV 검증본은 `220abf20882125a350981f322ef8bd1648fe93d1`이다. 운영은 선별 릴리스 구조이므로 기존 운영 `b445b682c04df830e71a7906a0a574c52ace871c`에서 MONEY 변경만 반영했다. `ac55083`, `945ff48`, `b9fb076`, `220abf2`를 순서대로 적용한 운영 후보가 5146fa4이다. Calendar·Sleep 등 다른 DEV 변경은 포함하지 않았다.

현재 운영 대비 28개 파일이 바뀌었다. backend MONEY·frontend MONEY 소스는 DEV 검증본과 바이트 기준으로 동일하다. 기존 분류 선택기와 다른 운영 화면을 보존했다. migration 차이는 V100 추가 하나뿐이며 이전 migration 파일은 동일하다.

## 재검증

5146fa4 clean 상태에서 격리된 loopback PostgreSQL 18.4와 실제 DEV 프로필 API를 실행했다. 실제 shared DEV/PROD DB에 연결하지 않았다.

| 검증 | 결과 |
|---|---|
| backend bootJar/classpath | PASS |
| 백엔드 12개 클래스 | 125 tests, failures/errors/skipped 0 |
| 프론트엔드 집중 테스트 | 30 passed |
| production build / TypeScript | PASS |
| 실제 합성 API·브라우저 연속 행동 | 14 checks PASS |
| owned DB·API·Web 정리 | PASS |

검증 실행: `unified-1792925237258`. 기존 2단 선택기의 ‘이번 거래만 반영’ 저장, 미확정→소비, 이체 연결/해제/Undo, 500000 상환 배분, 환불 상속/직접 override, 금융 유형 일괄 부분 성공, 버전 충돌·명시 재적용, outcome replay와 취소·복원 등을 실행했다. 이 합성 실행을 운영 금융 기록 수정 테스트로 바꾸어 설명하지 않는다.

## 운영 마이그레이션과 순서

공식 CLI의 production 한 환경에 대한 명시적 source patch로 API를 먼저 배포했다. 새 컨테이너의 로그에서 95 migrations validation, public v99, V100 한 개 적용 성공, `active_profile=prod db_environment=PROD`를 확인했다. API 정상 기동과 로그인 후 unified API 응답을 확인한 뒤 Web을 배포했다.

V100은 `meaning_state` default CONFIRMED·제약·인덱스를 추가하고 한쪽 이체 형태를 허용한다. 기존 거래를 임의 재분류하거나 금액·ID·원문·잔액 관측을 바꾸지 않는다. reset/truncate/clean, 데이터 복사, 수동 운영 DB 정정은 수행하지 않았다. 배포 보조 스크립트의 초기 health 응답 파싱 오류는 수정했고, 재실행 시 이미 성공한 API를 재배포하지 않고 정상 확인했다.

새 의미 상태를 사용한 뒤 이를 이해하지 못하는 이전 서버로 단순 rollback하지 않는다. 금융 의미와 사용자 입력을 보존하는 roll-forward를 우선한다. 다운 마이그레이션이나 금융 기록 삭제는 승인되지 않았다.

## 운영 읽기 전용 검증

- 정상 소유자 로그인으로 새 unified API HTTP 200.
- 운영 가계부 KPI 4개·도넛 3개, 전체 거래·전 기간 미확정 제어 확인.
- `/money/transactions` bookmark가 통합 전체 거래 가계부를 표시함을 확인.
- 위 조회 중 pageerror·HTTP 5xx 없음.
- 비로그인 MONEY API는 401, 운영 도메인 CORS는 정상.
- 배포 전 선택한 기존 거래 20건의 ID·금액·유형·발생 시각·버전·제외 상태·분류·연결·제목/메모 필드 지문이 배포 후 동일했다. 전후 SHA256: `1369af88be34834e8a4ca83e0aee9b743debe3bea22d54e1029e4e24a426f627`.

이 비교는 표본 20건에 한정되며 전체 DB 무결성 감사가 아니다. 운영 테스트 기록 생성·편집·저장·취소를 하지 않았다. 인증 토큰은 메모리에서만 사용하고 검증 후 참조를 해제했다. 원문 금융 데이터·쿠키·토큰·DB dump는 증거에 포함하지 않는다.

## 잔여 범위와 인계

배포 완료와 Q01–Q34 전체 완료는 별개다. 기존 판정 PASS 28 / PARTIAL 6을 유지한다. 희소 History 호환 검증(Q01), 검증된 고유 식별에 의한 자동 대출/환불/중복·수동 알림 연결(Q13/Q15/Q16/Q24), Android UX(Q31)는 남아 있다. 기존 DEV hosted UI 저장 검증의 자동화 제어 차단도 해소됐다고 주장하지 않는다. 이번 운영 smoke는 읽기 전용이다.

DEV 전용 배포 실행기와 지속 승인 범위를 바꾸지 않았다. 이번 운영 배포는 소유자의 현재 요청에 한정한 별도 작업이며, 후속 무관 PROD 배포를 상시 승인하지 않는다. 공통 release lock을 사용했고 기존 다른 작업자의 worktree·미커밋 변경은 보존했다.

로컬 보고서·증거: `D:\DEV_Space\money-unified-bookkeeping-prod-report-20261025`.

Drive: https://drive.google.com/drive/folders/1OjIeX7QSwkvbHurJcPLTCG9GmGac8_E6

운영 후보 worktree와 릴리스 브랜치는 현재 배포 SHA의 재현과 초기 관찰을 위해 보존한다. 별도 스크립트는 이번 승인 SHA·환경·서비스만 대상으로 하며, DEV 실행기의 PROD 차단을 해제하지 않는다.
