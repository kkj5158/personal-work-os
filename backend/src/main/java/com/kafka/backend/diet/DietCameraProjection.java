package com.kafka.backend.diet;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.notesystem.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;

/** Called inside DietNoteSync's transaction and existing setting. No NOTE contract changes. */
@Service
public class DietCameraProjection {
    private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;
    private final NoteSystemService notes;
    public DietCameraProjection(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,NoteSystemService notes){this.db=db;this.users=users;this.json=json;this.notes=notes;}
    private UUID owner(){return users.getCurrentUserId();}
    public String merge(UUID workspace,LocalDate date,String content){
        var images=new ArrayList<Map<String,Object>>();
        var active=db.query("select * from diet_camera_media where owner_id=? and captured_date=? and deleted_at is null and purge_requested=false order by captured_at,client_media_id",DietCameraMediaService::map,owner(),date);
        for(var item:active){
            var refs=db.queryForList("select media_id from diet_camera_note_media where camera_id=? and workspace_id=? and media_id is not null",UUID.class,item.id(),workspace);
            UUID ref;
            if(refs.isEmpty()){
                ref=UUID.randomUUID();
                // Same storage/ownership validation as NoteMediaController; copy the
                // already-validated raster, never accept arbitrary imageRef from clients.
                int copied=db.update("insert into journal_media(id,workspace_id,mime_type,width,height,data) select ?,?,mime_type,width,height,data from journal_media where id=? and diet_owner_id=?",ref,workspace,item.imageRef(),owner());
                if(copied!=1)throw new IllegalStateException("Canonical camera image missing");
                db.update("insert into diet_camera_note_media(camera_id,workspace_id,media_id) values(?,?,?) on conflict(camera_id,workspace_id) do update set media_id=excluded.media_id",item.id(),workspace,ref);
            }else ref=refs.getFirst();
            var image=new LinkedHashMap<String,Object>();image.put("src","media:"+ref);image.put("caption",item.memo()==null?"":item.memo());image.put("ratio",100);images.add(image);
        }
        var owned=new HashSet<>(db.queryForList("select 'media:'||b.media_id from diet_camera_note_media b join diet_camera_media m on m.id=b.camera_id where m.owner_id=? and m.captured_date=? and b.workspace_id=? and b.media_id is not null",String.class,owner(),date,workspace));
        return DietCameraImages.merge(content,owned,images,json);
    }
    public void projected(LocalDate date){db.update("update diet_camera_media set projection_pending=false where owner_id=? and captured_date=?",owner(),date);}
    public void removePurgingFromOldWorkspaces(UUID current){
        var targets=db.query("select distinct b.workspace_id,m.captured_date from diet_camera_note_media b join diet_camera_media m on m.id=b.camera_id join note_workspaces w on w.id=b.workspace_id where m.owner_id=? and m.purge_requested and m.purged_at is null and b.workspace_id<>? and w.archived_at is null order by b.workspace_id",(r,n)->new Object[]{r.getObject(1,UUID.class),r.getDate(2).toLocalDate()},owner(),current);
        for(var target:targets){
            UUID w=(UUID)target[0];LocalDate date=(LocalDate)target[1];
            db.queryForList("select id from note_workspaces where id=? and owner_id=? for update",w,owner());
            var refs=new HashSet<>(db.queryForList("select 'media:'||b.media_id from diet_camera_note_media b join diet_camera_media m on m.id=b.camera_id where m.owner_id=? and m.captured_date=? and m.purge_requested and b.workspace_id=?",String.class,owner(),date,w));
            var rows=db.query("select id,content,version from journal_notes where workspace_id=? and journal_date=? and deleted_at is null",(r,n)->new Object[]{r.getObject(1,UUID.class),r.getString(2),r.getLong(3)},w,date);
            for(var row:rows){String old=(String)row[1],next=DietCameraImages.merge(old,refs,List.of(),json);if(!old.equals(next))notes.save(w,new NoteTypes.NoteInput((UUID)row[0],date,null,next,(Long)row[2]));}
        }
    }
}
