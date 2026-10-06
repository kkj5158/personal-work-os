package com.kafka.backend.money;
import java.util.*;
public interface MoneyClassificationProvider {
 record Result(UUID categoryId,String reason,String provider,String model,String errorCode){}
 Result classify(Map<String,Object> minimizedInput);
}
