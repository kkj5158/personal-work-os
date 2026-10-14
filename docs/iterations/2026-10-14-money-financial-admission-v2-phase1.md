# MONEY Financial Admission V2 Phase 1 — 구현 보고서

2026-10-14 / Asia/Seoul. 합성·격리 검증과 실제 운영 관측을 구분한다. PROD 배포와 과거 Review 자동 재등록은 이 작업에서 금지한다.

## 구현 결과

일반 은행 입출금의 좁은 `급여 ` 접두어·업종 키워드 조건을 제거했다. 지원 parser/shape·원화·양수 금액·방향·시각·소유 계좌·source identity를 검증한 뒤 금융 의미와 주변 충돌을 평가한다. 분류 카테고리가 없어도 수입·지출을 등록한다.

이체는 기본 발생 시각 60초, 동일 금액·통화, 서로 다른 확인된 소유 계좌와 상호 유일한 근거를 사용한다. provider time이 있으면 서로 다른 상대방 표시를 허용한다. 명시 두 계좌 route와 명확한 쌍은 즉시 처리한다. 단일 알림 관찰은 server received_at 기준 10초로 줄였으며 durable schedule/after-commit dispatch를 유지했다.

장부에 별도 read-only processing projection을 추가했다. RECEIVED 원문도 메모리에서 파싱하여 계좌를 확인하면 `처리 중`으로 보인다. 원장에 임시 거래를 넣지 않는다. 확정 source 링크가 생기면 관측 행을 제외하고 canonical `sourceRawEventIds`로 stale 화면의 중복도 막는다. 합계·donut·저축·잔액·선택·분류 Save·학습은 canonical 데이터만 사용한다.

후발 알림은 사용자 확정·수동·취소·병합 사실까지 충돌 문맥에서 확인한다. 기존 수입/지출을 SQL로 이체로 바꾸거나 소유자 판단을 덮어쓰지 않는다. 같은 잔액/은행 발생 시각의 재수집은 거래처 표시가 달라도 검토하고, 정상 잔액 흐름이 증명된 동일 금액 반복은 별도 거래로 유지한다.

학습 DIRECT/CONFIRMED·provider 결과는 추천으로 남긴다. Legacy category worker와 synchronous merchant rule은 승인 rule/version 및 적용 권한을 재확인한다. 기존 manual rule의 승인 의미를 보존하며 AI_APPROVED에는 별도 automaticRules 권한과 승인 identity를 적용한다. 새 개인 급여 규칙·M-007 후보 engine·동의 UI·schema migration은 추가하지 않았다.

## 이전과 새 정책

| 항목 | 이전 | Phase 1 |
| --- | --- | --- |
| 일반 IN | `급여 ` 접두어 필수 | 구조·계좌·금융 문맥과 충돌 검증 |
| 일반 OUT | 제한된 business regex 필수 | 낯선 거래처도 적격 ordinary admission |
| 이체 시각 | posted 10초 + provider 90초 | provider 발생 60초 기본; Android-only corroborated fallback 별도 |
| 상대방 문구 | equality 또는 savings 특례 | 유일한 provider-timed owned graph에서 차이 허용 |
| 단일 관찰 | parse 시각 기준 2분 | server ingestion 기준 10초 |
| 장부 가시성 | canonical 등록 후 | 안전한 owned processing observation부터 |
| 후발 자료 | 같은-type route overlap 중심 | opposite·legacy·manual·canceled/merged·기존 transfer source overlap 보호 |
| review 설명 | ordinary 실패를 상대 계좌 오류처럼 표시 | 계좌/이체/중복/필수 사실/dedicated operation을 분리 |
| legacy category auto | learned/provider 직접 persist 가능 | 승인된 현재 rule만 persist; 그 외 추천/owner Save |
| live refresh와 picker | 페이지 이탈 시 local popup state 손실 가능 | 실제 popup 초안을 owner-scoped memory로 보존 |

일반 merchant/payroll 문구는 admission의 허가 목록이 아니다. 명백한 external 의미와 numeric 외부 경로는 우연히 겹친 OUT/IN을 이체로 묶지 않는 보조 veto다. 이체 60초 바깥 61초의 잠재 쌍은 90초 safety neighborhood에서 검토한다. 반대 알림의 소유 계좌 자체가 미해결이면 기존 600초 posted-time 보호 범위를 유지한다. 별도 수수료/다른 gross-net 금액을 임의로 추론하지 않는다.

## 변경 구성요소

Backend: VerifiedMoneyTransferMatcher, MoneyOrdinaryAdmission, MoneyProcessingService, MoneyService의 automatic recent-fact/category guard, MoneyClassificationAutomaticService, MoneyReviewAdmission 사유 연결, MoneyWebService source ID projection. 새 MoneyProcessingReadService/Controller 및 MoneyAdmissionReasons.

Frontend: MoneyBookkeeping, MoneyProcessingRows, processing filter/type/cache, reviewReasons. 기존 RecommendationCategory popup의 draft retention만 보강했다. 새 top navigation, 독립 provisional 화면, 대규모 UX 변경은 없다. 동시 UX worktree의 파일·branch·미커밋 작업을 편집하지 않았다.

상세 정책은 [financial admission contract](../contracts/money-financial-admission-v2.md), 시나리오/재현은 [test matrix](2026-10-14-money-admission-test-matrix.md), 환경은 [read-only preflight](2026-10-14-money-admission-environment-preflight.md)를 따른다.

## 실제 측정 경계

동일한 16개 합성 시나리오에는 정상 ordinary 11개, 적격 transfer 4쌍과 ambiguity/duplicate/boundary 자료가 있다. 운영 raw·계좌 식별자·credentials는 사용하거나 업로드하지 않았다. 각 버전의 동일 matcher corpus를 1,600회 실행한다. baseline MONEY 소스는 시작 6cfdff7과 이후 c2679e2 사이에 diff가 없다.

| 동일 합성 corpus | 이전 | 신규 |
| --- | ---: | ---: |
| 적격 ordinary proposal | 4/11 (36.36%) | 11/11 (100%) |
| 서로 다른 counterpart 적격 transfer | 0/4 | 4/4 |
| Review source | 22 | 7 |
| false transfer / false duplicate suppression | 0 / 0 | 0 / 0 |
| source 중복 canonical proposal | 0 | 0 |

Proposal 수치는 실제 운영 canonical 건수와 다르다. 실제 DB tests는 별도로 한 transfer의 두 sources, 확정 후 후발 zero new fact, transport/source replay, minute/balance 독립 반복, cancellation preservation을 확인한다. 운영 전체 자동화율이나 장기 오류율 개선으로 일반화하지 않는다.

`System.nanoTime` matcher-only 비교는 before 평균 216.941µs, p50 127.400µs/p95 360.700µs/p99 860.300µs; 배포 소스2d4759d의 마지막 after는 평균393.304µs, p50 170.800µs/p95 900.500µs/p99 3,991.900µs였다. 중간 after 측정370.558/710.629µs도 원본 영수증에 보존한다. 추가 safety graph 평가 비용과 CPU/GC 변동이 있으며 CPU 속도 개선을 주장하지 않는다. 실제 대기 정책 변화와 in-memory 계산 시간은 서로 다른 측정이다.

가장 최근 e06db61 격리 PostgreSQL service의 실제 received_at→projection 조회12건: 평균15.82425ms, p50 8.2029ms, p95 43.3962ms. 같은12건의 real10.1초 관찰 뒤 직접 dispatch 완료: 평균10,335.68335ms, p50 10,346.0766ms, p95 10,437.3736ms. 앞선 full run에서는 각각 평균3.6945ms/10,242.9237ms였다. HTTP/브라우저 paint/Android 전달/스케줄러 jitter가 포함되지 않으며 전후 hosted SLA 측정은 아니다.

50 processing rows를5회 읽은 SQL 수는 매회2개였다. 최근 delta 측정 시간은20.5001/16.7103/9.8770/11.6001/14.3679ms. Source polling3초마다 이 read, canonical list9초마다 기존4 SQL read를 추가하므로 visible 한 페이지에서 기본 추가량은 약67 SQL/min이고 완료 transition의 다른 mounted projection invalidation 비용은 별도다. 숨겨진 페이지에서는 폴링이 중단된다. source aggregate는 list projection에서 기존 index를 사용하며 새 application N+1은 없다.

## QA 상태

실제 결과와 각 SHA/XML hash는 [sanitized evidence JSON](2026-10-14-money-admission-evidence.json)에 기록했다. 전체 backend451건 중449 PASS·실기기/paid AI2 opt-in skip·실패0(c5212e2, 당시 dirty는 미추적 문서뿐), 이후 numeric external route/gross-net 안전 조건119건 PASS(clean e06db61), 마지막 설정 window 수정 두 matcher suite40건 PASS(배포 소스2d4759d)다. 중복 실행 수를 고유 테스트 수로 합산하지 않는다. 실제 격리 DB 이체 harness39/39 PASS와 PG/schema/port cleanup PASS를 확인했다. Frontend134/134·lint·전체type·production build PASS. 134건 후 추가된 frontend 변경은 NET_GROSS_TRANSFER_CONFLICT 한국어 사유1개이며 최종type/lint/build에 포함된다.

실패한 중간 영수증은 유지한다. 처음 새 isolation assertion은 overview의 동적 balanceAsOf까지 비교해 실패하여 금융 값만 비교하도록 수정했다. 이후 full run의 두 legacy scheduler fixture는 parse.created_at만 과거로 만들어 receipt maturity에 맞지 않았으며 synthetic received_at을 관찰 window에 맞게 설정하고 재검증했다. CSS loader를 제외한 실행 실패도 명시했다. 기존39건 harness의 T02/T03/T05/T22/T25는 새 승인 정책으로 기대값을 변경했다. T25의 이전 counterpart equality 기대 때문에 중간38/39였고, 새 요구사항대로 transfer1/source2/income·expense0을 확인한 최종39/39를 별도로 보관했다.

초기 backend agent 테스트1회는 오래된 공유 Supabase 읽기 전용 설정을 상속했다. CREATE SCHEMA가 SQLSTATE25006으로 fixture 생성 전에 거절되어 중단했고 공유 DB 변경·cleanup은 수행하지 않았다. 최종 자동 회귀는 모두 credential 상속을 차단한 owned loopback PG에서 실행했다.

실제 유료 AI·실기기는 opt-in으로 제외한다. server restart 검증은 persisted due/source를 사용한 새 worker/matcher instance 범위이며 hosted JVM crash/재시작 실험과 동일하지 않다.

## 환경·배포·승격

현재 DB는 DEV pos_dev_final / PROD pos_prod_final, Railway PostgreSQL17.11·GoTrue, auth mirror false다. 읽기 전용 확인에서 양쪽 Flyway81개 성공·최종 V83/checksum1001497463·실패0·전체 로컬 migration checksum 일치였다. 과거 Supabase cutover 미확인 문구를 현재 blocker로 쓰지 않았다. 신규 migration은 없다. 기존 realtime의 NOT VALID check1은 MONEY와 무관하며 수정하지 않았다.

현재 tool의 첫 browser entry 계약에 metadata-only connection inventory가 없어, 승인 TEAM KAFKA 기존 process까지 bootstrap 확인했으나 browserId/extension match/claim/DOM/auth는 확인하지 못했다. 개인 tab inventory, 새 headless profile, 새 CDP/debug endpoint, Chrome group 조작으로 우회하지 않았다. 따라서 native authenticated DEV 화면·실제 UI ingestion-to-paint는 미검증이다. 이는 group/tracing API 부족에 따른 blocker가 아니다.

DEV는 테스트·현재 release/inspection ownership 확인 후 clean 소스 `2d4759dd733546277e8cb39683e485d14e695348`를 명시 service ID로 직접 upload했다. API `dc048c5b-542f-43fa-abc0-b43f8bca832a`는04:46:48 UTC SUCCESS, 웹 `7fb6bb4f-6ace-4e11-8fc0-af0b062032e5`는04:49:51 UTC SUCCESS다. Railway manual upload metadata에는 commitHash가 없어 소스 SHA는 로컬 clean upload provenance로 증명한다. DEV4서비스 online·issues0·pendingWork0을 확인했다. API health200·웹login200·새 processing 비인증401을 확인했으나 이를 owner login 성공으로 해석하지 않는다.

최초 성공 뒤 다른 dev push1e24a0f가04:54 UTC 자동 배포로 MONEY를 교체했다. 최신 커밋의 변경은 `qa/workpad-dev-inspection.mjs`뿐이었고, 이를 로컬 dev 통합8c5af48에 보존했다. backend/frontend가 검증 소스2d4759d와 동일한 것을 Git diff로 확인했다. 진행 배포 종료·공유 잠금 없음 확인 후 최초 성공 build를 명시적으로 재사용했다. **최종 DEV API `c96ebb99-3a34-4e76-9141-33488a0c8949` SUCCESS05:00:03 UTC, 웹 `0ee3f115-b6aa-421a-8e87-41184f5fe596` SUCCESS04:59:54 UTC**다. 최종4서비스 online·pending0·issues0, health/login200·비인증processing401을 다시 확인했다. 최종 source는 새 build를 추정한 값이 아니라 명시 재사용한 최초2d4759d build다.

API startup에서 Flyway81개 validate 성공·현재V83·No migration necessary를 직접 확인했다. 최종 재배포04:59:56 UTC에도 같은 validation/no migration을 확인했다. 배포 뒤 읽기 전용 DEV/PROD checksum도 일치했다. 04:39:52→04:51:33 UTC와 최종05:00:23 UTC의 기존 DEV owner 보존 비교에서 거래·계좌·대출·categories·overrides·classification state/events·registration events·source links·immutable RAW·owner identity 모두 동일했다. cutoff 이전 확정 기록을 비교했고 정상 신규 traffic과 RAW processing 상태는 제외했다. private owner/count/digest는 ignored 영수증에만 남긴다. owner 인증은 DB identity 보존과 anonymous access control까지이며 native owner session은 미검증이다.

Git dev push는 PROD Auth source도 dev이므로 수행하지 않았다. PROD 배포·auth 변경·schema 변경·backfill은 없다. PROD promotion은 native authenticated DEV smoke와 소유자 별도 승인 전에는 **NOT READY**다.

Rollback은 동일 DEV service의 MONEY 이전 API `e2fbe415-4df8-4cf4-98ad-32f0290d376f`와 웹 `005ce44b-dbc5-4502-bd86-620dce4c625a` build를 명시하여 재사용하는 방식이다. 두 build 모두 connector의 canRollback=true였으며 소스는 `1e24a0f97dfe69db9f693de66c3993406a473029`다. 필요하면 그 SHA를 별도 clean checkout에서 같은 DEV service ID로 upload한다. 두 서비스 rollback 후 health/login/access-control과 owner 금융 보존을 다시 확인한다. schema drop/restore/repair, 기존 사실 삭제, cancellation/history 제거를 하지 않는다. 이미 새 정책으로 생성된 정상 거래는 application rollback으로 지우지 않고 source/owner/version 계약을 보존한다. 과거 financial fact를 새 rule로 소급 재등록·재분류하지 않는다.

## 통합 handoff와 한계

V6 확정 ID·선택·직접 Save·Review preview·취소/복원·refund/loan 계약을 유지한다. Processing API/sourceRawEventIds는 additive이고 concurrent UX redesign에 같은 financial policy를 전달할 수 있다. 미래 개인 금융 규칙은 이 admission safety gate를 우회할 수 없으며 별도 승인/권한 설계가 필요하다.

은행 고유 movement ID가 없거나 minute precision/미확인 source identity가 남으면 Review가 필요할 수 있다. 완전 자동 late income/expense→transfer reconciliation은 Phase2다. 공교롭게 같은 금액·시각의 generic 외부 문맥에 대한 운영 장기 오매칭률은 미측정이며 합성 fixture의0을 운영0으로 주장하지 않는다. 500 financial graph/200 processing projection cap의 기존/신규 범위 제한은 보존한다.

구현·격리 검증·허용된 DEV 배포 완료, 인증 DEV smoke 미검증이므로 Phase1 전체 acceptance/PROD promotion은 보류한다. 배포 구현 SHA는 위2d4759d이며 뒤따르는 최종 보고/evidence commit은 문서만 변경한다. 최신remote dev1e24a0f를 포함하는8c5af48로 로컬 dev fast-forward 통합을 완료했다. task용4개 worktree/branch는 clean·patch 보존 확인과 raw QA archive checksum 검증 후 정리한다. `origin/dev` push는 금지된 PROD 영향 가능성 때문에 수행하지 않는다. 원래 main의 .claude/AGENTS 수정·staged Authoring 이미지·untracked audit/SLEEP 자료는 보존한다. raw QA 영수증은 `F:/artifacts/money-financial-admission-v2-20261014-2d4759d`에 보존하고 이 report의 evidence JSON은 private 금융 payload/owner/account 식별자를 포함하지 않는다.

다음 승격 검증은 승인 TEAM KAFKA 연결·claim·fresh Phase2 preflight를 완료한 뒤 owner 로그인, 정상 알림→processing→canonical, 합계 불변, 후발/중복, 열려 있는 category picker 유지와 실패 Save를 실제 DEV 화면에서 확인하는 것이다. 새 debugging interface·개인 profile·우회 headless 사용은 승인 범위 밖이다. 별도 owner PROD 승인 후에도 현재 release/migration ownership과 배포 소스를 다시 확인해야 한다.
