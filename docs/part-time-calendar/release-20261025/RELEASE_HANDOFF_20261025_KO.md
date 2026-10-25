# 알바 근무 달력 배포 재개 인계 · 2026-10-25

**DEV 배포 성공, PROD 미배포. 새 배포 허가를 다시 받을 필요는 없으며 사용자가 DEV→PROD 진행을 이미 요청했다.** 브라우저 제어가 현재 URL을 확인하지 못해 중단됐으므로 이 턴에서는 UI 작업을 재시도하지 않았다.

검증·배포 후보 `d6653a0b4bb690ac5563a7037091ca48c4a77be2`, 원격 `release/money-part-time-20261025`. DEV 통합 `ef43be0c201d8ec4f8f0ab763bce5b62c4450618`. origin/prod는 `08fe6767e1c42b6701502a5851ba753d77bc20a9`로 유지된다. 후보는 PROD 기준 MONEY만 적용했으며 dev의 MONEY 제품 소스와 일치한다.

작업본:

- `D:/DEV_SPACE/personal-work-os-worktrees/part-time-calendar-20261025`
- `D:/DEV_SPACE/personal-work-os-worktrees/part-time-calendar-release-20261025`
- 영속 보고·증거: `D:/DEV_SPACE/part-time-calendar-artifacts-20261025/release`

## 다음 순서

1. 기존 인증 Chrome 업무 프로필의 DEV QA 탭에서 초안 폐기 확인창 상태를 확인한다. 이 탭에서 검증용 B1 초안만 버린다. URL이 확인되는 공식 브라우저 도구 경로를 사용하고 인증·토큰 추출이나 다른 UI 도구로 제약을 우회하지 않는다.
2. DEV 앱 `https://workflow-web-development-development.up.railway.app/money/coupang-work-calendar`에서 남은 UI gate를 수행한다. 작업 소유 A/B 근무지와 템플릿·A1/A2 기록은 보고서의 정확한 명칭·메모로 식별한다. 프리셋이 없는 B에는 QA 프리셋을 추가해야 새 근무 저장이 가능하다.
3. 공유 DEV에서 필터·다른 근무지·수동 금액 유지·보관/복원을 마무리하고 QA 기록을 제품의 보관 기능으로 정리한다. 신규 테스트 행의 UUID를 manifest로 남기고 그 UUID만 제외하여 원래 근무8/템플릿4/주간2/입금0/거래85의 해시·행 수가 이전 baseline과 일치하는지 다시 확인한다. 원본 baseline은 `dev-before.json`, 마이그레이션 직후 일치 결과는 `dev-after-migration.json`이다.
4. Railway 최신 상태·Git 원격을 다시 확인해 동시 배포를 피한다. DEV API/Web은 d6653a0 SUCCESS이다. DEV Web의 기존 Sleep 대기 패치 `7f54b155-6c09-41ca-84a1-f97eabe42199`는 기존 Sleep을 포함하는 ef43be0를 대상으로 남아 있다. `accept-deploy`로 모든 대기 변경을 무심코 함께 적용하지 않는다.
5. PROD 백업과 baseline을 갱신 확인한다. 새 백업 `2026-10-25 13:01`, 3.05 GB가 Restore 가능 상태다. 복원 훈련은 하지 않았다. PROD 기존93개/DEV92개 Flyway 체크섬 및 파일명은 검증했고, PROD V98/DEV V97에서 출발했다. DEV는 V98·V99 성공이다. 이미 적용된 migration의 checksum을 고치거나 Flyway repair/clean을 실행하지 않는다.
6. DEV 전체 gate 통과 후 동일 후보 d6653a0를 PROD API→health/DB V99/기존 해시 비교→Web 순서로 배포한다. PROD DB `pos_prod_final`, 기존 API health `https://personal-work-os-prod-production.up.railway.app/actuator/health`, 웹 `https://kafka-sys.life`. 인증된 PROD smoke는 기존 기록·금액·입금 보존을 읽기 위주로 확인한다. 임의 운영 QA 기록을 만들지 않는다.
7. prod 브랜치 통합은 최신 origin/prod에서 의도한 변경만 포함하는지 다시 확인한다. 현재 prod 기준 후보가 fast-forward 가능하지만 동시 변경이 있으면 재검증한다. Railway source pin과 실제 successful deployment SHA가 같은지 확인한다. branch push만으로 배포됐다고 기록하지 않는다.
8. 최종 보고/인계/증거를 기존 Drive MONEY 폴더에 업로드·metadata 검증한다. 현재 blocked 보고를 완료 보고로 오해하지 않게 새 결과를 명시한다. 성공 후에만 임시 branch/worktree와 소유 runtime을 정리한다.

## Railway 식별자

프로젝트 `2b52b232-38b2-44b6-b97e-4caba54f90bc`.

|환경|Environment|API service|Web service|DB service|
|---|---|---|---|---|
|DEV|9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c|eba7d263-7dc3-448a-a6b8-c2994721b597|b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae|0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9|
|PROD|c2c20488-311f-4b9e-9ec9-d79508123176|e46b58f4-e829-430f-a4c4-b27e24d46f19|5818a578-b7a2-443a-aaad-ce10f6bb708c|e0b42e61-9207-4225-83ee-c516edc75202|

공식 인증 Railway DB console에서 `PGOPTIONS` 읽기 전용 + `psql -U "$PGUSER" -d pos_dev_final/pos_prod_final`을 사용했다. 비밀값을 노출하지 않았다. 콘솔 clipboard 붙여넣기와 Enter 후 출력 완료를 별도 확인한다. baseline SQL은 작업 증거에 있다. 기존 행 JSON 전체에서 새 workplace_id만 제외한 해시를 비교해 version/request/timestamp도 보호한다.

로컬 후보 검증: backend61, frontend71, HTTP11, bootJar, Next 운영 build, tsc, 범위 eslint PASS. 로컬 runtime 정지·포트3개 반환 PASS. Android APK 및 실제 백업 복원은 미수행이다. V99 이후 다중 근무가 생기면 date unique나 구 binary로 무조건 rollback하지 않고 forward-fix를 우선한다.
