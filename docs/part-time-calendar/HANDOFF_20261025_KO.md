# 알바 근무 달력 재개 인계 · 2026-10-25

**구현·격리 검증 완료 / 공유 DEV gate BLOCKED / PROD NOT DEPLOYED.**

원격 `kkj5158/personal-work-os`, branch `feat/money/part-time-calendar-20261025`, 검증 소스 `e29477e6f320883674490fd4ff396d3c65e2af42`. 기준 dev `04238cc`. 제품 커밋 `7d2531d`, 주간 근무지 충돌 수정 `930eacb`. 보고·증거 커밋은 제품 변경이 아니다.

로컬: `D:/DEV_SPACE/personal-work-os-worktrees/part-time-calendar-20261025`. 기존 root checkout과 다른 작업본 변경은 보존했다. task worktree/branch는 아래 공유 배포 gate를 이어서 수행할 구체적 이유로 남겼다.

1. 승인된 공유 DEV DB audit 경로를 복구한다. 현재 Railway OAuth는 값 비공개, 로컬 canonical DEV env/CLI session이 없고 지정 TEAM KAFKA 인증 브라우저도 없다. 비밀값을 채팅·문서로 전달하지 말고 기존 공식 경로로 연결한다.
2. 최신 origin/dev와 live Flyway history를 다시 확인한다. V99는 로컬 후보 번호이며 공유 적용·번호 점유를 검증하지 못했다. 적용 전 충돌 시 미적용 후보만 renumber하고 이미 적용된 migration을 고치거나 repair/clean하지 않는다.
3. 기존 template preset ID 충돌, owner mapping, work/payments/receipt/주간 JSON·version·timestamp baseline, backup/recovery를 읽기 전용으로 확인한다. migration은 금액 JSON을 바꾸지 않는다.
4. 실제 활성 Android/API 소비자를 확인한다. V4 필드와 UUID 쓰기는 유지하지만 날짜당 N건, 공유 preset, 근무지별 주간 합계가 새 의미이다. 현재 Android 앱 소스 검색으로 이 API 소비자를 찾지 못했다. Android UI/배포는 미수행이다.
5. 공유 gate 통과 후 dev 통합·backend→web 배포, 인증된 DEV e2e를 실행한다. 기존 DEV Web staged patch `7f54b155-6c09-41ca-84a1-f97eabe42199`와 Sleep source `d4fd2a5...`를 임의 폐기하지 않는다. 이 코드는 최신 dev 기준으로 해당 Sleep 변경을 포함한다.
6. P01–P10과 12개 불변식·실데이터 보존·복구 gate를 통과한 동일 후보만 PROD로 승격한다. 현재 task가 공유 DEV/PROD를 바꾸지 않았다는 상태를 유지해 보고한다.
7. 배포·smoke·인계 완료 후에만 task worktree와 임시 local/remote branch를 정리한다.

재현 검증:

```text
frontend: npm ci --no-audit --no-fund
frontend: npm run test:money-calendar               # 최종 71/71
frontend: npx next typegen && npx tsc --noEmit
frontend: npx eslint app/money/MoneyCalendar.tsx app/money/MoneyCalendarEditors.tsx app/money/MoneyCalendarEditors.test.tsx app/money/WorkplaceManager.tsx app/money/MoneyCalendarWorkplaces.test.tsx lib/money/calendar.ts
root: node qa/part-time-calendar-owned-runtime.mjs
root: write "rebuild" to .qa/part-time-command        # isolated backend Calendar 61/61 + bootJar
root: node qa/part-time-calendar-api-smoke.mjs         # empty synthetic runtime only; 11 scenarios
root: write "web" to .qa/part-time-command            # production Next build + localhost UI
root: write "stop" to .qa/part-time-command           # owned runtime cleanup
```

Runtime uses installed PostgreSQL18 and Java21 paths, fixed loopback ports55456/13456/13457, random synthetic owner, no shared credentials. Smoke script는 새 빈 합성 cluster에서만 실행하며 같은 cluster에 재실행하지 않는다. 초기 legacy 보존 및 migration replay는 `MoneyCalendarWorkplacePostgresTest`가 격리 schema에서 검증한다.

검증 결과: backend61, frontend71, HTTP11 PASS; bootJar/Next build/typegen/tsc/scoped lint PASS. 1040px 모달, 독립 스크롤, 390×844 넘침 없음, Tab focus trap, 0/1/N, 필터 외 기록, 겹침 허용, preset90000→수동77777 저장/API readback PASS. 실제 shared DEV/PROD 전체 금융 데이터 보존을 검증한 결과가 아니다.

인센은 포함 내역, 주급은 각 근무지 확정 일급+수동 특근/주휴를 합산한다. 기록한 근무일 카드는 같은 날짜 여러 건을 한 일로 센다. 이력·receipt·OFF·기존 deep link를 유지한다. DB에 다중 근무가 생긴 뒤 예전 dateunique나 binary로 무조건 rollback하지 말고 forward-fix를 우선한다.

소유 runtime 모두 정지, 포트 반환 PASS. raw DB/토큰은 공유 증거에서 제외했다. 최종 보고와 evidence ZIP은 다음 Drive 폴더에서 개별 파일로 확인한다.

https://drive.google.com/drive/folders/1wY0yMYudZuByBo4nm1eVPPWAbfaTo8lQ
