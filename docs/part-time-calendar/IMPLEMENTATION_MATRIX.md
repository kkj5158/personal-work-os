# 알바 근무 달력 구현 매핑 · 2026-10-25

기준: owner가 지정한 `4_MONEY_SYS_PART_TIME_WORK_CALENDAR_CODEX_IMPLEMENTATION_PROMPT_20261025.md`, Git `origin/dev` 04238cc, 기존 money-calendar-web-v1 계약. 전역 정책 1PdhTAZW8S2nO9k5jEWCSdQuMBEMIzcCQxCg7L3Pr2DU READ, modified 2026-10-25T02:05:15.433Z. 관련 없는 기획 ZIP은 입력에서 제외.

|정책|DB / API|화면|검증|
|---|---|---|---|
|P01|기존 route 유지|MoneyApp / globalTabs 명칭|기존 경로 회귀|
|P02|catalog 버전 잠금|전용 1040px 관리 모달 / 계층 탐색|키보드·초안·390px|
|P03|V99 workplaces, template/record FK|근무지 생성·수정·이동|기존 금액 JSON 불변|
|P04|date unique 제거, ID 쓰기|다중 항목·겹침 경고|동일 날짜 독립 수정·replay|
|P05|workplace/status query|필터·모든 합계|전체=부분합|
|P06|workplace/week unique, 수당별 합산|합산 주급·근무지 상세|인센 비가산·월경계|
|P07|저장 일급 권위 유지|명시 프리셋→확정 일급 draft|수동 수정·재개 불변|
|P08|workplace JSON canonical presets / nested compatibility projection|공유 프리셋 관리|교차 참조 거절·이동 시 해제|
|P09|날짜는 조회 기준, ID는 변경 기준|0/1/N 선택 및 추가|필터 외 기록 안내|
|P10|active archive, FK restrict|보관/복원·보관 항목 토글|역사 연결 보존|

기존 산식은 확정 일급 + 수동 특근/주휴수당이다. 법정 수당 자동 자격 엔진을 새로 도입하지 않는다. 기존 포함 인센·공제는 재가산/재차감하지 않는다. rest/OFF 및 날짜 없는 입금 확인은 유지한다. 새 근무가 있는 날은 휴무 마커 대신 근무를 우선 표시하되 마커에 접근할 수 있다.

실제 테스트·배포 결과는 최종 보고에 기록하며 이 표는 통과 증거가 아니다. 원본 checkout의 기존 수정과 다른 작업 브랜치는 보존한다.
