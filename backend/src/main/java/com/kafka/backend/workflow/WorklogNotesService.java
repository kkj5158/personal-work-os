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
    public record ContextBlock(Block block, int depth) {}
    public record BacklinkContext(List<ContextBlock> blocks, int total) {}
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
    /** Resolve a clicked title without assigning a Workspace or guessing an ambiguous identity. */
    public List<Topic> resolve(String title) {
        String name=NoteContent.name(title,240),normalized=NoteContent.normalize(name);
        db.update("insert into workflow_preferences(user_id) values(?) on conflict do nothing",owner());
        db.queryForList("select user_id from workflow_preferences where user_id=? for update",owner());
        var matches=db.query("select n.id,n.title from journal_notes n left join note_workspaces w on w.id=n.workspace_id where (w.owner_id=? or n.workflow_owner_id=?) and n.deleted_at is null and n.type='NOTE' order by n.updated_at desc,n.id",
            (r,i)->Map.entry(r.getObject("id",UUID.class),r.getString("title")),owner(),owner()).stream()
            .filter(row->NoteContent.normalize(row.getValue()).equals(normalized)).map(row->get(row.getKey())).toList();
        return matches.isEmpty()?List.of(create(new TopicInput(name,"",0))):matches;
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
        return backlinks(id,0);
    }
    public List<Backlink> backlinks(UUID id,int offset) {
        get(id);
        if(offset<0)throw new InvalidRequestException("Invalid history offset");
        return db.query("select r.day,r.block_id,min(r.excerpt) as excerpt from worklog_note_references r join workpad_blocks b on b.id=r.block_id and b.day=r.day and b.user_id=r.user_id where r.user_id=? and r.note_id=? group by r.day,r.block_id order by r.day desc,min(b.sort_order),r.block_id limit 50 offset ?",
            (r,i)->new Backlink(r.getDate("day").toLocalDate(),r.getObject("block_id",UUID.class),r.getString("excerpt")),owner(),id,offset);
    }
    /** Lazy, owner/date-scoped canonical read: no per-occurrence day queries in the list. */
    public BacklinkContext backlinkContext(UUID id,LocalDate date,UUID root,int offset) {
        get(id);
        if(offset<0)throw new InvalidRequestException("Invalid context offset");
        if(db.queryForObject("select count(*) from worklog_note_references where user_id=? and note_id=? and day=? and block_id=?",Long.class,owner(),id,date,root)==0)
            throw new ResourceNotFoundException("This reference no longer exists");
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        var blocks=new WorkflowService(db,users,json).day(date).blocks();
        Map<UUID,List<Block>> children=new HashMap<>();
        for(var b:blocks)if(b.parentId()!=null)children.computeIfAbsent(b.parentId(),k->new ArrayList<>()).add(b);
        children.values().forEach(rows->rows.sort(Comparator.comparingInt(Block::order).thenComparing(Block::id)));
        var source=blocks.stream().filter(b->b.id().equals(root)).findFirst().orElseThrow(()->new ResourceNotFoundException("Source block not found"));
        List<ContextBlock> context=new ArrayList<>();
        appendContext(source,0,children,new HashSet<>(),context);
        return new BacklinkContext(context.subList(Math.min(offset,context.size()),Math.min(offset+100,context.size())),context.size());
    }
    private static void appendContext(Block block,int depth,Map<UUID,List<Block>> children,Set<UUID> seen,List<ContextBlock> result) {
        if(!seen.add(block.id()))return;
        result.add(new ContextBlock(block,depth));
        for(var child:children.getOrDefault(block.id(),List.of()))appendContext(child,depth+1,children,seen,result);
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
