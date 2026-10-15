package com.kafka.backend.diet;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Function;
import static org.assertj.core.api.Assertions.*;

/** Only a disposable loopback database with a dedicated name is accepted. No shared health data. */
@EnabledIfEnvironmentVariable(named="DIET_MEASUREMENT_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/diet_v2_qa")
class DietMeasurementPostgresTest {
 static DriverManagerDataSource ds; static JdbcTemplate db;static TransactionTemplate tx;
 UUID owner,other;LocalDate day=LocalDate.of(2026,1,1);
 @BeforeAll static void schema()throws Exception{
  ds=new DriverManagerDataSource(System.getenv("DIET_MEASUREMENT_DB_URL"),"diet_qa","");db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
  assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("diet_v2_qa");
  db.execute("drop schema public cascade; drop schema if exists auth cascade; create schema public");
  db.execute("create schema if not exists auth; create table if not exists auth.users(id uuid primary key)");
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V36__create_diet_system.sql")));
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V53__diet_day_slot_measured_at.sql")));
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V87__diet_measurement_events.sql")));
 }
 @BeforeEach void users(){owner=UUID.randomUUID();other=UUID.randomUUID();db.update("insert into auth.users values(?),(?)",owner,other);}
 <T>T call(UUID user,Function<DietMeasurementService,T> action){return tx.execute(s->action.apply(new DietMeasurementService(db,()->user,JsonMapper.builder().build())));}
 DietMeasurementService.Input input(UUID id,String metric,LocalDate date,double value,Long revision){return new DietMeasurementService.Input(UUID.randomUUID(),id,metric,date,date.atTime(7,30),value,"MORNING",revision);}
 DietMeasurementService.Measurement save(DietMeasurementService.Input in){return call(owner,s->s.save(in.id(),in));}
 @Test void createUpsertPreservesIdAndRetryIsIdempotentAfterLostResponse(){
  var in=input(UUID.randomUUID(),"weight",day,78.4,null);var a=save(in);assertThat(save(in)).isEqualTo(a);
  var update=input(a.id(),"weight",day,78.2,a.revision());var b=save(update);assertThat(b.id()).isEqualTo(a.id());assertThat(b.revision()).isEqualTo(2);
  assertThat(save(in)).isEqualTo(a);assertThat(call(owner,s->s.list(null,500)).records()).hasSize(1).first().extracting(DietMeasurementService.Measurement::value).isEqualTo(78.2);
  assertThat(db.queryForObject("select morning_weight from diet_days where owner_id=? and entry_date=?",Double.class,owner,day)).isEqualTo(78.2);
 }
 @Test void explicitMoveRetainsIdentityAndRejectsOccupiedDate(){
  var a=save(input(UUID.randomUUID(),"weight",day,78,null));save(input(UUID.randomUUID(),"weight",day.plusDays(1),77,null));
  assertThatThrownBy(()->save(input(a.id(),"weight",day.plusDays(1),76,a.revision()))).isInstanceOf(OptimisticLockConflictException.class);
  var moved=save(input(a.id(),"weight",day.plusDays(2),78,a.revision()));assertThat(moved.id()).isEqualTo(a.id());
  assertThat(db.queryForObject("select morning_weight from diet_days where owner_id=? and entry_date=?",Double.class,owner,day)).isNull();
 }
 @Test void multipleMeasurementsTiesAndPaginationDoNotLoseRows(){
  for(int i=0;i<8;i++)save(input(UUID.randomUUID(),"glucose",day,90+i,null));
  var p=call(owner,s->s.list(null,3));var p2=call(owner,s->s.list(p.nextCursor(),3));var p3=call(owner,s->s.list(p2.nextCursor(),3));
  var ids=new HashSet<UUID>();for(var page:List.of(p,p2,p3))page.records().forEach(r->assertThat(ids.add(r.id())).isTrue());assertThat(ids).hasSize(8);assertThat(p3.nextCursor()).isNull();
 }
 @Test void staleRevisionAndForeignOwnerCannotOverwrite(){
  var a=save(input(UUID.randomUUID(),"bloodKetone",day,0.8,null));save(input(a.id(),"bloodKetone",day,0.9,a.revision()));
  assertThatThrownBy(()->save(input(a.id(),"bloodKetone",day,1,a.revision()))).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(call(other,s->s.list(null,500)).records()).isEmpty();
  assertThatThrownBy(()->call(other,s->s.save(a.id(),input(a.id(),"bloodKetone",day,1,null)))).isInstanceOf(ResourceNotFoundException.class);
 }
 @Test void simultaneousDevicesCannotCreateDuplicateDailyWeight()throws Exception{
  var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
  try{var tasks=new ArrayList<Future<Boolean>>();for(int i=0;i<2;i++)tasks.add(pool.submit(()->{gate.await();try{save(input(UUID.randomUUID(),"weight",day,78,null));return true;}catch(OptimisticLockConflictException e){return false;}}));gate.countDown();assertThat(tasks.get(0).get(15,TimeUnit.SECONDS)^tasks.get(1).get(15,TimeUnit.SECONDS)).isTrue();assertThat(call(owner,s->s.list(null,500)).records()).hasSize(1);}finally{pool.shutdownNow();}
 }
 @Test void legacyValuesTimesPrecisionMetadataAndOtherColumnsSurvive(){
  db.update("insert into diet_days(owner_id,entry_date,morning_weight,morning_glucose,morning_breath_ketone,fasting_hours,target_weight,morning_measured_at) values(?,?,70.234,92,4.56,16,65,?)",owner,day,OffsetDateTime.parse("2026-01-01T00:01:00+09:00"));
  var a=call(owner,s->s.list(null,500)).records().stream().filter(r->r.metric().equals("weight")).findFirst().orElseThrow();assertThat(a.measuredAt()).isEqualTo(day.atTime(0,1));
  db.update("update diet_measurements set metadata=metadata||'{\"context\":\"fasting\",\"sourceDevice\":\"meter\"}'::jsonb where id=?",a.id());
  var b=save(input(a.id(),"weight",day,70.234,a.revision()));assertThat(b.metadata()).containsEntry("context","fasting");assertThat(b.source()).isEqualTo("POS_LEGACY");
  var row=db.queryForMap("select * from diet_days where owner_id=? and entry_date=?",owner,day);assertThat(row.get("morning_breath_ketone")).isEqualTo(4.56);assertThat(row.get("fasting_hours")).isEqualTo(16.0);assertThat(row.get("target_weight")).isEqualTo(65.0);
  db.update("update diet_days set morning_weight=71 where owner_id=? and entry_date=?",owner,day);var changed=call(owner,s->s.list(null,500)).records().stream().filter(r->r.id().equals(a.id())).findFirst().orElseThrow();assertThat(changed.value()).isEqualTo(71);assertThat(changed.revision()).isEqualTo(3);
 }
 @Test void sharedLegacyTimeDoesNotRewriteOtherEventTimesAndUnknownTimeIsNotInvented(){
  db.update("insert into diet_days(owner_id,entry_date,morning_glucose,morning_blood_ketone) values(?,?,92,0.8)",owner,day);
  var before=call(owner,s->s.list(null,500)).records();assertThat(before).allMatch(r->r.measuredAt()==null);
  save(input(UUID.randomUUID(),"glucose",day,95,null));
  assertThat(call(owner,s->s.list(null,500)).records()).filteredOn(r->r.metric().equals("bloodKetone")).first().extracting(DietMeasurementService.Measurement::measuredAt).isNull();
 }
 @Test void operationPayloadCannotBeReusedForDifferentWriteAndPrecisionIsValidated(){
  var in=input(UUID.randomUUID(),"glucose",day,92,null);save(in);var changed=new DietMeasurementService.Input(in.operationId(),in.id(),in.metric(),in.date(),in.measuredAt(),94d,in.slot(),null);
  assertThatThrownBy(()->save(changed)).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->save(input(UUID.randomUUID(),"weight",day,70.123,null))).isInstanceOf(InvalidRequestException.class);
 }
}
