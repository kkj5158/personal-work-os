package com.kafka.backend.exercise;
import com.fasterxml.jackson.databind.node.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
/** Real PostgreSQL audit against isolated DEV schema, only disposable generated audit owners. */
public class ExerciseDbAudit {
 static void check(boolean v,String label){if(!v)throw new AssertionError(label);System.out.println("PASS "+label);}
 public static void main(String[] args)throws Exception{
  String url=System.getenv("DEV_DB_URL");var ds=new DriverManagerDataSource(url+(url.contains("?")?"&":"?")+"currentSchema=orbit_exercise_v0_dev_20261007",System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var db=new JdbcTemplate(ds);var tx=new TransactionTemplate(new DataSourceTransactionManager(ds));UUID a=UUID.randomUUID(),b=UUID.randomUUID();var service=new ExerciseService(db,()->a);var other=new ExerciseService(db,()->b);var json=service.json;
  java.util.function.Function<ObjectNode,ObjectNode> mutate=r->tx.execute(s->service.mutate(r));
  try{
   var doc=new ExerciseTest().session();doc.put("id",UUID.randomUUID().toString()).put("revision",0);UUID mid=UUID.randomUUID();var request=json.createObjectNode().put("mutationId",mid.toString()).put("expectedRevision",0).put("action","SAVE");request.set("document",doc);
   var saved=mutate.apply(request);check(saved.path("documents").get(0).path("revision").asLong()==1,"atomic fact + revision");check(service.hash(saved).equals(service.hash(mutate.apply(request))),"same mutation returns exact receipt");
   var changed=request.deepCopy();((ObjectNode)changed.path("document")).put("name","changed");try{mutate.apply(changed);throw new AssertionError("reuse");}catch(ExerciseError e){check(e.status==409&&e.code.equals("MUTATION_REUSE"),"different payload reuse rejected");}
   check(other.state().withArray("documents").isEmpty(),"authenticated owners isolated");
   var stale=request.deepCopy().put("mutationId",UUID.randomUUID().toString());try{mutate.apply(stale);throw new AssertionError("stale");}catch(ExerciseError e){check(e.code.equals("REVISION_CONFLICT"),"stale revision preserves server snapshot");}
   var copy=json.createObjectNode().put("mutationId",UUID.randomUUID().toString()).put("action","COPY_DATE").put("sourceDate","2026-10-06").put("targetDate","2026-10-08");var copied=mutate.apply(copy);check(copied.withArray("documents").size()==1&&!copied.path("documents").get(0).path("exercises").get(0).path("sets").get(0).path("done").asBoolean(),"date copy resets performance");check(service.hash(copied).equals(service.hash(mutate.apply(copy))),"copy retry creates no duplicate");
   var trash=request.deepCopy().put("mutationId",UUID.randomUUID().toString()).put("expectedRevision",1).put("action","TRASH");var trashed=mutate.apply(trash);var restore=trash.deepCopy().put("mutationId",UUID.randomUUID().toString()).put("expectedRevision",2).put("action","RESTORE");var restored=mutate.apply(restore);check(restored.path("documents").get(0).path("exercises").get(0).path("sets").get(0).path("done").asBoolean(),"trash restore retains actual facts");
   trash.put("mutationId",UUID.randomUUID().toString()).put("expectedRevision",3);mutate.apply(trash);var purge=trash.deepCopy().put("mutationId",UUID.randomUUID().toString()).put("expectedRevision",4).put("action","PURGE");mutate.apply(purge);var resurrection=request.deepCopy().put("mutationId",UUID.randomUUID().toString()).put("expectedRevision",5);try{mutate.apply(resurrection);throw new AssertionError("resurrection");}catch(ExerciseError e){check(e.code.equals("PURGED"),"tombstone rejects stale resurrection");}
   check(db.queryForObject("select count(*) from exercise_audit where owner_id=?",Integer.class,a)==6,"audit and mutations committed together");
  }finally{for(UUID owner:List.of(a,b)){db.update("delete from exercise_audit where owner_id=?",owner);db.update("delete from exercise_mutations where owner_id=?",owner);db.update("delete from exercise_documents where owner_id=?",owner);}}
 }
}
