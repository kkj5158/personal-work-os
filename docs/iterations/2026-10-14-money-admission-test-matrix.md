# Financial Admission V2 Phase 1 — 재현·검증 범위

합성 데이터만 사용한다. 현재 실행 영수증은 구현 보고서와 evidence JSON에 기록하며 과거 V6 영수증을 이번 실행으로 합산하지 않는다. 아래는 테스트별 실제 검증 경계다.

| 요청 시나리오 | 자동 검증 위치 | 검증 경계 |
| --- | --- | --- |
| 같은 은행·다른 은행 이체, 서로 다른 상대방 표시 | VerifiedMoneyMatcherTest, MoneyFinancialAdmissionV2Test, MoneyProcessingReadPostgresTest.pairWithDifferentCounterpartTextPostsImmediatelyAndRemovesBothRows | 순수 그래프 + 실제 격리 DB canonical/source 저장 |
| 명시 두 소유 계좌 단일 알림 | VerifiedMoneyMatcherTest, MoneyTrustPassPostgresTest | 기존 route·소유권·원문 연결 보존 |
| 5/10/30/59/60/61초 | MoneyFinancialAdmissionV2Test.crossBankDifferentCounterpartsMatchAtFiveTenThirtyAndFiftyNineSecondsButNotSixtyOne | provider second fixture, 61초는 Review |
| 경쟁 쌍·동일 금액 독립 이체 | MoneyFinancialAdmissionV2Test.completeCompetingGraphIsAmbiguousAndCounterpartCorroborationDistinguishesLegitimatePairs, VerifiedMoneyMatcherTest | 상호 유일 근거·금액 반복만으로 병합하지 않음 |
| 적금·auxiliary | VerifiedMoneyMatcherTest, MoneyTrustPassPostgresTest, 기존 39건 transfer harness | 기존 특례 유지, 취소·병합 대상 연결 제외 |
| 미확인·모호한 계좌, cross owner | MoneyFinancialAdmissionV2Test, MoneyProcessingReadPostgresTest, MoneyPostgresIntegrationTest, MoneyControllerSecurityTest | scoped registry·SQL·인증 route 보호 |
| 접두어 없는 급여·쿠팡·프리랜서·낯선 입출금 | MoneyFinancialAdmissionV2Test.unfamiliarPayrollSettlementAndMerchantsAdmitWithoutCategory, MoneyOrdinaryAdmissionTest, AdmissionCorpus | 문구 allowlist 제거·분류 없는 registration |
| 통화·amount/direction/source 부족 | MoneyOrdinaryAdmissionTest, MoneyFinancialAdmissionV2Test.missingRequiredFactsProduceSpecificReviewWithoutDiscardingSourceEvidence, MoneyParserContractTest, MoneyReviewBatchPostgresTest | 원문/분석 currency conflict·지원 shape/package |
| 환불·대출·취소·저축 의미 | MoneyFinancialAdmissionV2Test.specialRefundLoanAndSavingsSemanticsRequireDedicatedOperations, MoneyFinancialPostgresTest, MoneyV6RegistrationPostgresTest | dedicated command·연결·상환 잔액·취소복원 |
| 단일 관측 10초 및 즉시 pair | MoneyFinancialAdmissionV2Test.observationBoundaryRestartAndJobReplayRetainSourceIdentity, MoneyProcessingReadPostgresTest.measureServerIngestionVisibilityAndRealObservationDecision | persisted receipt 기반 maturity, 실제 10.1초 한 번 대기 |
| 10초 이후 아직 미등록 두 알림 | MoneyFinancialAdmissionV2Test.secondNotificationAfterTenSecondsStillPairsWhenNeitherSideIsPosted | 대기가 pair 등록을 늦추지 않음 |
| 확정 후 후발 알림 | MoneyProcessingReadPostgresTest.latePairDoesNotRewriteConfirmedExpenseOrCreateSecondFact, V2 late/legacy/manual tests | 기존 fact ID/version/payload 불변·새 fact 0 |
| Android 지연·bank precision·fallback | MoneyFinancialAdmissionV2Test.providerTimeControlsDelayedAndroidDeliveryAndConclusivePairDoesNotWait, missingBankTimestampUsesOnlyExplicitTestedAndroidCounterpartFallback, VerifiedMoneyParserTest | provider timestamp 우선·명시 Android fallback |
| 재시작·job replay | V2 observation restart test, MoneyTrustPassPostgresTest, MoneyPostgresIntegrationTest | 새 matcher/worker와 persisted due/source; 실제 hosted JVM 종료/재시작 실험은 미실행 |
| transport exact replay·key 재사용 payload conflict | MoneyPostgresIntegrationTest, MoneyBridgePostgresTest | 같은 RAW 반환·conflict·canonical source unique |
| 동일 움직임·표시명 변화·동일 금액 정상 반복 | V2 duplicate tests, MoneyProcessingReadPostgresTest.independentEqualAmountPaymentsWithinOneProviderMinuteUseDistinctBalanceFlow, recapturedSameMovementKeepsOneFactAndSpecificOverlapReview, recaptureWithDifferentCounterpartFormattingStillUsesSameBankBalanceIdentity | minute/balance progression과 source identity를 별도 검증 |
| 이미 등록된 사실·사용자 판단·취소·병합 | V2 legacy/owner/cancellation tests, MoneyProcessingReadPostgresTest.legacyOwnerProvenanceAndCancelledFactsCannotBeSilentlyRecreated, MoneyV6RegistrationPostgresTest | 자동 복원·재해석 없음 |
| unrelated equal OUT/IN | V2 explicit unrelated test + numeric external-route identity test | 명시 external 문맥/반대 경로 conflict를 이체로 병합하지 않음 |
| 입수 직후 processing·confirmed 전환·중복 row 방지 | MoneyProcessingReadPostgresTest, MoneyProcessingRows.test.tsx, processing.test.ts | 실제 DB service projection + mocked React cache polling; native browser evidence와 구분 |
| terminal Review·검토 navigation | MoneyProcessingReadPostgresTest.terminalReviewHasSpecificReasonAndAccountScopeIsMandatory, MoneyProcessingRows.test.tsx | 안정된 code·한국어 reason·기존 페이지 연결 |
| 합계·donut·savings·balance·학습 제외 | MoneyProcessingReadPostgresTest.projectionDoesNotEnterAnyFinancialOrLearningStore, frontend processing tests, MoneySavingsReadPostgresTest, MoneyReconciliationReadPostgresTest | canonical/analytics 전용 store 분리·no write |
| 자동 갱신·기존 picker/선택 보존 | MoneyProcessingRows.test.tsx, MoneyCategoryPopupDraft.test.tsx, MoneyCategoryTree.test.tsx, MoneyClassificationWorkflow.test.tsx | 실제 picker eviction/remount·stale/failed Save·owner reset |
| 승인 없는 category 자동 저장 금지 | MoneyClassificationPostgresTest, MoneyClassificationAutomaticContextTest, MoneyAiAutomationPostgresTest, MoneyMeaningPostgresTest | learned/provider 추천만·approved rule revalidation |
| request recovery·Review batch·ledger/refund/loan/override | 전체 MONEY + production-security suite | 기존 financial assertions 유지; fixture maturity만 receipt 기준으로 변경 |

## 재현 명령

Windows PowerShell, repository root에서 격리 PostgreSQL 18과 Java21/Node24를 사용한다. 공유 DEV credential을 전체 test 실행에 상속하지 않는다. 현재 SHA를 바꾸거나 소스를 편집하면서 runner를 실행하지 않는다.

```powershell
npm ci --ignore-scripts --no-audit --no-fund
# classpath-only Gradle init: classes 생성 후 sourceSets.main.runtimeClasspath.asPath를
# .qa/runs/<run-id>/audit-classpath.txt에 저장한다. DB audit/migrate task를 호출하지 않는다.
$env:QA_RUN_ID='<run-id>'
$env:QA_RUN_DIR='<absolute repository>\.qa\runs\<run-id>'
$env:QA_OWNED_BACKEND_PORT='55467'
node qa/money-backend-owned-runtime.mjs
```

Runner는 `com.kafka.backend.money.*`와 ProdCurrentUserProvider/ProdSecurityConfigJwtDecoder/SecurityProfileIsolation 테스트를 실행한다. 55467은 기존 V6 opt-in suite의 정확한 loopback 조건을 만족한다. 자신이 만든 PG 디렉터리·PID·schema marker를 검증하고 cleanup하며 다른 프로세스나 공유 DB를 건드리지 않는다.

동일 corpus 비교는 같은 `AdmissionCorpus.java`를 컴파일하고 before/after runtime classpath에서 각각 실행한다. 출력에는 16개 시나리오, expected eligibility, 실제 proposal/review source count, 1,600개 `System.nanoTime` matcher 표본이 들어 있다. 이것은 SQL/HTTP/Android/브라우저 처리시간 측정이 아니다.

```powershell
javac -cp $taskClasspath -d .qa/corpus qa/suites/money-admission/AdmissionCorpus.java
java -cp ('.qa/corpus;'+$taskClasspath) com.kafka.backend.money.AdmissionCorpus
```

Frontend root:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
# Node DOM test의 CSS import는 빈 module로 처리한다. 기존 MoneyForms test에도 필요하다.
# .qa/ignore-css.cjs: require.extensions[".css"] = () => {};
$taskTests=@(Get-ChildItem lib/money -Filter '*.test.ts' | ForEach-Object {'lib/money/'+$_.Name})+@(Get-ChildItem app/money -Filter '*.test.tsx' | ForEach-Object {'app/money/'+$_.Name})
node --require ../.qa/ignore-css.cjs --import tsx --test --test-concurrency=1 @taskTests
.\node_modules\.bin\eslint.cmd app/money lib/money
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
npm run build
```

초기 broad frontend 호출은 기존 CSS loader 부재로 MoneyForms 파일 로딩만 실패했다. CSS 처리를 적용한 전체 재실행과 production build 결과를 실제 최종 근거로 사용한다. 실패 영수증을 성공으로 덮어쓰지 않는다.

## 현재 검증하지 않은 경계

실제 Android bank notification delivery latency, hosted ingestion-to-paint latency, 실제 은행 corpus의 자동화율, 새 정책의 장기 false-positive rate, native 인증 DEV UI와 모든 viewport/pixel fidelity, hosted 서버 crash/restart 및 실제 paid AI 왕복은 별도 검증이 필요하다. 현재 TEAM KAFKA Chrome process는 승인 bootstrap으로 확인했지만, 도구의 첫 호출 계약에 metadata-only 연결 식별 API가 없어 connection/auth/DOM까지 확인하지 않았다. 새 headless browser·personal profile·새 debug endpoint로 대체하지 않는다.
