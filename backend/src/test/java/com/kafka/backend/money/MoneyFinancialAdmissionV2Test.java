package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;
import static org.assertj.core.api.Assertions.*;

/** Synthetic second-precision bank evidence distinguishes bank occurrence from transport arrival. */
class MoneyFinancialAdmissionV2Test {
 final List<MoneyAccount> registry=accounts();
 final VerifiedMoneyTransferMatcher matcher=new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC));
 ParseAttempt movement(String bank,Direction direction,String cp,Instant occurred,Instant posted,Instant received,BigDecimal balance){
  String own=bank.equals("SHINHAN")?"급여통장(1228)":null;
  var a=attempt(side(bank,direction,1000,"16:54:36",own,cp));var c=a.candidate();
  var exact=new ParsedCandidate(c.rawEventId(),c.provider(),c.direction(),c.amount(),occurred,"09/24 16:54:36",c.sourceAccountHint(),c.destinationAccountHint(),c.accountSuffixHints(),c.counterpartyText(),balance,c.notificationSubtype(),c.parseStatus(),posted,occurred,TimeSource.PROVIDER_SECOND,c.parserVersion(),c.evidence());
  return new ParseAttempt(a.id(),a.rawEventId(),a.parserKey(),a.parserVersion(),a.status(),null,exact,received);
 }
 ParseAttempt movement(String bank,Direction direction,String cp,int seconds){return movement(bank,direction,cp,NOW.minusSeconds(300).plusSeconds(seconds),NOW.minusSeconds(300).plusSeconds(seconds),NOW.minusSeconds(20),new BigDecimal("50000"));}
 List<MoneyTransferMatcher.Proposal> propose(List<ParseAttempt> attempts,List<MoneyTransaction> existing){return matcher.propose(new MoneyTransferMatcher.Context(registry,attempts,existing));}
 List<MoneyTransferMatcher.Proposal> propose(ParseAttempt... attempts){return propose(List.of(attempts),List.of());}
 MoneyTransaction fact(MoneyTransferMatcher.Proposal p){var t=p.transaction();return new MoneyTransaction(UUID.randomUUID(),t.type(),t.fromAccountId(),t.toAccountId(),t.amount(),t.currency(),t.occurredAt(),t.counterpartyText(),t.sources());}
 @Test void crossBankDifferentCounterpartsMatchAtFiveTenThirtyAndFiftyNineSecondsButNotSixtyOne(){
  for(int seconds:List.of(5,10,30,59,60)){
   var out=movement("IBK",Direction.OUT,"보낸사람표시",0);var in=movement("SHINHAN",Direction.IN,"받는사람표시",seconds);
   assertThat(propose(out,in)).singleElement().satisfies(p->{assertThat(p.transaction().type()).isEqualTo(TransactionType.TRANSFER);assertThat(p.sources()).hasSize(2);assertThat(p.transaction().fromAccountId()).isEqualTo(registry.get(1).id());assertThat(p.transaction().toAccountId()).isEqualTo(registry.getFirst().id());});
  }
  assertThat(propose(movement("IBK",Direction.OUT,"보낸사람표시",0),movement("SHINHAN",Direction.IN,"받는사람표시",61))).hasSize(2).allMatch(p->p.transaction()==null&&p.evidence().get("reason").equals("UNRESOLVED_TRANSFER_CANDIDATE"));
 }
 @Test void providerTimeControlsDelayedAndroidDeliveryAndConclusivePairDoesNotWait(){
  var out=movement("IBK",Direction.OUT,"내계좌보내기",NOW.minusSeconds(300),NOW.minusSeconds(100),NOW,null);
  var in=movement("SHINHAN",Direction.IN,"내계좌받기",NOW.minusSeconds(295),NOW,NOW,null);
  assertThat(propose(out,in)).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.TRANSFER));
  assertThat(propose(out)).isEmpty();
 }
 @Test void observationBoundaryRestartAndJobReplayRetainSourceIdentity(){
  var occurred=NOW.minusSeconds(300);
  var waiting=movement("IBK",Direction.OUT,"새로운상점",occurred,occurred,NOW.minusSeconds(9),null);
  assertThat(propose(waiting)).isEmpty();
  var due=movement("IBK",Direction.OUT,"새로운상점",occurred,occurred,NOW.minusSeconds(10),null);
  var posted=propose(due);assertThat(posted).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE));
  // A fresh matcher instance models restart: maturity comes from persisted ingestion, never a process timer.
  assertThat(new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC)).propose(new MoneyTransferMatcher.Context(registry,List.of(due),List.of()))).isEqualTo(posted);
  assertThat(propose(List.of(due),List.of(fact(posted.getFirst())))).isEmpty();
 }
 @Test void observationAndTransferWindowsAreIndependentlyConfigurable(){
  var configured=new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC),Duration.ofSeconds(20),Duration.ofSeconds(30));
  var out=movement("IBK",Direction.OUT,"내계좌",0);var in=movement("SHINHAN",Direction.IN,"다른표시",31);
  assertThat(configured.propose(new MoneyTransferMatcher.Context(registry,List.of(out,in),List.of()))).allMatch(p->p.transaction()==null||p.transaction().type()!=TransactionType.TRANSFER);
  assertThatThrownBy(()->new VerifiedMoneyTransferMatcher(Clock.systemUTC(),Duration.ofSeconds(-1),Duration.ofSeconds(60))).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void unfamiliarPayrollSettlementAndMerchantsAdmitWithoutCategory(){
  for(String cp:List.of("합성회사","쿠팡 풀필먼트 정산","프리랜서 용역 정산","낯선외부지급인"))assertThat(propose(movement("SHINHAN",Direction.IN,cp,0))).singleElement().satisfies(p->{assertThat(p.transaction().type()).isEqualTo(TransactionType.INCOME);assertThat(p.transaction().counterpartyText()).isEqualTo(cp);});
  assertThat(propose(movement("IBK",Direction.OUT,"처음방문한가게",0))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE));
 }
 @Test void explicitUnrelatedSpendingAndPayrollAreNotTransfersDespiteAmountAndTime(){
  var out=movement("IBK",Direction.OUT,"새로운카페",0);var in=movement("SHINHAN",Direction.IN,"합성 급여 지급",5);
  assertThat(propose(out,in)).hasSize(2).allMatch(p->p.transaction()!=null&&p.transaction().type()!=TransactionType.TRANSFER);
 }
 ParseAttempt ownedHint(ParseAttempt a,String hint){var c=a.candidate();var changed=new ParsedCandidate(c.rawEventId(),c.provider(),c.direction(),c.amount(),c.occurredAt(),c.providerTimeText(),c.direction()==Direction.OUT?hint:c.sourceAccountHint(),c.direction()==Direction.IN?hint:c.destinationAccountHint(),c.accountSuffixHints(),c.counterpartyText(),c.postBalance(),c.notificationSubtype(),c.parseStatus(),c.postedAt(),c.providerOccurredAt(),c.timeSource(),c.parserVersion(),c.evidence());return new ParseAttempt(a.id(),a.rawEventId(),a.parserKey(),a.parserVersion(),a.status(),a.failureCode(),changed,a.createdAt());}
 ParseAttempt externalHint(ParseAttempt a,String hint){var c=a.candidate();var changed=new ParsedCandidate(c.rawEventId(),c.provider(),c.direction(),c.amount(),c.occurredAt(),c.providerTimeText(),c.direction()==Direction.IN?hint:c.sourceAccountHint(),c.direction()==Direction.OUT?hint:c.destinationAccountHint(),c.accountSuffixHints(),c.counterpartyText(),c.postBalance(),c.notificationSubtype(),c.parseStatus(),c.postedAt(),c.providerOccurredAt(),c.timeSource(),c.parserVersion(),c.evidence());return new ParseAttempt(a.id(),a.rawEventId(),a.parserKey(),a.parserVersion(),a.status(),a.failureCode(),changed,a.createdAt());}
 ParseAttempt amount(ParseAttempt a,int amount){var c=a.candidate();var changed=new ParsedCandidate(c.rawEventId(),c.provider(),c.direction(),new BigDecimal(amount),c.occurredAt(),c.providerTimeText(),c.sourceAccountHint(),c.destinationAccountHint(),c.accountSuffixHints(),c.counterpartyText(),c.postBalance(),c.notificationSubtype(),c.parseStatus(),c.postedAt(),c.providerOccurredAt(),c.timeSource(),c.parserVersion(),c.evidence());return new ParseAttempt(a.id(),a.rawEventId(),a.parserKey(),a.parserVersion(),a.status(),a.failureCode(),changed,a.createdAt());}
 @Test void sameCounterpartOppositeOwnedMovementsWithNetGrossMismatchNeverInferPrincipalOrFee(){
  var out=amount(movement("IBK",Direction.OUT,"신한오픈합성소유자",0),10500);
  var in=amount(movement("SHINHAN",Direction.IN,"합성소유자",0),10000);
  for(var pair:List.of(List.of(out,in),List.of(in,out)))assertThat(propose(pair,List.of())).hasSize(2).allMatch(p->p.transaction()==null&&p.evidence().get("reason").equals("NET_GROSS_TRANSFER_CONFLICT"));
  assertThat(propose(out,in).stream().flatMap(p->p.sources().stream()).map(TransactionSource::rawEventId)).containsExactlyInAnyOrder(out.rawEventId(),in.rawEventId());
 }
 @Test void unrelatedExplicitExternalMovementsWithDifferentAmountsRemainOrdinary(){
  var out=amount(movement("IBK",Direction.OUT,"합성카페",0),10500);var in=amount(movement("SHINHAN",Direction.IN,"급여 합성회사",0),10000);
  assertThat(propose(out,in)).hasSize(2).allMatch(p->p.transaction()!=null&&p.transaction().type()!=TransactionType.TRANSFER);
  var externalOut=externalHint(amount(movement("IBK",Direction.OUT,"합성외부표시",0),10500),"1234567890123");
  var externalIn=externalHint(amount(movement("SHINHAN",Direction.IN,"합성외부표시",0),10000),"9876543210123");
  assertThat(propose(externalOut,externalIn)).hasSize(2).allMatch(p->p.transaction()!=null&&p.transaction().type()!=TransactionType.TRANSFER);
 }
 @Test void lateNetGrossCounterpartPreservesPostedAmountAndNeverCreatesAnIndependentIncome(){
  var out=amount(movement("IBK",Direction.OUT,"합성소유자",0),10500);var previous=fact(propose(out).getFirst());
  var in=amount(movement("SHINHAN",Direction.IN,"합성소유자",5),10000);
  assertThat(propose(List.of(in),List.of(previous))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","NET_GROSS_TRANSFER_CONFLICT");});
  assertThat(previous.type()).isEqualTo(TransactionType.EXPENSE);assertThat(previous.amount()).isEqualByComparingTo("10500");assertThat(previous.sources()).hasSize(1);
 }
 @Test void numericExternalRoutesPreventFalseTransferPairingEvenWithUnfamiliarEqualCounterparts(){
  for(String incomingText:List.of("새로운상대방","동일상대방")){
   var out=externalHint(movement("IBK",Direction.OUT,"동일상대방",0),"1234567890123");
   var in=externalHint(movement("SHINHAN",Direction.IN,incomingText,5),"9876543210123");
   assertThat(propose(out,in)).hasSize(2).allMatch(p->p.transaction()!=null&&p.transaction().type()!=TransactionType.TRANSFER);
   var prior=fact(propose(out).getFirst());
   assertThat(propose(List.of(in),List.of(prior))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.INCOME));
   var genericLater=movement("SHINHAN",Direction.IN,incomingText,5);
   assertThat(propose(List.of(genericLater),List.of(prior))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.INCOME));
  }
 }
 @Test void numericExternalRouteDoesNotConflictWithExistingOwnedTransferOnSameBankSide(){
  var prior=fact(propose(movement("IBK",Direction.OUT,"소유자표시",0),movement("SHINHAN",Direction.IN,"다른표시",5)).getFirst());
  var external=externalHint(movement("IBK",Direction.OUT,"새로운상대방",6),"1234567890123");
  assertThat(propose(List.of(external),List.of(prior))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE));
 }
 @Test void oppositeUnresolvedOwnershipBlocksKnownMerchantAcrossExistingReviewNeighborhood(){
  var merchant=movement("IBK",Direction.OUT,"합성 카페",0);
  for(int seconds:List.of(120,600)){
   var unknown=ownedHint(movement("IBK",Direction.IN,"확인필요",seconds),"975-******-01-999");
   assertThat(propose(merchant,unknown)).hasSize(2).allMatch(p->p.transaction()==null).anySatisfy(p->assertThat(p.evidence()).containsEntry("reason","OPPOSITE_OWNER_ACCOUNT_UNRESOLVED")).anySatisfy(p->assertThat(p.evidence()).containsEntry("reason","ACCOUNT_RESOLUTION_REQUIRED"));
  }
  var outside=ownedHint(movement("IBK",Direction.IN,"확인필요",601),"975-******-01-999");
  assertThat(propose(merchant,outside)).anySatisfy(p->assertThat(p.transaction()).isNotNull());
 }
 @Test void fullyResolvedUnrelatedExternalMovementsStillAdmitDespiteTheReviewNeighborhood(){
  assertThat(propose(movement("IBK",Direction.OUT,"합성 카페",0),movement("SHINHAN",Direction.IN,"급여 합성 회사",120))).hasSize(2).allMatch(p->p.transaction()!=null&&p.transaction().type()!=TransactionType.TRANSFER);
 }
 @Test void completeCompetingGraphIsAmbiguousAndCounterpartCorroborationDistinguishesLegitimatePairs(){
  var out=movement("IBK",Direction.OUT,"내계좌",0);var in=movement("SHINHAN",Direction.IN,"다른표시",5);var alternative=movement("WOORI",Direction.IN,"세번째표시",10);
  assertThat(propose(out,in,alternative)).hasSize(3).allMatch(p->p.transaction()==null&&p.evidence().get("reason").equals("AMBIGUOUS_TRANSFER_PAIR"));
  assertThat(propose(movement("IBK",Direction.OUT,"첫째",0),movement("SHINHAN",Direction.IN,"첫째",5),movement("WOORI",Direction.OUT,"둘째",0),movement("SHINHAN",Direction.IN,"둘째",5))).hasSize(2).allMatch(p->p.transaction().type()==TransactionType.TRANSFER);
 }
 @Test void lateCounterpartAfterOrdinaryPostingPreservesOriginalFactAndRequestsLinkReview(){
  var out=movement("IBK",Direction.OUT,"내계좌보내기",0);var original=fact(propose(out).getFirst());
  var late=movement("SHINHAN",Direction.IN,"다른표시",5);
  assertThat(propose(List.of(late),List.of(original))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","LATE_POSTED_TRANSFER_LINK_REQUIRED");assertThat(p.sources()).extracting(TransactionSource::rawEventId).containsExactly(late.rawEventId());});
  assertThat(original.type()).isEqualTo(TransactionType.EXPENSE);assertThat(original.sources()).hasSize(1);
  var boundaryLate=movement("SHINHAN",Direction.IN,"다른표시",61);
  assertThat(propose(List.of(boundaryLate),List.of(original))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","LATE_POSTED_TRANSFER_LINK_REQUIRED");});
 }
 MoneyTransaction preserved(MoneyTransaction t,List<TransactionSource> sources,boolean excluded,UUID mergedInto){return new MoneyTransaction(t.id(),t.type(),t.fromAccountId(),t.toAccountId(),t.amount(),t.currency(),t.occurredAt(),t.counterpartyText(),sources,t.categoryId(),t.memo(),excluded,t.version(),true,t.refundOf(),mergedInto);}
 @Test void ownerConfirmedAndLegacyManualDirectionsAreInferredFromPreservedCanonicalFacts(){
  for(Direction originalDirection:Direction.values()){
   String bank=originalDirection==Direction.OUT?"IBK":"SHINHAN",otherBank=originalDirection==Direction.OUT?"SHINHAN":"IBK";
   var source=movement(bank,originalDirection,"합성소유자",0);var ordinary=fact(propose(source).getFirst());
   for(String rule:List.of("OWNER_ASSERTED_REVIEW","USER_CONFIRMED","LEGACY_NO_SOURCE")){
    var provenance=rule.equals("LEGACY_NO_SOURCE")?List.<TransactionSource>of():List.of(new TransactionSource(source.rawEventId(),source.id(),SourceRelationship.PRIMARY,Map.of("rule",rule)));
    var ownerFact=preserved(ordinary,provenance,false,null);var late=movement(otherBank,originalDirection==Direction.OUT?Direction.IN:Direction.OUT,"은행별다른표시",5);
    assertThat(propose(List.of(late),List.of(ownerFact))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","LATE_POSTED_TRANSFER_LINK_REQUIRED");});
    assertThat(ownerFact.sources()).isEqualTo(provenance);assertThat(ownerFact.type()).isEqualTo(ordinary.type());
   }
  }
 }
 @Test void legacyManualSameSideSourceOverlapUsesAccountIdentityRatherThanCounterpartEquality(){
  var original=preserved(fact(propose(movement("IBK",Direction.OUT,"소유자확인표시",0)).getFirst()),List.of(),false,null);
  assertThat(propose(List.of(movement("IBK",Direction.OUT,"은행표시변경",5)),List.of(original))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","POSSIBLE_ALREADY_POSTED_ROUTE");});
 }
 @Test void ownerConfirmedTransferPreventsSameSideLateOrdinaryFactAndAllowsExplicitUnrelatedExternalMovement(){
  var transfer=fact(propose(movement("IBK",Direction.OUT,"소유자표시",0),movement("SHINHAN",Direction.IN,"다른표시",5)).getFirst());
  var original=preserved(transfer,List.of(new TransactionSource(UUID.randomUUID(),UUID.randomUUID(),SourceRelationship.PRIMARY,Map.of("rule","USER_CONFIRMED"))),false,null);
  for(var late:List.of(movement("IBK",Direction.OUT,"은행보낸표시",6),movement("SHINHAN",Direction.IN,"은행받은표시",6)))assertThat(propose(List.of(late),List.of(original))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","LATE_POSTED_TRANSFER_SOURCE_OVERLAP");});
  var unrelated=movement("IBK",Direction.OUT,"합성카페",6);
  assertThat(propose(List.of(unrelated),List.of(original))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE));
  assertThat(original.sources().getFirst().evidence()).containsOnlyKeys("rule");
 }
 @Test void sourceFreeManualTransferAlsoBlocksCompatibleLateObservations(){
  var transfer=fact(propose(movement("IBK",Direction.OUT,"소유자표시",0),movement("SHINHAN",Direction.IN,"다른표시",5)).getFirst());
  var manual=preserved(transfer,List.of(),false,null);
  assertThat(propose(List.of(movement("SHINHAN",Direction.IN,"은행다른표시",6)),List.of(manual))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","LATE_POSTED_TRANSFER_SOURCE_OVERLAP");});
 }
 @Test void cancelledAndMergedFactsArePreservedWhileDistinctNewBalanceFlowRemainsAdmissible(){
  var first=movement("IBK",Direction.OUT,"합성상점",0);var t=fact(propose(first).getFirst());
  for(UUID mergedInto:Arrays.asList(null,UUID.randomUUID())){
   var excluded=preserved(t,t.sources(),true,mergedInto);
   var recaptured=movement("IBK",Direction.OUT,"합성상점",0);
   assertThat(propose(List.of(recaptured),List.of(excluded))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","POSSIBLE_ALREADY_POSTED_ROUTE");});
   var at=NOW.minusSeconds(300).plusSeconds(5);var next=movement("IBK",Direction.OUT,"합성상점",at,at,NOW.minusSeconds(20),new BigDecimal("49000"));
   assertThat(propose(List.of(next),List.of(excluded))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE));
   assertThat(excluded.excluded()).isTrue();assertThat(excluded.mergedInto()).isEqualTo(mergedInto);
  }
 }
 @Test void reformattedCounterpartWithSameBankOccurrenceAndBalanceCannotDuplicatePostedMovement(){
  var first=movement("IBK",Direction.OUT,"상점원표시",0);var original=fact(propose(first).getFirst());
  var recaptured=movement("IBK",Direction.OUT,"상점다른표시",0);
  assertThat(propose(List.of(recaptured),List.of(original))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","POSSIBLE_ALREADY_POSTED_ROUTE");});
  var at=NOW.minusSeconds(300).plusSeconds(5);var separate=movement("IBK",Direction.OUT,"상점다른표시",at,at,NOW.minusSeconds(20),new BigDecimal("49000"));
  assertThat(propose(List.of(separate),List.of(original))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE));
 }
 @Test void secondNotificationAfterTenSecondsStillPairsWhenNeitherSideIsPosted(){
  assertThat(propose(movement("IBK",Direction.OUT,"보낸표시",0),movement("SHINHAN",Direction.IN,"받은표시",20))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.TRANSFER));
 }
 @Test void independentEqualAmountPayrollWithBalanceFlowPostsAndRecaptureReviews(){
  var at=NOW.minusSeconds(300);var one=movement("SHINHAN",Direction.IN,"합성회사",at,at,NOW.minusSeconds(20),new BigDecimal("50000"));
  var previous=fact(propose(one).getFirst());
  var next=movement("SHINHAN",Direction.IN,"합성회사",at.plusSeconds(5),at.plusSeconds(5),NOW.minusSeconds(20),new BigDecimal("51000"));
  assertThat(propose(List.of(next),List.of(previous))).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.INCOME));
  var replay=movement("SHINHAN",Direction.IN,"합성회사",at,at,NOW.minusSeconds(20),new BigDecimal("50000"));
  assertThat(propose(one,replay)).hasSize(2).allMatch(p->p.transaction()==null);
 }
 @Test void specialRefundLoanAndSavingsSemanticsRequireDedicatedOperations(){
  for(String cp:List.of("결제환불","대출실행","대출상환","정기적금가입","결제취소"))assertThat(propose(movement("SHINHAN",Direction.IN,cp,0))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","DEDICATED_FINANCIAL_OPERATION_REQUIRED");});
  assertThat(propose(movement("IBK",Direction.OUT,"대출상환",0),movement("SHINHAN",Direction.IN,"대출상환",5))).hasSize(2).allMatch(p->p.transaction()==null);
 }
 @Test void singleTransferIntentCannotBecomeExternalOnlyBecauseTheCounterpartIsAbsent(){
  for(String cp:List.of("내계좌이체","내계좌송금","신한오픈합성소유자"))assertThat(propose(movement("IBK",Direction.OUT,cp,0))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","UNRESOLVED_TRANSFER_INTENT");});
 }
 @Test void missingRequiredFactsProduceSpecificReviewWithoutDiscardingSourceEvidence(){
  var a=movement("IBK",Direction.OUT,"합성상점",0);var c=a.candidate();
  var missing=new ParsedCandidate(c.rawEventId(),c.provider(),null,null,null,c.providerTimeText(),c.sourceAccountHint(),c.destinationAccountHint(),c.accountSuffixHints(),c.counterpartyText(),c.postBalance(),c.notificationSubtype(),c.parseStatus(),null,null,null,c.parserVersion(),c.evidence());
  var incomplete=new ParseAttempt(a.id(),a.rawEventId(),a.parserKey(),a.parserVersion(),a.status(),null,missing,a.createdAt());
  assertThat(propose(incomplete)).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","MISSING_REQUIRED_FINANCIAL_FACTS");assertThat(p.sources()).extracting(TransactionSource::rawEventId).containsExactly(a.rawEventId());});
  assertThatThrownBy(()->new VerifiedMoneyTransferMatcher(Clock.systemUTC(),Duration.ofSeconds(10),Duration.ofSeconds(91))).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void accountRegistryIsOwnerScopedAndCannotMatchAnotherOwnersAccounts(){
  var out=movement("IBK",Direction.OUT,"내계좌",0);var in=movement("SHINHAN",Direction.IN,"다른표시",5);
  assertThat(matcher.propose(new MoneyTransferMatcher.Context(List.of(registry.get(1)),List.of(out,in),List.of()))).allMatch(p->p.transaction()==null);
 }
 @Test void missingBankTimestampUsesOnlyExplicitTestedAndroidCounterpartFallback(){
  var out=attempt(side("KAKAO",Direction.OUT,1000,"16:54:36","입출금통장(8557)","내계좌"));
  var in=attempt(side("SHINHAN",Direction.IN,1000,"16:54:39","급여통장(1228)","다른표시"));
  assertThat(propose(out,in)).allMatch(p->p.transaction()==null);
  var corroborated=attempt(side("SHINHAN",Direction.IN,1000,"16:54:39","급여통장(1228)","내계좌"));
  assertThat(propose(out,corroborated)).singleElement().satisfies(p->assertThat(p.transaction().type()).isEqualTo(TransactionType.TRANSFER));
 }
}
