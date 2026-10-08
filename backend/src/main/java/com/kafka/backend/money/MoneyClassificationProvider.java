package com.kafka.backend.money;
import java.util.*;
public interface MoneyClassificationProvider {
 record Result(UUID categoryId,String reason,String provider,String model,String errorCode,Long inputTokens,Long outputTokens,String providerRequestId){public Result(UUID id,String reason,String provider,String model,String error){this(id,reason,provider,model,error,null,null,null);}}
 record Quote(String model,String priceVersion,java.math.BigDecimal inputPerMillion,java.math.BigDecimal outputPerMillion,int maxInputTokens,int maxOutputTokens,boolean ready){}
 default Quote quote(Map<String,Object> input){return new Quote("UNKNOWN","UNVERIFIED",java.math.BigDecimal.ZERO,java.math.BigDecimal.ZERO,0,0,false);}
 Result classify(Map<String,Object> minimizedInput);
}
