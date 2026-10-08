# Sleep Web V1 승인·실행 기록

2026-10-08 / 사용자 지시 및 인증된 업무 Drive 통합 지침 기준.

- D01: 개요 / 기록 / 통계 / 설정 네 메뉴 승인.
- D02: LIFE OS 기본 진입 `/life/categories` 보존, Sleep 하위 탐색 승인.
- D03: 기존 주수면과 별도 낮잠 리소스 승인. 과거 기록 재분류 없음.
- D04: 시작 endpoint 현지 날짜 기준, 같은 날 여러 낮잠, `[start,end)` 겹침 409, 양방향·OPEN 검사, 18h 이상 확인 후 긴 구간 허용 승인.
- D05: Web 명시 저장, 주수면 수정 8초 Undo, 삭제 Undo 없음, owner별 초안과 정확한 명시 재시도 승인.
- D06: 기존 주수면 7/30일 지표, 낮잠 별도 집계, 기존 공유 알림 설정만 편집 승인.
- D07: 구현·필수 검증·DEV 배포·PROD 승격·인증 smoke·문서 게시 승인. 추가 화면별 승인 불필요.

실행 원본: Drive 파일 `17bItDKZQl0SSHIMw8pe2oWOeMTpiuyZT`. ZIP 안의 planning-only / approval-pending 내용은 역사적 감사 자료로 보존하며 이번 통합 지침이 실행 권한을 대체한다. 기술·데이터 보호 요구는 유지한다.

인증 계정: Kafka_AI_WorkSpace / hello@studio-kafka.com. 원본 ZIP `19-gEh4gSEoShoUX-dnLEjvPXs1SSFSnC`은 47,697바이트, SHA256 `60161576f4d012c99375c03ed31965ae8cbdc9f1574008eda503838f31a0c265` 일치. 모든 압축 항목 읽기·경로 검증 후 `D:/DEV_SPACE/sleep-app/.local-dev/sleep-web-v1-planning/extracted/SLEEP_WEB_V1_PLANNING_20261008`에 안전하게 추출했다. 같은 상위 폴더에 ZIP과 통합 지침 전문을 보존했다.

작업은 `origin/dev` 2004063443e7321b15dd8663f265e896133bd90e에서 분리한 `codex/sleep-web-v1` / `D:/DEV_SPACE/personal-work-os-worktrees/sleep-web-v1`에서 진행한다. 본 작업 복사본의 기존 staged authoring PNG·설정 변경·미추적 감사 자료는 그대로 보존한다.

V78은 실제 DEV/PROD V77 history 및 다른 작업 트리의 V78 이상 파일 부재를 확인한 뒤 신규 낮잠에 배정했다. V70/V76은 변경하지 않는다. 적용 직전 원격 HEAD·공유 history·동시 예약을 다시 확인한다.

Android 낮잠 UI/동기화, 실시간 Web capture, Web 알람, Usage 수집, 수면 점수, AI 코칭, 자유기간 분석, bulk export/delete는 범위 밖이다. Flip6 실기기 QA는 계속 보류한다.

## D07 실행 완료

최종 앱 후보 5a0e27eacf75fca57edaedd40c45205f3f9296a8를 DEV 검증 후 동일 SHA로 PROD 승격했다. 네 Railway 배포 SUCCESS, DEV/PROD V78 checksum 1519532796, V76 및 이전 history·기존 사실 보존을 확인했다. PROD 정상 인증 smoke 9/9와 유일한 disposable nap의 DB privacy 정리도 통과했다. DEV 정상 owner 세션은 기존 Chrome 프로필에 없어 우회하지 않고 제한을 보고했다. 실제 검사·배포 ID·사용 안내·Android 계약·Drive 증거는 CLOSEOUT.md와 evidence에 기록한다. 마지막 문서/검사 스크립트 커밋은 애플리케이션 소스와 분리해 source 동일성을 확인한다.
