package com.kafka.backend.shareddesk;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import static com.kafka.backend.shareddesk.DeskService.*;

/** Restart-safe per-object cleanup queue. Never performs prefix-wide deletion. */
@Component
public class DeskMaintenance {
 final DeskService s;final DeskFiles files;final AtomicLong cleanupFailures=new AtomicLong();
 public DeskMaintenance(DeskService s,DeskFiles files){this.s=s;this.files=files;}
 @Scheduled(fixedDelayString="${SHARED_DESK_CLEANUP_INTERVAL_MS:3600000}") public void sweep(){
  if(!s.enabled)return;
  var owners=s.db.queryForList("select owner_id from shared_desk_sync_heads",UUID.class);
  for(UUID o:owners)s.locked(o,()->{
   for(var f:s.rows("select * from shared_desk_files where owner_id=? and ((state='UPLOADING' and upload_expires_at<current_timestamp-interval '1 hour') or (state='VERIFYING' and verification_started_at<current_timestamp-interval '1 hour'))",o)){
    UUID id=uuid(f.get("item_id"));files.cleanup(o,f.get("staging_key"),Instant.now());files.cleanup(o,f.get("final_key"),Instant.now());
    s.db.update("update shared_desk_files set state='FAILED',failure_code='EXPIRED' where owner_id=? and item_id=?",o,id);
    s.db.update("update shared_desk_items set revision=revision+1,updated_at=current_timestamp where owner_id=? and id=?",o,id);s.change(o,id,"UPSERT");s.finishVerification(o,f.get("verification_operation"),s.view(s.raw(o,id),true));
   }
   for(var item:s.rows("select i.* from shared_desk_items i left join shared_desk_files f on f.item_id=i.id and f.owner_id=i.owner_id where i.owner_id=? and i.deleted_at<current_timestamp-interval '7 days' and (i.kind<>'FILE' or f.state<>'PURGED')",o)){
    UUID id=uuid(item.get("id"));for(var f:s.rows("select * from shared_desk_files where owner_id=? and item_id=?",o,id)){files.cleanup(o,f.get("staging_key"),Instant.now());files.cleanup(o,f.get("final_key"),Instant.now());}
    s.db.update("delete from shared_desk_memo_files where owner_id=? and memo_id=?",o,id);
    if("FILE".equals(item.get("kind"))){
     // Keep a small FILE tombstone while memo references exist; remove private name/size/hash after byte expiry.
     s.db.update("update shared_desk_files set state='PURGED',size_bytes=0,display_name='삭제된 파일',sha256=?,final_key=null where owner_id=? and item_id=?","0".repeat(64),o,id);
     s.db.update("update shared_desk_items set title='삭제된 파일',body='',project_id=null where owner_id=? and id=?",o,id);
    } else {
     s.db.update("delete from shared_desk_replies where owner_id=? and parent_id=?",o,id);
     s.db.update("delete from shared_desk_items where owner_id=? and id=?",o,id);
    }
    s.db.update("delete from shared_desk_item_versions where owner_id=? and item_id=?",o,id);
   }
   Long floor=s.db.queryForObject("select coalesce(max(seq),0) from shared_desk_changes where owner_id=? and created_at<current_timestamp-interval '30 days'",Long.class,o);
   if(floor!=null&&floor>0){s.db.update("update shared_desk_sync_heads set retention_floor=greatest(retention_floor,?) where owner_id=?",floor,o);s.db.update("delete from shared_desk_changes where owner_id=? and seq<=?",o,floor);}
   s.db.update("update shared_desk_operations set result=null where owner_id=? and expires_at<current_timestamp and result is not null",o);s.db.update("delete from shared_desk_item_versions v where v.owner_id=? and exists(select 1 from shared_desk_item_versions newer where newer.owner_id=v.owner_id and newer.item_id=v.item_id and newer.seq>v.seq and newer.updated_at<current_timestamp-interval '2 hours')",o);
   return null;
  });
  s.db.update("delete from shared_desk_cursors where expires_at<current_timestamp");
  if(!s.storage.enabled())return;
  for(var entry:s.rows("select * from shared_desk_object_cleanup where not_before<current_timestamp order by not_before limit 100")){
   UUID o=uuid(entry.get("owner_id"));String key=entry.get("object_key").toString();
   // Defend against an accidentally queued live object; final/staging writes have their own owner lock.
   boolean live=s.db.queryForObject("select count(*) from shared_desk_files f join shared_desk_items i on i.id=f.item_id and i.owner_id=f.owner_id where f.owner_id=? and ((f.final_key=? and f.state in ('READY','VERIFYING') and (i.deleted_at is null or i.deleted_at>current_timestamp-interval '7 days')) or (f.staging_key=? and f.state='UPLOADING' and f.upload_expires_at>current_timestamp))",Integer.class,o,key,key)>0;
   if(live)continue;
   try{s.storage.delete(o,key);s.locked(o,()->{s.db.update("delete from shared_desk_upload_reservations where owner_id=? and staging_key=?",o,key);s.db.update("delete from shared_desk_object_cleanup where object_key=?",key);return null;});}catch(RuntimeException ex){cleanupFailures.incrementAndGet();s.db.update("update shared_desk_object_cleanup set attempts=attempts+1,not_before=? where object_key=?",Timestamp.from(Instant.now().plusSeconds(3600)),key);}
  }
 }
}
