package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class MoneyClassificationAutomaticContextTest {
 private Map<String,Object> row(){
  return new LinkedHashMap<>(Map.of("accountId",UUID.randomUUID(),"type","EXPENSE","counterpartyText","Synthetic café","title","커피","memo","","version",7L,"transactionVersion",4L,"projectionVersion",3L));
 }

 @Test void completionUsesTheSameRequestExplanationAsPreparationWithoutChangingEitherRow(){
  var current=row();var snapshot=new LinkedHashMap<>(current);snapshot.put("requestExplanation","커피 구독을 설명합니다");
  var completed=MoneyClassificationAutomaticService.requestContext(current,snapshot);
  assertThat(MoneyClassificationContext.local(completed)).isEqualTo(MoneyClassificationContext.local(snapshot));
  assertThat(MoneyClassificationContext.minimized(completed,List.of())).isEqualTo(MoneyClassificationContext.minimized(snapshot,List.of()));
  assertThat(current).doesNotContainKey("requestExplanation");
  completed.put("requestExplanation","다른 설명");
  assertThat(snapshot.get("requestExplanation")).isEqualTo("커피 구독을 설명합니다");
 }

 @Test void requestExplanationCannotReplaceFreshTransactionFieldsOrHideChangedContext(){
  var snapshot=row();snapshot.put("requestExplanation","커피 구독");var current=new LinkedHashMap<>(snapshot);current.remove("requestExplanation");
  current.put("title","생활용품");current.put("accountId",UUID.randomUUID());current.put("transactionVersion",5L);
  var completed=MoneyClassificationAutomaticService.requestContext(current,snapshot);
  assertThat(completed.get("title")).isEqualTo("생활용품");
  assertThat(completed.get("accountId")).isEqualTo(current.get("accountId"));
  assertThat(completed.get("transactionVersion")).isEqualTo(5L);
  assertThat(MoneyClassificationContext.local(completed)).isNotEqualTo(MoneyClassificationContext.local(snapshot));
 }

 @Test void jobContextMustRetainItsImmutableExplanationDuringProviderWork(){
  String snapshot="커피 구독";
  assertThat(MoneyClassificationAutomaticService.sameRequestExplanation(snapshot,Map.of("requestExplanation",snapshot))).isTrue();
  assertThat(MoneyClassificationAutomaticService.sameRequestExplanation(snapshot,Map.of("requestExplanation","생활용품"))).isFalse();
  assertThat(MoneyClassificationAutomaticService.sameRequestExplanation(snapshot,Map.of())).isFalse();
  assertThat(MoneyClassificationAutomaticService.sameRequestExplanation(null,Map.of("requestExplanation",snapshot))).isFalse();
 }

 @Test void automaticRequestsWithoutExplanationKeepTheirOriginalContext(){
  var current=row();var completed=MoneyClassificationAutomaticService.requestContext(current,current);
  assertThat(completed).isEqualTo(current).isNotSameAs(current);
  assertThat(MoneyClassificationAutomaticService.sameRequestExplanation(null,Map.of("reason","QUEUED"))).isTrue();
 }
}
