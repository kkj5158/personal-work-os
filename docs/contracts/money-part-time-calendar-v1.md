# MONEY 알바 근무 달력 V1 · 2026-10-25

Owner의 2026-10-25 구현 요청 및 지정 프롬프트 P01–P10이 아래 변경을 승인한다. 이전 money-calendar-web-v1의 하루 한 기록·템플릿별 프리셋·프리셋 참고 전용 정책을 이 계약이 대체한다. 금융 원장과 WORK OS 근태에는 쓰지 않는다.

## 저장과 호환

V99 `money_workplaces_multi_shift`는 `money_workplaces`와 기존 template/work/earnings-week의 `workplace_id`를 추가한다. 기존 owner별 기본 근무지 ID는 `md5('money-workplace:coupang:' || user_id)::uuid`, 표시명은 쿠팡이다. 기존 JSON·버전·timestamp·입금 행은 변경하지 않는다. 기존 중첩 프리셋 UUID들을 근무지의 공유 JSON catalog로 이관하며 같은 ID의 정의가 충돌하면 migration이 중단된다. 자동 금액 보정은 없다.

날짜 unique를 제거하고 `(user_id,work_date,id)` 조회 index를 둔다. UUID와 expectedVersion으로 생성·수정하며 동일 요청 replay와 optimistic conflict를 유지한다. 휴무 마커는 날짜당 하나의 기존 식별자를 유지한다. 새 근무는 같은 날짜에 N개 가능하며 휴무보다 근무를 우선 표시한다. OFF로 정정하거나 취소할 때 원본·입금 이력을 보존한다.

Workplace/Template의 `active=false`는 보관이다. 근무지 보관은 자식 상태를 덮어쓰지 않고 신규 선택만 막는다. 복원하면 자식별 상태가 그대로 돌아온다. 물리 삭제 API는 제공하지 않는다.

## API

기존 `/money/coupang-work-calendar` 및 `/api/money/calendar` 경로를 유지한다.

|메서드·경로|계약|
|---|---|
|GET /workplaces|owner의 활성·보관 근무지와 공유 presets|
|PUT /workplaces/{uuid}|expectedVersion, name, active, presets; 기존 preset 삭제 금지, 보관 사용|
|GET /templates|workplaceId, workplaceName, workplaceActive 추가; presets는 근무지 catalog의 호환 projection|
|PUT /templates/{uuid}|기존 필드 + workplaceId; 기본 preset의 근무지 일치 검증; 이동 시 불일치 default 해제|
|GET /earnings-calendar?month=YYYY-MM&workplaceId=UUID&status=ALL|선택 근무지·상태의 기록·월합계·주합계. 생략하면 전체|
|GET /earnings-weeks/{sunday}?workplaceId=UUID|근무지별 주급·수동 특근/주휴·fingerprint|
|PUT /earnings-weeks/{sunday}?workplaceId=UUID|기존 expectedVersion/fingerprint + 두 수당, 해당 근무지에만 저장|
|GET /earnings-weeks/{sunday}|전체 합계 + workplaceBreakdowns. legacy 무지정 PUT은 쿠팡 기본 근무지에 저장|
|PUT /earnings-records/{uuid}|V4 기존 계약 유지, workplace는 선택 template에서 추론, 기존 snapshot은 명시 재선택 때만 변경|

`allRecords`는 필터 외 기록까지 포함해 날짜 선택·겹침 경고에 사용한다. 달력 경계 전후 하루는 익일 근무 겹침 확인용이며 셀·월·주 합계에는 중복 포함하지 않는다. `records`는 필터를 반영한다. 이전 입금일 기반 이력은 읽기 전용이다.

기존 template-local PUT은 공유 catalog로 호환 연결한다. 공유 preset 변경 시 연관 template 버전을 갱신해 stale 명시 선택을 거절한다. 이전 API rolling instance의 INSERT를 위한 기본 근무지 trigger는 제공하지만 이전 binary에 multi-shift UI 기능이 생기지는 않는다. 새 catalog API를 쓸 클라이언트는 변경된 template 버전을 다시 읽어야 한다. Android 화면·APK는 이번 범위 밖이다.

## 금액과 화면

주급은 각 근무지의 `확정 일급 합계 + 수동 특근수당 + 수동 주휴수당`을 계산한 뒤 합산한다. 인센은 포함 내역이며 재가산하지 않고 과거 공제는 재차감하지 않는다. 근무시간을 다른 근무지와 합쳐 자동 수당 자격을 만들지 않는다. 새 법정 급여 엔진은 없다. 월간 일수 카드는 날짜 중복을 제거하고 시간·금액은 모든 근무를 합산한다.

명시 preset/template 선택은 현재 draft의 확정 일급을 즉시 채운다. 이후 수동 일급이 저장 권위이다. 기존 편집기를 여는 것·비급여 필드 변경·catalog 재조회는 저장 일급을 덮어쓰지 않는다. preset 변경 자체는 입금 완료를 자동 ON하지 않는다. 기존 완료 근무에서 양수 일급 직접 입력 이벤트만 입금 토글을 사전 선택하며 수동 OFF를 존중한다.

날짜의 근무 수가 0이면 신규 편집기, 1이면 직접 편집기, N이면 간단한 목록을 연다. 필터 외 기록도 목록에서 설명하고 접근하며 기록 하나 뒤에도 `＋ 근무 추가`를 제공한다. 겹침은 경고만 하고 저장은 허용한다. 관리 모달은 1040px, 모바일은 전체 높이로 적응하고 기존 MoneyPanel focus trap/초안 확인을 재사용한다.

## 배포·복구

### 주 시작 표시 설정 · 2026-10-25

달력 헤더의 `주 시작`은 기본 `일요일 시작`, 선택 `월요일 시작`을 제공한다. 설정은 MONEY의 인증 계정 ID별 브라우저 localStorage에 표시 enum만 저장하며 기기 간 동기화하지 않는다. 저장이 차단되면 현재 페이지 메모리에서 유지한다. 기존 세션 전용 필터·월·선택 날짜·편집 초안은 전환 시 보존한다.

표시 행과 정산은 독립이다. 기존 API의 일–토 정산·근무지별 breakdown·수당·입금 상태를 그대로 받아 정산 종료일이 포함된 표시 행에 한 번만 배치한다. 행과 기간이 다르면 양쪽 합계 열에 실제 정산 기간을 표시한다. 2026년 10월 월요일 첫 행은 09.28–10.04이며 09.27–10.03 정산을 표시한다. 필요한 이전/다음 월의 기존 GET 응답을 병합해 인접 날짜 편집과 원래 전체 정산 기간을 확보한다. 중복 기록은 UUID, 정산은 근무지/시작/종료로 제거한다. 경계 조회 실패 시 새 경계 날짜 편집을 막고 재시도를 제공한다.

월간 KPI와 아래 주별 비교는 기존 선택 월의 API 기준을 유지한다. 표시 격자에 종료일이 없는 기존 정산도 아래 주별 비교에서 접근할 수 있다. 표시 주간 일별 합계로 급여를 다시 계산하지 않으며, API·Android 계약·스키마·금액 저장 모델에는 변경이 없다.

공유 DEV Flyway history·migration 번호·기존 preset 충돌·금액 보존 baseline과 복구 준비를 확인한 뒤 backend→web 순서로 배포한다. migration은 공유 환경에서 아직 실행 여부를 검증해야 하며 로컬 QA 통과를 공유 배포로 간주하지 않는다. PROD는 DEV 전체 gate 통과 후 동일 후보를 승격한다.

V99 이후 이전 API binary로 되돌리면 같은 날짜 여러 기록을 제대로 다루지 못할 수 있다. application forward-fix를 우선한다. 새 기록이 있는 DB에 날짜 unique를 다시 만들거나 V99를 down-migrate하지 않는다. 원래 DB를 덮어쓰는 복구는 별도 승인·새 쓰기 보존 검토가 필요하다.
