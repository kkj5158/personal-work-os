package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class MoneyAiClassificationProviderTest {
 final JsonMapper json=JsonMapper.builder().build();
 final MoneyAiClassificationProvider provider=new MoneyAiClassificationProvider(json,"not-a-credential","gpt-4.1-mini",true);
 String response(String status,String text){return json.writeValueAsString(Map.of("id","synthetic-response","status",status,"usage",Map.of("input_tokens",100,"output_tokens",20),"output",List.of(Map.of("content",List.of(Map.of("type","output_text","text",text))))));}
 @Test void validCategoryAndMeasuredUsageSurviveResponseParsing(){UUID id=UUID.randomUUID();var result=provider.parseResponse(response("completed",json.writeValueAsString(Map.of("categoryId",id,"reason","합성 커피"))));assertThat(result.categoryId()).isEqualTo(id);assertThat(result.errorCode()).isNull();assertThat(result.inputTokens()).isEqualTo(100);assertThat(result.outputTokens()).isEqualTo(20);}
 @Test void invalidChargedOutputRetainsUsageAndResponseIdentity(){var result=provider.parseResponse(response("completed","not JSON"));assertThat(result.errorCode()).isEqualTo("PROVIDER_INVALID_OUTPUT");assertThat(result.inputTokens()).isEqualTo(100);assertThat(result.outputTokens()).isEqualTo(20);assertThat(result.providerRequestId()).isEqualTo("synthetic-response");}
 @Test void incompleteChargedOutputIsKnownFailureRatherThanLostUsage(){var result=provider.parseResponse(response("incomplete","{}"));assertThat(result.errorCode()).isEqualTo("PROVIDER_INCOMPLETE");assertThat(result.inputTokens()).isEqualTo(100);}
 @Test void missingUsageIsNotInvented(){var result=provider.parseResponse("{\"status\":\"completed\",\"output\":[]}");assertThat(result.inputTokens()).isNull();assertThat(result.outputTokens()).isNull();}
 @Test void noCredentialOrUnknownModelKeepsReadinessBlocked(){assertThat(new MoneyAiClassificationProvider(json,"","gpt-4.1-mini",true).quote(Map.of()).ready()).isFalse();assertThat(new MoneyAiClassificationProvider(json,"not-a-credential","unknown",true).quote(Map.of()).ready()).isFalse();assertThat(new MoneyAiClassificationProvider(json,"not-a-credential","gpt-4.1-mini",false).quote(Map.of()).ready()).isFalse();}
}
