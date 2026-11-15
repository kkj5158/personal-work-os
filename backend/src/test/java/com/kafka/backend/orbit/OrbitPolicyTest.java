package com.kafka.backend.orbit;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class OrbitPolicyTest {
    @Test void nestedAccountAndNotesAreRedactedWithoutChangingNumbersOrNulls() {
        var input=new LinkedHashMap<String,Object>();
        input.put("amount",null);input.put("count",0);
        input.put("balances",List.of(Map.of("account",Map.of("id","synthetic-id","maskedReference","PRIVATE","suffix","1234","imageData","PRIVATE","memo","PRIVATE"))));
        input.put("metadata",Map.of("image","PRIVATE"));input.put("memoItems",List.of("PRIVATE"));
        var result=OrbitResponseAdvice.scrub(input,0).toString();
        assertThat(result).doesNotContain("PRIVATE","1234").contains("amount=null","count=0","synthetic-id");
    }
    @Test void outputBoundsFailInsteadOfSilentlyReturningPartialStatistics() {
        assertThatThrownBy(()->OrbitResponseAdvice.scrub(Collections.nCopies(1001,1),0)).isInstanceOf(OrbitResponseAdvice.LimitExceeded.class);
        assertThat((String)OrbitResponseAdvice.scrub("a".repeat(500),0)).hasSize(301);
        assertThat(OrbitResponseAdvice.scrub("data:image/png;base64,private",0)).isEqualTo("[REDACTED]");
    }
    @Test void perOwnerRateLimitResetsAndDoesNotConsumeAnotherOwnersQuota() {
        var policy=new OrbitRequestPolicy();
        for(int i=0;i<60;i++)assertThat(policy.accept("a",1)).isTrue();
        assertThat(policy.accept("a",1)).isFalse();assertThat(policy.accept("b",1)).isTrue();
        assertThat(policy.accept("a",2)).isTrue();
    }
}
