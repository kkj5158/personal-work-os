# 실제 구현 증거

이 폴더의 PNG는 소유한 합성 DEV fixture로 실행한 실제 Sleep Web 화면이다. 기획 MOCKUPS.html, 기존 UIREF, 임시 실패 화면과 구분한다. 실제 사용자 행 key/hash, 인증 토큰, 전체 비공개 런타임 로그는 게시하지 않는다.

- `release-deployments.json`: 애플리케이션 후보 5a0e27e의 DEV/PROD API·Web SUCCESS 네 건.
- `db-preservation.json`: 체크포인트별 counts/history/checksum/기존 행 보존/RLS 검사에서 개인 row key/hash를 제외한 요약.
- `hosted-prod.json`: 정상 Supabase owner 세션 smoke 9/9와 유일한 시험 낮잠 정리.
- `prod-cleanup-privacy.json`: 실제 PROD 읽기 전용 SQL로 facts/events 0, 최소 tombstone/receipt 및 endpoint 제거 확인.
- `hosted-readonly-{dev,prod}.json`: 실제 health/보안/CORS/login gate 각 10개.
- `hosted-probe-dev.json`: DEV 정상 로그인 세션 없음이라는 정확한 제한.
- XML·`backend-naps-final13.log.txt`·`security.log.txt`: 최종 관련 backend 검사. final12는 이전 12개 검사 실행 이력이며 최종 13개와 구분한다.
- `frontend-tests.log.txt`, `frontend-verified-build.log.txt`: 모델·탭 및 build 자료. `frontend-final-build.log.txt`가 최종 표시 변경 build다.
- `browser.json`: 전체 실제 UI 19개. `android-contract-browser.json`: 마지막 충돌 표시 변경 이후 추가 2개.
- `records-*`, `statistics-desktop.png`, `main-nap-conflict.png`: 실제 합성 데이터 화면. zoom200은 CSS content zoom이다.
- `runtime-cleanup.json`: 소유 DEV schema 9개 및 owned runtime 정리 요약.

전체 초기 실패·진행 로그와 row hash 원본은 `.qa/evidence/sleep-web-v1-20261008`에 비공개 보존한다. 검증 범위·시점은 [CLOSEOUT](../CLOSEOUT.md)과 [QA_MATRIX](../QA_MATRIX.md)를 따른다.
