# 쿠팡 근무 달력 Web · 공유 API — Task 1 최종 검증

2026-10-17 KST. **WEB_API_READY**. Web·공유 backend의 필수 게이트가 통과했다. Android 구현과 PROD 배포는 수행하지 않았다.

## 검증한 구현·배포

- 검증된 통합 구현: `b82cc4b5c4d3c67d8b9d3f1b3989fa6004adc55d`. 인증 도구·검토된 fixture manifest·문서를 dev에 fast-forward 통합했다.
- 제품 구현은 `96f454364216d492f27e1545d2ad6087cfc8fc44`; 기존 브라우저 검증09c1a5d와 b82cc4b의 backend/frontend diff는0이다. 이번 재개에는 제품 기능·DB migration 변경이 없다.
- DEV API `54bc9c55-bfeb-4d83-8d60-6d2e4ba2561e`, Web `7dbf60b5-bf2f-421e-81d7-932de50ff078`: 같은 b82cc4b, SUCCESS/각1 replica Online. Auth/Postgres Online, pending work0.
- 최종 문서 커밋·그 이후 배포의 정확한 SHA/ID는 배포 확인 후 공유 `final-state.json`에 기록한다. 문서 변경을 제품 재검증 실행으로 세지 않는다.
- PROD는 `6830c5bfaa16a942ccae773ddc1e6040d372f23c` 유지. Web `ef1c672e-4901-4c84-8ed1-4b0ce446304e`, API `77964206-b7e8-4cb5-873e-17c5a60be7f2`. PROD 데이터·구성을 변경하지 않았다.

## 배포 문제 해결

이전 DEV API71d61de2는34분 이상 Metal builder scheduling 로그만 있었다. 정상 서비스 중인 이전 API를 유지한 상태에서 해당 미완료 빌드만 Abort했다. 통합 커밋의 새 API는 정상 빌드·시작했다.

새 DEV Web214b873f는 Turbopack 캐시의 누락된 SST 파일 복원 오류로 실패했다. DEV Web 서비스에만 아래 build command를 적용해 손상된 재사용 캐시를 제거한 뒤 재빌드했고7dbf60b5가 성공했다. 소스 기능·라이브 데이터·PROD 설정은 바꾸지 않았다.

`rm -rf .next/cache/turbopack && npm run build`


빌드 복구 중 Node -e 명령의 중첩 따옴표가 Railpack에서 제거되어 edb06d74가 syntax 오류로 실패했다. 위의 고정된 Linux 빌드 캐시 경로 정리 명령으로 수정했다. 런타임/DB/PROD 변경은 없으며 이 실패도 과거 배포 이력으로 보존한다.
최신 성공 빌드는 production build와 TypeScript를 통과했다. 실패한214b873f는 과거 실패 이력으로 남으며 현재 서비스 장애가 아니다. 새 API startup은 PostgreSQL17.11, public schema87,85개 migration validate, up-to-date/no migration을 확인했다.

## QA 및 증거 경계

| 필수 항목 | 결과·실행 근거 |
| --- | --- |
| 실제390×844 저장/reload | PASS. 이전 인증된 DEV에서 null 저장,38411 수동OFF 저장/reload, 명시ON 저장/reload. dialog390/clientWidth388/scrollWidth388 |
| 사용자 입력 override | PASS. COMPLETED의 직접 양수 입력만 미저장ON. 수동OFF 후 재입력에도OFF. 저장된 임금을 여는 것만으로ON 안 됨 |
| 초안·모달·스크롤 | PASS. 닫기 확인 취소 뒤 초안 보존, 내부 스크롤·저장 버튼 접근, Escape 후 날짜 포커스 복원. 확인창 도구 timeout은 사용자 취소로 해결 |
| MONEY 회귀 | PASS. 소비/수입/근무 메뉴, 분류 적용·해제, 계좌 제외·초기화, 템플릿 관리, 주급, 상세 포커스와 돌아가기. 개인 원장 상세는 공유 증거에서 제외 |
| 예상액 snapshot | PASS. 기존42140→catalog43000 변경 뒤 unrelated edit는42140 유지, 명시 재적용만43000. stale selection409·초안 보존 |
| 주급·입금 | PASS.112970+10000+15000=137970, 포함 인센2000 비가산. 입금 확인은 근무일 기준 별도 집계, 금융 원장 생성 없음 |
| hosted OFF/CANCELLED/archive | PASS.0원·집계 제외·경고 없음, 입금 이력 보존. archive 후 재생성도 같은UUID 사용·중복 없음 |
| 독립 bearer replay | PASS. 별도 정상 GoTrue 세션에서 같은UUID/body/original expectedVersion 즉시 재생 시 canonical 전체·버전·이력 동일. archive 후 같은 낡은 요청409, GET 불변 |
| 정확한 fixture 정리 | PASS. 원본 guarded dry-run 차단→의도한v8 조사→owner/전체 canonical hash 고정 manifest→dry-run 불일치0→exact6 OFF/archive·2 templates 비활성·수당0 |
| hosted history/payment | PASS. 기존 transition/receipt 배열은 OFF 뒤 prefix 유지, archive 뒤 canonical JSON 동일. payments 전후 동일/0. 파생 wageCompatibility만 archive response에 없어 별도 비교 |
| 최종 읽기 smoke | PASS. 새 API 인증 calendar/templates200. 현재390×844에서도0근무·0원·0경고, 두 QA 템플릿 비활성 확인. 이번 재개에서 추가 fixture 쓰기 없음 |
| 인증·가용성 | PASS. 사용자 확인·이메일 일치, templates200, health200, 무인증 templates401, 공개 JWKS200. 임시 토큰0 |

재개 시 새로 실행한 오프라인 도구 검증: PowerShell16/16, Node14/14, diff --check PASS. 설치된 도우미 SHA-256이 Git 원본과 일치한다. 현재 로컬 토큰 파일0을 다시 확인했다. 이전 최종 별도 창의 실제 Validate도 사용자 확인·templates200·토큰 삭제 PASS이며, 이번에 새 password grant를 실행했다고 주장하지 않는다.

과거 제품 자동 테스트는 backend Calendar56/56(실패0/skip0)·bootJar PASS, frontend Calendar65/65·집중13/13·typegen/tsc/scoped lint/build PASS이다. 이번에는 제품 변경이 없어 해당 suite를 재실행하거나 새 실행 수치에 합산하지 않았다. 격리 PostgreSQL18의 dated payment ctid/JSON 불변·V2 예외·V3 snapshot·원장0 증거도 과거 결과이다. 실제 DEV/PROD 전체 DB 원행 hash 대조를 수행했다고 주장하지 않는다.

실제 Android 기기·OS 숫자 키보드·A16/A17은 Task2 책임이다. Chrome390 검증을 Android 기기 검증으로 표현하지 않는다.

## fixture 정리 최종 상태

| 날짜 | UUID | 최종 archived version |
| --- | --- | --- |
|10/14|af60badc-3254-4edc-a05a-84e19f93baf0|10|
|10/15|2007f2c5-fd80-4f80-be8f-abf766edaecd|4|
|10/16|4a562239-e6b0-4244-ae74-b72d5954c42a|3|
|10/17|eb7a2a34-f162-43c0-9407-962c0e79b91e|10|
|10/18|6551f277-fe64-4e92-9287-16ddd142281e|3|
|10/19|6330da53-c011-4fe4-819a-1a5e0f33bba5|3|

두 QA 템플릿은 각각version3/2·inactive, preset IDs 유지.2026-10-11 주간은version2·특근0·주휴0. 활성 QA 기록0·활성 QA 템플릿0. soft archive이므로 원본 이력은 남는다. physical delete·DB reset·원장 endpoint·PROD 요청은 없었다.

10/17의 원본v1 가드는 정상적으로 차단했다. 기존 QA PUT6+archive1로 생긴v8을 canonical/history와 대조한 뒤 별도 reviewed manifest에 owner·UUID/date/version·전체 response SHA-256·week fingerprint를 고정했다. 기존 가드를 삭제하거나 최신 버전을 무조건 수용하지 않았다. 이미 완료한 일회성 cleanup을 다시 실행하면 상태/hash 불일치로 중단하는 것이 정상이다.

실제 성공 실행 코드8184edd, 최종 인증 문서b82cc4b, 원본·reviewed dry-run·exact cleanup·마지막 Validate 증거는 [환경 구축 보고서](https://drive.google.com/file/d/1x2PCZqDrZtRWZsCBgrjMusD3Fl5l77m-/view)에 연결되어 있다.

## 보존·범위와 핸드오프

FIX-001/002, CONFIRMED_DIRECT_V3, V2 계산 근거, 예상액 snapshot, 과거 dated payment·주간 이력을 유지한다. null은0으로 바꾸지 않고, 포함 인센은 가산하지 않는다. 기존 임금 자동 확인·상태 자동 변경·입금 날짜·부분/분할 입금·추가 지급 등록·금융 거래 생성은 없다.

Android는 같은 DEV GoTrue 인증 및 `contractVersion:4` API를 사용한다. 정확한 endpoints/DTO/version/error/보존 규칙은 [ANDROID_API_HANDOFF.md](../../ANDROID_API_HANDOFF.md). Task1 게이트는 충족했으며 Android 구현은 Task2에서 시작한다. PROD 승인은 별도다.

## Git·두 PC 전달

기존 main checkout의 .claude/settings.local.json, frontend/package-lock.json, 미추적AGENTS.md를 보존했다. 다른 MONEY 작업본과 미통합 변경은 건드리지 않았다. 이 작업의 임시 워크트리/브랜치는 통합·배포 확인 뒤 정리하고 상태 파일에 기록한다. 인증 작업본은 별도 작업의 열린 콘솔/소유권을 보존한다.

Google Drive 스킬로 기존 [Task1 폴더](https://drive.google.com/drive/folders/1aF3qGk8Vww1G8Za7SI7vdUaWOOwOnSpT)의 최종 보고서·핸드오프·상태·테스트/정리 요약·증거 ZIP을 갱신하고 metadata/content/바이너리 hash를 검증한다. 과거 NOT_READY 자료는 날짜가 명시된 역사 증거로만 보관한다. 비밀번호·토큰·refresh token·민감 헤더·DB dump·무관한 개인 자료는 제외한다. 전달 규칙은 agent/OPERATING_POLICY.md에 유지한다.

**남은 Task1 blocker: 없음.** 운영상 JWKS 순간 timeout이나 외부 빌드 캐시 장애가 재발할 경우 기존 정상 배포를 유지하며 진단한다. 이를 새 금융 데이터 수정이나 인증 완화로 해결하지 않는다.
