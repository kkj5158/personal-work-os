package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Synthetic provenance objects only; these tests do not call or certify a live search provider. */
class MoneyAiEvidenceTest {
 private Map<String,Object> evidence(String industry,String sourceUrl){return Map.of("available",true,"retrievedAt",Instant.now().toString(),"uncertainty","Synthetic fixture: branch unresolved","sources",List.of(Map.of("url","https://fixture.invalid/cafe","title","Synthetic provider fixture")),"candidates",List.of(Map.of("name","Fixture branch A","industry",industry,"sourceUrls",List.of(sourceUrl)),Map.of("name","Fixture branch B","industry",industry,"sourceUrls",List.of(sourceUrl))));}
 @Test void sourceBackedSameIndustryCandidatesMatchOneActualCategoryWithoutBranchIdentity(){
  UUID expense=UUID.randomUUID(),income=UUID.randomUUID();var categories=List.<Map<String,Object>>of(Map.of("id",expense,"name","Fixture cafe","kind","EXPENSE"),Map.of("id",income,"name","Fixture cafe","kind","INCOME"));
  assertThat(MoneyAiService.externalCategory(evidence("Fixture cafe","https://fixture.invalid/cafe"),"EXPENSE",categories)).isEqualTo(expense);
  assertThat(MoneyAiService.externalCategory(evidence("Fixture cafe","https://fixture.invalid/cafe"),"INCOME",categories)).isEqualTo(income);
 }
 @Test void unsupportedSourceAmbiguousCategoryOrIndustryAndUnmatchedTaxonomyReturnNoProposal(){
  var one=Map.<String,Object>of("id",UUID.randomUUID(),"name","Fixture cafe","kind","EXPENSE");var two=Map.<String,Object>of("id",UUID.randomUUID(),"name","Fixture cafe","kind","EXPENSE");
  assertThat(MoneyAiService.externalCategory(evidence("Fixture cafe","https://unretrieved.invalid/fabricated"),"EXPENSE",List.of(one))).isNull();
  assertThat(MoneyAiService.externalCategory(evidence("Cafe","https://fixture.invalid/cafe"),"EXPENSE",List.of(one))).isNull();
  assertThat(MoneyAiService.externalCategory(evidence("Fixture cafe","https://fixture.invalid/cafe"),"EXPENSE",List.of(one,two))).isNull();
  var mixed=new LinkedHashMap<>(evidence("Fixture cafe","https://fixture.invalid/cafe"));mixed.put("candidates",List.of(Map.of("name","Fixture cafe A","industry","Fixture cafe","sourceUrls",List.of("https://fixture.invalid/cafe")),Map.of("name","Fixture mixed shop B","industry","Mixed shop","sourceUrls",List.of("https://fixture.invalid/cafe"))));
  assertThat(MoneyAiService.externalCategory(mixed,"EXPENSE",List.of(one))).isNull();
 }
}
