package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import com.kafka.backend.notesystem.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import static org.assertj.core.api.Assertions.*;

/** Scoped UUIDs, transaction rollback, no auth/user creation and no persistent owner changes. */
@EnabledIfEnvironmentVariable(named="CAMERA_DB_TESTS",matches="1")
class DietCameraPostgresTest {
    @Test void lifecycleProjectionSettingsStorageAndOwnerBoundary()throws Exception{
        try(var c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"))){
            c.setAutoCommit(false);
            try{
                var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));db.execute("set local statement_timeout='15s'");db.execute("set local lock_timeout='5s'");
                UUID owner=UUID.fromString(System.getenv("APP_DEV_USER_ID")),other=UUID.randomUUID(),client=UUID.randomUUID();
                var json=JsonMapper.builder().build();var media=new DietCameraMediaService(db,()->owner);var foreign=new DietCameraMediaService(db,()->other);
                var notes=new NoteSystemService(db,()->owner,json);var daily=new DietDailyNoteService(db,()->owner);
                var diet=new DietService(db,()->owner,json);var projection=new DietCameraProjection(db,()->owner,json,notes);
                var sync=new DietNoteSync(db,()->owner,json,diet,daily,notes,projection);
                var stream=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(8,8,BufferedImage.TYPE_INT_RGB),"jpeg",stream);
                byte[] pixels=stream.toByteArray();String encoded=Base64.getEncoder().encodeToString(pixels),sha=DietCameraMediaService.digest(pixels);
                Instant at=Instant.parse("2041-01-01T15:00:00.123Z");LocalDate date=LocalDate.of(2041,1,2);
                var first=new DietCameraMediaService.Input(at,540,encoded,sha,"first",null,1,false);
                sync.update(new DietNoteSync.SyncInput(false,null));
                var created=media.put(client,first);UUID source=created.imageRef();
                assertThat(media.put(client,first).id()).isEqualTo(created.id());
                assertThat(media.list(date)).hasSize(1);assertThat(media.get(client).capturedDate()).isEqualTo(date);
                assertThat(media.image(client)).isEqualTo(pixels);assertThat(sync.project(List.of(date))).isZero();
                assertThat(media.get(client).projectionPending()).isTrue();
                assertThat(foreign.list(date)).isEmpty();
                assertThatThrownBy(()->foreign.get(client)).isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(()->foreign.image(client)).isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(()->foreign.finishPurge(client)).isInstanceOf(ResourceNotFoundException.class);
                // Mutation without create bytes cannot resolve the other owner's identity.
                for(var input:List.of(new DietCameraMediaService.Input(at,540,null,sha,"attack",null,2,false),new DietCameraMediaService.Input(at,540,null,sha,null,at,2,false),new DietCameraMediaService.Input(at,540,null,sha,null,null,3,false)))
                    assertThatThrownBy(()->foreign.put(client,input)).isInstanceOf(InvalidRequestException.class);
                assertThat(media.get(client).memo()).isEqualTo("first");
                assertThatThrownBy(()->media.put(client,new DietCameraMediaService.Input(at.plusSeconds(1),540,null,sha,"first",null,1,false))).isInstanceOf(OptimisticLockConflictException.class);
                UUID w=notes.createWorkspace(new NoteTypes.WorkspaceInput("Camera rollback "+UUID.randomUUID(),"QA","notebook",false,null));
                UUID foreignImage=UUID.randomUUID();db.update("insert into journal_media(id,workspace_id,mime_type,width,height,data) values(?,?,'image/jpeg',8,8,?)",foreignImage,w,pixels);
                String user="Owner text [[keep]]\n\n:::images {\"images\":[{\"src\":\"media:"+foreignImage+"\",\"caption\":\"user\",\"ratio\":100}],\"width\":100,\"align\":\"left\"}\n:::";
                var note=notes.save(w,new NoteTypes.NoteInput(UUID.randomUUID(),date,null,user,0));
                daily.save(date,new DietDailyNoteService.NoteInput("Diet daily text",0L));
                sync.update(new DietNoteSync.SyncInput(true,w)); // resync spans >401 days and includes photo-only dates
                String content=db.queryForObject("select content from journal_notes where id=?",String.class,note.id());
                assertThat(content).contains("Owner text [[keep]]","media:"+foreignImage,"Diet daily text",":::diet","first");
                assertThat(media.get(client).projectionPending()).isFalse();
                long version=db.queryForObject("select version from journal_notes where id=?",Long.class,note.id());
                sync.project(List.of(date));assertThat(db.queryForObject("select version from journal_notes where id=?",Long.class,note.id())).isEqualTo(version);
                media.put(client,new DietCameraMediaService.Input(at,540,null,sha,"updated",null,2,false));sync.project(List.of(date));
                assertThat(db.queryForObject("select content from journal_notes where id=?",String.class,note.id())).contains("updated").doesNotContain("\"caption\":\"first\"");
                // Late revision cannot override newer memo/deletion state.
                media.put(client,first);assertThat(media.get(client).memo()).isEqualTo("updated");
                UUID copy=db.queryForObject("select media_id from diet_camera_note_media where camera_id=? and workspace_id=?",UUID.class,created.id(),w);
                media.put(client,new DietCameraMediaService.Input(at,540,null,sha,"updated",at,3,false));sync.project(List.of(date));
                assertThat(db.queryForObject("select content from journal_notes where id=?",String.class,note.id())).doesNotContain("media:"+copy).contains("media:"+foreignImage,"Owner text");
                media.put(client,new DietCameraMediaService.Input(at,540,null,sha,"updated",null,4,false));sync.project(List.of(date));
                assertThat(db.queryForObject("select content from journal_notes where id=?",String.class,note.id())).contains("media:"+copy);
                sync.update(new DietNoteSync.SyncInput(false,null));
                String unchanged=db.queryForObject("select content from journal_notes where id=?",String.class,note.id());
                media.put(client,new DietCameraMediaService.Input(at,540,null,sha,"updated",at,5,true));sync.project(List.of(date));
                assertThat(media.finishPurge(client).purgedAt()).isNull();assertThat(media.image(client)).isEqualTo(pixels);
                assertThat(db.queryForObject("select content from journal_notes where id=?",String.class,note.id())).isEqualTo(unchanged);
                sync.update(new DietNoteSync.SyncInput(true,w));
                // Shared/copied NOTE references block storage deletion without changing that user note.
                var shared=notes.save(w,new NoteTypes.NoteInput(UUID.randomUUID(),null,"Shared QA "+UUID.randomUUID(),"media:"+copy,0));
                assertThat(media.finishPurge(client).purgedAt()).isNull();
                notes.save(w,new NoteTypes.NoteInput(shared.id(),null,shared.title(),"Owner keeps text",shared.version()));
                assertThat(media.finishPurge(client).purgedAt()).isNotNull();
                assertThat(db.queryForObject("select count(*) from journal_media where id in (?,?)",Long.class,source,copy)).isZero();
                assertThat(db.queryForObject("select count(*) from journal_media where id=?",Long.class,foreignImage)).isEqualTo(1);
                assertThat(media.put(client,first).purgedAt()).isNotNull(); // late upload cannot resurrect
                assertThat(media.list(date)).hasSize(1);
            } finally {c.rollback();}
        }
    }
}
