package com.kafka.backend.workflow.attention;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.util.*;
import java.sql.Timestamp;
import java.time.Instant;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="QA_ATTENTION_PG_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:55443/postgres")
class AttentionManagementPostgresTest {
 UUID owner=UUID.randomUUID(),other=UUID.randomUUID();String schema;JdbcTemplate db,admin;AttentionService service;AttentionCredentials credentials;AttentionManagement console,foreign;
 <T>T proxy(T value){var f=new ProxyFactory(value);f.setProxyTargetClass(true);f.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(db.getDataSource()),new AnnotationTransactionAttributeSource()));return (T)f.getProxy();}
 @BeforeEach void setup()throws Exception{
  SecurityContextHolder.clearContext();String url=System.getenv("QA_ATTENTION_PG_URL");admin=new JdbcTemplate(new DriverManagerDataSource(url,"attention_snapshot_synthetic","synthetic-loopback-only"));
  assertThat(admin.queryForObject("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()",String.class)).isEqualTo("owned-work-queue-snapshot-qa");assertThat(admin.queryForObject("select inet_server_port()",Integer.class)).isEqualTo(55443);
  schema="qa_attention_management_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);admin.update("insert into auth.users(id) values(?),(?)",owner,other);
  db=new JdbcTemplate(new DriverManagerDataSource(url+"?currentSchema="+schema+",public","attention_snapshot_synthetic","synthetic-loopback-only"));
  db.execute("create table projects(id uuid primary key,user_id uuid,name varchar,status varchar default 'ACTIVE',revision bigint default 0)");db.execute("create table work_tasks(id uuid primary key,user_id uuid,project_id uuid,status varchar default 'WAITING',revision bigint default 0)");
  for(String file:List.of("V72__workflow_attention_queue.sql","V82__workflow_attention_memo.sql","V111__attention_unified_groups.sql","V115__attention_persistent_credentials.sql","V117__attention_management.sql"))for(String sql:Files.readString(Path.of("src/main/resources/db/migration",file)).replaceAll("(?m)--.*$","").split(";"))if(!sql.isBlank())db.execute(sql);
  var json=JsonMapper.builder().build();service=proxy(new AttentionService(db,()->owner,json));credentials=proxy(new AttentionCredentials(db,()->owner));console=proxy(new AttentionManagement(service,credentials,db,json));
  var foreignService=proxy(new AttentionService(db,()->other,json));foreign=proxy(new AttentionManagement(foreignService,proxy(new AttentionCredentials(db,()->other)),db,json));
 }
 @AfterEach void clean(){SecurityContextHolder.clearContext();admin.execute("drop schema "+schema+" cascade");}
 Map<String,Object> data(Map<String,Object> envelope){return (Map<String,Object>)envelope.get("data");}
 Map<String,Object> command(String route,Map<String,Object> input){var in=new LinkedHashMap<>(input);in.putIfAbsent("requestId",UUID.randomUUID().toString());return data(console.command(route,in));}
 Item create(String title){var response=command("create",Map.of("title",title));return service.item(UUID.fromString(((Map<?,?>)response.get("item")).get("id").toString()));}
 Map<String,Object> version(Item i){return Map.of("id",i.id().toString(),"expectedRevision",i.revision(),"expectedGeneration",i.source().generation());}
 Map<String,Object> preview(Map<String,Object> filter){var in=new LinkedHashMap<>(filter);in.put("requestId",UUID.randomUUID().toString());return data(console.preview(in));}
 Map<String,Object> execute(Map<String,Object> preview,String request){return data(console.execute(Map.of("requestId",request,"previewId",preview.get("previewId").toString(),"fingerprint",preview.get("fingerprint"),"confirmed",true)));}
 @Test void completedHideRestoresOriginalLifecycleAndDoesNotMutateSurvivingOrders(){
  Item a=create("completed"),b=create("survives");a=service.group(a.id(),new Group(UUID.randomUUID(),a.revision(),a.source().generation(),"COMPLETED")).item();var completed=a.completedAt();String before=db.queryForObject("select row_to_json(a)::text from attention_items a where id=?",String.class,b.id());
  command("hide",version(a));var hidden=service.item(a.id());assertThat(hidden.status()).isEqualTo("DISMISSED");command("restore",version(hidden));var restored=service.item(a.id());assertThat(restored.status()).isEqualTo("COMPLETED");assertThat(restored.completedAt()).isEqualTo(completed);assertThat(restored.createdAt()).isEqualTo(a.createdAt());assertThat(restored.sourceKey()).isEqualTo(a.sourceKey());assertThat(db.queryForObject("select row_to_json(a)::text from attention_items a where id=?",String.class,b.id())).isEqualTo(before);
 }
 @Test void fixedDateSnapshotExcludesPostCutoffHiddenAndBackdatedConcurrentInsertAndReplaysExactly(){
  Item a=create("old"),b=create("reference day"),next=create("next day"),hidden=create("already hidden");
  db.update("update attention_items set created_at=? where id=?",Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")),a.id());db.update("update attention_items set created_at=? where id=?",Timestamp.from(Instant.parse("2026-11-17T14:59:59Z")),b.id());db.update("update attention_items set created_at=? where id=?",Timestamp.from(Instant.parse("2026-11-17T15:00:00Z")),next.id());command("hide",version(hidden));
  var plan=preview(Map.of("action","HIDE","createdBefore","2026-11-17T15:00:00Z"));assertThat(plan.get("candidateCount")).isEqualTo(2);
  Item late=create("backdated arrival");db.update("update attention_items set created_at=? where id=?",Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")),late.id());String request=UUID.randomUUID().toString();var result=execute(plan,request);assertThat(result.get("appliedCount")).isEqualTo(2);assertThat(service.item(late.id()).status()).isEqualTo("OPEN");assertThat(service.item(next.id()).status()).isEqualTo("OPEN");assertThat(execute(plan,request).get("appliedCount").toString()).isEqualTo("2");assertThat(data(console.outcome(UUID.fromString(request),0,1)).get("nextOffset")).isEqualTo(1);
  var restore=preview(Map.of("action","RESTORE","batchId",plan.get("previewId").toString()));assertThat(restore.get("candidateCount")).isEqualTo(2);execute(restore,UUID.randomUUID().toString());assertThat(service.item(a.id()).status()).isEqualTo("OPEN");assertThat(service.item(hidden.id()).status()).isEqualTo("DISMISSED");
 }
 @Test void staleTargetRejectsWholeBatchAndStoresARecoverableConflict(){
  Item a=create("first"),b=create("second");var plan=preview(Map.of("action","HIDE"));service.memo(a.id(),new Memo(UUID.randomUUID(),0L,"changed"));String request=UUID.randomUUID().toString();var result=execute(plan,request);assertThat(result.get("status")).isEqualTo("CONFLICT");assertThat(result.get("appliedCount")).isEqualTo(0);assertThat(service.item(b.id()).status()).isEqualTo("OPEN");assertThat(data(console.outcome(UUID.fromString(request),0,50)).get("status")).isEqualTo("CONFLICT");
 }
 @Test void fingerprintExpiryForeignOwnerAndDuplicatePreviewExecutionFailClosed(){
  create("one");var plan=preview(Map.of("action","HIDE"));String request=UUID.randomUUID().toString();assertThatThrownBy(()->foreign.execute(Map.of("requestId",request,"previewId",plan.get("previewId").toString(),"fingerprint",plan.get("fingerprint"),"confirmed",true))).isInstanceOf(AttentionException.class);
  var tampered=new LinkedHashMap<>(plan);tampered.put("fingerprint","0".repeat(64));assertThatThrownBy(()->execute(tampered,request)).hasMessage("FINGERPRINT_MISMATCH");db.update("update attention_management_previews set expires_at=current_timestamp-interval '1 second' where id=?",plan.get("previewId"));assertThatThrownBy(()->execute(plan,request)).hasMessage("PREVIEW_EXPIRED");
  var fresh=preview(Map.of("action","HIDE"));execute(fresh,UUID.randomUUID().toString());assertThatThrownBy(()->execute(fresh,UUID.randomUUID().toString())).hasMessage("PREVIEW_ALREADY_EXECUTED");
 }
 @Test void explicitMasksMemoVersionsAndIdempotencyPreserveCreationTime(){
  Item a=create("title");var args=new LinkedHashMap<String,Object>();args.put("id",a.id().toString());args.put("fields",List.of("memo"));args.put("memo",null);args.put("expectedRevision",a.revision());args.put("expectedMemoRevision",0);command("edit",args);assertThat(service.item(a.id()).action()).isEqualTo("title");args.put("expectedMemoRevision",99);assertThatThrownBy(()->command("edit",args)).hasMessage("MEMO_REVISION_CONFLICT");args.put("fields",List.of("title"));assertThatThrownBy(()->command("edit",args)).hasMessage("FIELD_MASK_MISMATCH");
  String request=UUID.randomUUID().toString();command("create",Map.of("requestId",request,"title","retry"));command("create",Map.of("requestId",request,"title","retry"));assertThatThrownBy(()->command("create",Map.of("requestId",request,"title","different"))).hasMessage("IDEMPOTENCY_MISMATCH");assertThat(service.item(a.id()).createdAt()).isEqualTo(a.createdAt());
 }
 @Test void keyRestoreRequiresCryptographicLocalPossessionAndRevocationAlwaysWins()throws Exception{
  var key=credentials.producer(new AttentionCredentials.Producer("Synthetic producer","synthetic-queue"));db.update("update attention_credentials set expires_at=current_timestamp-interval '1 day' where id=?",key.credentialId());
  var challenge=data(console.possession(key.credentialId(),Map.of()));var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(HexFormat.of().parseHex(AttentionCredentials.hash(key.token())),"HmacSHA256"));String answer=HexFormat.of().formatHex(mac.doFinal(challenge.get("message").toString().getBytes(StandardCharsets.UTF_8)));
  var verified=data(console.possession(key.credentialId(),Map.of("challengeId",challenge.get("challengeId").toString(),"response",answer)));command("restore-connection",Map.of("id",key.credentialId().toString(),"expectedName","Synthetic producer","possessionProofId",verified.get("possessionProofId").toString()));assertThat(credentials.authenticate(key.token())).isNotNull();command("revoke-connection",Map.of("id",key.credentialId().toString(),"expectedName","Synthetic producer"));assertThatThrownBy(()->credentials.authenticate(key.token())).isInstanceOf(RuntimeException.class);assertThatThrownBy(()->console.possession(key.credentialId(),Map.of())).hasMessage("CONNECTION_NOT_FOUND");assertThat(console.connections().toString()).doesNotContain(key.token()).doesNotContain(AttentionCredentials.hash(key.token()));
 }
 @Test void pageTotalsCursorScopeAndProducerDeviceBoundariesAreTruthful(){
  Item a=create("one");create("two");var first=data(console.list(Map.of("limit",1),false));assertThat(((Map<?,?>)first.get("filteredTotals")).get("ACTIVE")).isEqualTo(2L);String cursor=first.get("nextCursor").toString();assertThat(((List<?>)data(console.list(Map.of("limit",1,"cursor",cursor),false)).get("items"))).hasSize(1);assertThatThrownBy(()->foreign.list(Map.of("cursor",cursor),false)).hasMessage("INVALID_CURSOR");service.memo(a.id(),new Memo(UUID.randomUUID(),0L,"new"));assertThatThrownBy(()->console.list(Map.of("cursor",cursor),false)).hasMessage("FEED_CHANGED");
  for(String kind:List.of("PRODUCER","DEVICE")){SecurityContextHolder.getContext().setAuthentication(new AttentionAuthentication(owner,UUID.randomUUID(),"test",kind));assertThatThrownBy(()->console.list(Map.of(),true)).hasMessage("OWNER_AUTH_REQUIRED");}SecurityContextHolder.clearContext();assertThat(data(console.outcome(UUID.randomUUID(),0,50)).get("status")).isEqualTo("UNKNOWN");
 }
}

