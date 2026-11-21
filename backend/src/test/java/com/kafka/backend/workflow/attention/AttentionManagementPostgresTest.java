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
  for(String file:List.of("V72__workflow_attention_queue.sql","V82__workflow_attention_memo.sql","V111__attention_unified_groups.sql","V115__attention_persistent_credentials.sql","V117__attention_management.sql","V122__attention_managed_content.sql"))for(String sql:Files.readString(Path.of("src/main/resources/db/migration",file)).replaceAll("(?m)--.*$","").split(";"))if(!sql.isBlank())db.execute(sql);
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
 @Test void snapshotAndReceiptsPreserveAllTargetsAcrossReadAndOutcomePages(){
  var expected=new HashSet<UUID>();for(int i=0;i<57;i++){Item item=create("paged "+i);expected.add(item.id());if(i%3==0)service.group(item.id(),new Group(UUID.randomUUID(),item.revision(),item.source().generation(),"COMPLETED"));}
  var seen=new HashSet<UUID>();String cursor=null;do{var filter=new HashMap<String,Object>();filter.put("limit",13);if(cursor!=null)filter.put("cursor",cursor);var page=data(console.list(filter,false));for(var item:(List<Map<String,Object>>)page.get("items"))seen.add(UUID.fromString(item.get("id").toString()));cursor=(String)page.get("nextCursor");}while(cursor!=null);assertThat(seen).isEqualTo(expected);
  var plan=preview(Map.of("action","HIDE"));assertThat(plan.get("candidateCount")).isEqualTo(57);String request=UUID.randomUUID().toString();var first=execute(plan,request);assertThat(first.get("outcomeCount")).isEqualTo(57);assertThat(first.get("nextOffset")).isEqualTo(50);var second=data(console.outcome(UUID.fromString(request),50,50));assertThat((List<?>)second.get("outcomes")).hasSize(7);assertThat(second.get("complete")).isEqualTo(true);
  var hidden=data(console.list(Map.of("view","HIDDEN","group","COMPLETED"),true));assertThat(((Map<?,?>)hidden.get("filteredTotals")).get("COMPLETED")).isEqualTo(19L);assertThat(data(console.list(Map.of(),false)).get("items")).asList().isEmpty();
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
 @Test void managedReportsUseExactTargetSignatureCasAndAppendOnlyHistory() throws Exception {
  var mapper=JsonMapper.builder().build();
  var producer=proxy(new AttentionContent(db,service,mapper,"DEV",true,true));
  var signing=java.security.KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
  String publicKey=Base64.getUrlEncoder().withoutPadding().encodeToString(signing.getPublic().getEncoded());
  var proposal=new AttentionContentTypes.Proposal("work-content.v1",UUID.randomUUID(),UUID.randomUUID(),
      "DEV","실제 요청 제목","승인한 요청",null,publicKey,"read-only");
  byte[] input=mapper.writeValueAsBytes(proposal);
  var grant=producer.reserve(input);
  assertThat(producer.reserve(input)).isEqualTo(grant);
  assertThat(grant.proposalHash()).isEqualTo(AttentionContent.digest(input));
  var startId=UUID.randomUUID();
  var startBytes=mapper.writeValueAsBytes(new AttentionContentTypes.Start(startId,grant.proposalHash()));
  var startSig=sign(signing,String.join("\n","work-content.v1","POST",AttentionContentController.startPath(grant.itemId()),
      "DEV",grant.createReceipt().toString(),Long.toString(grant.expiresAt().toEpochMilli()),
      startId.toString(),AttentionContent.digest(startBytes)));
  assertThat(producer.checkGrant(grant.itemId(),startSig,startBytes)).isEqualTo(grant);
  var foreignQueue=proxy(new AttentionService(db,()->other,mapper));
  var foreignProducer=proxy(new AttentionContent(db,foreignQueue,mapper,"DEV",true,true));
  assertThatThrownBy(()->foreignProducer.revoke(grant.itemId())).isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.status()).isEqualTo(404));
  var out=Map.of("sourceTitle","제목","request","요청","performed",List.of("시험 실행"),
      "outcome",Map.of("state","PARTIAL","fact","한 건 실패"),
      "evidence",List.of(Map.of("id","T1","kind","TEST","label","한 건 실패","reference","dates-v1")), "remaining",List.of(), "limitations",List.of());
  var body=new LinkedHashMap<String,Object>();
  body.put("schemaVersion","work-content.v1");
  body.put("operationId",UUID.randomUUID().toString());
  body.put("reportId",UUID.randomUUID().toString());
  body.put("reportRevision",1);
  body.put("expectedContentRevision",0);
  body.put("logicalTaskId",grant.logicalTaskId());
  body.put("runId",grant.runId());
  body.put("sourceKey",grant.sourceKey());
  body.put("generation",grant.generation());
  body.put("createReceipt",grant.createReceipt());
  body.put("sessionId",UUID.randomUUID());
  body.put("turnId","exec:"+grant.runId()+":1");
  body.put("eventId","turn.completed");
  body.put("producedAt",Instant.now().toString());
  body.put("report",out);
  java.util.function.Function<byte[],String> signed=bytes->sign(signing,
      String.join("\n","work-content.v1","POST",AttentionContentController.reportPath(grant.itemId()),
          "DEV",grant.createReceipt().toString(),Long.toString(grant.expiresAt().toEpochMilli()),
          body.get("operationId").toString(),AttentionContent.digest(bytes)));
  var original=service.item(grant.itemId());
  var edited=service.edit(grant.itemId(),Map.of("operationId",UUID.randomUUID().toString(),
      "expectedRevision",original.revision(),"action","내가 지정한 제목")).item();
  service.memo(grant.itemId(),new Memo(UUID.randomUUID(),0L,"사용자 메모"));
  var rowBefore=db.queryForObject("select row_to_json(a)::text from attention_items a where id=?",String.class,grant.itemId());

  byte[] first=mapper.writeValueAsBytes(body);
  String auth=signed.apply(first);
  assertThatThrownBy(()->producer.submit(grant.itemId(),"x".repeat(86),first))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("INVALID_REPORT_SIGNATURE"));
  var receipt=producer.submit(grant.itemId(),auth,first);
  assertThat(receipt.contentRevision()).isEqualTo(1);
  assertThat(producer.submit(grant.itemId(),auth,first)).isEqualTo(receipt);
  assertThat(db.queryForObject("select row_to_json(a)::text from attention_items a where id=?",String.class,grant.itemId())).isEqualTo(rowBefore);
  assertThat(service.item(grant.itemId()).action()).isEqualTo(edited.action());
  assertThatThrownBy(()->foreignQueue.item(grant.itemId()))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.status()).isEqualTo(404));

  var verifier=java.security.KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
  org.springframework.test.util.ReflectionTestUtils.setField(producer,"verifierKey",
      Base64.getUrlEncoder().withoutPadding().encodeToString(verifier.getPublic().getEncoded()));
  var proofId=UUID.randomUUID();
  var proof=mapper.writeValueAsBytes(new AttentionContentTypes.Verification("work-content.v1",proofId,
      "DEV",grant.sourceKey(),receipt.reportId(),1,receipt.bodyHash(),"T1","dates-v1","FAILED",
      Instant.now().plusSeconds(120)));
  String message=String.join("\n","work-content.v1","POST",AttentionContentController.verifyPath(grant.itemId()),
      "DEV",proofId.toString(),AttentionContent.digest(proof));
  assertThatThrownBy(()->producer.verifyEvidence(grant.itemId(),sign(signing,message),proof))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("INVALID_VERIFIER_SIGNATURE"));
  var attestation=producer.verifyEvidence(grant.itemId(),sign(verifier,message),proof);
  assertThat(producer.verifyEvidence(grant.itemId(),sign(verifier,message),proof)).isEqualTo(attestation);
  org.springframework.test.util.ReflectionTestUtils.setField(service,"contentRender",true);
  var projected=(List<Map<String,Object>>)service.item(grant.itemId()).content().get("evidence");
  assertThat(projected.getFirst()).containsEntry("verification","SOURCE_VERIFIED").containsEntry("verifiedResult","FAILED");
  assertThat(db.queryForObject("select relrowsecurity from pg_class where oid='attention_content_verifications'::regclass",Boolean.class)).isTrue();

  body.put("producedAt",Instant.now().minusSeconds(1).toString());
  byte[] changed=mapper.writeValueAsBytes(body);
  assertThatThrownBy(()->producer.submit(grant.itemId(),auth,changed))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("INVALID_REPORT_SIGNATURE"));
  assertThatThrownBy(()->producer.submit(grant.itemId(),signed.apply(changed),changed))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("IDEMPOTENCY_MISMATCH"));
  body.put("operationId",UUID.randomUUID().toString());
  byte[] stale=mapper.writeValueAsBytes(body);
  assertThatThrownBy(()->producer.submit(grant.itemId(),signed.apply(stale),stale))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("CONTENT_REVISION_CONFLICT"));

  body.put("expectedContentRevision",1);
  body.put("reportRevision",2);
  var wrong=new LinkedHashMap<>(body);
  wrong.put("sessionId",UUID.randomUUID());
  byte[] unbound=mapper.writeValueAsBytes(wrong);
  assertThatThrownBy(()->producer.submit(grant.itemId(),signed.apply(unbound),unbound))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("REPORT_UNBOUND"));
  var annotated=new LinkedHashMap<>(out);
  annotated.put("evidence",List.of(Map.of("id","fabricated","kind","TEST","label","unverified",
      "reference","synthetic","verification","SOURCE_VERIFIED")));
  var forged=new LinkedHashMap<>(body);
  forged.put("report",annotated);
  byte[] alleged=mapper.writeValueAsBytes(forged);
  assertThatThrownBy(()->producer.submit(grant.itemId(),signed.apply(alleged),alleged))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("INVALID_REPORT"));

  byte[] second=mapper.writeValueAsBytes(body);
  assertThat(producer.submit(grant.itemId(),signed.apply(second),second).contentRevision()).isEqualTo(2);
  assertThat(db.queryForObject("select count(*) from attention_content_reports where item_id=?",Integer.class,grant.itemId())).isEqualTo(2);
  Item latest=service.item(grant.itemId());
  command("hide",version(latest));
  assertThatThrownBy(()->producer.submit(grant.itemId(),signed.apply(second),second))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("TARGET_HIDDEN"));
  producer.revoke(grant.itemId());
  assertThatThrownBy(()->producer.submit(grant.itemId(),signed.apply(second),second))
      .isInstanceOfSatisfying(AttentionException.class,e->assertThat(e.code()).isEqualTo("REPORT_GRANT_REVOKED"));
 }

 private static String sign(java.security.KeyPair key,String message){
  try {
   var signature=java.security.Signature.getInstance("Ed25519");
   signature.initSign(key.getPrivate());
   signature.update(message.getBytes(StandardCharsets.US_ASCII));
   return Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
  }catch(java.security.GeneralSecurityException e){throw new AssertionError(e);}
 }

}

