package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
/** Explicit opt-in: one public merchant lookup; durable writes roll back with synthetic owner. */
@EnabledIfEnvironmentVariable(named="MONEY_AI_LIVE_QA",matches="true")
@EnabledIfEnvironmentVariable(named="OPENAI_API_KEY",matches=".+")
class MoneyAiProviderLivePostgresTest {
 @Test void actualConfiguredProviderProducesRetrievedSources()throws Exception{new MoneyTrustPassPostgresTest().rollback(c->{
  c.db().update("insert into money_ai_settings(user_id,external_lookup) values(?,true)",c.owner());
  var ds=(SingleConnectionDataSource)c.db().getDataSource();var service=new MoneyAiLookupService(c.db(),()->c.owner(),JsonMapper.builder().build(),new DataSourceTransactionManager(ds),System.getenv("OPENAI_API_KEY"),"gpt-4.1-mini",1);
  var result=service.lookup("스타벅스코리아","서울");System.out.println("LIVE_PROVIDER_RESULT="+result.getOrDefault("errorCode","SUCCEEDED"));assertThat(result.get("available")).isEqualTo(true);assertThat((List<?>)result.get("sources")).isNotEmpty();assertThat(result.get("responseId")).isNotNull();
  var repeated=service.lookup("스타벅스코리아","서울");assertThat(repeated.get("cached")).isEqualTo(true);assertThat(c.db().queryForObject("select count(*) from money_ai_lookups where user_id=?",Long.class,c.owner())).isEqualTo(1);
  assertThat(service.lookup("국립중앙박물관","서울").get("errorCode")).isEqualTo("DAILY_LIMIT");
 });}
}
