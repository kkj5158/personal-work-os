# 근무지 관리 입력 포커스 수정 · 2026-10-25

상태: **DEV 실제 클릭·키 입력·저장 재조회 PASS / PROD Web 배포 및 실제 클릭·키보드 포커스 검증 완료.**

사용자가 운영 앱에서 근무지 이름, 프리셋 이름·금액을 수정할 수 없다고 보고했다. 실제 입력칸을 클릭하면 `INPUT` 대신 패널 `ASIDE`가 포커스를 얻는 현상을 세 입력칸에서 재현했다. 이전 자동 값 채우기 검증은 실제 포인터 포커스 전환을 거치지 않아 이 결함을 놓쳤다.

원인은 달력의 포커스 복구 로직이다. 브라우저가 클릭한 입력칸으로 포커스를 옮기는 도중 `focusout`과 다음 focus 사이에 activeElement가 잠깐 BODY가 된다. 그 순간 실행된 microtask가 패널을 다시 focus해 원래 입력칸으로의 이동을 가로챘다.

명시적인 다음 포커스 대상(`relatedTarget`)이 있으면 이동을 그대로 허용하도록 수정했다. 비활성화·제거된 저장 버튼처럼 다음 대상이 없어 포커스를 잃은 경우의 복구는 유지한다. `MoneyCalendar.tsx`와 회귀 테스트만 변경했으며 API·스키마·급여/입금 산식은 변경하지 않았다.

## 소스와 검증

- PROD 후보 `8e0fa48e6cfe548795b8553f11f6a500fbf9d7ab`는 초기 운영 배포 d6653a0의 직접 자식이다.
- DEV에는 기존 Sleep 등 다른 화면 변경을 유지하기 위해 동일 패치만 cherry-pick한 `ade1cc0e35f6537cf70f7e79ea9c7dfdbb9c3850`을 배포했다. 수정 파일2개의 내용은 PROD 후보와 완전히 동일하다. 다른 DEV 화면을 좁은 운영 후보로 되돌리지 않았다.
- 새 회귀 테스트는 수정 전 `pointer focus must reach the chosen input`에서 실패(actual1, expected0), 수정 후 통과했다. 근무지 이름/프리셋 이름/금액, 명시적인 다른 포커스 대상, 대상 없는 포커스 복구를 확인한다.
- frontend 관련72/72 PASS, next typegen/tsc/scoped lint PASS, Next 운영 빌드 PASS. backend는 변경이 없어 이전61개 및 격리HTTP11개 결과를 유지하며 이번 입력 수정에서 재실행하지 않았다.
- DEV 배포 `aaf2e7fd-e9e3-43c6-bf6e-0d38802dde1a` SUCCESS. 실제 클릭 후 각 입력칸 INPUT focus 유지 → Control+A 및 연속 키 입력 → 저장 → 닫기/재진입 시 세 값 재조회 PASS.
- 검증은 기존 보관된 QA 근무지 A만 사용했다. 임시 이름/프리셋 이름/금액을 입력하고 재조회한 뒤 원래 이름 `QA_RELEASE_20261025_A`, 프리셋 `QA_A_30000`, 금액90000으로 복원했다. 보관 상태는 유지했다. 원래 DEV5개 테이블은 QA UUID 제외 후 행 수·해시가 baseline과 계속 일치한다.

## 최종 운영 확인

운영 Web 배포 `ffde44e9-5772-49dd-8d13-0da2f4b79be6`, source pin 및 실제 SUCCESS metadata 모두8e0fa48이다. 실제 클릭 후 근무지 이름·프리셋 이름·금액 모두 INPUT focus 유지 및 Home/ArrowRight 키보드 이동을 확인했다. 세 값은 바꾸지 않았다. DEV/PROD console error0이다. 운영 API는 d6653a0 / `14ca2cbd-100d-4fe1-b3ec-f04cda2c9c93`를 유지하며 추가 배포나 DB migration은 없다. API·Web replica1/1 Online, 최근실패0이다.

운영 UI의 실제 사용자 근무지·프리셋 값을 변경해 테스트하지 않았다. DEV에서 실제 키 입력과 저장을 검증하고, 운영에서는 세 입력칸의 클릭 focus와 키보드 caret 이동을 확인했다. 최종 운영 근무28/주간정산2/입금1/거래246행의 수·원본 해시는 계속 일치한다. 템플릿3행 중1개는 초기 smoke 이후 04:30:07 UTC의 정상 PUT200과 같은 시각에 version/updated_at이 변경돼 전체 템플릿 해시가 달라졌다. 04:29–04:30 UTC 근무지/템플릿 PUT200도 관측됐다. 이 작업이 실행한 운영 쓰기는0이며, 이후 저장된 설정을 원래 baseline으로 덮어쓰지 않았다. 초기 마이그레이션 직후와 최초 smoke까지5개 테이블 모두 일치한 증거는 그대로 보존한다.

이미 열려 있던 브라우저 화면에는 새 코드 로드를 위한 새로고침이 필요하다. 로컬 작업본·통합된 임시 fix branch는 보고와 증거 복사 후 정리한다. `release/money-part-time-20261025` 원격 branch는 여전히 가동 중 DEV API 소스 참조이므로 유지한다.
