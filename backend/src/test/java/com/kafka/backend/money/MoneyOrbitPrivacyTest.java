package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class MoneyOrbitPrivacyTest {
 @Test void privacyKeepsCanonicalIdsColorsAndValidFinancialDates(){
  for(String value:List.of("2026-11-15","2026-11-15T04:03:47.9681634Z","2026-11-15T13:03:47+09:00","00000000-0000-0000-0000-000000000001","a".repeat(64),"#123456"))assertThat(MoneyOrbitConsoleService.scrub(value)).isEqualTo(value);
  assertThat(MoneyOrbitConsoleService.scrub("account 123-456-7890123")).isEqualTo("account [REDACTED]");
 }
 @Test void nestedSourceEvidenceDropsPrivateFieldsAndKeepsSafeProvenance(){
  var input=Map.of("sources",List.of(Map.of("rawEventId","00000000-0000-0000-0000-000000000001","evidence",Map.of("rawBody","PRIVATE_BODY","accountHint","PRIVATE_HINT","reason","SOURCE_MATCH"))));
  assertThat(MoneyOrbitConsoleService.scrub(input).toString()).contains("SOURCE_MATCH","00000000-0000-0000-0000-000000000001").doesNotContain("PRIVATE_BODY","PRIVATE_HINT","rawBody","accountHint");
 }
}
