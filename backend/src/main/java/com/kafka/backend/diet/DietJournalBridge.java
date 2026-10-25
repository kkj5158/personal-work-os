package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;

/** Called within the existing NOTE save transaction; no second journal mutation API. */
@Service
public class DietJournalBridge {
    private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;
    private final DietDailyNoteService daily;
    public DietJournalBridge(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,DietDailyNoteService daily){this.db=db;this.users=users;this.json=json;this.daily=daily;}
    private UUID owner(){return users.getCurrentUserId();}
    /** Canonical diary refs survive an explicit target-workspace change without copying/rekeying media. */
    public static boolean sharedMedia(JdbcTemplate db,UUID owner,UUID target,UUID media){
        return sharedMedia(db,owner,target,media,true);
    }
    public static boolean sharedMedia(JdbcTemplate db,UUID owner,UUID target,UUID media,boolean allowCanonical){
        return Boolean.TRUE.equals(db.queryForObject("""
            select exists(select 1 from journal_media m join note_workspaces source on source.id=m.workspace_id
            where m.id=? and source.owner_id=?
            and exists(select 1 from note_workspaces target where target.id=? and target.owner_id=?)
            and ((? and exists(select 1 from diet_settings s where s.owner_id=? and s.note_sync_enabled and s.note_sync_workspace_id=?)
            and exists(select 1 from diet_daily_notes n where n.owner_id=? and position(? in n.content)>0))
            or exists(select 1 from journal_notes kept where kept.workspace_id=? and position(? in kept.content)>0)))
            """,Boolean.class,media,owner,target,owner,allowCanonical,owner,target,owner,"media:"+media,target,"media:"+media));
    }
    private boolean target(UUID w){return db.queryForObject("select count(*) from diet_settings where owner_id=? and note_sync_enabled and note_sync_workspace_id=?",Long.class,owner(),w)>0;}
    /** Match DietNoteSync lock order before acquiring a NOTE workspace row. */
    public boolean lockTarget(UUID w,LocalDate date){
        if(date==null||!target(w))return false;
        db.queryForList("select owner_id from diet_settings where owner_id=? for update",owner());
        if(!target(w))return false;
        db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","diet-camera:"+owner());
        return true;
    }
    public Set<String> cameraRefs(UUID w,LocalDate date){return new HashSet<>(db.queryForList("select 'media:'||b.media_id from diet_camera_note_media b join diet_camera_media m on m.id=b.camera_id where m.owner_id=? and m.captured_date=? and b.workspace_id=? and b.media_id is not null",String.class,owner(),date,w));}
    public String save(UUID w,LocalDate date,String previous,String incoming){
        var canonical=daily.get(date);var base=DietJournalContent.snapshot(previous.isBlank()?incoming:previous,json);
        // A first web save must use the virtual dashboard base, including an empty tombstone version.
        // Inferring the current version here would resurrect a stale never-created/offline draft.
        boolean stale=previous.isBlank()?(base.version()==null?0:base.version())!=canonical.version()
            :base.version()!=null?base.version()!=canonical.version():!base.note().equals(canonical.content());
        // The NOTE version alone is insufficient when a mobile save committed but projection failed.
        if(stale)
            throw new OptimisticLockConflictException("모바일에서 이 날짜의 일지가 변경되었습니다. 내 초안을 보존하고 최신 일지를 불러오세요.");
        String body=DietJournalContent.body(incoming,cameraRefs(w,date),json);
        if(!body.equals(canonical.content()))canonical=daily.save(date,new DietDailyNoteService.NoteInput(body,canonical.version()));
        if(!DietJournalContent.hasDashboard(incoming)) {
            var snapshot=new LinkedHashMap<String,Object>();snapshot.put("v",1);snapshot.put("date",date.toString());snapshot.put("note",canonical.content());snapshot.put("noteVersion",canonical.version());
            return DietNoteProjection.merge(incoming,DietNoteProjection.block(snapshot,json));
        }
        return DietJournalContent.withSnapshot(incoming,canonical.content(),canonical.version(),json);
    }
}
