package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;
import static org.assertj.core.api.Assertions.*;

class MoneyOrdinaryAdmissionTest {
 final VerifiedMoneyTransferMatcher matcher=new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC));
 List<MoneyTransferMatcher.Proposal> proposals(ParseAttempt... a){return matcher.propose(new MoneyTransferMatcher.Context(accounts(),List.of(a),List.of()));}
 ParsedCandidate copy(ParsedCandidate c,String own,String other,Map<String,Object> evidence){return new ParsedCandidate(c.rawEventId(),c.provider(),c.direction(),c.amount(),c.occurredAt(),c.providerTimeText(),own,other,c.accountSuffixHints(),c.counterpartyText(),c.postBalance(),c.notificationSubtype(),c.parseStatus(),c.postedAt(),c.providerOccurredAt(),c.timeSource(),c.parserVersion(),evidence);}
 ParseAttempt candidate(ParseAttempt a,ParsedCandidate c){return new ParseAttempt(a.id(),a.rawEventId(),a.parserKey(),a.parserVersion(),a.status(),a.failureCode(),c,a.createdAt());}
 ParseAttempt merchant(){return attempt(side("IBK",Direction.OUT,5800,"16:54:36",null,"합성 카페"));}
 @Test void structuredMerchantExpenseDoesNotNeedCategoryOrCurrencyField(){
  var a=merchant();var evidence=new HashMap<>(a.candidate().evidence());evidence.remove("currency");var legacy=candidate(a,copy(a.candidate(),a.candidate().sourceAccountHint(),null,evidence));
  assertThat(MoneyOrdinaryAdmission.currency(legacy.candidate())).isEqualTo("KRW");
  assertThat(proposals(legacy)).singleElement().satisfies(p->{assertThat(p.transaction().type()).isEqualTo(TransactionType.EXPENSE);assertThat(p.transaction().currency()).isEqualTo("KRW");assertThat(p.transaction().sources()).hasSize(1);});
 }
 @Test void supportedMerchantAliasesCorroborateStructuredExpenseWithoutRenamingDescriptor(){
  for(String descriptor:List.of("지에스25 합성점","씨유합성점","GS25합성점","CU합성점","탐앤탐스 합성점","빽다방(합성점)"))assertThat(proposals(attempt(side("IBK",Direction.OUT,5800,"16:54:36",null,descriptor)))).singleElement().satisfies(p->assertThat(p.transaction().counterpartyText()).isEqualTo(descriptor));
 }
 @Test void unknownExternalNumberAloneDoesNotBlockReliableExpenseButOwnedProductDoes(){
  var a=merchant();assertThat(proposals(candidate(a,copy(a.candidate(),a.candidate().sourceAccountHint(),"1234567890123",a.candidate().evidence())))).singleElement().satisfies(p->assertThat(p.transaction()).isNotNull());
  assertThat(proposals(candidate(a,copy(a.candidate(),a.candidate().sourceAccountHint(),"정기적금(9999)",a.candidate().evidence())))).singleElement().satisfies(p->assertThat(p.transaction()).isNull());
 }
 @Test void unknownOwnedAccountCannotBeReplacedWithMerchantText(){
  var a=merchant();assertThat(proposals(candidate(a,copy(a.candidate(),"975-******-01-999",null,a.candidate().evidence())))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","ACCOUNT_RESOLUTION_REQUIRED");});
 }
 @Test void foreignAndUnverifiedSourcesKeepSafeguards(){
  var a=merchant();var evidence=new HashMap<>(a.candidate().evidence());evidence.put("currency","USD");var foreign=candidate(a,copy(a.candidate(),a.candidate().sourceAccountHint(),null,evidence));
  assertThat(MoneyOrdinaryAdmission.currency(foreign.candidate())).isEqualTo("USD");assertThat(proposals(foreign)).allMatch(p->p.transaction()==null);
  evidence.remove("shape");assertThat(MoneyOrdinaryAdmission.currency(copy(a.candidate(),a.candidate().sourceAccountHint(),null,evidence))).isEqualTo("USD");assertThat(proposals(candidate(a,copy(a.candidate(),a.candidate().sourceAccountHint(),null,Map.of())))).allMatch(p->p.transaction()==null);
 }
 @Test void externalMerchantAndUnrelatedCreditAreNotMergedAndRepeatedEvidenceIsPreserved(){
  var a=merchant();var opposite=attempt(side("SHINHAN",Direction.IN,5800,"16:54:37","급여통장(1228)","외부미확인"));assertThat(proposals(a,opposite)).hasSize(2).allMatch(p->p.transaction()!=null&&p.transaction().type()!=TransactionType.TRANSFER);
  var raw=side("IBK",Direction.OUT,5800,"16:54:36",null,"합성 카페");assertThat(proposals(a,attempt(raw))).allMatch(p->p.transaction()==null);
 }
 @Test void unrelatedOppositeBeyondOccurrenceWindowDoesNotBlockOrdinaryAdmission(){
  var out=merchant();var in=attempt(side("SHINHAN",Direction.IN,5800,"16:56:36","급여통장(1228)","외부미확인"));
  assertThat(VerifiedMoneyTransferMatcher.close(out.candidate(),in.candidate())).isFalse();assertThat(VerifiedMoneyTransferMatcher.unresolvedOpposite(out.candidate(),in.candidate())).isFalse();assertThat(proposals(out,in)).hasSize(2).allMatch(p->p.transaction()!=null);
 }
 @Test void existingNearbyExpenseProtectsReissuedNotification(){
  var registry=accounts();var a=merchant();var tx=matcher.propose(new MoneyTransferMatcher.Context(registry,List.of(a),List.of())).getFirst().transaction();var posted=new MoneyTransaction(UUID.randomUUID(),tx.type(),tx.fromAccountId(),tx.toAccountId(),tx.amount(),tx.currency(),tx.occurredAt(),tx.counterpartyText(),tx.sources());
  var next=attempt(side("IBK",Direction.OUT,5800,"16:54:37",null,"합성 카페"));assertThat(matcher.propose(new MoneyTransferMatcher.Context(registry,List.of(next),List.of(posted)))).singleElement().satisfies(p->{assertThat(p.transaction()).isNull();assertThat(p.evidence()).containsEntry("reason","POSSIBLE_ALREADY_POSTED_ROUTE");});
 }
 @Test void explicitCaptureCurrencyIsPreservedByDomesticParser(){
  var original=side("IBK",Direction.OUT,5800,"16:54:36",null,"합성 카페");var raw=new MoneyRawNotification(original.id(),original.sourcePackage(),original.notificationKey(),original.deviceId(),original.title(),original.text(),original.bigText(),original.postedAt(),original.receivedAt(),Map.of("currency","USD"),original.dedupeKey(),original.state(),original.processingVersion());
  assertThat(new IbkNotificationParserV1().parse(raw).evidence()).containsEntry("currency","USD");
 }
}
