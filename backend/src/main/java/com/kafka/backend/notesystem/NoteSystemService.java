package com.kafka.backend.notesystem;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.*;
import java.time.*;
import java.util.*;
import static com.kafka.backend.notesystem.NoteTypes.*;

/** All writes hold the owning workspace row lock. This orders cross-table namespace
 * operations and link reconciliation, while note versions reject stale clients. */
@Service
@Transactional
public class NoteSystemService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    public NoteSystemService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json){this.db=db;this.users=users;this.json=json;}
    private UUID owner(){return users.getCurrentUserId();}
    private static Instant time(ResultSet r,String key)throws SQLException {var t=r.getTimestamp(key);return t==null?null:t.toInstant();}
    private static LocalDate date(ResultSet r,String key)throws SQLException {var d=r.getDate(key);return d==null?null:d.toLocalDate();}
    private void workspace(UUID id, boolean write) {
        var rows=db.query("select archived_at from note_workspaces where id=? and owner_id=?"+(write?" for update":""),(r,n)->Optional.ofNullable(time(r,"archived_at")),id,owner());
        if(rows.isEmpty())throw new ResourceNotFoundException("Workspace를 찾을 수 없습니다.");
        if(write && rows.getFirst().isPresent())throw new InvalidRequestException("보관된 Workspace를 먼저 복원하세요.");
    }
    private void version(Note note,long expected){if(note.version()!=expected)throw new OptimisticLockConflictException("다른 창에서 변경되었습니다. 초안을 보존한 뒤 최신 노트를 다시 여세요.");}
    public List<Workspace> workspaces(){
        db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))",owner().toString());
        if(db.queryForObject("select count(*) from note_workspaces where owner_id=?",Long.class,owner())==0)
            createWorkspace(new WorkspaceInput("JISEUNG","나의 기록과 생각을 연결하는 공간","notebook",false,null));
        var modules=new HashMap<UUID,List<ModuleSetting>>();
        db.query("select s.* from workspace_module_settings s join note_workspaces w on w.id=s.workspace_id where w.owner_id=? order by position",r->{
            modules.computeIfAbsent(r.getObject("workspace_id",UUID.class),k->new ArrayList<>()).add(new ModuleSetting(NoteTypes.Module.valueOf(r.getString("module")),r.getBoolean("enabled"),r.getInt("position"),r.getBoolean("is_default")));
        },owner());
        return db.query("select * from note_workspaces where owner_id=? order by created_at,id",(r,n)->new Workspace(r.getObject("id",UUID.class),r.getString("name"),r.getString("description"),r.getString("icon"),time(r,"archived_at"),modules.getOrDefault(r.getObject("id",UUID.class),List.of())),owner());
    }
    public UUID createWorkspace(WorkspaceInput in){
        UUID id=UUID.randomUUID();String name=NoteContent.name(in.name(),120);
        db.update("insert into note_workspaces(id,owner_id,name,normalized_name,description,icon) values(?,?,?,?,?,?)",id,owner(),name,NoteContent.normalize(name),Objects.requireNonNullElse(in.description(),""),Objects.requireNonNullElse(in.icon(),"notebook"));
        int i=0;for(var m:NoteTypes.Module.values())db.update("insert into workspace_module_settings(workspace_id,module,position,is_default) values(?,?,?,?)",id,m.name(),i++,m==NoteTypes.Module.DAILY_NOTES);
        return id;
    }
    public void updateWorkspace(UUID id,WorkspaceInput in){
        workspace(id,false);
        db.queryForList("select id from note_workspaces where id=? for update",id);
        String name=NoteContent.name(in.name(),120);
        if(in.modules()!=null){
            var mods=in.modules();
            if(mods.size()!=6 || mods.stream().map(ModuleSetting::module).filter(Objects::nonNull).distinct().count()!=6 || mods.stream().filter(ModuleSetting::isDefault).count()!=1 || mods.stream().anyMatch(m->m.isDefault()&&!m.enabled()))throw new InvalidRequestException("활성 기본 모듈 하나와 6개의 모듈이 필요합니다.");
            db.update("update workspace_module_settings set is_default=false where workspace_id=?",id);
            for(int i=0;i<mods.size();i++){var m=mods.get(i);db.update("update workspace_module_settings set enabled=?,position=?,is_default=? where workspace_id=? and module=?",m.enabled(),i,m.isDefault(),id,m.module().name());}
        }
        db.update("update note_workspaces set name=?,normalized_name=?,description=?,icon=?,archived_at=?,updated_at=now() where id=?",name,NoteContent.normalize(name),Objects.requireNonNullElse(in.description(),""),Objects.requireNonNullElse(in.icon(),"notebook"),in.archived()?Timestamp.from(Instant.now()):null,id);
    }
    public void deleteWorkspace(UUID id,String confirmation){
        workspace(id,false);var row=db.queryForMap("select name,archived_at from note_workspaces where id=? for update",id);
        if(!Objects.equals(row.get("name"),confirmation))throw new InvalidRequestException("Workspace 이름을 입력해 영구삭제를 확인하세요.");
        // Remove incoming references before cascading notes; the target FK is restrictive.
        db.update("delete from journal_link_occurrences where workspace_id=?",id);
        db.update("delete from note_workspaces where id=?",id);
    }
    public void deleteNote(UUID w,UUID id,long expectedVersion,String confirmation){
        workspace(w,true);Note old=note(w,id);version(old,expectedVersion);
        if(old.deletedAt()==null || !old.type().equals("NOTE"))throw new InvalidRequestException("휴지통의 일반 노트만 영구삭제할 수 있습니다.");
        if(!old.title().equals(confirmation))throw new InvalidRequestException("노트 제목을 입력해 영구삭제를 확인하세요.");
        // Surviving source text remains intact and becomes an unresolved wiki link.
        db.update("update journal_link_occurrences set target_note_id=null where workspace_id=? and target_note_id=?",w,id);
        db.update("delete from journal_notes where workspace_id=? and id=?",w,id);
        var media=java.util.regex.Pattern.compile("media:([0-9a-fA-F-]{36})").matcher(old.content());
        Set<UUID> candidates=new HashSet<>();while(media.find())candidates.add(UUID.fromString(media.group(1)));
        for(UUID candidate:candidates)db.update("delete from journal_media where workspace_id=? and id=? and not exists(select 1 from journal_notes where workspace_id=? and position(? in content)>0)",w,candidate,w,"media:"+candidate);
    }
    public Settings settings(){var rows=db.queryForList("select settings::text from note_system_settings where owner_id=?",String.class,owner());return rows.isEmpty()?Settings.defaults():json.readValue(rows.getFirst(),Settings.class);}
    public Settings settings(Settings value){db.update("insert into note_system_settings(owner_id,settings) values(?,?::jsonb) on conflict(owner_id) do update set settings=excluded.settings",owner(),json.writeValueAsString(value));return value;}
    private Note mapNote(ResultSet r,List<String> aliases,List<Tag> tags)throws SQLException{return new Note(r.getObject("id",UUID.class),r.getObject("workspace_id",UUID.class),r.getString("type"),date(r,"journal_date"),r.getString("title"),r.getString("content"),r.getLong("version"),time(r,"pinned_at"),time(r,"deleted_at"),time(r,"created_at"),time(r,"updated_at"),aliases,tags);}
    public Note note(UUID w,UUID id){
        workspace(w,false);
        var aliases=db.queryForList("select alias from journal_note_aliases where workspace_id=? and note_id=? order by created_at",String.class,w,id);
        var tags=db.query("select t.id,t.name from note_tags t join journal_note_tags nt on nt.tag_id=t.id where nt.workspace_id=? and nt.note_id=? order by t.name",(r,n)->new Tag(r.getObject("id",UUID.class),r.getString("name"),0),w,id);
        var rows=db.query("select * from journal_notes where workspace_id=? and id=?",(r,n)->mapNote(r,aliases,tags),w,id);
        if(rows.isEmpty())throw new ResourceNotFoundException("노트를 찾을 수 없습니다.");return rows.getFirst();
    }
    public List<Note> daily(UUID w,LocalDate end,int days){
        workspace(w,false);if(days<1||days>31)throw new InvalidRequestException("날짜 범위는 1~31일입니다.");
        return db.query("select * from journal_notes where workspace_id=? and journal_date between ? and ? and deleted_at is null order by journal_date desc",(r,n)->mapNote(r,List.of(),List.of()),w,end.minusDays(days-1),end);
    }
    private UUID resolve(UUID w,String name){var ids=db.queryForList("select note_id from journal_note_names where workspace_id=? and normalized_name=?",UUID.class,w,NoteContent.normalize(name));return ids.isEmpty()?null:ids.getFirst();}
    public Note resolveNote(UUID w,String name){workspace(w,false);UUID id=resolve(w,name);if(id==null)throw new ResourceNotFoundException("아직 생성되지 않은 링크입니다.");return note(w,id);}
    public Note openWiki(UUID w,String name){
        workspace(w,true);String title=NoteContent.name(name,240);UUID id=resolve(w,title);
        if(id!=null)return note(w,id);
        return save(w,new NoteInput(UUID.randomUUID(),null,title,"",0));
    }
    public List<SearchResult> wikiSuggestions(UUID w,String query){
        workspace(w,false);if(query==null||query.length()>240)throw new InvalidRequestException("검색 조건을 확인하세요.");
        String normalized=NoteContent.normalize(query);
        return db.query("select n.id,n.type,n.title from journal_notes n where n.workspace_id=? and n.deleted_at is null and exists(select 1 from journal_note_names names where names.workspace_id=n.workspace_id and names.note_id=n.id and position(? in names.normalized_name)>0) order by n.updated_at desc,n.id limit 8",(r,n)->new SearchResult(r.getString("id"),r.getString("type"),r.getString("title"),""),w,normalized);
    }
    private void reserve(UUID w,UUID id,String title){
        String key=NoteContent.normalize(title);UUID found=resolve(w,key);
        if(found!=null&&!found.equals(id))throw new OptimisticLockConflictException("같은 제목 또는 별칭이 이미 사용 중입니다 (휴지통 포함).");
        db.update("insert into journal_note_names(workspace_id,normalized_name,note_id) values(?,?,?) on conflict do nothing",w,key,id);
    }
    public Note save(UUID w,NoteInput in){
        workspace(w,true);
        UUID id=in.id();var exists=db.queryForList("select id from journal_notes where workspace_id=? and id=?",UUID.class,w,id);
        if(exists.isEmpty()){
            if(in.expectedVersion()!=0)throw new OptimisticLockConflictException("노트 버전을 확인하세요.");
            if(in.journalDate()!=null){
                var daily=db.queryForList("select id from journal_notes where workspace_id=? and journal_date=?",UUID.class,w,in.journalDate());
                if(!daily.isEmpty())throw new OptimisticLockConflictException("이 날짜의 노트가 다른 창에서 생성되었습니다. 초안을 보존하고 다시 여세요.");
                if(in.content().isBlank())return null;
            }
            String title=in.journalDate()!=null?in.journalDate().toString():NoteContent.name(in.title(),240);
            db.update("insert into journal_notes(id,workspace_id,type,journal_date,title) values(?,?,?,?,?)",id,w,in.journalDate()!=null?"DAILY":"NOTE",in.journalDate(),title);
            reserve(w,id,title);
        }
        Note old=note(w,id);version(old,in.expectedVersion());
        if(old.deletedAt()!=null)throw new InvalidRequestException("휴지통의 노트를 먼저 복원하세요.");
        if(!Objects.equals(old.journalDate(),in.journalDate()))throw new InvalidRequestException("노트 날짜/종류는 변경할 수 없습니다.");
        validateRichContent(w,in.content());
        db.update("update journal_notes set content=?,version=version+1,updated_at=now() where workspace_id=? and id=?",in.content(),w,id);
        reconcile(w,id,in.content());resolvePending(w);
        return note(w,id);
    }
    private void validateRichContent(UUID w,String content){
        // Every canonical media reference is checked before it can be attached.
        var refs=java.util.regex.Pattern.compile("media:([0-9a-fA-F-]{36})").matcher(content);
        Set<UUID> ids=new HashSet<>();while(refs.find())try{ids.add(UUID.fromString(refs.group(1)));}catch(IllegalArgumentException e){throw new InvalidRequestException("잘못된 미디어 참조입니다.");}
        for(UUID id:ids)if(db.queryForObject("select count(*) from journal_media where workspace_id=? and id=?",Long.class,w,id)==0)throw new InvalidRequestException("이 Workspace의 미디어만 사용할 수 있습니다.");
        // Real Reflection embeds require a provider; no production fixture objects.
        if(content.contains(":::reflection "))throw new InvalidRequestException("WORK_OS Reflection 제공자가 아직 연결되지 않았습니다.");
    }
    public Note rename(UUID w,UUID id,RenameInput in){
        workspace(w,true);Note old=note(w,id);version(old,in.expectedVersion());
        if(old.type().equals("DAILY"))throw new InvalidRequestException("Daily Note 제목은 날짜로 고정됩니다.");
        String title=NoteContent.name(in.title(),240);reserve(w,id,title);
        if(!NoteContent.normalize(old.title()).equals(NoteContent.normalize(title))){
            db.update("insert into journal_note_aliases(id,workspace_id,note_id,alias,normalized_alias) values(?,?,?,?,?) on conflict do nothing",UUID.randomUUID(),w,id,old.title(),NoteContent.normalize(old.title()));
            db.update("delete from journal_note_aliases where workspace_id=? and note_id=? and normalized_alias=?",w,id,NoteContent.normalize(title));
        }
        db.update("update journal_notes set title=?,version=version+1,updated_at=now() where id=?",title,id);resolvePending(w);return note(w,id);
    }
    private void reconcile(UUID w,UUID source,String content){
        var links=NoteContent.links(content);Set<String> keep=new HashSet<>();
        for(var link:links){
            keep.add(link.normalized()+"\u0000"+link.ordinal());
            db.update("""
                insert into journal_link_occurrences(id,workspace_id,source_note_id,target_note_id,target_title,normalized_target,ordinal,source_position,context_text)
                values(?,?,?,?,?,?,?,?,?) on conflict(source_note_id,normalized_target,ordinal) do update set
                target_note_id=coalesce(journal_link_occurrences.target_note_id,excluded.target_note_id),target_title=excluded.target_title,
                source_position=excluded.source_position,context_text=excluded.context_text
                """,UUID.randomUUID(),w,source,resolve(w,link.title()),link.title(),link.normalized(),link.ordinal(),link.position(),link.context());
        }
        var obsolete=db.query("select id,normalized_target,ordinal from journal_link_occurrences where source_note_id=?",(r,n)->keep.contains(r.getString("normalized_target")+"\u0000"+r.getInt("ordinal"))?null:r.getObject("id",UUID.class),source);
        for(UUID id:obsolete)if(id!=null)db.update("delete from journal_link_occurrences where id=?",id);
    }
    private void resolvePending(UUID w){
        db.update("update journal_link_occurrences l set target_note_id=n.note_id from journal_note_names n where l.workspace_id=? and l.target_note_id is null and n.workspace_id=l.workspace_id and n.normalized_name=l.normalized_target",w);
        db.update("insert into journal_connection_history(workspace_id,source_note_id,target_note_id,first_connected_at) select workspace_id,source_note_id,target_note_id,min(created_at) from journal_link_occurrences where workspace_id=? and target_note_id is not null group by workspace_id,source_note_id,target_note_id on conflict do nothing",w);
    }
    public Note pin(UUID w,UUID id,VersionInput in){workspace(w,true);Note old=note(w,id);version(old,in.expectedVersion());db.update("update journal_notes set pinned_at=?,version=version+1 where id=?",in.value()?Timestamp.from(Instant.now()):null,id);return note(w,id);}
    public Note trash(UUID w,UUID id,VersionInput in){workspace(w,true);Note old=note(w,id);version(old,in.expectedVersion());if(old.type().equals("DAILY")&&in.value())throw new InvalidRequestException("Daily Note는 내용을 비워 기록 없음 상태로 돌릴 수 있습니다.");db.update("update journal_notes set deleted_at=?,version=version+1 where id=?",in.value()?Timestamp.from(Instant.now()):null,id);return note(w,id);}
    public void visit(UUID w,UUID id){
        workspace(w,false);Note n=note(w,id);if(n.deletedAt()!=null)return;
        db.update("insert into journal_note_recent_views(workspace_id,note_id,last_opened_at) values(?,?,clock_timestamp()) on conflict(workspace_id,note_id) do update set last_opened_at=excluded.last_opened_at",w,id);
        db.update("delete from journal_note_recent_views where workspace_id=? and note_id in (select note_id from journal_note_recent_views where workspace_id=? order by last_opened_at desc,note_id offset 50)",w,w);
    }
    public Page<Summary> library(UUID w,String filter,String query,UUID tag,int offset,int limit){
        workspace(w,false);if(offset<0||limit<1||limit>100)throw new InvalidRequestException("잘못된 페이지 범위입니다.");
        String condition=switch(filter){case "TRASH"->"n.deleted_at is not null";case "PINNED"->"n.deleted_at is null and n.pinned_at is not null";case "NOTE","DAILY"->"n.deleted_at is null and n.type='"+filter+"'";case "RECENT"->"n.deleted_at is null and v.note_id is not null";default->"n.deleted_at is null";};
        String sql="select n.id,n.type,n.journal_date,n.title,left(n.content,180) excerpt,n.updated_at,n.pinned_at,v.last_opened_at from journal_notes n left join journal_note_recent_views v on v.note_id=n.id where n.workspace_id=? and "+condition;
        var args=new ArrayList<Object>();args.add(w);
        if(tag!=null){sql+=" and exists(select 1 from journal_note_tags t where t.note_id=n.id and t.tag_id=?)";args.add(tag);}
        if(query!=null&&!query.isBlank()){sql+=" and (position(lower(?) in lower(n.title||' '||n.content))>0 or exists(select 1 from journal_note_aliases a where a.note_id=n.id and position(? in a.normalized_alias)>0))";args.add(query);args.add(NoteContent.normalize(query));}
        sql+=" order by "+(filter.equals("RECENT")?"v.last_opened_at":"n.updated_at")+" desc,n.id limit ? offset ?";args.add(limit+1);args.add(offset);
        Map<UUID,List<Tag>> tags=new HashMap<>();
        var rows=db.query(sql,(r,n)->new Summary(r.getObject("id",UUID.class),r.getString("type"),date(r,"journal_date"),r.getString("title"),NoteContent.excerpt(r.getString("excerpt")),time(r,"updated_at"),time(r,"pinned_at"),time(r,"last_opened_at"),tags.computeIfAbsent(r.getObject("id",UUID.class),k->new ArrayList<>())),args.toArray());
        if(!rows.isEmpty()){
            String placeholders=String.join(",",Collections.nCopies(rows.size(),"?"));
            db.query("select nt.note_id,t.id,t.name from journal_note_tags nt join note_tags t on t.id=nt.tag_id where nt.note_id in ("+placeholders+")",r->{tags.get(r.getObject("note_id",UUID.class)).add(new Tag(r.getObject("id",UUID.class),r.getString("name"),0));},rows.stream().map(Summary::id).toArray());
        }
        return new Page<>(rows.subList(0,Math.min(rows.size(),limit)),offset,rows.size()>limit);
    }
    public List<Tag> tags(UUID w){workspace(w,false);return db.query("select t.id,t.name,count(n.id) uses from note_tags t left join journal_note_tags nt on nt.tag_id=t.id left join journal_notes n on n.id=nt.note_id and n.deleted_at is null where t.workspace_id=? group by t.id order by uses desc,t.name",(r,n)->new Tag(r.getObject("id",UUID.class),r.getString("name"),r.getLong("uses")),w);}
    public Tag createTag(UUID w,String name){workspace(w,true);name=NoteContent.name(name,80);String normalized=NoteContent.normalize(name);db.update("insert into note_tags(id,workspace_id,name,normalized_name) values(?,?,?,?) on conflict(workspace_id,normalized_name) do nothing",UUID.randomUUID(),w,name,normalized);return db.queryForObject("select id,name from note_tags where workspace_id=? and normalized_name=?",(r,n)->new Tag(r.getObject("id",UUID.class),r.getString("name"),0),w,normalized);}
    public void renameTag(UUID w,UUID tag,String name){workspace(w,true);name=NoteContent.name(name,80);if(db.update("update note_tags set name=?,normalized_name=? where workspace_id=? and id=?",name,NoteContent.normalize(name),w,tag)==0)throw new ResourceNotFoundException("태그를 찾을 수 없습니다.");}
    public void deleteTag(UUID w,UUID tag){workspace(w,true);db.update("delete from note_tags where workspace_id=? and id=?",w,tag);}
    public Note tag(UUID w,UUID id,String name,boolean attach){workspace(w,true);Note note=note(w,id);if(note.deletedAt()!=null)throw new InvalidRequestException("노트를 먼저 복원하세요.");if(attach){Tag tag=createTag(w,name);db.update("insert into journal_note_tags(workspace_id,note_id,tag_id) values(?,?,?) on conflict do nothing",w,id,tag.id());}else db.update("delete from journal_note_tags where workspace_id=? and note_id=? and tag_id in(select id from note_tags where workspace_id=? and normalized_name=?)",w,id,w,NoteContent.normalize(name));return note(w,id);}
    public List<Reference> references(UUID w,UUID target,String pending){
        workspace(w,false);if(target!=null)note(w,target);
        return db.query("select l.*,n.title,n.journal_date from journal_link_occurrences l join journal_notes n on n.id=l.source_note_id where l.workspace_id=? and n.deleted_at is null and "+(target!=null?"l.target_note_id=?":"l.target_note_id is null and l.normalized_target=?")+" order by coalesce(n.journal_date,n.created_at at time zone 'Asia/Seoul'::text)::date desc,l.source_position limit 500",(r,n)->new Reference(r.getObject("source_note_id",UUID.class),r.getString("title"),date(r,"journal_date"),r.getString("context_text"),r.getInt("source_position"),time(r,"created_at")),w,target!=null?target:NoteContent.normalize(pending));
    }
    public List<Pending> pending(UUID w){workspace(w,false);return db.query("select min(l.target_title) title,l.normalized_target,count(*) mentions,min(l.created_at) first,max(l.created_at) latest from journal_link_occurrences l join journal_notes n on n.id=l.source_note_id where l.workspace_id=? and l.target_note_id is null and n.deleted_at is null group by l.normalized_target order by mentions desc,latest desc",(r,n)->new Pending(r.getString("title"),r.getString("normalized_target"),r.getLong("mentions"),time(r,"first"),time(r,"latest")),w);}
    private static final String ACTIVE_LINKS="""
        with links as (select l.*,s.journal_date from journal_link_occurrences l
        join journal_notes s on s.id=l.source_note_id and s.deleted_at is null
        left join journal_notes t on t.id=l.target_note_id
        where l.workspace_id=? and (l.target_note_id is null or t.deleted_at is null)),
        neighbors as (select source_note_id id,target_note_id neighbor from links where target_note_id is not null and target_note_id<>source_note_id
        union select target_note_id,source_note_id from links where target_note_id is not null and target_note_id<>source_note_id)
        """;
    public List<Metric> metrics(UUID w){
        workspace(w,false);
        return db.query(ACTIVE_LINKS+"""
          , degrees as (select id,count(*) degree from neighbors group by id),
          incoming as (select target_note_id id,count(distinct source_note_id) incoming,count(distinct journal_date) days from links where target_note_id is not null group by target_note_id),
          outgoing as (select source_note_id id,count(distinct target_note_id) outgoing from links group by source_note_id),
          mentions as (select id,count(*) mentions,max(created_at) last from (
             select id occurrence,source_note_id id,created_at from links
             union select id,target_note_id,created_at from links where target_note_id is not null) x group by id),
          first_edges as (select least(source_note_id,target_note_id) a,greatest(source_note_id,target_note_id) b,min(first_connected_at) first
             from journal_connection_history where workspace_id=? and source_note_id<>target_note_id group by a,b),
          growth as (select n.id,count(*) growth from neighbors n join first_edges f on (f.a=n.id and f.b=n.neighbor) or (f.b=n.id and f.a=n.neighbor)
             where f.first>=now()-interval '30 days' group by n.id)
          select n.id,n.title,n.type,coalesce(d.degree,0) degree,coalesce(i.days,0) days,coalesce(m.mentions,0) mentions,
          coalesce(g.growth,0) growth,m.last,coalesce(i.incoming,0) incoming,coalesce(o.outgoing,0) outgoing
          from journal_notes n left join degrees d on d.id=n.id left join incoming i on i.id=n.id
          left join outgoing o on o.id=n.id left join mentions m on m.id=n.id left join growth g on g.id=n.id
          where n.workspace_id=? and n.deleted_at is null order by degree desc,n.title
          """,(r,n)->new Metric(r.getObject("id",UUID.class),r.getString("title"),r.getString("type"),r.getLong("degree"),r.getLong("days"),r.getLong("mentions"),r.getLong("growth"),time(r,"last"),r.getLong("incoming"),r.getLong("outgoing")),w,w,w);
    }
    public Graph graph(UUID w){
        workspace(w,false);var metrics=metrics(w);var pending=pending(w);
        var edges=db.query(ACTIVE_LINKS+"select source_note_id,coalesce(target_note_id::text,'pending:'||normalized_target) target,count(*) weight from links group by source_note_id,target",(r,n)->new GraphEdge(r.getString("source_note_id"),r.getString("target"),r.getLong("weight")),w);
        Set<String> involved=new HashSet<>();for(var e:edges){involved.add(e.source());involved.add(e.target());}
        List<GraphNode> nodes=new ArrayList<>();for(var m:metrics)nodes.add(new GraphNode(m.id().toString(),m.title(),m.type(),m.connectedNotes(),!involved.contains(m.id().toString())));
        for(var p:pending)nodes.add(new GraphNode("pending:"+p.normalizedTitle(),p.title(),"PENDING",edges.stream().filter(e->e.target().equals("pending:"+p.normalizedTitle())).count(),false));
        return new Graph(nodes,edges);
    }
    public List<SearchResult> search(UUID w,String q,int limit){
        workspace(w,false);if(q==null||q.length()>240||limit<1||limit>100)throw new InvalidRequestException("검색 조건을 확인하세요.");
        // V1 literal substring search supports Korean; workspace B-tree bounds the
        // personal-scale scan. Link/tag discovery never parses or LIKE-scans bodies.
        return db.query("""
          select id,type,title,excerpt from (
          select n.id::text id,n.type,n.title,left(n.content,180) excerpt,n.updated_at ordering from journal_notes n where n.workspace_id=? and n.deleted_at is null and
          (position(lower(?) in lower(n.title||' '||n.content||' '||coalesce(n.journal_date::text,'')))>0
           or exists(select 1 from journal_note_aliases a where a.note_id=n.id and position(? in a.normalized_alias)>0)
           or exists(select 1 from journal_note_tags nt join note_tags t on t.id=nt.tag_id where nt.note_id=n.id and position(? in t.normalized_name)>0))
          union all select t.id::text,'TAG',t.name,'태그로 노트 탐색',null from note_tags t where t.workspace_id=? and position(? in t.normalized_name)>0
          ) results order by ordering desc nulls last,title limit ?
          """,(r,n)->new SearchResult(r.getString("id"),r.getString("type"),r.getString("title"),NoteContent.excerpt(r.getString("excerpt"))),w,q,NoteContent.normalize(q),NoteContent.normalize(q),w,NoteContent.normalize(q),limit);
    }
}
