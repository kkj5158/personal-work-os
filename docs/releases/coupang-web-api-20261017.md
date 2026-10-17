# 쿠팡 근무 달력 Web · 공유 API — Task 1 검증

2026-10-17 KST. **NOT_WEB_API_READY**. Web 구현·DEV 배포는 완료되었으나 독립 bearer 재생 검증과 전체 합성 fixture 정리가 미완료다. Android 구현과 PROD 배포는 수행하지 않았다.

## 감사 기준선

- 이번 인증 브라우저 검증 SHA: `09c1a5df8db1339c90e29126ec19944859ea57c4`.
- 제품 구현 SHA: `96f454364216d492f27e1545d2ad6087cfc8fc44`. 위 문서 커밋과의 차이는 핸드오프·보고서·정리 스크립트뿐이다. 이번 closeout에도 제품 코드·마이그레이션 변경은 없다.
- DEV Web `f300a70b-05b3-47ae-b633-f76353200591`, API `c02c8d75-9624-42ff-959d-cec36f09363d`: SUCCESS, 각1/1 실행. Auth/Postgres도 Online, pending work 없음.
- PROD Web `ef1c672e-4901-4c84-8ed1-4b0ce446304e`, API `77964206-b7e8-4cb5-873e-17c5a60be7f2`: 기존 `6830c5bfaa16a942ccae773ddc1e6040d372f23c` 유지.
- 원격 dev/prod를 새로 fetch했다. 기본 checkout의 main과 기존 `.claude/settings.local.json`, `frontend/package-lock.json`, 미추적 `AGENTS.md`는 보존하고 별도 워크트리를 사용했다. 원격 PC의 미커밋 상태는 직접 감사하지 못했다.
- 기존 Drive 보고서·핸드오프·README·final-state·ZIP을 먼저 읽었다. 내려받은 기존 ZIP의 MD5 `043952e213621e7553812bc9fde944f8`는 로컬 원본과 일치했다.

## 구현·보존 계약

기존 earnings endpoint를 `contractVersion:4`로 확장했다. null 미확정 저장, 서버 프리셋 버전·예상액 스냅샷, 날짜 없는 입금 확인·정정 이력을 원자적으로 저장한다. 날짜 한 번으로 편집기를 열며 COMPLETED의 의도한 양수 일급 입력만 미저장 ON을 선택한다. 같은 편집 세션의 수동 OFF는 재입력 후에도 유지된다. 저장된 임금을 여는 것과 상태 변경만으로 입금을 확인하지 않는다.

FIX-001/002, CONFIRMED_DIRECT_V3, V2 계산 근거, 일–토 주급, 포함 인센 비가산, 과거 dated payments를 보존한다. 새 금융 거래·부분 입금·분할 입금·입금 날짜·추가 지급 등록은 없다. 새 Flyway migration도 없다. 정확한 DTO는 [API 핸드오프](../../ANDROID_API_HANDOFF.md)에 있다.

## 이번 DEV QA — 새 실행

URL은 모두 `https://workflow-web-development-development.up.railway.app` 아래다. 기존 정상 로그인 Chrome 세션을 사용했다. 독립 API 클라이언트 검증과 구분한다.

| 항목 | 결과·증거 |
| --- | --- |
| 가용성·인증 | health200, 무인증 templates401, 공개 JWKS200. 인증 UI 읽기·저장 HTTP200 |
| 실제390×844 | 선택된 DEV 탭 DOM width390/height844. dialog width390/clientWidth388/scrollWidth388, 높이812/top32/bottom844 |
| null 저장 | 10/17 allowlist 기록 템플릿·프리셋 선택 후 COMPLETED/null 저장·페이지 reload. 빈 일급·OFF 확인 |
| 자동ON·수동OFF | 38410 입력 후ON, 수동OFF,38411 재입력에도OFF. 저장·reload 후38411/OFF. 저장된 임금 재열기만으로ON 안 됨 |
| 새 세션·명시ON | 새 직접38412 입력에서ON. 이후 수동OFF→38413 초안 보존.38411/명시ON 저장·reload 후ON |
| 초안 보호 | 닫기 확인창 API timeout. 사용자가 취소한 뒤38413/OFF 초안 보존 확인. 보안·인증 우회 없음 |
| 스크롤·포커스 | 내부 scrollTop606/scrollHeight1325/clientHeight719. 저장 버튼 bottom815 이내. Escape 후 날짜 버튼 포커스 복원. 실제 OS 숫자 키보드 노출은 미실행 |
| MONEY 회귀 | 모바일 메뉴→소비→분류 적용·해제→계좌 제외·초기화→수입→근무. 필터 재조회200. 기본1905×855에서도 소비·수입 재조회·상세 닫기 포커스 복원 |
| 금융 원장 독립성 smoke | 임금·입금 QA 전후 소비·수입 요약 동일. 전체 DB 원행 대조를 뜻하지 않으며 개인 거래 내용은 증거에서 제외 |
| 템플릿 관리 | 기존 두 QA 템플릿 전환,43000/84280 프리셋·기본 시각·활성 상태 읽기. 이번 템플릿 저장 없음 |
| 주급 | QA 복원 후112970+10000+15000=137970, 포함 인센2000 비가산, 입금 합계0. 주 수당 저장 없음 |
| CANCELLED | 같은10/17 기록 취소 저장·reload. 실근무0/일급0·경고 없는 취소 셀, 주급137970. 이전 입금38411 정정 이력 유지 |
| OFF·archive | 같은 기록OFF 저장·reload, 휴무 셀·경고 없음. remove-off POST200 후 빈 날짜. 재열기·복원 PUT200은 같은 UUID, 활성 기록 수6 유지 |

실제390px 증거는 이번에 새로 촬영했다. 과거 `dev-narrow-save.png`는 데스크톱 이미지라 모바일 증거로 사용하지 않는다. 이번 `dev-390-off-reloaded.png`는38411/미입금 날짜 셀이고, ON/null/history 이미지는 실제 편집 시트이다. 최종 정상 저장 상태에서 시트를 닫고 viewport override를 해제했다. Chrome390 검증을 실제 Android 기기/OS 키보드 검증으로 확대 주장하지 않는다.

## 과거 자동 테스트 — 이번 재실행 아님

- backend `b27e6fac6caf4991b55d373a4194f9d2c4d0f39a`: Calendar56/56, 실패0·skip0, bootJar PASS.
- frontend `923dea651628e9387a10b6fef031eaed80e39ad0`: Calendar65/65, 집중13/13, typegen·tsc·scoped ESLint PASS.
- 통합 제품96f4543 production build PASS.
- 전용 loopback PostgreSQL18에서 dated payments의 ctid·JSON이 ON→정정→OFF 동안 불변, V2 예외·V3 스냅샷 보존, 원장0 검증. DB는 이미 종료됨.
- 이전 인증 데스크톱에서 stale template409·동시 편집409·초안 보존·서버 값 비교, 프리셋42140→43000 변경 후 메모만 수정하면42140 유지·명시 재적용만43000 반영 확인.
- 제품 변경이 없어 suite/build 재실행 없음. 이번 정리 스크립트 node --check PASS.

## fixture 정리 — 미완료

원본 `qa/coupang-dev-fixture-cleanup.mjs`를 검토하고 default read-only 모드로 실행했으나 `COUPANG_DEV_ACCESS_TOKEN_FILE` 미설정으로 HTTP 요청 이전 exit1이었다. owner·UUID·버전·legacy payments·주 수당 사전조건을 검증했다고 주장하지 않는다. --execute는 실행하지 않았고 버전 가드를 바꾸지 않았다.

추가 QA로10/17 UUID `eb7a2a34-f162-43c0-9407-962c0e79b91e`에 PUT6회와 archive POST1회가 성공했다. 원래v1에서 증가 예상치는v8이나 canonical JSON version을 별도 bearer GET으로 확인하지 못했으므로 검증된 값으로 쓰지 않는다. 최종 UI는 원래 COMPLETED/null·예상84280·입금OFF·09–13시·메모로 복원했고 정정 이력은 남았다. 기존 스크립트의v1 가드는 이제 불일치해야 한다. 인증 확보 후 원래 dry-run을 먼저 실행하고, 이번 요청 근거와 canonical 이력·전체 의존성을 대조해 정확한 새 manifest를 검토한다. 단순 버전 변경으로 통과시키지 않는다.

나머지5개 기록·2개 템플릿·주 수당에는 이번 쓰기가 없다. 전체6개 활성 합성 기록, 두 QA 템플릿,10/11 특근10000·주휴15000이 남는다. archive는 QA 후 복원했으므로 정리 완료가 아니다. 물리 삭제·SQL DELETE·DB reset·원장 변경은 수행하지 않았다.

## 남은 준비 게이트

| 미완료 요건 | 이유·다음 조치 |
| --- | --- |
| 독립 hosted bearer 즉시 동일 요청 재생·intervening edit409 | Chrome 로그인과 별개인 API 인증 파일 없음. 권한 있는 정상 DEV 토큰 파일로 원래 expectedVersion·동일 UUID/body를 재생해 version/history 불변 확인 |
| 전체 합성 fixture 안전 정리 | 인증 부재 및10/17의 의도한 버전 변경. owner·record/version/history·payments·template/week 전체 대조 후 검토된 exact manifest로만 soft cleanup·재조회 |
| hosted 보존의 전체 JSON readback | UI의 입금 이력·집계 제외·UUID 재사용은 확인. work version과 transition payload/legacy 배열 전체 대조는 위 인증 클라이언트로 마무리 |

따라서 **NOT_WEB_API_READY**. Android 기준 제품 SHA는09c1a5d이나 Task2 착수 게이트는 미충족이다. A16/A17 Android 통합·실기기 검증은 Task2 책임이며, 이를 Task1 준비의 선행 요건으로 추가하지 않는다.

## 두 개발 환경의 보고서 전달

태스크 종료 시 최종 보고서·핸드오프·상태·검증 요약·정리 보고서·증거 ZIP을 기존 [Task1 Drive 폴더](https://drive.google.com/drive/folders/1aF3qGk8Vww1G8Za7SI7vdUaWOOwOnSpT)에 갱신하고 metadata/content를 재조회한다. 로컬만 전달하면 완료가 아니다. 기존 계정·권한을 유지하며 인증 값, DB 원본, 무관한 개인 금융 내용을 제외한다. 규칙은 `agent/OPERATING_POLICY.md`에도 반영한다.
