package com.kafka.backend.money;

import java.util.*;

/** Deterministic, field-wise defaults. It cannot express financial mutations. */
final class MoneyRuleEngine {
 record Condition(String field, String operator, String value) {}
 record Definition(UUID id, long version, List<Condition> conditions, Map<String,Object> outputs) {}
 record Result(Map<String,Object> defaults, Map<String,Object> evidence) {}
 static boolean matches(Map<String,Object> fact, Condition c) {
  String actual=Objects.toString(fact.get(c.field()),"").strip().toLowerCase(Locale.ROOT);
  String expected=c.value().strip().toLowerCase(Locale.ROOT);
  return switch(c.operator()) {case "EXACT" -> actual.equals(expected);case "CONTAINS" -> actual.contains(expected);case "STARTS_WITH" -> actual.startsWith(expected);default -> false;};
 }
 static Result evaluate(Map<String,Object> fact,List<Definition> ordered) {
  var defaults=new LinkedHashMap<String,Object>();var evidence=new LinkedHashMap<String,Object>();
  for(var rule:ordered) if(rule.conditions().stream().allMatch(c->matches(fact,c))) {
   rule.outputs().forEach((key,value)->{if(value!=null&&!defaults.containsKey(key)) {
    defaults.put(key,value);evidence.put(key,Map.of("ruleId",rule.id(),"version",rule.version()));
   }});
  }
  return new Result(defaults,evidence);
 }
 private MoneyRuleEngine() {}
}
