package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import com.kafka.backend.notesystem.NoteContent;
import com.kafka.backend.notesystem.NoteSystemService;
import com.kafka.backend.notesystem.NoteTypes;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.*;
import static com.kafka.backend.diet.DietTypes.*;

/**
 * "NOTE SYS에 다이어트 기록 자동 정리". One-way DIET SYS -> NOTE SYS projection into
 * the Daily note of an ordinary NOTE SYS Workspace (default "다이어트 기록"). Writes
 * go through {@link NoteSystemService#save}, so NOTE versions, workspace locks and
 * link reconciliation apply exactly as for editor saves. OFF stops future writes
 * and never deletes projected content; ON re-projects every date from canonical data.
 */
@Service
@Transactional
public class DietNoteSync {
    public static final String WORKSPACE_NAME="다이어트 기록";
    private static final int MAX_DATES=800;
    public record SyncSettings(boolean enabled,UUID workspaceId,String workspaceName) {}
    public record SyncInput(boolean enabled,UUID workspaceId) {}
    public record SyncResult(SyncSettings settings,int projected) {}
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    private final DietService diet;
    private final DietDailyNoteService notes;
    private final NoteSystemService noteSystem;
    public DietNoteSync(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,DietService diet,DietDailyNoteService notes,NoteSystemService noteSystem){
        this.db=db;this.users=users;this.json=json;this.diet=diet;this.notes=notes;this.noteSystem=noteSystem;
    }
    private UUID owner(){return users.getCurrentUserId();}

    @Transactional(readOnly=true)
    public SyncSettings settings(){
        var rows=db.query("select s.note_sync_enabled,w.id,w.name from diet_settings s left join note_workspaces w on w.id=s.note_sync_workspace_id and w.owner_id=s.owner_id and w.archived_at is null where s.owner_id=?",
            (r,n)->new SyncSettings(r.getBoolean(1),r.getObject(2,UUID.class),r.getString(3)),owner());
        return rows.isEmpty()?new SyncSettings(false,null,null):rows.getFirst();
    }

    public SyncResult update(SyncInput in){
        if(in==null)throw new InvalidRequestException("동기화 설정을 확인하세요.");
        db.update("insert into diet_settings(owner_id) values(?) on conflict(owner_id) do nothing",owner());
        db.queryForList("select owner_id from diet_settings where owner_id=? for update",owner());
        if(!in.enabled()){
            db.update("update diet_settings set note_sync_enabled=false where owner_id=?",owner());
            return new SyncResult(settings(),0);
        }
        UUID target=resolveWorkspace(in.workspaceId());
        db.update("update diet_settings set note_sync_enabled=true,note_sync_workspace_id=? where owner_id=?",target,owner());
        return new SyncResult(settings(),resyncAll());
    }

    private boolean activeWorkspace(UUID id){
        return id!=null&&db.queryForObject("select count(*) from note_workspaces where owner_id=? and id=? and archived_at is null",Long.class,owner(),id)>0;
    }
    private UUID resolveWorkspace(UUID requested){
        if(requested!=null){if(!activeWorkspace(requested))throw new InvalidRequestException("활성 NOTE SYS Workspace를 선택하세요.");return requested;}
        var saved=db.queryForList("select note_sync_workspace_id from diet_settings where owner_id=? and note_sync_workspace_id is not null",UUID.class,owner());
        if(!saved.isEmpty()&&activeWorkspace(saved.getFirst()))return saved.getFirst();
        var named=db.queryForList("select id from note_workspaces where owner_id=? and normalized_name=? and archived_at is null order by sort_order,id",UUID.class,owner(),NoteContent.normalize(WORKSPACE_NAME));
        if(!named.isEmpty())return named.getFirst();
        noteSystem.workspaces(); // keeps NOTE SYS's first-use default Workspace ahead of this one
        UUID created=noteSystem.createWorkspace(new NoteTypes.WorkspaceInput(WORKSPACE_NAME,"DIET SYS에서 날짜별로 자동 정리되는 다이어트 기록","notebook",false,null));
        // Created on the owner's explicit enable, so show it in Daily Hub; later exclusion is respected.
        var hub=noteSystem.dailyHubSettings();
        var included=new ArrayList<>(hub.includedWorkspaceIds());if(!included.contains(created))included.add(created);
        noteSystem.dailyHubSettings(new NoteTypes.DailyHubSettings(included,hub.autoIncludeNewWorkspaces()));
        return created;
    }

    /** Re-projects every date that has canonical DIET content (checklist item edits change every summary). */
    public int resyncAll(){
        if(!settings().enabled())return 0;
        var data=diet.data();
        var dates=new TreeSet<LocalDate>();
        data.days().forEach(d->dates.add(d.date()));
        data.checks().stream().filter(c->c.state()!=CheckState.MISSING).forEach(c->dates.add(c.date()));
        db.queryForList("select entry_date from diet_daily_notes where owner_id=?",java.sql.Date.class,owner()).forEach(d->dates.add(d.toLocalDate()));
        return project(dates,data);
    }

    /** Refreshes the managed block for these dates when sync is ON; no-op when OFF. */
    public int project(Collection<LocalDate> dates){
        if(dates.isEmpty()||!settings().enabled())return 0;
        return project(new TreeSet<>(dates),diet.data());
    }

    @Transactional(readOnly=true)
    public LocalDate[] challengePeriod(UUID id){
        var rows=db.query("select start_date,end_date from diet_challenges where owner_id=? and id=?",(r,n)->new LocalDate[]{r.getDate(1).toLocalDate(),r.getDate(2).toLocalDate()},owner(),id);
        return rows.isEmpty()?null:rows.getFirst();
    }

    /** Challenge edits change the derived context of every date in the old and new periods. */
    public int projectPeriods(List<LocalDate[]> periods){
        var dates=new TreeSet<LocalDate>();
        for(var p:periods)if(p!=null&&p[0]!=null&&p[1]!=null)
            for(var d=p[0];!d.isAfter(p[1])&&dates.size()<MAX_DATES;d=d.plusDays(1))dates.add(d);
        return project(dates);
    }

    private int project(SortedSet<LocalDate> dates,Data data){
        var current=settings();
        if(!current.enabled()||current.workspaceId()==null||dates.isEmpty())return 0;
        UUID w=current.workspaceId();
        var text=notes.range(dates.first(),dates.last()).stream().collect(Collectors.toMap(DietDailyNoteService.DailyNote::date,DietDailyNoteService.DailyNote::content));
        var existing=db.query("select id,journal_date,content,version from journal_notes where workspace_id=? and type='DAILY' and deleted_at is null and journal_date between ? and ?",
            (r,n)->new Object[]{r.getObject(1,UUID.class),r.getDate(2).toLocalDate(),r.getString(3),r.getLong(4)},w,dates.first(),dates.last())
            .stream().collect(Collectors.toMap(r->(LocalDate)r[1],r->r));
        int written=0;
        for(var date:dates){
            var note=existing.get(date);
            String content=note==null?"":(String)note[2];
            String block=DietNoteProjection.hasContent(date,data,text.get(date))?DietNoteProjection.block(DietNoteProjection.snapshot(date,data,text.get(date)),json):null;
            String merged=DietNoteProjection.merge(content,block);
            if(merged.equals(content))continue;
            if(note==null)noteSystem.save(w,new NoteTypes.NoteInput(UUID.randomUUID(),date,null,merged,0));
            else noteSystem.save(w,new NoteTypes.NoteInput((UUID)note[0],date,null,merged,(Long)note[3]));
            written++;
        }
        return written;
    }
}
