# 알바 근무 달력 완료 인계 · 2026-10-25

**구현, DEV 화면 검증, QA 정리, PROD 배포·smoke 완료. 남은 기능 배포 gate 없음.**

검증·운영 소스: `d6653a0b4bb690ac5563a7037091ca48c4a77be2`, `kkj5158/personal-work-os`, `prod` 브랜치에 fast-forward 통합. 운영 API/Web source pin 및 실제 SUCCESS metadata가 모두 이 SHA다. 보고 문서 커밋은 제품 소스 변경이 아니다.

운영 앱: https://kafka-sys.life/money/coupang-work-calendar

|서비스|서비스 ID|실제 배포 ID|
|---|---|---|
|PROD API|e46b58f4-e829-430f-a4c4-b27e24d46f19|14ca2cbd-100d-4fe1-b3ec-f04cda2c9c93|
|PROD Web|5818a578-b7a2-443a-aaad-ce10f6bb708c|d094091b-2c1e-40e3-9a33-407937ca4b5d|
|DEV API|eba7d263-7dc3-448a-a6b8-c2994721b597|68d20f0e-74a4-4081-b19a-448f56428d69|
|DEV Web 후보 검증|b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae|1a11e7a4-7bf9-4405-9251-0499cbe2bd40|

Railway 프로젝트 `2b52b232-38b2-44b6-b97e-4caba54f90bc`, PROD environment `c2c20488-311f-4b9e-9ec9-d79508123176`, DEV environment `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c`.

최종 확인 중 DEV Web의 별도 `25fcdd3a-e26d-4830-b7d2-a5b0b5b32147` SUCCESS 배포를 관측했다. metadata는 dev `24e2e9c`, source config pin은 `ef43be0`다. 기존 Sleep 대기 패치는 해소됐으며 이 작업은 accept-deploy를 실행하지 않았다. 해당 배포는 보존했고 후보와 MONEY 제품 소스가 동일함을 Git으로 확인했다. 새로고침한 DEV 화면에서도 QA 근무0일·금액0원, console error0이다. 앞으로도 source config와 actual deployment metadata를 구분해 확인한다.

DEV API는 여전히 `release/money-part-time-20261025`의 d6653a0에 pin되어 있다. 따라서 **이 원격 release 브랜치는 현재 가동 중인 소스 참조로 보존**한다. 향후 승인된 DEV API 배포에서 장기 브랜치로 소스를 옮긴 뒤 삭제할 수 있다. 이 참조만 정리하려고 이번에 추가 배포를 만들지 않았다. 임시 local release branch와 worktree는 배포 참조와 별개로 정리한다.

## 확인된 결과

- 후보 backend61/frontend71/격리HTTP11 통과, bootJar/Next 운영 build/tsc/scoped lint 통과. 전체 저장소 무관 테스트를 모두 실행한 것은 아니다.
- 공유 DEV에서 두 근무지·공유 프리셋·동일 날짜3건·겹침 경고·0/1/N·필터 밖 편집·상태와 근무지별 합계·수동 일급 보존·보관/복원 통과.
- DEV QA9개 UUID는 `dev-qa-manifest.json`에 있다. 근무3건 removed=true, 템플릿2/근무지2/프리셋2는 보관, QA 주간2행 수당0. 물리 삭제 없이 제품의 tombstone·감사 기록을 남겼다. 이후 이 UUID를 원래 사용자 기록으로 오인하지 않는다.
- QA UUID만 제외한 DEV 기존 근무8/템플릿4/주간2/입금0/거래85 및 PROD 전체 근무28/템플릿3/주간2/입금1/거래246의 행 수·원본 해시 일치. JSON/version/request/timestamp도 포함했다. 신규 workplace_id 컬럼만 제외했다.
- DEV V98·V99, PROD V99 정상 적용. 양 환경 owner FK3개/RLS 활성/기본 근무지 매핑 확인. 기존 날짜 유일 제약 해제.
- PROD API health UP, 익명 API401, Web login200, 두 서비스1/1 Online/최근실패0/대기0. 인증된 PROD UI 읽기 smoke 통과, UI 금융 쓰기0, console error0. smoke 후에도 원본 해시 일치.
- 운영 Railway 백업 `2026-10-25 13:01`, 3.05 GB 및 Restore 가능 상태 확인. 실제 복원 훈련은 미수행이다.

## 운영 시 주의할 계약

일급은 저장된 수동 확정 금액이 권위다. 프리셋 catalog나 템플릿을 바꿔도 기존 금액을 재계산하지 않는다. 주급은 확정 일급 + 근무지별 수동 특근/주휴수당이며 포함 인센은 재가산하지 않는다. 날짜는 조회 기준이고 수정은 record UUID로 한다. 보관해도 연결 이력과 입금 원본은 유지한다. Android 화면·APK는 이번 범위 밖이다.

다중 근무가 생성된 이후 예전 날짜 유일 제약이나 구 binary로 무조건 rollback하지 않는다. 현재 스키마를 유지한 forward-fix가 우선이며 백업 복원은 이후 사용자 입력 손실을 따져 별도로 판단한다. Flyway repair/clean을 하지 않는다.

로컬 소유 runtime은 모두 정지했고 포트55456/13456/13457 반환을 확인했다. 기존 main checkout 변경과 다른 작업본은 보존했다. 완료 보고·증거의 영속 로컬 위치는 `D:/DEV_SPACE/part-time-calendar-artifacts-20261025/release/final`이다. 최종 정리 관측은 cleanup 증거에 기록한다. Drive MONEY 폴더의 개별 보고·인계·증거 ZIP을 함께 확인한다.
