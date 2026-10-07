package com.kafka.backend.exercise;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
class ExerciseTest {
 @Test void nativeExplicitNullGroupIsNotAGroup()throws Exception{var doc=session();var ex=(ObjectNode)doc.path("exercises").get(0);ex.putNull("groupId");ex.putNull("groupType");assertDoesNotThrow(()->ExerciseRules.validate(doc,"SESSION"));var copy=ExerciseRules.copy(doc,"2026-10-08");assertTrue(copy.path("exercises").get(0).path("groupId").isNull());assertDoesNotThrow(()->ExerciseRules.validate(copy,"SESSION"));}
 @Test void controllerSerializesErrorsWithoutReadingProxyFields()throws Exception{
  var target=new ExerciseService(null,()->UUID.randomUUID());
  var factory=new org.springframework.aop.framework.ProxyFactory(target);factory.setProxyTargetClass(true);
  factory.addAdvice((org.aopalliance.intercept.MethodInterceptor)invocation->invocation.proceed());
  var controller=new ExerciseController((ExerciseService)factory.getProxy());
  var response=controller.error(new ExerciseError(409,"REVISION_CONFLICT","비교 필요",Map.of("serverSnapshot",Map.of("revision",3))));
  assertEquals(409,response.getStatusCode().value());var body=json.readTree((String)response.getBody());assertEquals(3,body.path("serverSnapshot").path("revision").asInt());
  var invalid=assertThrows(ExerciseError.class,()->controller.mutate("[]"));assertEquals("INVALID_JSON",invalid.code);
 }
 final ObjectMapper json=new ObjectMapper();
 ObjectNode session() throws Exception{return (ObjectNode)json.readTree("""
 {"id":"00000000-0000-0000-0000-000000000002","kind":"SESSION","revision":4,"date":"2026-10-06","elapsedSeconds":90,"exercises":[{"id":"ex","measurement":"WEIGHT_REPS","basis":"PER_SIDE","unit":"kg","sets":[{"id":"set","number":1,"done":true,"rest":0,"actual":{"weight":20,"reps":8,"rir":1},"input":{"weight":15,"reps":5},"completedAt":"2026-10-06T00:00:00Z","completionEventId":"event"},{"id":"drop","number":2,"setType":"DROP","parentSetId":"set","done":false,"input":{"weight":15,"reps":5}}]}]}
 """);}
 @Test void copyRemapsAndResetsFacts()throws Exception{var source=session();var n=ExerciseRules.copy(source,"2026-10-08");ExerciseRules.validate(n,"SESSION");var sets=n.path("exercises").get(0).path("sets");assertFalse(sets.get(0).path("done").asBoolean());assertEquals(20,sets.get(0).path("input").path("weight").asInt());assertFalse(sets.get(0).path("input").has("rir"));assertEquals(0,sets.get(0).path("rest").asInt());assertEquals(sets.get(0).path("id"),sets.get(1).path("parentSetId"));assertFalse(n.has("elapsedSeconds"));assertTrue(source.path("exercises").get(0).path("sets").get(0).path("done").asBoolean());}
 @Test void rejectsPendingActualAndMissingRequiredFacts()throws Exception{var n=session();var set=(ObjectNode)n.path("exercises").get(0).path("sets").get(0);set.put("done",false);assertThrows(ExerciseError.class,()->ExerciseRules.validate(n,"SESSION"));set.put("done",true);((ObjectNode)set.path("actual")).put("reps",0);assertThrows(ExerciseError.class,()->ExerciseRules.validate(n,"SESSION"));set.put("setType","FAILURE");assertDoesNotThrow(()->ExerciseRules.validate(n,"SESSION"));}
 @Test void rejectsCrossOccurrenceDropParent()throws Exception{var n=session();((ObjectNode)n.path("exercises").get(0).path("sets").get(1)).put("parentSetId","other");assertThrows(ExerciseError.class,()->ExerciseRules.validate(n,"SESSION"));}
}
