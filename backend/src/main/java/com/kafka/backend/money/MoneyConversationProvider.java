package com.kafka.backend.money;
import java.util.*;
/** Explanations and unapplied proposals only; providers cannot execute a mutation. */
interface MoneyConversationProvider {
 record Proposal(UUID targetRuleId,Long sourceVersion,String summary,MoneyMeaningService.RuleInput rule){}
 record Result(String text,List<Proposal> proposals,String provider,String model,String errorCode){}
 Result answer(Map<String,Object> minimizedContext);
}
