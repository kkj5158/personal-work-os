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
        var canonical=daily.get(date);var base=DietJournalContent.snapshot(previous,json);
        // The NOTE version alone is insufficient when a mobile save committed but projection failed.
        if(base.version()!=null?base.version()!=canonical.version():!base.note().equals(canonical.content()))
            throw new OptimisticLockConflictException("모바일에서 이 날짜의 일지가 변경되었습니다. 내 초안을 보존하고 최신 일지를 불러오세요.");
        String body=DietJournalContent.body(incoming,cameraRefs(w,date),json);
        if(!body.equals(canonical.content()))canonical=daily.save(date,new DietDailyNoteService.NoteInput(body,canonical.version()));
        if(!incoming.contains(":::diet ")) {
            var snapshot=new LinkedHashMap<String,Object>();snapshot.put("v",1);snapshot.put("date",date.toString());snapshot.put("note",canonical.content());snapshot.put("noteVersion",canonical.version());
            return DietNoteProjection.merge(incoming,DietNoteProjection.block(snapshot,json));
        }
        return DietJournalContent.withSnapshot(incoming,canonical.content(),canonical.version(),json);
    }
}
