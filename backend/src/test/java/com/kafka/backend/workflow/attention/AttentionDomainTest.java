package com.kafka.backend.workflow.attention;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;

/** SQL-backed owning-domain acceptance; all tables/owners/WorkTasks are isolated in memory. */
class AttentionDomainTest {
    SingleConnectionDataSource source;JdbcTemplate db;AttentionService service;UUID owner=UUID.randomUUID(),other=UUID.randomUUID();TransactionTemplate tx;
    @BeforeEach void setup()throws Exception{
        SecurityContextHolder.clearContext();source=new SingleConnectionDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL","sa","",true);db=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");db.update("insert into auth.users values(?),(?)",owner,other);
        db.execute("create table projects(id uuid primary key,user_id uuid,name varchar,status varchar default 'ACTIVE',revision bigint default 0)");
        db.execute("create table work_tasks(id uuid primary key,user_id uuid,project_id uuid,status varchar default 'WAITING',revision bigint default 0)");
        String sql=Files.readString(Path.of("src/main/resources/db/migration/V72__workflow_attention_queue.sql")).replaceAll("(?m)--.*$","").replace("TIMESTAMPTZ","TIMESTAMP WITH TIME ZONE");for(String statement:sql.split(";"))if(!statement.isBlank()&&!statement.contains("ENABLE ROW LEVEL SECURITY"))db.execute(statement);
        String memoSql=Files.readString(Path.of("src/main/resources/db/migration/V82__workflow_attention_memo.sql")).replaceAll("(?m)--.*$","");for(String statement:memoSql.split(";"))if(!statement.isBlank())db.execute(statement);
        service=new AttentionService(db,()->owner,JsonMapper.builder().build());
    }
    @AfterEach void close(){SecurityContextHolder.clearContext();source.destroy();}
    Source manual(String ref,String intent,String generation){return new Source("CHATGPT",ref,"https://chatgpt.com/c/"+ref,"MANUAL",intent,generation,"ACK_ONLY",null);}
    Create request(String action,Source source){return new Create(UUID.randomUUID(),UUID.randomUUID(),action,null,"WORK FLOW",null,source,null);}
    Item create(String ref){return service.create(request("확인 "+ref,manual(ref,"review","v1"))).item();}
    Action action(Item item){return new Action(UUID.randomUUID(),item.revision(),item.source().generation());}
    void fails(String code,Runnable work){assertThatThrownBy(work::run).isInstanceOf(AttentionException.class).satisfies(e->assertThat(((AttentionException)e).code()).isEqualTo(code));}
    @Test void sourceDedupeSurvivesTerminalStatesIntentAndGenerationRemainIndependent(){
        var in=request("확인",manual("one","review","v1"));var created=service.create(in);long rev=created.queueRevision();
        assertThat(service.create(in)).isEqualTo(created);assertThat(service.snapshot().queueRevision()).isEqualTo(rev);
        var complete=service.status(created.item().id(),"COMPLETED",action(created.item()));
        var retry=service.create(request("중복 새 제목",manual("one","review","v1")));assertThat(retry.item().id()).isEqualTo(created.item().id());assertThat(retry.item().status()).isEqualTo("COMPLETED");assertThat(retry.queueRevision()).isEqualTo(complete.queueRevision());
        var differentIntent=service.create(request("다른 검토",manual("one","approval","v1")));assertThat(differentIntent.item().id()).isNotEqualTo(created.item().id());
        var differentGeneration=service.create(request("다시 생성",manual("one","review","v2")));assertThat(differentGeneration.item().id()).isNotEqualTo(created.item().id());
        var dismiss=service.status(differentGeneration.item().id(),"DISMISSED",action(differentGeneration.item()));assertThat(service.create(request("재시도",manual("one","review","v2"))).item().status()).isEqualTo("DISMISSED");
        assertThat(service.snapshot().items()).extracting(Item::id).containsExactly(differentIntent.item().id());
    }
    @Test void ledgerMismatchAndFailedMutationRollbackAreAtomic(){
        var input=request("한 번만",manual("ledger","review","v1"));var response=tx.execute(status->service.create(input));
        var changed=new Create(input.operationId(),input.id(),"다른 입력",null,"WORK FLOW",null,input.source(),null);fails("IDEMPOTENCY_MISMATCH",()->service.create(changed));
        assertThat(service.create(input)).isEqualTo(response);long before=service.snapshot().queueRevision();
        var invalid=new Create(UUID.randomUUID(),UUID.randomUUID(),"test",UUID.randomUUID(),"",null,manual("bad","review","v1"),null);
        fails("PROJECT_NOT_FOUND",()->tx.execute(status->service.create(invalid)));assertThat(service.snapshot().queueRevision()).isEqualTo(before);assertThat(db.queryForObject("select count(*) from attention_operations where operation_id=?",Integer.class,invalid.operationId())).isZero();
        var item=response.item();UUID op=UUID.randomUUID();var a=new LinkedHashMap<String,Object>();a.put("operationId",op.toString());a.put("expectedRevision",item.revision());a.put("action","바뀐 제목");var b=new LinkedHashMap<String,Object>();b.put("action","바뀐 제목");b.put("expectedRevision",item.revision());b.put("operationId",op.toString());assertThat(service.edit(item.id(),b)).isEqualTo(service.edit(item.id(),a));
    }
    @Test void queueAckNeverMutatesLinkedWorkTaskOrProjectAndReferencesAreOwnerScoped(){
        UUID project=UUID.randomUUID(),task=UUID.randomUUID(),foreign=UUID.randomUUID();db.update("insert into projects(id,user_id,name) values(?,?,?),(?,?,?)",project,owner,"실제 프로젝트",foreign,other,"외부");db.update("insert into work_tasks(id,user_id,project_id,status,revision) values(?,?,?,'WAITING',12)",task,owner,project);
        var item=service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"인계 확인",project,"snapshot",task,manual("linked","review","v1"),null)).item();assertThat(item.projectLabel()).isEqualTo("실제 프로젝트");
        var done=service.status(item.id(),"COMPLETED",action(item)).item();var opened=service.status(item.id(),"OPEN",action(done)).item();service.status(item.id(),"DISMISSED",action(opened));
        assertThat(db.queryForObject("select status from work_tasks where id=?",String.class,task)).isEqualTo("WAITING");assertThat(db.queryForObject("select revision from work_tasks where id=?",Long.class,task)).isEqualTo(12);assertThat(db.queryForObject("select status from projects where id=?",String.class,project)).isEqualTo("ACTIVE");
        fails("PROJECT_NOT_FOUND",()->service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"foreign",foreign,"",null,manual("foreign","review","v1"),null)));
        UUID mismatch=UUID.randomUUID();db.update("insert into projects(id,user_id,name) values(?,?,?)",mismatch,owner,"다른 프로젝트");fails("INVALID_INPUT",()->service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"mismatch",mismatch,"",task,manual("mismatch","review","v1"),null)));
        var otherService=new AttentionService(db,()->other,JsonMapper.builder().build());fails("ITEM_NOT_FOUND",()->otherService.item(item.id()));assertThat(otherService.snapshot().items()).isEmpty();assertThat(otherService.etag(otherService.snapshot())).isNotEqualTo(service.etag(service.snapshot()));
    }
    @Test void stackAndLaneOrdersAreIndependentAndRenameSeenDoNotBump(){
        var a=create("a");var b=create("b");var c=create("c");var snap=service.snapshot();assertThat(snap.items()).extracting(Item::id).containsExactly(c.id(),b.id(),a.id());
        service.move(a.id(),new Move(UUID.randomUUID(),a.revision(),snap.queueRevision(),"STACK",null,c.id()));snap=service.snapshot();assertThat(snap.items()).extracting(Item::id).containsExactly(a.id(),c.id(),b.id());assertThat(snap.items().stream().sorted(Comparator.comparingInt(Item::laneOrder))).extracting(Item::id).containsExactly(c.id(),b.id(),a.id());
        var current=service.item(a.id());service.edit(a.id(),Map.of("operationId",UUID.randomUUID().toString(),"expectedRevision",current.revision(),"action","수정"));service.seen(a.id(),action(service.item(a.id())));assertThat(service.snapshot().items()).extracting(Item::id).containsExactly(a.id(),c.id(),b.id());
        snap=service.snapshot();UUID destination=snap.lanes().get(1).id();current=service.item(a.id());service.move(a.id(),new Move(UUID.randomUUID(),current.revision(),snap.queueRevision(),"LANE",destination,null));assertThat(service.snapshot().items()).extracting(Item::id).containsExactly(a.id(),c.id(),b.id());assertThat(service.item(a.id()).laneId()).isEqualTo(destination);
        var done=service.status(c.id(),"COMPLETED",action(service.item(c.id()))).item();service.status(c.id(),"OPEN",action(done));assertThat(service.snapshot().items()).extracting(Item::id).containsExactly(c.id(),a.id(),b.id());
    }
    @Test void lanesHaveOneToThreeInvariantAndRemovalRebindsHistory(){
        var a=create("lane");var snap=service.snapshot();fails("LANE_LIMIT",()->service.createLane(new LaneCreate(UUID.randomUUID(),snap.queueRevision(),"초과")));
        var done=service.status(a.id(),"COMPLETED",action(a)).item();UUID sourceLane=a.laneId(),target=snap.lanes().get(1).id();service.removeLane(sourceLane,new LaneRemove(UUID.randomUUID(),service.snapshot().queueRevision(),target));assertThat(service.item(done.id()).laneId()).isEqualTo(target);assertThat(service.snapshot().lanes()).hasSize(2);
        var now=service.snapshot();service.orderLanes(new LaneOrder(UUID.randomUUID(),now.queueRevision(),List.of(now.lanes().get(1).id(),now.lanes().getFirst().id())));var lanes=service.snapshot().lanes();service.renameLane(lanes.getFirst().id(),new LaneRename(UUID.randomUUID(),lanes.getFirst().revision(),"내 순서"));assertThat(service.snapshot().lanes().getFirst().name()).isEqualTo("내 순서");
        var two=service.snapshot();service.removeLane(two.lanes().get(1).id(),new LaneRemove(UUID.randomUUID(),two.queueRevision(),two.lanes().getFirst().id()));var one=service.snapshot();fails("LANE_LIMIT",()->service.removeLane(one.lanes().getFirst().id(),new LaneRemove(UUID.randomUUID(),one.queueRevision(),one.lanes().getFirst().id())));assertThat(one.lanes()).hasSize(1);
    }
    @Test void newerReopenAndWrongGenerationCannotBeOverwrittenAndHistorySearchEscapesWildcards(){
        var item=create("conflict");var oldAction=action(item);var done=service.status(item.id(),"COMPLETED",oldAction).item();service.status(item.id(),"OPEN",action(done));fails("REVISION_CONFLICT",()->service.status(item.id(),"COMPLETED",new Action(UUID.randomUUID(),oldAction.expectedRevision(),oldAction.expectedGeneration())));
        fails("GENERATION_CHANGED",()->service.status(item.id(),"COMPLETED",new Action(UUID.randomUUID(),service.item(item.id()).revision(),"new-generation")));
        service.status(item.id(),"COMPLETED",action(service.item(item.id())));assertThat(service.history("COMPLETED",null,"conflict").items()).hasSize(1);assertThat(service.history("COMPLETED",null,"%").items()).isEmpty();assertThat(service.history("COMPLETED",null,"_never_").items()).isEmpty();
    }
    @Test void sourceResolutionIsNamespaceScopedAndHumanReopenWinsSameGeneration(){
        SecurityContextHolder.getContext().setAuthentication(new AttentionAuthentication(owner,UUID.randomUUID(),"team-kafka","PRODUCER"));Source source=new Source("TEAM_KAFKA","workspace:review:one","https://example.com/review/one","team-kafka","human-confirmation","cycle1","SOURCE_RESOLVED",null);var created=service.create(request("승인 확인",source)).item();var resolution=new Resolution(UUID.randomUUID(),created.sourceKey(),"cycle1","source-rev1");var resolved=service.resolve(resolution);assertThat(resolved.item().status()).isEqualTo("COMPLETED");assertThat(service.resolve(resolution)).isEqualTo(resolved);
        SecurityContextHolder.clearContext();var reopened=service.status(created.id(),"OPEN",action(service.item(created.id()))).item();
        SecurityContextHolder.getContext().setAuthentication(new AttentionAuthentication(owner,UUID.randomUUID(),"team-kafka","PRODUCER"));assertThat(service.resolve(new Resolution(UUID.randomUUID(),created.sourceKey(),"cycle1","source-rev1")).item().status()).isEqualTo("OPEN");
        SecurityContextHolder.getContext().setAuthentication(new AttentionAuthentication(owner,UUID.randomUUID(),"codex-local","PRODUCER"));fails("ITEM_NOT_FOUND",()->service.resolve(new Resolution(UUID.randomUUID(),created.sourceKey(),"cycle1","source-rev1")));fails("INSUFFICIENT_SCOPE",()->service.status(created.id(),"COMPLETED",action(reopened)));
    }
    @Test void invalidTargetsOwnerFieldsAndStaleQueueMovesAreRejected(){
        assertThat(AttentionService.normalizeUrl("HTTPS://CHATGPT.COM:443/c/a%2Fb?x=%2F#ignored")).isEqualTo("https://chatgpt.com/c/a%2Fb?x=%2F");for(String url:List.of("file:///C:/secret","javascript:alert(1)","http://chatgpt.com/c/one","https://user:password@example.com/"))fails("INVALID_TARGET",()->AttentionService.normalizeUrl(url));
        var a=create("strict");var b=create("incoming");fails("QUEUE_ORDER_CHANGED",()->service.move(a.id(),new Move(UUID.randomUUID(),a.revision(),0L,"STACK",null,b.id())));
        fails("INVALID_INPUT",()->service.edit(a.id(),Map.of("operationId",UUID.randomUUID().toString(),"expectedRevision",a.revision(),"ownerId",other.toString())));
        fails("TARGET_MEANING_CHANGED",()->service.target(a.id(),new Target(UUID.randomUUID(),a.revision(),a.source().generation(),new Source("CHATGPT","another-conversation","https://chatgpt.com/c/another",null,null,null,null,null))));
        fails("TARGET_MEANING_CHANGED",()->service.target(a.id(),new Target(UUID.randomUUID(),a.revision(),a.source().generation(),new Source("CHATGPT",a.source().reference(),"https://chatgpt.com/c/another",null,null,null,null,null))));
        fails("INVALID_TARGET",()->service.create(request("folder leak",new Source("CODEX_DESKTOP","D:\\DEV_SPACE\\private",null,"MANUAL","review","v1","ACK_ONLY",null))));
    }
    @Test void projectRenameInvalidatesEtagAndDeletionKeepsSnapshotLabelEditable(){
        UUID project=UUID.randomUUID();db.update("insert into projects(id,user_id,name) values(?,?,?)",project,owner,"Original");var item=service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"Project check",project,"",null,manual("project-ref","review","v1"),null)).item();String before=service.etag(service.snapshot());db.update("update projects set name='Renamed' where id=?",project);assertThat(service.snapshot().items().getFirst().projectLabel()).isEqualTo("Renamed");assertThat(service.etag(service.snapshot())).isNotEqualTo(before);db.update("delete from projects where id=?",project);assertThat(service.item(item.id()).projectLabel()).isEqualTo("Original");assertThat(service.edit(item.id(),Map.of("operationId",UUID.randomUUID().toString(),"expectedRevision",item.revision(),"action","Still editable")).item().action()).isEqualTo("Still editable");
    }
    @Test void historyCursorIsBoundedAndDoesNotRepeatRows(){
        for(int i=0;i<55;i++){var item=create("history-"+i);service.status(item.id(),"COMPLETED",action(item));}var first=service.history("COMPLETED",null,null);assertThat(first.items()).hasSize(50);assertThat(first.nextCursor()).isNotBlank();var second=service.history("COMPLETED",first.nextCursor(),null);assertThat(second.items()).hasSize(5);assertThat(second.nextCursor()).isNull();var ids=new HashSet<UUID>();first.items().forEach(item->ids.add(item.id()));second.items().forEach(item->assertThat(ids.add(item.id())).isTrue());
    }
    @Test void memoUsesIndependentRevisionAndNeverChangesLifecycleSourceOrdersOrLinkedTask(){
        UUID project=UUID.randomUUID(),task=UUID.randomUUID();db.update("insert into projects(id,user_id,name) values(?,?,?)",project,owner,"Memo project");db.update("insert into work_tasks(id,user_id,project_id,status,revision) values(?,?,?,'WAITING',12)",task,owner,project);
        var item=service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"확인",project,"",task,manual("memo-linked","RESPONSE_COMPLETED","v1"),null)).item();
        assertThat(item.memo()).isEmpty();assertThat(item.memoRevision()).isZero();
        var completed=service.status(item.id(),"COMPLETED",action(item)).item();
        var saved=service.memo(item.id(),new Memo(UUID.randomUUID(),0L,"  첫 메모\r\n다음\t줄  ")).item();
        assertThat(saved.memo()).isEqualTo("  첫 메모\n다음\t줄  ");assertThat(saved.memoRevision()).isEqualTo(1);assertThat(saved.revision()).isEqualTo(completed.revision()+1);
        assertThat(saved.status()).isEqualTo("COMPLETED");assertThat(saved.completedAt()).isEqualTo(completed.completedAt());assertThat(saved.dismissedAt()).isNull();assertThat(saved.source()).isEqualTo(completed.source());assertThat(saved.sourceKey()).isEqualTo(completed.sourceKey());assertThat(saved.attentionSequence()).isEqualTo(completed.attentionSequence());assertThat(saved.stackOrder()).isEqualTo(completed.stackOrder());assertThat(saved.laneOrder()).isEqualTo(completed.laneOrder());assertThat(saved.laneId()).isEqualTo(completed.laneId());
        assertThat(db.queryForObject("select status from work_tasks where id=?",String.class,task)).isEqualTo("WAITING");assertThat(db.queryForObject("select revision from work_tasks where id=?",Long.class,task)).isEqualTo(12);assertThat(db.queryForObject("select status from projects where id=?",String.class,project)).isEqualTo("ACTIVE");
        var reopened=service.status(item.id(),"OPEN",action(saved)).item();assertThat(reopened.memo()).isEqualTo(saved.memo());assertThat(reopened.memoRevision()).isEqualTo(1);
    }
    @Test void memoConflictReturnsLatestAndRollbackDoesNotRecordOrOverwrite(){
        var item=create("memo-conflict");var first=service.memo(item.id(),new Memo(UUID.randomUUID(),0L,"server newer"));UUID rejected=UUID.randomUUID();
        assertThatThrownBy(()->tx.execute(status->service.memo(item.id(),new Memo(rejected,0L,"offline older")))).isInstanceOf(AttentionException.class).satisfies(e->{var conflict=(AttentionException)e;assertThat(conflict.code()).isEqualTo("MEMO_REVISION_CONFLICT");assertThat(conflict.latest()).isEqualTo(first.item());assertThat(conflict.queueRevision()).isEqualTo(first.queueRevision());});
        assertThat(service.item(item.id()).memo()).isEqualTo("server newer");assertThat(db.queryForObject("select count(*) from attention_operations where operation_id=?",Integer.class,rejected)).isZero();
    }
    @Test void memoReplayAfterLaterEditAndNormalizedRetryAreIdempotent(){
        var item=create("memo-replay");UUID operation=UUID.randomUUID();var request=new Memo(operation,0L,"line1\r\nline2");var first=service.memo(item.id(),request);service.memo(item.id(),new Memo(UUID.randomUUID(),1L,"later"));
        assertThat(service.memo(item.id(),request)).isEqualTo(first);assertThat(service.memo(item.id(),new Memo(operation,0L,"line1\nline2"))).isEqualTo(first);assertThat(service.item(item.id()).memo()).isEqualTo("later");
        fails("IDEMPOTENCY_MISMATCH",()->service.memo(item.id(),new Memo(operation,0L,"different")));assertThat(db.queryForObject("select count(*) from attention_items",Integer.class)).isEqualTo(1);
    }
    @Test void memoNoopAndEmptySaveDoNotCreateRowsOrSpuriousRevisions(){
        var item=create("memo-empty");long before=service.snapshot().queueRevision();var noChange=service.memo(item.id(),new Memo(UUID.randomUUID(),0L,""));assertThat(noChange.queueRevision()).isEqualTo(before);assertThat(noChange.item()).isEqualTo(item);
        var saved=service.memo(item.id(),new Memo(UUID.randomUUID(),0L,"한글"));var empty=service.memo(item.id(),new Memo(UUID.randomUUID(),1L,""));assertThat(empty.item().memo()).isEmpty();assertThat(empty.item().memoRevision()).isEqualTo(2);assertThat(empty.queueRevision()).isEqualTo(saved.queueRevision()+1);assertThat(db.queryForObject("select count(*) from attention_items",Integer.class)).isEqualTo(1);
    }
    @Test void memoValidationCountsUtf16AndRejectsUnsafeControlsAndMissingRevision(){
        var item=create("memo-limits");String emoji="😀".repeat(2000);var saved=service.memo(item.id(),new Memo(UUID.randomUUID(),0L,emoji));assertThat(saved.item().memo()).hasSize(4000);
        for(String value:Arrays.asList(null,"x".repeat(4001),"x\u0000","x\u007f","x\u0085","\uD800"))fails("INVALID_INPUT",()->service.memo(item.id(),new Memo(UUID.randomUUID(),1L,value)));
        fails("INVALID_INPUT",()->service.memo(item.id(),new Memo(UUID.randomUUID(),null,"memo")));fails("INVALID_INPUT",()->service.memo(item.id(),new Memo(UUID.randomUUID(),-1L,"memo")));
    }
    @Test void memoIsOwnerScopedHumanDeviceOnlyAndMetadataPatchCannotBypassGuard(){
        var item=create("memo-owner");var otherService=new AttentionService(db,()->other,JsonMapper.builder().build());fails("ITEM_NOT_FOUND",()->tx.execute(status->otherService.memo(item.id(),new Memo(UUID.randomUUID(),0L,"foreign"))));
        SecurityContextHolder.getContext().setAuthentication(new AttentionAuthentication(owner,UUID.randomUUID(),"team-kafka","PRODUCER"));fails("INSUFFICIENT_SCOPE",()->service.memo(item.id(),new Memo(UUID.randomUUID(),0L,"producer")));
        SecurityContextHolder.getContext().setAuthentication(new AttentionAuthentication(owner,UUID.randomUUID(),"human","DEVICE"));assertThat(service.memo(item.id(),new Memo(UUID.randomUUID(),0L,"device" )).item().memo()).isEqualTo("device");
        fails("INVALID_INPUT",()->service.edit(item.id(),Map.of("operationId",UUID.randomUUID(),"expectedRevision",1L,"memo","unguarded")));
    }
    @Test void providedSummaryIsGroundedValidatedAndTargetRefreshCannotReplaceItOrDedupe(){
        Source provided=new Source("CHATGPT","summary","https://chatgpt.com/c/summary","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,"  Source authorized\r\nsummary  ","SOURCE_PROVIDED");var item=service.create(request("확인",provided)).item();
        assertThat(item.summary()).isEqualTo("Source authorized\nsummary");assertThat(item.summaryOrigin()).isEqualTo("SOURCE_PROVIDED");
        var target=service.target(item.id(),new Target(UUID.randomUUID(),item.revision(),"v1",new Source("CHATGPT","summary",provided.url(),null,null,null,null,null,"injected","SOURCE_PROVIDED"))).item();assertThat(target.summary()).isEqualTo(item.summary());
        var duplicate=service.create(request("other",new Source("CHATGPT","summary",provided.url(),"MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,"different","SOURCE_PROVIDED"))).item();assertThat(duplicate.id()).isEqualTo(item.id());assertThat(duplicate.summary()).isEqualTo(item.summary());
        for(String origin:List.of("AI_GENERATED","TITLE_FALLBACK","invented"))fails("INVALID_INPUT",()->service.create(request("bad",new Source("CHATGPT","bad-summary",provided.url(),"MANUAL","review","v1","ACK_ONLY",null,"summary",origin))));
        fails("INVALID_INPUT",()->service.create(request("bad",new Source("CHATGPT","bad-summary",provided.url(),"MANUAL","review","v1","ACK_ONLY",null,"s".repeat(1001),"SOURCE_PROVIDED"))));
        fails("INVALID_INPUT",()->service.create(request("bad",new Source("CHATGPT","bad-summary",provided.url(),"MANUAL","review","v1","ACK_ONLY",null,"summary",null))));
    }
    @Test void legacySourcesAndStoredReplayDeserializeWithSafeDefaults(){
        var mapper=JsonMapper.builder().build();var item=create("legacy-fields");var object=mapper.readValue(mapper.writeValueAsString(item),Map.class);object.remove("memo");object.remove("memoRevision");object.remove("summary");object.remove("summaryOrigin");var sourceMap=(Map<?,?>)object.get("source");sourceMap.remove("summary");sourceMap.remove("summaryOrigin");
        var legacy=mapper.readValue(mapper.writeValueAsString(object),Item.class);assertThat(legacy.memo()).isEmpty();assertThat(legacy.memoRevision()).isZero();assertThat(legacy.summary()).isEqualTo(item.action());assertThat(legacy.summaryOrigin()).isEqualTo("TITLE_FALLBACK");assertThat(legacy.source().summary()).isNull();
        UUID operation=UUID.randomUUID();var changed=service.edit(item.id(),Map.of("operationId",operation,"expectedRevision",item.revision(),"action","새 제목"));assertThat(changed.item().summary()).isEqualTo("새 제목");assertThat(changed.item().summaryOrigin()).isEqualTo("TITLE_FALLBACK");
    }
    @Test void legacyCreateOperationHashAndReplyRemainReplayCompatibleAcrossUpgrade()throws Exception{
        var mapper=JsonMapper.builder().build();var request=request("legacy operation",manual("old-operation","review","v1"));var result=service.create(request);
        var payload=new TreeMap<String,Object>(mapper.readValue(mapper.writeValueAsString(request),Map.class));var oldSource=new TreeMap<String,Object>((Map<String,Object>)payload.get("source"));oldSource.remove("summary");oldSource.remove("summaryOrigin");payload.put("source",oldSource);
        String legacyHash=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(("create\n"+mapper.writeValueAsString(payload)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        var reply=mapper.readValue(mapper.writeValueAsString(result),Map.class);var replyItem=(Map<String,Object>)reply.get("item");for(String key:List.of("memo","memoRevision","summary","summaryOrigin"))replyItem.remove(key);var replySource=(Map<String,Object>)replyItem.get("source");replySource.remove("summary");replySource.remove("summaryOrigin");
        db.update("update attention_operations set request_hash=?,response=? where user_id=? and operation_id=?",legacyHash,mapper.writeValueAsString(reply),owner,request.operationId());
        assertThat(service.create(request)).isEqualTo(result);assertThat(db.queryForObject("select count(*) from attention_items",Integer.class)).isEqualTo(1);
    }
    @Test void extractiveAndStructuredSummaryProvenanceRoundTripsWithoutInventingContent(){
        var mapper=JsonMapper.builder().build();
        for(String origin:List.of("LOCAL_EXTRACTIVE","EVENT_METADATA")){
            var source=new Source("CHATGPT",origin,"https://chatgpt.com/c/"+origin,"MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,"  근거 있는 문장\r\n확인할 내용  ",origin);
            var request=request("검토",source);var result=service.create(request);var item=result.item();
            assertThat(item.summary()).isEqualTo("근거 있는 문장\n확인할 내용");assertThat(item.summaryOrigin()).isEqualTo(origin);assertThat(item.source().summary()).isEqualTo(item.summary());assertThat(item.source().summaryOrigin()).isEqualTo(origin);
            var roundtrip=mapper.readValue(mapper.writeValueAsString(item),Item.class);assertThat(roundtrip).isEqualTo(item);assertThat(service.create(request)).isEqualTo(result);
            assertThat(service.snapshot().items()).filteredOn(i->i.id().equals(item.id())).singleElement().satisfies(i->{assertThat(i.summary()).isEqualTo(item.summary());assertThat(i.summaryOrigin()).isEqualTo(origin);});
            var completed=service.status(item.id(),"COMPLETED",action(item)).item();assertThat(service.history("COMPLETED",null,null).items()).filteredOn(i->i.id().equals(item.id())).singleElement().satisfies(i->assertThat(i.summaryOrigin()).isEqualTo(origin));
            assertThat(completed.summary()).isEqualTo(item.summary());
        }
    }
    @Test void repeatedProducerEventCannotOverwriteMemoCompletedStateOrdersOrOriginalExtract(){
        var authentication=new AttentionAuthentication(owner,UUID.randomUUID(),"team-kafka","PRODUCER");SecurityContextHolder.getContext().setAuthentication(authentication);
        var source=new Source("TEAM_KAFKA","summary-dedupe","https://example.com/review","team-kafka","COMPLETED","cycle-1","ACK_ONLY",null,"첫 결과에서 뽑은 문장","LOCAL_EXTRACTIVE");var first=service.create(request("검토 필요",source)).item();
        SecurityContextHolder.clearContext();var saved=service.memo(first.id(),new Memo(UUID.randomUUID(),0L,"사용자의 별도 메모")).item();var completed=service.status(first.id(),"COMPLETED",action(saved)).item();long queue=service.snapshot().queueRevision();
        SecurityContextHolder.getContext().setAuthentication(authentication);
        var repeatedSource=new Source(source.kind(),source.reference(),source.url(),source.producer(),source.intent(),source.generation(),source.completionPolicy(),null,"재시도에서 다른 문장","EVENT_METADATA");var repeated=service.create(request("바꾼 제목",repeatedSource));
        assertThat(repeated.item()).isEqualTo(completed);assertThat(repeated.queueRevision()).isEqualTo(queue);assertThat(repeated.item().memo()).isEqualTo("사용자의 별도 메모");assertThat(repeated.item().memoRevision()).isEqualTo(1L);assertThat(repeated.item().summary()).isEqualTo("첫 결과에서 뽑은 문장");assertThat(repeated.item().summaryOrigin()).isEqualTo("LOCAL_EXTRACTIVE");
        assertThat(db.queryForObject("select count(*) from attention_items",Integer.class)).isEqualTo(1);
    }
    @Test void summarySizeAndProvenanceAreBoundedAndOwnerScoped(){
        for(String origin:List.of("SOURCE_PROVIDED","LOCAL_EXTRACTIVE","EVENT_METADATA")){
            var item=service.create(request("bounded",new Source("CHATGPT","bound-"+origin,"https://chatgpt.com/c/bound","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,"😀".repeat(500),origin))).item();assertThat(item.summary()).hasSize(1000);
            fails("INVALID_INPUT",()->service.create(request("too long",new Source("CHATGPT","over-"+origin,"https://chatgpt.com/c/bound","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,"😀".repeat(500)+"x",origin))));
            for(String value:List.of("\u0000","\u007f","\u0085","\uD800"))fails("INVALID_INPUT",()->service.create(request("unsafe",new Source("CHATGPT","unsafe-"+origin,"https://chatgpt.com/c/bound","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,value,origin))));
            fails("INVALID_INPUT",()->service.create(request("no content",new Source("CHATGPT","empty-"+origin,"https://chatgpt.com/c/bound","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,null,origin))));
            var otherService=new AttentionService(db,()->other,JsonMapper.builder().build());fails("ITEM_NOT_FOUND",()->otherService.item(item.id()));
        }
    }
}
