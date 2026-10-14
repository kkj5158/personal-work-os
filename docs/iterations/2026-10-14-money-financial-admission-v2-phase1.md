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

`System.nanoTime` matcher-only 비교는 before 평균 216.941µs, p50 127.400µs/p95 360.700µs/p99 860.300µs; after 평균 370.558µs, p50 187.700µs/p95 805.200µs/p99 1,822.200µs였다. 추가 safety graph 평가 비용과 CPU/GC 변동이 있으며 CPU 속도 개선을 주장하지 않는다. 실제 대기 정책 변화와 in-memory 계산 시간은 서로 다른 측정이다.

격리 PostgreSQL service의 실제 received_at→projection 조회 12건: 평균 3.6945ms, p50 2.055ms, p95 18.1271ms. 같은 12건의 real 10.1초 관찰 뒤 직접 dispatch 완료: 평균 10,242.9237ms, p50 10,240.1477ms, p95 10,273.6207ms. HTTP/브라우저 paint/Android 전달/스케줄러 jitter가 포함되지 않으며 전후 hosted SLA 측정은 아니다.

50 processing rows를 5회 읽은 SQL 수는 매회 2개였다. 시간은 13.1023/4.9928/9.7626/9.2219/15.5979ms. Source polling 3초마다 이 read, canonical list 9초마다 기존 4 SQL read를 추가하므로 visible 한 페이지에서 기본 추가량은 약 67 SQL/min이고 완료 transition의 다른 mounted projection invalidation 비용은 별도다. 숨겨진 페이지에서는 폴링이 중단된다. source aggregate는 list projection에서 기존 index를 사용하며 새 application N+1은 없다.

## QA 상태

최종 코드의 backend full regression, 좁은 safety delta, 39-case transfer DB harness, frontend134/type/lint/build 결과와 각각의 SHA·명령·XML hash는 evidence JSON에 확정하여 기록한다. 실패한 중간 영수증은 유지한다. 처음 새 isolation assertion은 overview의 동적 balanceAsOf까지 비교해 실패하여 금융 값만 비교하도록 수정했다. 이후 full run의 두 legacy scheduler fixture는 parse.created_at만 과거로 만들어 receipt maturity에 맞지 않았으며 synthetic received_at을 관찰 window에 맞게 설정하고 재검증했다. CSS loader를 제외한 실행 실패도 명시했다.

실제 유료 AI·실기기는 opt-in으로 제외한다. server restart 검증은 persisted due/source를 사용한 새 worker/matcher instance 범위이며 hosted JVM crash/재시작 실험과 동일하지 않다.

## 환경·배포·승격

현재 DB는 DEV pos_dev_final / PROD pos_prod_final, Railway PostgreSQL17.11·GoTrue, auth mirror false다. 읽기 전용 확인에서 양쪽 Flyway81개 성공·최종 V83/checksum1001497463·실패0·전체 로컬 migration checksum 일치였다. 과거 Supabase cutover 미확인 문구를 현재 blocker로 쓰지 않았다. 신규 migration은 없다. 기존 realtime의 NOT VALID check1은 MONEY와 무관하며 수정하지 않았다.

현재 tool의 첫 browser entry 계약에 metadata-only connection inventory가 없어, 승인 TEAM KAFKA 기존 process까지 bootstrap 확인했으나 browserId/extension match/claim/DOM/auth는 확인하지 못했다. 개인 tab inventory, 새 headless profile, 새 CDP/debug endpoint, Chrome group 조작으로 우회하지 않았다. 따라서 native authenticated DEV 화면·실제 UI ingestion-to-paint는 미검증이다. 이는 group/tracing API 부족에 따른 blocker가 아니다.

DEV는 테스트·현재 release/inspection ownership 확인 후 명시 service ID upload 경로를 사용한다. Git dev push는 PROD Auth source도 dev이므로 자동 수행하지 않는다. 배포 ID/SUCCESS/health/Flyway/운영 preservation은 별도 release evidence에 기록한다. PROD promotion은 native authenticated DEV smoke와 소유자 별도 승인 전에는 준비 완료로 판정하지 않는다.

Rollback은 동일 DEV service에 검증된 이전 application source/build를 배포하는 방식이다. schema drop/restore/repair, 기존 사실 삭제, cancellation/history 제거를 하지 않는다. 이미 새 정책으로 생성된 정상 거래는 application rollback으로 지우지 않고 source/owner/version 계약을 보존한다. 과거 financial fact를 새 rule로 소급 재등록·재분류하지 않는다.

## 통합 handoff와 한계

V6 확정 ID·선택·직접 Save·Review preview·취소/복원·refund/loan 계약을 유지한다. Processing API/sourceRawEventIds는 additive이고 concurrent UX redesign에 같은 financial policy를 전달할 수 있다. 미래 개인 금융 규칙은 이 admission safety gate를 우회할 수 없으며 별도 승인/권한 설계가 필요하다.

은행 고유 movement ID가 없거나 minute precision/미확인 source identity가 남으면 Review가 필요할 수 있다. 완전 자동 late income/expense→transfer reconciliation은 Phase2다. 공교롭게 같은 금액·시각의 generic 외부 문맥에 대한 운영 장기 오매칭률은 미측정이며 합성 fixture의0을 운영0으로 주장하지 않는다. 500 financial graph/200 processing projection cap의 기존/신규 범위 제한은 보존한다.

최종 Git SHA·local dev integration·배포 상태·작업트리 정리와 QA 영수증 위치는 완료 시 아래에 기재한다. 원래 main의 .claude/AGENTS 수정·staged Authoring 이미지·untracked audit/SLEEP 자료는 보존한다.

완료 영수증: 최종 검증 후 기록.
