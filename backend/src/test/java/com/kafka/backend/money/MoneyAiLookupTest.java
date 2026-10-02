package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;
class MoneyAiLookupTest {
 @Test void proseWithInventedUrlsIsNotRetrievedEvidence(){var output=Map.<String,Object>of("output",List.of(Map.of("type","message","content",List.of(Map.of("type","output_text","text","https://invented.example 카페입니다")))));assertEquals(false,MoneyAiLookupService.decode(output,"test",Instant.EPOCH).get("available"));}
 @Test void actualSearchSourcesAndCitationAnnotationsPersistWithRetrievalTime(){var output=Map.<String,Object>of("id","real-response","output",List.of(Map.of("type","web_search_call","action",Map.of("sources",List.of(Map.of("url","https://merchant.example/info","title","공식 거래처")))),Map.of("type","message","content",List.of(Map.of("type","output_text","text","후보 거래처입니다.","annotations",List.of(Map.of("type","url_citation","url","https://merchant.example/info","title","공식 거래처")))))));var result=MoneyAiLookupService.decode(output,"test",Instant.EPOCH);assertEquals(true,result.get("available"));var sources=(List<?>)result.get("sources");assertEquals(1,sources.size());assertEquals("1970-01-01T00:00:00Z",((Map<?,?>)sources.getFirst()).get("retrievedAt"));assertEquals("real-response",result.get("responseId"));assertTrue(result.get("uncertainty").toString().contains("확정이 아닙니다"));}
 @Test void executableAndCredentialUrlsAreRejected(){var sources=new LinkedHashMap<String,Map<String,Object>>();for(String url:List.of("javascript:alert(1)","file:///secret","https://user:secret@example.com","broken"))MoneyAiLookupService.addSource(sources,Map.of("url",url),Instant.EPOCH);assertTrue(sources.isEmpty());}
 @Test void structuredCandidatesRequireEveryUrlToBeAnActualRetrievedSource(){
  String text="{\"summary\":\"두 후보를 비교했습니다\",\"candidates\":[{\"name\":\"실제 후보\",\"industry\":\"카페\",\"sourceUrls\":[\"https://merchant.example/info\"]},{\"name\":\"지어낸 후보\",\"industry\":\"카페\",\"sourceUrls\":[\"https://invented.example/info\"]}]}";
  var output=Map.<String,Object>of("output",List.of(Map.of("type","web_search_call","action",Map.of("sources",List.of(Map.of("url","https://merchant.example/info")))),Map.of("type","message","content",List.of(Map.of("type","output_text","text",text)))));
  var result=MoneyAiLookupService.decode(output,"test",Instant.EPOCH);var candidates=(List<?>)result.get("candidates");assertEquals(1,candidates.size());assertEquals("실제 후보",((Map<?,?>)candidates.getFirst()).get("name"));assertEquals("두 후보를 비교했습니다",result.get("summary"));
 }
}
