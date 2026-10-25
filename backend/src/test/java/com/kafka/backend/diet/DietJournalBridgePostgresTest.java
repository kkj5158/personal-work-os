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
import static org.assertj.core.api.Assertions.*;

/** Full-schema isolated DEV only. All UUID-scoped fixtures and preference changes roll back. */
@EnabledIfEnvironmentVariable(named="DIET_JOURNAL_DB_TESTS",matches="1")
class DietJournalBridgePostgresTest {
    @Test void mobileWebJournalCasMediaAndDeleteRecreateRoundTrip()throws Exception{
        try(var c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"))){
            c.setAutoCommit(false);
            try{
                var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));db.execute("set local statement_timeout='15s'");db.execute("set local lock_timeout='5s'");
                UUID owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var json=JsonMapper.builder().build();
                var daily=new DietDailyNoteService(db,()->owner);var notes=new NoteSystemService(db,()->owner,json);
                var diet=new DietService(db,()->owner,json);var camera=new DietCameraProjection(db,()->owner,json,notes);
                var sync=new DietNoteSync(db,()->owner,json,diet,daily,notes,camera);
                var mobile=new DietMobileService(db,()->owner,diet,daily,new DietCameraMediaService(db,()->owner),json);
                UUID w=notes.createWorkspace(new NoteTypes.WorkspaceInput("Shared journal QA "+UUID.randomUUID(),"rollback fixture","notebook",false,null));
                LocalDate date=LocalDate.of(2044,2,3),empty=date.plusDays(1);
                assertThat(daily.get(date).version()).isZero();
                sync.update(new DietNoteSync.SyncInput(true,w));
                long before=db.queryForObject("select count(*) from journal_notes where workspace_id=? and journal_date=?",Long.class,w,empty);
                var controller=new NoteSystemController(notes,sync);var virtual=controller.daily(w,empty,1);
                assertThat(virtual).hasSize(1);assertThat(virtual.getFirst().createdAt()).isNull();assertThat(virtual.getFirst().content()).contains(":::diet",empty.toString());
                assertThat(db.queryForObject("select count(*) from journal_notes where workspace_id=? and journal_date=?",Long.class,w,empty)).isEqualTo(before);
                var oldVirtual=virtual.getFirst();
                daily.save(empty,new DietDailyNoteService.NoteInput("임시 모바일 글",0L));
                var tombstone=daily.save(empty,new DietDailyNoteService.NoteInput("",daily.get(empty).version()));
                assertThat(tombstone.version()).isGreaterThan(0);
                Savepoint staleCreate=c.setSavepoint();
                assertThatThrownBy(()->notes.save(w,new NoteTypes.NoteInput(oldVirtual.id(),empty,null,oldVirtual.content()+"\n\n낡은 웹 초안",0)))
                    .isInstanceOf(OptimisticLockConflictException.class);
                c.rollback(staleCreate);                daily.save(date,new DietDailyNoteService.NoteInput("모바일 첫 기록 **보존**",0L));sync.project(List.of(date));
                var note=notes.daily(w,date,1).getFirst();
                assertThat(DietJournalContent.body(note.content(),Set.of(),json)).isEqualTo("모바일 첫 기록 **보존**");
                long v=note.version();sync.project(List.of(date));assertThat(notes.note(w,note.id()).version()).isEqualTo(v);
                UUID image=UUID.randomUUID();db.update("insert into journal_media(id,workspace_id,mime_type,width,height,data) values(?,?,'image/jpeg',1,1,?)",image,w,new byte[]{1,2,3});
                String body="# 웹 제목\n\n모바일 첫 기록 **보존**\n\n:::images {\"images\":[{\"src\":\"media:"+image+"\",\"caption\":\"날짜 사진 설명\",\"ratio\":100}],\"width\":100,\"align\":\"left\"}\n:::\n\n사진 다음 문단";
                var fromWeb=notes.save(w,new NoteTypes.NoteInput(note.id(),date,null,DietNoteProjection.merge(body,sync.dashboard(date)),note.version()));
                var canonical=daily.get(date);assertThat(canonical.content()).isEqualTo(body);assertThat(canonical.version()).isEqualTo(2);
                assertThat(mobile.journal(null,null,"2044-02",9).entries()).anyMatch(e->e.date().equals(date)&&e.note().content().equals(body));
                assertThat(mobile.journalMedia(date)).containsExactly(new DietMobileService.JournalMedia(w,image,"날짜 사진 설명"));
                assertThatThrownBy(()->daily.save(date,new DietDailyNoteService.NoteInput("낡은 모바일 초안",1L))).isInstanceOf(OptimisticLockConflictException.class);
                assertThatThrownBy(()->notes.save(w,new NoteTypes.NoteInput(note.id(),date,null,"낡은 웹 초안",note.version()))).isInstanceOf(OptimisticLockConflictException.class);
                LocalDate legacy=date.minusDays(1);daily.save(legacy,new DietDailyNoteService.NoteInput("기존 모바일 글",0L));
                String oldSnapshot=DietNoteProjection.block(DietNoteProjection.snapshot(legacy,diet.dataRange(legacy,legacy),"기존 모바일 글"),json);
                var legacyNote=notes.saveProjection(w,new NoteTypes.NoteInput(UUID.randomUUID(),legacy,null,oldSnapshot+"\n\n# 기존 웹 서식\n\n보존할 내용",0));
                sync.project(List.of(legacy));String legacyBody=notes.note(w,legacyNote.id()).content();
                assertThat(legacyBody).contains("# 기존 웹 서식","보존할 내용","기존 모바일 글");
                long legacyVersion=notes.note(w,legacyNote.id()).version();sync.project(List.of(legacy));assertThat(notes.note(w,legacyNote.id()).version()).isEqualTo(legacyVersion);                // Mobile edits preserve exact image refs/captions/ordering in the same shared string.
                daily.save(date,new DietDailyNoteService.NoteInput(body+"\n\n모바일 추가",canonical.version()));sync.project(List.of(date));
                var reopened=controller.note(w,note.id());assertThat(reopened.content()).contains(body,"모바일 추가");
                assertThat(db.queryForObject("select count(*) from journal_notes where workspace_id=? and journal_date=?",Long.class,w,date)).isEqualTo(1);
                // A committed mobile edit whose projection was delayed must still reject an old web body.
                daily.save(date,new DietDailyNoteService.NoteInput(body+"\n\n아직 미투영",daily.get(date).version()));
                assertThatThrownBy(()->notes.save(w,new NoteTypes.NoteInput(reopened.id(),date,null,reopened.content()+"\n웹 초안",reopened.version()))).isInstanceOf(OptimisticLockConflictException.class);
                sync.project(List.of(date));
                var cleared=daily.save(date,new DietDailyNoteService.NoteInput("",daily.get(date).version()));assertThat(cleared.version()).isGreaterThan(0);
                assertThat(daily.range(date,date)).isEmpty();assertThat(mobile.journal(null,null,"2044-02",9).entries()).noneMatch(e->e.date().equals(date));
                assertThatThrownBy(()->daily.save(date,new DietDailyNoteService.NoteInput("offline zero resurrection",0L))).isInstanceOf(OptimisticLockConflictException.class);
                assertThatThrownBy(()->daily.save(date,new DietDailyNoteService.NoteInput("offline previous resurrection",canonical.version()))).isInstanceOf(OptimisticLockConflictException.class);
                daily.save(date,new DietDailyNoteService.NoteInput("명시적 새 기록",cleared.version()));assertThat(daily.get(date).version()).isGreaterThan(cleared.version());
                assertThat(new DietDailyNoteService(db,UUID::randomUUID).get(date).content()).isEmpty();
                UUID other=UUID.randomUUID();var foreign=new DietMobileService(db,()->other,new DietService(db,()->other,json),new DietDailyNoteService(db,()->other),new DietCameraMediaService(db,()->other),json);
                assertThat(foreign.journalMedia(date)).isEmpty();
                assertThat(db.queryForObject("select count(*) from journal_media where id=?",Long.class,image)).isEqualTo(1); // clearing text never deletes stored images
            }finally{c.rollback();}
        }
    }
}
