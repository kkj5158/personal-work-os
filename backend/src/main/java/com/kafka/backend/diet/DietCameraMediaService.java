package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.sql.*;
import java.util.*;
import java.security.MessageDigest;

@Service
@Transactional
public class DietCameraMediaService {
    public record Input(Instant capturedAt,Integer offsetMinutes,String data,String sha256,String memo,Instant deletedAt,long revision,boolean purge) {}
    public record Media(UUID id,UUID clientMediaId,Instant capturedAt,int offsetMinutes,LocalDate capturedDate,UUID imageRef,String sha256,String memo,Instant deletedAt,long revision,boolean purgeRequested,Instant purgedAt,boolean projectionPending) {}
    private final JdbcTemplate db;private final CurrentUserProvider users;
    public DietCameraMediaService(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
    UUID owner(){return users.getCurrentUserId();}
    void lock(){db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","diet-camera:"+owner());}
    static Instant instant(ResultSet r,String key)throws SQLException{var t=r.getTimestamp(key);return t==null?null:t.toInstant();}
    static Media map(ResultSet r,int n)throws SQLException{return new Media(r.getObject("id",UUID.class),r.getObject("client_media_id",UUID.class),instant(r,"captured_at"),r.getInt("offset_minutes"),r.getDate("captured_date").toLocalDate(),r.getObject("image_ref",UUID.class),r.getString("image_sha256"),r.getString("memo"),instant(r,"deleted_at"),r.getLong("revision"),r.getBoolean("purge_requested"),instant(r,"purged_at"),r.getBoolean("projection_pending"));}
    public List<Media> list(LocalDate date){return db.query("select * from diet_camera_media where owner_id=?"+(date==null?"":" and captured_date=?")+" order by captured_at,client_media_id",DietCameraMediaService::map,date==null?new Object[]{owner()}:new Object[]{owner(),date});}
    public Media get(UUID client){var rows=db.query("select * from diet_camera_media where owner_id=? and client_media_id=?",DietCameraMediaService::map,owner(),client);if(rows.isEmpty())throw new ResourceNotFoundException("사진을 찾을 수 없습니다.");return rows.getFirst();}
    public byte[] image(UUID client){var m=get(client);if(m.imageRef()==null||m.purgedAt()!=null)throw new ResourceNotFoundException("사진을 찾을 수 없습니다.");return db.queryForObject("select data from journal_media where id=? and diet_owner_id=?",byte[].class,m.imageRef(),owner());}
    public static LocalDate captureDate(Instant at,int offset){if(at==null||offset < -1080||offset>1080)throw new InvalidRequestException("촬영 시각을 확인하세요.");return at.atOffset(ZoneOffset.ofTotalSeconds(offset*60)).toLocalDate();}
    static String digest(byte[] data){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));}catch(Exception e){throw new IllegalStateException(e);}}
    public Media put(UUID client,Input in)throws java.io.IOException{
        if(in==null||in.offsetMinutes()==null||in.revision()<1||in.sha256()==null||!in.sha256().matches("[0-9a-f]{64}")||in.memo()!=null&&in.memo().length()>4000||in.purge()&&in.deletedAt()==null)throw new InvalidRequestException("사진 변경 내용을 확인하세요.");
        LocalDate date=captureDate(in.capturedAt(),in.offsetMinutes());String memo=in.memo()==null||in.memo().isBlank()?null:in.memo().strip();
        lock();var rows=db.query("select * from diet_camera_media where owner_id=? and client_media_id=? for update",DietCameraMediaService::map,owner(),client);
        if(rows.isEmpty()){
            // Purge of a never-uploaded item still reserves a terminal identity.
            UUID ref=null;
            if(!in.purge()){
                var image=RasterMedia.decode(in.data());
                if(!image.mimeType().equals("image/jpeg"))throw new InvalidRequestException("타임스탬프가 저장된 JPEG 사진을 사용하세요.");
                if(!digest(image.data()).equals(in.sha256()))throw new InvalidRequestException("사진 체크섬이 일치하지 않습니다.");
                ref=UUID.randomUUID();db.update("insert into journal_media(id,diet_owner_id,mime_type,width,height,data) values(?,?,?,?,?,?)",ref,owner(),image.mimeType(),image.width(),image.height(),image.data());
            }
            db.update("insert into diet_camera_media(id,owner_id,client_media_id,captured_at,offset_minutes,captured_date,image_ref,image_sha256,memo,deleted_at,revision,purge_requested) values(?,?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),owner(),client,Timestamp.from(in.capturedAt()),in.offsetMinutes(),date,ref,in.sha256(),memo,in.deletedAt()==null?null:Timestamp.from(in.deletedAt()),in.revision(),in.purge());
        }else{
            var old=rows.getFirst();
            if(!old.capturedAt().equals(in.capturedAt())||old.offsetMinutes()!=in.offsetMinutes()||!old.sha256().equals(in.sha256()))throw new OptimisticLockConflictException("같은 사진 ID의 원본 정보가 다릅니다.");
            if(old.purgeRequested()||old.purgedAt()!=null)return old; // terminal intent never resurrects
            if(in.revision()==old.revision()&&(!Objects.equals(old.memo(),memo)||!Objects.equals(old.deletedAt(),in.deletedAt())||in.purge()!=old.purgeRequested()))throw new OptimisticLockConflictException("같은 변경 번호의 내용이 다릅니다.");
            if(in.revision()>old.revision())db.update("update diet_camera_media set memo=?,deleted_at=?,revision=?,purge_requested=?,projection_pending=true,updated_at=now() where id=? and owner_id=?",memo,in.deletedAt()==null?null:Timestamp.from(in.deletedAt()),in.revision(),in.purge(),old.id(),owner());
        }
        return get(client);
    }
    /** After projection has committed, clean only owned bytes with no remaining reference. */
    public Media finishPurge(UUID client){
        lock();var m=get(client);if(!m.purgeRequested()||m.purgedAt()!=null)return m;
        var copies=db.queryForList("select media_id from diet_camera_note_media where camera_id=? and media_id is not null",UUID.class,m.id());
        for(var copy:copies)if(db.queryForObject("select count(*) from journal_notes where position(? in content)>0",Long.class,"media:"+copy)>0)return m;
        if(m.imageRef()!=null&&db.queryForObject("select count(*) from diet_gallery_blocks where media_id=?",Long.class,m.imageRef())>0)return m;
        db.update("delete from diet_camera_note_media where camera_id=?",m.id());
        for(var copy:copies)db.update("delete from journal_media m using note_workspaces w where m.id=? and m.workspace_id=w.id and w.owner_id=?",copy,owner());
        db.update("update diet_camera_media set image_ref=null,memo=null,purged_at=now(),projection_pending=false,updated_at=now() where id=? and owner_id=?",m.id(),owner());
        if(m.imageRef()!=null)db.update("delete from journal_media where id=? and diet_owner_id=?",m.imageRef(),owner());
        return get(client);
    }
}
