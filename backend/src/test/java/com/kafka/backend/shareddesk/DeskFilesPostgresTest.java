package com.kafka.backend.shareddesk;

import com.kafka.backend.shareddesk.storage.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.nio.file.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Real PostgreSQL metadata/race tests with a stubbed object boundary. No shared database/provider access. */
@EnabledIfEnvironmentVariable(named="SHARED_DESK_TEST_DB",matches="jdbc:postgresql://127\\.0\\.0\\.1:55487/postgres")
class DeskFilesPostgresTest {
    JdbcTemplate db;DeskService service,other;DeskFiles files,foreign;ObjectStorage storage;
    final UUID owner=UUID.randomUUID(),outsider=UUID.randomUUID();
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource(System.getenv("SHARED_DESK_TEST_DB"),"desk_test","");db=new JdbcTemplate(ds);
        db.execute("drop schema if exists desk_files_test cascade");db.execute("create schema desk_files_test");
        db.execute("create schema if not exists auth");db.execute("create table if not exists auth.users(id uuid primary key)");
        ds.setUrl(System.getenv("SHARED_DESK_TEST_DB")+"?currentSchema=desk_files_test,public");
        db.execute("create table projects(id uuid primary key,user_id uuid not null,name text)");db.update("insert into auth.users values(?),(?)",owner,outsider);
        db.execute(Files.readString(Path.of("src/main/resources/db/migration/V101__shared_desk_v1.sql")));
        storage=mock(ObjectStorage.class);when(storage.enabled()).thenReturn(true);
        when(storage.newStagingKey(any())).thenAnswer(i->"shared-desk/test/"+i.getArgument(0)+"/staging/"+UUID.randomUUID());
        when(storage.newFinalKey(any())).thenAnswer(i->"shared-desk/test/"+i.getArgument(0)+"/final/"+UUID.randomUUID());
        when(storage.presignPut(any(),anyString(),any())).thenReturn(new ObjectStorage.SignedTicket(URI.create("https://storage.invalid/upload"),Instant.now().plusSeconds(600),Map.of()));
        when(storage.presignGet(any(),anyString(),anyString())).thenReturn(new ObjectStorage.SignedTicket(URI.create("https://storage.invalid/download"),Instant.now().plusSeconds(60),Map.of()));
        when(storage.promoteAndVerify(any(),anyString(),anyString(),any())).thenAnswer(i->{FilePolicy.Claim c=i.getArgument(3);return new FilePolicy.Verified(c.sizeBytes(),c.sha256(),c.claimedMime());});
        var manager=new DataSourceTransactionManager(ds);var json=JsonMapper.builder().build();
        service=new DeskService(db,()->owner,json,manager,storage,true,"TEST");other=new DeskService(db,()->outsider,json,manager,storage,true,"TEST");
        files=new DeskFiles(service,storage);foreign=new DeskFiles(other,storage);
    }
    @AfterEach void cleanup(){if(db!=null){db.execute("drop schema if exists desk_files_test cascade");db.update("delete from auth.users where id=? or id=?",owner,outsider);}}
    Map<String,Object> op(Object... values){var out=new LinkedHashMap<String,Object>();out.put("operationId",UUID.randomUUID().toString());out.put("operationCreatedAt",Instant.now().toString());for(int i=0;i<values.length;i+=2)out.put(values[i].toString(),values[i+1]);return out;}
    Map<String,Object> upload(long bytes){return op("displayName","synthetic.txt","sizeBytes",bytes,"sha256","0".repeat(64),"claimedMime","text/plain");}
    UUID id(Map<String,Object> ticket){return UUID.fromString(ticket.get("fileId").toString());}
    Map<String,Object> completeRequest(Map<String,Object> ticket){return op("expectedRevision",ticket.get("revision"),"ticketId",ticket.get("ticketId").toString());}
    void fails(int status,Runnable action){assertThatThrownBy(action::run).isInstanceOfSatisfying(DeskException.class,e->assertThat(e.status).isEqualTo(status));}
    long reservations(){return db.queryForObject("select coalesce(sum(size_bytes),0) from shared_desk_upload_reservations where owner_id=?",Long.class,owner);}
    void seedReady(long size){
        // Represents old verified metadata whose staging deletion was already acknowledged; no fake provider test.
        service.locked(owner,()->{UUID item=UUID.randomUUID();db.update("insert into shared_desk_items(id,owner_id,kind,title) values(?,?,'FILE','seed')",item,owner);db.update("insert into shared_desk_files(item_id,owner_id,display_name,size_bytes,sha256,claimed_mime,state,staging_key,final_key,ticket_id,upload_expires_at) values(?,?,'seed.txt',?,?,'text/plain','READY',?,?,?,?)",item,owner,size,"0".repeat(64),"old-staging/"+item,"old-final/"+item,UUID.randomUUID(),Timestamp.from(Instant.now()));service.change(owner,item,"UPSERT");return null;});
    }
    @Test void completionOwnerIsolationTrashRestoreAndOperationReplay(){
        var ticket=files.create(upload(128));UUID item=id(ticket);var complete=completeRequest(ticket);
        fails(404,()->foreign.download(item));fails(404,()->foreign.cancel(item,op("expectedRevision",1)));
        var ready=files.complete(item,complete);assertThat(ready).containsEntry("state","READY");
        assertThat(files.complete(item,complete).get("id").toString()).isEqualTo(item.toString());
        assertThat(service.operation(UUID.fromString(complete.get("operationId").toString()))).containsEntry("status","ACKNOWLEDGED");
        assertThat(files.download(item)).containsEntry("sizeBytes",128L);fails(404,()->foreign.download(item));
        var trashed=service.delete("FILE",item,op("expectedRevision",ready.get("revision")));fails(410,()->files.download(item));
        service.restore(item,op("expectedRevision",trashed.get("revision")));assertThat(files.download(item)).containsEntry("sizeBytes",128L);
    }
    @Test void sameUploadOperationReservesOnlyOnceAndRejectsChangedPayload(){
        var request=upload(17);var first=files.create(request);var replay=files.create(request);
        assertThat(replay.get("fileId").toString()).isEqualTo(first.get("fileId").toString());assertThat(reservations()).isEqualTo(17);
        var changed=new LinkedHashMap<>(request);changed.put("sizeBytes",18);fails(409,()->files.create(changed));
        assertThat(db.queryForObject("select count(*) from shared_desk_items",Integer.class)).isEqualTo(1);
    }
    @Test void simultaneousFourthUploadIsRejectedWithoutLeakingReservation() throws Exception {
        files.create(upload(1));files.create(upload(1));var pool=Executors.newFixedThreadPool(2);
        try {
            var results=pool.invokeAll(List.<Callable<Integer>>of(()->createStatus(upload(1)),()->createStatus(upload(1))));
            assertThat(List.of(results.get(0).get(),results.get(1).get())).containsExactlyInAnyOrder(200,429);
            assertThat(db.queryForObject("select count(*) from shared_desk_files",Integer.class)).isEqualTo(3);assertThat(reservations()).isEqualTo(3);
        } finally {pool.shutdownNow();}
    }
    int createStatus(Map<String,Object> request){try{files.create(request);return 200;}catch(DeskException e){return e.status;}}
    @Test void quotaReservationRaceAndTrashBytesStayCharged() throws Exception {
        for(int i=0;i<10;i++)seedReady(100L*1024*1024);
        UUID seed=db.queryForObject("select id from shared_desk_items limit 1",UUID.class);
        service.delete("FILE",seed,op("expectedRevision",1));
        var pool=Executors.newFixedThreadPool(2);
        try {
            var results=pool.invokeAll(List.<Callable<Integer>>of(()->createStatus(upload(20L*1024*1024)),()->createStatus(upload(20L*1024*1024))));
            assertThat(List.of(results.get(0).get(),results.get(1).get())).containsExactlyInAnyOrder(200,413);
            assertThat(reservations()).isEqualTo(20L*1024*1024);
        } finally {pool.shutdownNow();}
    }
    @Test void cancelAndTicketRetryKeepPreviouslyIssuedBytesReserved(){
        var ticket=files.create(upload(100L*1024*1024));UUID item=id(ticket);
        var cancelled=files.cancel(item,op("expectedRevision",1));assertThat(reservations()).isEqualTo(100L*1024*1024);
        var next=files.retry(item,op("expectedRevision",cancelled.get("revision")));assertThat(reservations()).isEqualTo(200L*1024*1024);
        assertThat(next.get("ticketId").toString()).isNotEqualTo(ticket.get("ticketId").toString());
        assertThat(db.queryForObject("select min(extract(epoch from (r.expires_at-f.upload_expires_at))) from shared_desk_upload_reservations r join shared_desk_files f on f.staging_key=r.staging_key",Double.class)).isGreaterThanOrEqualTo(659.0);
    }
    @Test void cancellationCannotMintUnlimitedActivePresignedBytes(){
        var ticket=files.create(upload(100L*1024*1024));UUID item=id(ticket);long revision=1;
        for(int i=1;i<10;i++){
            var cancelled=files.cancel(item,op("expectedRevision",revision));
            ticket=files.retry(item,op("expectedRevision",cancelled.get("revision")));revision=((Number)ticket.get("revision")).longValue();
        }
        var cancelled=files.cancel(item,op("expectedRevision",revision));
        fails(413,()->files.retry(item,op("expectedRevision",cancelled.get("revision"))));
        assertThat(reservations()).isEqualTo(1000L*1024*1024);
    }
    @Test void completionReservesFinalCopyHeadroomBeforeExternalIo(){
        for(int i=0;i<9;i++)seedReady(100L*1024*1024);
        var ticket=files.create(upload(100L*1024*1024));
        fails(413,()->files.complete(id(ticket),completeRequest(ticket)));
        verify(storage,never()).promoteAndVerify(any(),anyString(),anyString(),any());
        assertThat(service.get("FILE",id(ticket))).containsEntry("state","UPLOADING");
    }
    @Test void forgedProjectAndMemoFileReferencesDoNotCrossOwners(){
        UUID project=UUID.randomUUID();db.update("insert into projects values(?,?,?)",project,outsider,"foreign");
        var request=upload(1);request.put("projectId",project.toString());fails(404,()->files.create(request));assertThat(reservations()).isZero();
        var ticket=files.create(upload(1));UUID item=id(ticket);files.complete(item,completeRequest(ticket));
        fails(404,()->other.create("MEMO",op("body","foreign","fileIds",List.of(item.toString()))));
        var memo=service.create("MEMO",op("body","owner","fileIds",List.of(item.toString())));assertThat(memo.get("fileIds")).asList().hasSize(1);
    }
    @Test void pendingCompletionCannotResurrectCancelledOrReticketedFile() throws Exception {
        var ticket=files.create(upload(1));UUID item=id(ticket);var request=completeRequest(ticket);
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        doAnswer(i->{entered.countDown();if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("test release timeout");return new FilePolicy.Verified(1,"0".repeat(64),"text/plain");}).when(storage).promoteAndVerify(any(),anyString(),anyString(),any());
        var pool=Executors.newSingleThreadExecutor();
        try {
            var pending=pool.submit(()->{try{files.complete(item,request);return 200;}catch(DeskException e){return e.status;}});
            assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
            var cancelled=files.cancel(item,op("expectedRevision",1));
            fails(409,()->files.complete(item,request));
            var retried=files.retry(item,op("expectedRevision",cancelled.get("revision")));
            fails(409,()->files.complete(item,request));release.countDown();assertThat(pending.get(10,TimeUnit.SECONDS)).isEqualTo(409);
            assertThat(service.get("FILE",item)).containsEntry("state","UPLOADING");assertThat(files.metadata(item).get("ticketId").toString()).isEqualTo(retried.get("ticketId").toString());
        } finally {release.countDown();pool.shutdownNow();}
    }
    @Test void stillValidPagingCursorExpiresWhenPendingChangesWerePurged(){
        String after=service.changes(null,null,100).get("nextCursor").toString();
        service.create("CLIP",op("body","first"));service.create("CLIP",op("body","pending"));
        var page=service.changes(after,null,1);assertThat(page.get("hasMore")).isEqualTo(true);
        db.update("update shared_desk_changes set created_at=current_timestamp-interval '31 days' where seq>1");
        new DeskMaintenance(service,files).sweep();
        fails(410,()->service.changes(page.get("nextCursor").toString(),page.get("highWater").toString(),100));
    }
    @Test void failedFinalAndOldStagingStayChargedUntilIndividualDeleteAcknowledgement(){
        var ticket=files.create(upload(100));UUID item=id(ticket);
        doThrow(new StorageFailure(StorageFailure.Code.UNAVAILABLE)).when(storage).promoteAndVerify(any(),anyString(),anyString(),any());
        var failed=files.complete(item,completeRequest(ticket));assertThat(failed).containsEntry("state","FAILED");
        assertThat(reservations()).isEqualTo(200); // old staging plus potentially existing unverified final
        files.retry(item,op("expectedRevision",failed.get("revision")));assertThat(reservations()).isEqualTo(300);
        doThrow(new StorageFailure(StorageFailure.Code.UNAVAILABLE)).when(storage).delete(any(),anyString());
        db.update("update shared_desk_object_cleanup set not_before=current_timestamp-interval '1 second'");
        new DeskMaintenance(service,files).sweep();assertThat(reservations()).isEqualTo(300);
        doNothing().when(storage).delete(any(),anyString());
        db.update("update shared_desk_object_cleanup set not_before=current_timestamp-interval '1 second'");
        new DeskMaintenance(service,files).sweep();assertThat(reservations()).isEqualTo(100);
        assertThat(service.get("FILE",item)).containsEntry("state","UPLOADING");
    }
    @Test void sizeLimitReturns413BeforeAllocatingBytes(){fails(413,()->files.create(upload(104857601L)));assertThat(reservations()).isZero();assertThat(db.queryForObject("select count(*) from shared_desk_items",Integer.class)).isZero();}
    @Test void expiredVerificationLeaseResumesSameOperationAndKeepsOldCopyCharged(){
        var ticket=files.create(upload(1));UUID item=id(ticket);var request=completeRequest(ticket);String oldFinal=storage.newFinalKey(owner);
        service.locked(owner,()->{service.saveOperation(owner,"COMPLETE/"+item,request,Map.of("status","VERIFYING"));db.update("update shared_desk_files set state='VERIFYING',final_key=?,verification_operation=?,verification_started_at=current_timestamp-interval '6 minutes' where item_id=?",oldFinal,UUID.fromString(request.get("operationId").toString()),item);return null;});
        var ready=files.complete(item,request);assertThat(ready).containsEntry("state","READY");assertThat(service.operation(UUID.fromString(request.get("operationId").toString()))).containsEntry("status","ACKNOWLEDGED");
        assertThat(db.queryForObject("select final_key from shared_desk_files where item_id=?",String.class,item)).isNotEqualTo(oldFinal);assertThat(reservations()).isEqualTo(2);
    }
}
