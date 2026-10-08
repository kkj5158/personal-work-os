# Sleep Web V1 검증 기록

현재 소스에서 실제 수행한 검증만 기록한다. 이전 SLEEP-09/Android 수치는 신규 결과로 계산하지 않는다.

| 검증 | 결과 및 근거 |
|---|---|
| 기존 Sleep PostgreSQL/recorder/time + 보안 profile | 58 executions 통과. 기존 테스트 자체 38개가 상속 실행을 포함해 58회 실행됨. 최초 전체 실행 로그와 XML 보존 |
| 낮잠·영속성·회귀 | 최종 12/12, skip 0. 실제 DEV PostgreSQL 소유 schema 사용. revision/replay/owner/delete redaction/OPEN/인접·상호 겹침/Undo/동시 main-nap 및 nap-nap/V76 기존 데이터 보존/같은 UUID 리소스 receipt 분리 |
| 정상 운영 보안 체인 | 3/3. 무인증 읽기·쓰기 거절, 검증 JWT subject의 owner predicate, invalid bearer 거절; 실제 ProdSecurityConfig 경유 |
| 프런트엔드 모델·탭 | 17/17. DST gap/fold, endpoint 원본 보존, null 간격, 24h 초과, owner 초안, URL context·기본 제목 보존 |
| Next production build | 성공. 4개 Sleep 경로 생성 및 TypeScript 검증 |
| 실제 Playwright UI | 개요 빈 상태, 낮잠 생성/같은 날 여러 건/수정/충돌·재적용/겹침/오프라인 복원/서버 commit 후 응답 유실·정확 재시도/확정 삭제/주수면 생성·수정·8초 Undo/이동 guard/30d/설정 장치 보존. 최종 19/19, skip 0. 같은 기록 화면의 deep-link 날짜 갱신도 검증. JSON과 실제 화면은 evidence에 기록 |
| 브라우저 화면 | 320/390/1280px light/dark, keyboard Tab/focus, 모바일 drawer, 200% content zoom. zoom은 headless CSS content zoom으로 재현하며 OS 실기기 확대 검증으로 표현하지 않음 |
| 배포 및 DB 보존 | release-before → after-dev → after-prod → after-smoke 체크포인트와 배포 SHA는 최종 CLOSEOUT에서 확정 |
| 인증된 운영 smoke | 기존 소유자 Chrome의 정상 Supabase 세션 조회 통과. 최종 CRUD/정리 결과는 배포 후 CLOSEOUT에서 확정 |

초기 구현에서 replay JSON 숫자 타입 비교 2건 실패가 있었고, JSON 의미 정규화 후 최종 낮잠 검증에서 통과했다. 초기 UI 배치/재적용 저장 경쟁을 수정했다. UI 시험 도구의 commit 대기·Undo 응답 대기를 보정했다. 실패 로그를 덮어 완성 결과처럼 취급하지 않는다.

운영 세션 조회는 기본 Playwright Chrome 인자가 프로세스를 종료시켰으나, 기존 POS 절차의 native Chrome `ignoreDefaultArgs`와 `--headless=new`로 해결했다. 토큰은 메모리에서만 사용했고 파일/로그/문서에 저장하지 않았다.

Android checkout과 기존 CONFLICT 보존·snapshot ID 비교 경로를 확인했다. Android 소스·API envelope는 변경하지 않았다. Android nap UI/sync 및 Flip6 physical QA는 범위 밖이며 계속 보류한다.
