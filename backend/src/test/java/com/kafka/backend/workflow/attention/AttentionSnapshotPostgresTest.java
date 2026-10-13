package com.kafka.backend.workflow.attention;

import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Actual shared-lock and snapshot behavior in a marked, task-owned loopback PostgreSQL database. */
@EnabledIfEnvironmentVariable(named="QA_ATTENTION_PG_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:55443/postgres")
class AttentionSnapshotPostgresTest {
    UUID owner=UUID.randomUUID(),other=UUID.randomUUID();String schema;RecordingJdbc db;JdbcTemplate admin;AttentionService service;ExecutorService threads;AtomicInteger connections=new AtomicInteger();
    static class RecordingJdbc extends JdbcTemplate {
        final Queue<String> sql=new ConcurrentLinkedQueue<>();final AtomicReference<Consumer<String>> before=new AtomicReference<>(),after=new AtomicReference<>();
        RecordingJdbc(DriverManagerDataSource source){super(source);}
        @Override public <T>List<T> query(String statement,RowMapper<T> mapper,Object...args){sql.add(statement);if(before.get()!=null)before.get().accept(statement);var result=super.query(statement,mapper,args);if(after.get()!=null)after.get().accept(statement);return result;}
        @Override public List<Map<String,Object>> queryForList(String statement,Object...args){sql.add(statement);if(before.get()!=null)before.get().accept(statement);var result=super.queryForList(statement,args);if(after.get()!=null)after.get().accept(statement);return result;}
        @Override public int update(String statement,Object...args){sql.add(statement);if(before.get()!=null)before.get().accept(statement);int result=super.update(statement,args);if(after.get()!=null)after.get().accept(statement);return result;}
    }
    DriverManagerDataSource dataSource(String url){var source=new DriverManagerDataSource(url,"attention_snapshot_synthetic","synthetic-loopback-only"){@Override public Connection getConnection()throws SQLException{connections.incrementAndGet();return super.getConnection();}};var props=new Properties();props.put("ApplicationName","owned-attention-snapshot-qa");props.put("connectTimeout","5");props.put("socketTimeout","15");source.setConnectionProperties(props);return source;}
    AttentionService proxy(UUID user){var factory=new ProxyFactory(new AttentionService(db,()->user,JsonMapper.builder().build()));factory.setProxyTargetClass(true);factory.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(db.getDataSource()),new AnnotationTransactionAttributeSource()));return (AttentionService)factory.getProxy();}
    @BeforeEach void setup()throws Exception{
        SecurityContextHolder.clearContext();String url=System.getenv("QA_ATTENTION_PG_URL");admin=new JdbcTemplate(dataSource(url));
        assertThat(admin.queryForObject("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()",String.class)).isEqualTo("owned-work-queue-snapshot-qa");
        assertThat(admin.queryForObject("select inet_server_port()",Integer.class)).isEqualTo(55443);
        schema="qa_attention_snapshot_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);admin.update("insert into auth.users(id) values(?),(?)",owner,other);
        db=new RecordingJdbc(dataSource(url+"?currentSchema="+schema+",public"));
        db.execute("create table projects(id uuid primary key,user_id uuid,name varchar,status varchar default 'ACTIVE',revision bigint default 0)");db.execute("create table work_tasks(id uuid primary key,user_id uuid,project_id uuid,status varchar default 'WAITING',revision bigint default 0)");
        for(String file:List.of("V72__workflow_attention_queue.sql","V82__workflow_attention_memo.sql"))for(String sql:Files.readString(Path.of("src/main/resources/db/migration",file)).replaceAll("(?m)--.*$","").split(";"))if(!sql.isBlank())db.execute(sql);
        service=proxy(owner);threads=Executors.newFixedThreadPool(3);
    }
    @AfterEach void close()throws Exception{
        db.before.set(null);db.after.set(null);threads.shutdownNow();assertThat(threads.awaitTermination(10,TimeUnit.SECONDS)).isTrue();SecurityContextHolder.clearContext();
        assertThat(schema).matches("qa_attention_snapshot_[a-f0-9]{32}");admin.execute("drop schema "+schema+" cascade");
    }
    Item create(){return service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"확인",null,"WORK FLOW",null,new Source("CHATGPT","synthetic","https://chatgpt.com/c/synthetic","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null),null)).item();}
    static void waitOn(CountDownLatch latch){try{if(!latch.await(8,TimeUnit.SECONDS))throw new IllegalStateException("TEST_LATCH_TIMEOUT");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
    @Test void matchingTagUsesTwoReadsAndSkipsFullPayloadAndLaneLoading(){
        var item=create();String tag=service.etag(service.snapshot());db.update("update attention_items set source=? where id=?","not JSON",item.id());db.sql.clear();
        var result=service.conditionalSnapshot("\"unrelated\", "+tag);assertThat(result.snapshot()).isNull();assertThat(result.etag()).isEqualTo(tag);
        assertThat(db.sql).hasSize(2).noneMatch(sql->sql.contains("a.*")||sql.contains("select * from attention_lanes")||sql.contains("insert")||sql.contains("for update"));
    }
    @Test void externalProjectRenameInvalidatesTagWithoutChangingQueueRevision(){
        UUID project=UUID.randomUUID();db.update("insert into projects(id,user_id,name) values(?,?,?)",project,owner,"Original");var item=service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"확인",project,"",null,new Source("CHATGPT","project","https://chatgpt.com/c/project","MANUAL","review","v1","ACK_ONLY",null),null)).item();
        var before=service.conditionalSnapshot(null);db.update("update projects set name='Renamed' where id=?",project);var after=service.conditionalSnapshot(before.etag());
        assertThat(after.snapshot()).isNotNull();assertThat(after.snapshot().queueRevision()).isEqualTo(before.snapshot().queueRevision());assertThat(after.snapshot().items().getFirst().projectLabel()).isEqualTo("Renamed");assertThat(after.etag()).isNotEqualTo(before.etag()).isEqualTo(service.etag(after.snapshot()));assertThat(after.snapshot().items().getFirst().id()).isEqualTo(item.id());
    }
    @Test void returned200TagUsesActualPayloadIfProjectRenamesAfterHeadingProjection(){
        UUID project=UUID.randomUUID();db.update("insert into projects(id,user_id,name) values(?,?,?)",project,owner,"First");service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"확인",project,"",null,new Source("CHATGPT","race","https://chatgpt.com/c/race","MANUAL","review","v1","ACK_ONLY",null),null));
        db.after.set(sql->{if(sql.startsWith("select a.id,a.action"))admin.update("update "+schema+".projects set name='Second' where id=?",project);});
        var result=service.conditionalSnapshot("\"wrong\"");assertThat(result.snapshot().items().getFirst().projectLabel()).isEqualTo("Second");assertThat(result.etag()).isEqualTo(service.etag(result.snapshot()));
    }
    @Test void warmSharedReadersOverlapWhileOneFullSnapshotIsHeld()throws Exception{
        create();String tag=service.etag(service.snapshot());CountDownLatch held=new CountDownLatch(1),release=new CountDownLatch(1);
        db.before.set(sql->{if(sql.contains("select a.*")&&Thread.currentThread().getName().equals("held-reader")){held.countDown();waitOn(release);}});
        var reader=threads.submit(()->{Thread.currentThread().setName("held-reader");return service.conditionalSnapshot(null);});waitOn(held);
        try{var second=threads.submit(()->service.conditionalSnapshot(tag));assertThat(second.get(3,TimeUnit.SECONDS).snapshot()).isNull();assertThat(reader.isDone()).isFalse();}finally{release.countDown();}assertThat(reader.get(5,TimeUnit.SECONDS).snapshot()).isNotNull();
    }
    @Test void writerWaitsForSharedReaderAndSnapshotRevisionMatchesItsItems()throws Exception{
        var item=create();long revision=service.snapshot().queueRevision();CountDownLatch held=new CountDownLatch(1),release=new CountDownLatch(1),writerRequested=new CountDownLatch(1);
        db.before.set(sql->{if(sql.contains("select a.*")&&Thread.currentThread().getName().equals("held-reader")){held.countDown();waitOn(release);}if(sql.contains("select user_id from attention_queues")&&Thread.currentThread().getName().equals("queued-writer"))writerRequested.countDown();});
        var reader=threads.submit(()->{Thread.currentThread().setName("held-reader");return service.conditionalSnapshot(null);});waitOn(held);
        var writer=threads.submit(()->{Thread.currentThread().setName("queued-writer");return service.memo(item.id(),new Memo(UUID.randomUUID(),0L,"after reader"));});waitOn(writerRequested);
        try{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);int blocked=0;while(blocked==0&&System.nanoTime()<end){blocked=admin.queryForObject("select count(*) from pg_stat_activity where application_name='owned-attention-snapshot-qa' and cardinality(pg_blocking_pids(pid))>0",Integer.class);Thread.sleep(20);}assertThat(blocked).isPositive();assertThat(writer.isDone()).isFalse();}finally{release.countDown();}
        var snapshot=reader.get(5,TimeUnit.SECONDS).snapshot();var saved=writer.get(5,TimeUnit.SECONDS);assertThat(snapshot.queueRevision()).isEqualTo(revision);assertThat(snapshot.items().getFirst().memo()).isEmpty();assertThat(saved.queueRevision()).isEqualTo(revision+1);var latest=service.snapshot();assertThat(latest.queueRevision()).isEqualTo(saved.queueRevision());assertThat(latest.items().getFirst().memo()).isEqualTo("after reader");
    }
    void concurrentBootstrap()throws Exception{
        CountDownLatch start=new CountDownLatch(1);var a=threads.submit(()->{waitOn(start);return service.snapshot();});var b=threads.submit(()->{waitOn(start);return service.snapshot();});start.countDown();var one=a.get(8,TimeUnit.SECONDS);var two=b.get(8,TimeUnit.SECONDS);
        assertThat(one.lanes()).hasSize(3);assertThat(two.lanes()).isEqualTo(one.lanes());assertThat(one.queueRevision()).isZero();assertThat(two.queueRevision()).isZero();assertThat(db.queryForObject("select count(*) from attention_queues",Integer.class)).isEqualTo(1);assertThat(db.queryForObject("select count(*) from attention_lanes",Integer.class)).isEqualTo(3);
    }
    @Test void concurrentColdQueueBootstrapCreatesExactlyThreeSharedLanes()throws Exception{concurrentBootstrap();}
    @Test void concurrentUnfinishedBootstrapDoesNotUpgradeTwoSharedLocks()throws Exception{db.update("insert into attention_queues(user_id) values(?)",owner);concurrentBootstrap();}
    @Test void foreignTagCannotReturn304AndProducerCannotReadOwnerSnapshot(){
        create();String tag=service.etag(service.snapshot());var foreign=proxy(other).conditionalSnapshot(tag);assertThat(foreign.snapshot().items()).isEmpty();assertThat(foreign.etag()).isNotEqualTo(tag);
        SecurityContextHolder.getContext().setAuthentication(new AttentionAuthentication(owner,UUID.randomUUID(),"team-kafka","PRODUCER"));assertThatThrownBy(()->service.conditionalSnapshot(tag)).isInstanceOf(AttentionException.class).satisfies(error->assertThat(((AttentionException)error).code()).isEqualTo("INSUFFICIENT_SCOPE"));
    }
    @Test void memoMutationInvalidatesMatchingTagAndPreservesCanonicalSource(){var item=create();var before=service.conditionalSnapshot(null);service.memo(item.id(),new Memo(UUID.randomUUID(),0L,"새 메모"));var after=service.conditionalSnapshot(before.etag());assertThat(after.snapshot().queueRevision()).isEqualTo(before.snapshot().queueRevision()+1);assertThat(after.snapshot().items().getFirst().memo()).isEqualTo("새 메모");assertThat(after.snapshot().items().getFirst().sourceKey()).isEqualTo(item.sourceKey());assertThat(after.etag()).isEqualTo(service.etag(after.snapshot()));}
    List<UUID> seedOpen(int count){
        // Fixture seeding commits before concurrent test threads start; it never holds their transaction.
        return new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(db.getDataSource())).execute(status->seedOpenInTransaction(count));
    }
    List<UUID> seedOpenInTransaction(int count){
        var first=create();var lanes=service.snapshot().lanes();var ids=new ArrayList<UUID>();ids.add(first.id());var mapper=JsonMapper.builder().build();
        for(int i=1;i<count;i++){
            UUID id=UUID.randomUUID();ids.add(id);var source=new Source("CHATGPT","seed-"+id,"https://chatgpt.com/c/seed-"+id,"MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null,"근거 "+i,"LOCAL_EXTRACTIVE");String key;
            try{key=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsString(List.of(owner.toString(),"human",source.kind(),source.reference(),source.intent(),source.generation())).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}
            db.update("insert into attention_items(id,user_id,action,project_label,status,lane_id,stack_order,lane_order,attention_sequence,revision,source,source_key,producer_namespace,generation,memo,memo_revision) values(?,?,?,'','OPEN',?,?,?,?,?,?,?,'human','v1',?,?)",id,owner,"seed "+i,lanes.get(i%3).id(),i,i/3,i+1,i%5,mapper.writeValueAsString(source),key,"메모 "+i,(long)(i%3));
        }
        db.update("update attention_queues set revision=?,next_sequence=? where user_id=?",count,count+1,owner);return ids;
    }
    void bulk(String mode,UUID lane,List<UUID> ids){
        var manager=new DataSourceTransactionManager(db.getDataSource());new org.springframework.transaction.support.TransactionTemplate(manager).execute(status->{
            db.queryForList("select user_id from attention_queues where user_id=? for update",owner);
            try{var method=AttentionService.class.getDeclaredMethod("reorder",String.class,UUID.class,List.class);method.setAccessible(true);method.invoke(new AttentionService(db,()->owner,JsonMapper.builder().build()),mode,lane,ids);}catch(java.lang.reflect.InvocationTargetException e){throw new IllegalStateException(e.getCause());}catch(ReflectiveOperationException e){throw new IllegalStateException(e);}return null;
        });
    }
    @ParameterizedTest @ValueSource(ints={84,1000}) void bulkOrderMatchesOriginalScalarResultAndPreservesAllOtherFields(int count){
        int beforeConnections=connections.get();
        new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(db.getDataSource())).execute(status->{scalarReferenceComparison(count);return null;});
        assertThat(connections.get()-beforeConnections).isLessThanOrEqualTo(4);
    }
    void scalarReferenceComparison(int count){
        var ids=seedOpen(count);var foreign=proxy(other).create(new Create(UUID.randomUUID(),UUID.randomUUID(),"foreign",null,"",null,new Source("CHATGPT","foreign","https://chatgpt.com/c/foreign","MANUAL","review","v1","ACK_ONLY",null),null)).item();
        UUID historical=UUID.randomUUID();db.update("insert into attention_items select ?,user_id,'history',project_id,project_label,work_task_id,'COMPLETED',lane_id,stack_order,lane_order,attention_sequence,revision,source,?,producer_namespace,generation,human_reopen_count,resolved_source_revision,seen_at,created_at,updated_at,current_timestamp,null,memo,memo_revision from attention_items where id=?",historical,"a".repeat(64),ids.getFirst());
        for(String mode:List.of("STACK","LANE")){
            var before=db.queryForList("select * from attention_items order by id");var lane=service.snapshot().lanes().getFirst().id();var ordered=new ArrayList<UUID>(mode.equals("STACK")?ids:db.queryForList("select id from attention_items where user_id=? and lane_id=? and status='OPEN' order by lane_order,id",UUID.class,owner,lane));Collections.reverse(ordered);ordered.add(ordered.size()/2,foreign.id());String column=mode.equals("STACK")?"stack_order":"lane_order";
            // Execute the previous scalar algorithm as an independent database reference.
            for(int i=0;i<ordered.size();i++)db.update("update attention_items set "+column+"=? where id=? and user_id=?",i,ordered.get(i),owner);
            var expected=db.queryForList("select * from attention_items order by id");for(var row:before)db.update("update attention_items set stack_order=?,lane_order=? where id=?",row.get("stack_order"),row.get("lane_order"),row.get("id"));
            db.sql.clear();bulk(mode,lane,ordered);assertThat(db.sql.stream().filter(sql->sql.startsWith("update attention_items a set")).count()).isEqualTo(1);assertThat(db.queryForList("select * from attention_items order by id")).isEqualTo(expected);
            var beforeMetadata=before.stream().map(row->{var copy=new LinkedHashMap<>(row);copy.remove("stack_order");copy.remove("lane_order");return copy;}).toList();var afterMetadata=expected.stream().map(row->{var copy=new LinkedHashMap<>(row);copy.remove("stack_order");copy.remove("lane_order");return copy;}).toList();assertThat(afterMetadata).isEqualTo(beforeMetadata);
            assertThat(db.queryForObject("select stack_order from attention_items where id=?",Integer.class,foreign.id())).isEqualTo(foreign.stackOrder());assertThat(db.queryForObject("select status from attention_items where id=?",String.class,historical)).isEqualTo("COMPLETED");
        }
    }
    @Test void emptyOrderDoesNoUpdateAndSingleItemOrderUsesOneStatement(){var item=create();db.sql.clear();bulk("STACK",null,List.of());assertThat(db.sql).noneMatch(sql->sql.startsWith("update attention_items"));db.sql.clear();bulk("STACK",null,List.of(item.id()));assertThat(db.sql.stream().filter(sql->sql.startsWith("update attention_items a set")).count()).isEqualTo(1);assertThat(service.item(item.id()).stackOrder()).isZero();}
    @Test void highCountOrderWritersSerializeAndReplayOrStaleCasNeverApplyTwice()throws Exception{
        var ids=seedOpen(84);var before=service.snapshot();var moved=service.item(ids.getLast());var request=new Move(UUID.randomUUID(),moved.revision(),before.queueRevision(),"STACK",null,ids.getFirst());CountDownLatch held=new CountDownLatch(1),release=new CountDownLatch(1),writerRequested=new CountDownLatch(1);
        db.after.set(sql->{if(sql.startsWith("update attention_items a set")&&Thread.currentThread().getName().equals("held-order-writer")){held.countDown();waitOn(release);}});db.before.set(sql->{if(sql.contains("select user_id from attention_queues")&&Thread.currentThread().getName().equals("queued-create"))writerRequested.countDown();});db.sql.clear();
        var first=threads.submit(()->{Thread.currentThread().setName("held-order-writer");return service.move(moved.id(),request);});waitOn(held);
        var second=threads.submit(()->{Thread.currentThread().setName("queued-create");return service.create(new Create(UUID.randomUUID(),UUID.randomUUID(),"later",null,"",null,new Source("CHATGPT","later","https://chatgpt.com/c/later","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null),null));});waitOn(writerRequested);
        try{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);int blocked=0;while(blocked==0&&System.nanoTime()<end){blocked=admin.queryForObject("select count(*) from pg_stat_activity where application_name='owned-attention-snapshot-qa' and cardinality(pg_blocking_pids(pid))>0",Integer.class);Thread.sleep(20);}assertThat(blocked).isPositive();assertThat(second.isDone()).isFalse();}finally{release.countDown();}
        var a=first.get(5,TimeUnit.SECONDS);var b=second.get(5,TimeUnit.SECONDS);assertThat(db.sql.stream().filter(sql->sql.startsWith("update attention_items a set")).count()).isEqualTo(3);db.after.set(null);db.before.set(null);
        var expected=new ArrayList<>(ids);expected.remove(moved.id());expected.addFirst(moved.id());expected.addFirst(b.item().id());var snapshot=service.snapshot();assertThat(snapshot.items()).extracting(Item::id).containsExactlyElementsOf(expected);assertThat(snapshot.queueRevision()).isEqualTo(before.queueRevision()+2);
        db.sql.clear();assertThat(service.move(moved.id(),request)).isEqualTo(a);assertThat(db.sql).noneMatch(sql->sql.startsWith("update attention_items a set"));
        UUID rejected=UUID.randomUUID();assertThatThrownBy(()->service.move(ids.getFirst(),new Move(rejected,service.item(ids.getFirst()).revision(),before.queueRevision(),"STACK",null,null))).isInstanceOf(AttentionException.class).satisfies(error->assertThat(((AttentionException)error).code()).isEqualTo("QUEUE_ORDER_CHANGED"));assertThat(db.queryForObject("select count(*) from attention_operations where operation_id=?",Integer.class,rejected)).isZero();assertThat(service.snapshot().queueRevision()).isEqualTo(snapshot.queueRevision());
    }
}
