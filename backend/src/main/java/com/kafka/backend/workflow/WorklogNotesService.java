package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import com.kafka.backend.notesystem.NoteContent;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Shared identity/content; NOTE SYS workspaces remain an optional context. */
@Service
@Transactional
public class WorklogNotesService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public WorklogNotesService(JdbcTemplate db, CurrentUserProvider users) { this.db=db; this.users=users; }
    private UUID owner() { return users.getCurrentUserId(); }
    public record Topic(UUID id, UUID workspaceId, String scope, String title, String content, long version) {}
    public record TopicInput(String title, String content, long version) {}
    public record Backlink(LocalDate date, UUID blockId, String excerpt) {}
    private static final String SELECT = "select n.*,coalesce(w.name,'WORK FLOW') as scope from journal_notes n left join note_workspaces w on w.id=n.workspace_id where (w.owner_id=? or n.workflow_owner_id=?)";
    private Topic row(java.sql.ResultSet r,int i) throws java.sql.SQLException {
        return new Topic(r.getObject("id",UUID.class),r.getObject("workspace_id",UUID.class),r.getString("scope"),r.getString("title"),r.getString("content"),r.getLong("version"));
    }
    public List<Topic> search(String query) {
        String q=NoteContent.normalize(Objects.requireNonNullElse(query,""));
        if(q.length()>240) throw new InvalidRequestException("Search is too long");
        // Bounded title search must not fetch every note body into autocomplete.
        String pattern="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        return db.query("select n.id,n.workspace_id,n.title,'' as content,n.version,coalesce(w.name,'WORK FLOW') as scope from journal_notes n left join note_workspaces w on w.id=n.workspace_id where (w.owner_id=? or n.workflow_owner_id=?) and n.deleted_at is null and lower(n.title) like ? escape '!' order by n.updated_at desc limit 30",this::row,owner(),owner(),pattern);
    }
    public Topic get(UUID id) {
        var rows=db.query(SELECT+" and n.id=? and n.deleted_at is null",this::row,owner(),owner(),id);
        if(rows.isEmpty())throw new ResourceNotFoundException("Note not found");return rows.getFirst();
    }
    public Topic create(TopicInput in) {
        String title=NoteContent.name(in.title(),240);UUID id=UUID.randomUUID();
        db.update("insert into journal_notes(id,workflow_owner_id,type,title,content) values(?,?,'NOTE',?,?)",id,owner(),title,content(in.content()));
        return get(id);
    }
    public Topic save(UUID id,TopicInput in) {
        var old=get(id);
        if(old.workspaceId()!=null)throw new InvalidRequestException("Edit workspace notes in NOTE SYS");
        if(db.update("update journal_notes set title=?,content=?,version=version+1,updated_at=current_timestamp where id=? and workflow_owner_id=? and version=?",
            NoteContent.name(in.title(),240),content(in.content()),id,owner(),in.version())!=1)throw new OptimisticLockConflictException("Note changed in another window; your draft is retained");
        return get(id);
    }
    private String content(String value) { value=Objects.requireNonNullElse(value,"");if(value.length()>1000000)throw new InvalidRequestException("Note content is too long");return value; }
    public List<Backlink> backlinks(UUID id) {
        get(id);
        return db.query("select day,block_id,excerpt from worklog_note_references where user_id=? and note_id=? order by day desc,block_id,ordinal",
            (r,i)->new Backlink(r.getDate("day").toLocalDate(),r.getObject("block_id",UUID.class),r.getString("excerpt")),owner(),id);
    }
    /** Only explicit resolved metadata binds an identity; unresolved names never guess. */
    void sync(LocalDate date,List<Block> blocks) {
        db.update("delete from worklog_note_references where user_id=? and day=?",owner(),date);
        for(var b:blocks) {
            if(b.metadata()==null || !(b.metadata().get("wikiLinks") instanceof List<?> resolved))continue;
            for(var link:NoteContent.links(Objects.requireNonNullElse(b.content(),""))) {
                for(Object item:resolved) {
                    if(!(item instanceof Map<?,?> value) || !Objects.equals(value.get("name"),link.title()) || !(value.get("ordinal") instanceof Number ordinal) || ordinal.intValue()!=link.ordinal())continue;
                    UUID id;try{id=UUID.fromString(String.valueOf(value.get("noteId")));}catch(IllegalArgumentException e){throw new InvalidRequestException("Invalid note identity");}
                    // A soft-deleted note can retain a historical identity without blocking
                    // unrelated worklog edits. Autocomplete/get still hide deleted notes.
                    if(db.queryForObject("select count(*) from journal_notes n left join note_workspaces w on w.id=n.workspace_id where n.id=? and (w.owner_id=? or n.workflow_owner_id=?)",Long.class,id,owner(),owner())==0)
                        throw new ResourceNotFoundException("Note not found");
                    db.update("insert into worklog_note_references(user_id,day,block_id,normalized_name,ordinal,note_id,excerpt) values(?,?,?,?,?,?,?)",
                        owner(),date,b.id(),link.normalized(),link.ordinal(),id,NoteContent.excerpt(link.context()));
                    break;
                }
            }
        }
    }
}
