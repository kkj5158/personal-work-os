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
}
