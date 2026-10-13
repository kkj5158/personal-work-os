package com.kafka.backend.exercise;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.flywaydb.core.Flyway;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** The integrated view commands the unchanged Exercise controller against an isolated real DB. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class LifeCalendarExercisePostgresTest {
 static JdbcTemplate db;static String schema;static UUID owner;static TransactionTemplate tx;static final ObjectMapper json=new ObjectMapper();
 @BeforeAll static void initialize()throws Exception {
  schema="life_exercise_qa_"+UUID.randomUUID().toString().replace("-","");
  var base=new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));new JdbcTemplate(base).execute("create schema "+schema);
  var dir=Path.of("build/life-calendar-exercise-migrations");Files.createDirectories(dir);Files.copy(Path.of("src/main/resources/db/migration/V77__exercise_v0.sql"),dir.resolve("V77__exercise_v0.sql"),StandardCopyOption.REPLACE_EXISTING);
  var flyway=Flyway.configure().dataSource(base).schemas(schema).defaultSchema(schema).locations("filesystem:"+dir.toAbsolutePath()).baselineVersion("76").cleanDisabled(true).load();flyway.baseline();flyway.migrate();flyway.validate();
  var url=System.getenv("DEV_DB_URL");var ds=new DriverManagerDataSource(url+(url.contains("?")?"&":"?")+"currentSchema="+schema,System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));
 }
 @AfterAll static void cleanup(){if(db!=null&&schema!=null&&schema.matches("life_exercise_qa_[0-9a-f]{32}"))db.execute("drop schema "+schema+" cascade");}
 ObjectNode workout(){var w=json.createObjectNode().put("id",UUID.randomUUID().toString()).put("kind","SESSION").put("date","2026-10-12").put("name","원본 운동").put("startedAt","2026-10-12T01:00:42Z").put("finishedAt","2026-10-12T01:30:42Z").put("elapsedSeconds",1400).put("memo","보존할 메모");
  var ex=w.putArray("exercises").addObject().put("id","ex").put("measurement","WEIGHT_REPS").put("basis","TOTAL").put("unit","kg");var set=ex.putArray("sets").addObject().put("id","set").put("number",1).put("done",true).put("completedAt","2026-10-12T01:20:42Z").put("completionEventId","event").put("rest",90);set.putObject("actual").put("weight",20).put("reps",10).put("rir",2);return w;
 }
 ObjectNode command(ObjectNode doc,long revision){var a=json.createObjectNode().put("mutationId",UUID.randomUUID().toString()).put("action","SAVE").put("expectedRevision",revision);a.set("document",doc);return a;}
 @Test void controllerEditPreservesOriginalIdentitySetsAndHistoryAndRejectsStaleRevision(){tx.executeWithoutResult(st->{
  var service=new ExerciseService(db,()->owner);var controller=new ExerciseController(service);var original=workout();
  try{var create=json.readTree(controller.mutate(command(original,0).toString()));var canonical=(ObjectNode)create.path("documents").get(0);var proposal=canonical.deepCopy().put("startedAt","2026-10-12T01:05:42Z");var request=command(proposal,1);var response=json.readTree(controller.mutate(request.toString()));var changed=response.path("documents").get(0);
   assertThat(changed.path("id")).isEqualTo(canonical.path("id"));for(String key:List.of("exercises","finishedAt","elapsedSeconds","memo","name"))assertThat(changed.path(key)).isEqualTo(canonical.path(key));assertThat(changed.path("revision").asLong()).isEqualTo(2);
   assertThat(json.readTree(controller.mutate(request.toString()))).isEqualTo(response);assertThatThrownBy(()->controller.mutate(command(proposal,1).toString())).isInstanceOfSatisfying(ExerciseError.class,e->assertThat(e.code).isEqualTo("REVISION_CONFLICT"));
   assertThat(service.state().path("documents").get(0)).isEqualTo(changed);assertThat(db.queryForObject("select count(*) from exercise_documents where owner_id=?",Long.class,owner)).isEqualTo(1);assertThat(db.queryForObject("select count(*) from exercise_audit where owner_id=?",Long.class,owner)).isEqualTo(2);
  }catch(java.io.IOException e){throw new RuntimeException(e);}st.setRollbackOnly();
 });}
 @Test void exerciseOwnerCannotReadOrEditAnotherOwnersOriginal(){tx.executeWithoutResult(st->{var service=new ExerciseService(db,()->owner);var created=service.mutate(command(workout(),0));var doc=(ObjectNode)created.path("documents").get(0);UUID otherOwner=UUID.randomUUID();var other=new ExerciseService(db,()->otherOwner);assertThat(other.state().path("documents").size()).isZero();assertThatThrownBy(()->other.mutate(command(doc,1))).isInstanceOfSatisfying(ExerciseError.class,e->assertThat(e.code).isEqualTo("REVISION_CONFLICT"));assertThat(service.canonical(service.state().path("documents").get(0))).isEqualTo(service.canonical(doc));st.setRollbackOnly();});}
}
