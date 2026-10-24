package com.kafka.backend.timetable;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kafka.backend.calendar.CalendarCreationOperations;
import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.timetable.TimetableTypes.*;

@Service
@Transactional
public class TimetableService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final CalendarCreationOperations operations;
    private final ObjectMapper json = new ObjectMapper();
    public TimetableService(JdbcTemplate db, CurrentUserProvider users, CalendarCreationOperations operations) {
        this.db=db; this.users=users; this.operations=operations;
    }
    private UUID owner() { return users.getCurrentUserId(); }
    private static Instant time(ResultSet r, String key) throws SQLException {var t=r.getTimestamp(key);return t==null?null:t.toInstant();}
    private Timetable row(ResultSet r, int n) throws SQLException {
        try {return new Timetable(r.getObject("id",UUID.class),r.getString("title"),r.getString("description"),r.getString("goal"),r.getString("memo"),r.getString("default_color"),
            Arrays.asList(json.readValue(r.getString("checklist"),CheckItem[].class)),r.getInt("sort_order"),time(r,"archived_at"),r.getLong("version"),time(r,"created_at"),time(r,"updated_at"));}
        catch(java.io.IOException ex) {throw new IllegalStateException("Invalid stored checklist",ex);}
    }
    private Block blockRow(ResultSet r,int n) throws SQLException {return new Block(r.getObject("id",UUID.class),r.getObject("timetable_id",UUID.class),r.getString("title"),r.getInt("weekday"),r.getInt("start_minute"),r.getInt("duration_minutes"),r.getString("memo"),r.getString("color"),r.getLong("version"),time(r,"deleted_at"));}
    private Timetable owned(UUID id,boolean write,boolean allowArchived) {
        var rows=db.query("select * from calendar_timetables where id=? and owner_id=?"+(write?" for update":""),this::row,id,owner());
        if(rows.isEmpty())throw new ResourceNotFoundException("시간표를 찾을 수 없습니다.");
        var t=rows.getFirst();
        if(write&&!allowArchived&&t.archivedAt()!=null)throw new InvalidRequestException("보관된 시간표를 먼저 복원하세요.");
        return t;
    }
    private void lockOwner() {db.query("select id from auth.users where id=? for update",r->{},owner());}
    private void version(long actual,Long expected) {if(expected==null)throw new InvalidRequestException("버전이 필요합니다.");if(actual!=expected)throw new OptimisticLockConflictException("다른 창에서 변경되었습니다. 초안을 보존하고 최신 내용을 불러오세요.");}
    private String text(String value,int max) {if(value==null)return "";if(value.length()>max)throw new InvalidRequestException("입력 내용이 너무 깁니다.");return value;}
    private String title(String value) {if(value==null||value.isBlank()||value.trim().length()>200)throw new InvalidRequestException("제목을 1~200자로 입력하세요.");return value.trim();}
    private String color(String value) {if(value==null)return null;if(!value.matches("#[0-9a-fA-F]{6}"))throw new InvalidRequestException("올바른 색상을 선택하세요.");return value.toLowerCase(Locale.ROOT);}
    private String encode(Object value) {try{return json.writeValueAsString(value);}catch(java.io.IOException ex){throw new IllegalStateException(ex);}}
    private String kind(String action,Object input) {
        try {return "timetable:"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest((action+":"+encode(input)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException ex){throw new IllegalStateException(ex);}
    }
    public Map<String,UUID> context() {return Map.of("ownerId",owner());}
    private UUID key(UUID key) {if(key==null)throw new InvalidRequestException("Idempotency-Key가 필요합니다.");return key;}
    private Input normalize(Input in) {
        if(in==null)throw new InvalidRequestException("시간표 정보가 필요합니다.");
        var items=in.checklist()==null?List.<CheckItem>of():in.checklist();
        if(items.size()>200||items.stream().anyMatch(i->i==null||i.id()==null)||items.stream().map(CheckItem::id).distinct().count()!=items.size())throw new InvalidRequestException("체크리스트 항목을 확인하세요.");
        var checked=items.stream().map(i->new CheckItem(i.id(),title(i.title()),i.checked())).toList();
        return new Input(in.version(),title(in.title()),text(in.description(),20000),text(in.goal(),20000),text(in.memo(),20000),color(in.defaultColor()),checked);
    }
    @Transactional(readOnly=true) public List<Timetable> list() {return db.query("select * from calendar_timetables where owner_id=? order by sort_order,created_at,id",this::row,owner());}
    @Transactional(readOnly=true) public Timetable get(UUID id) {return owned(id,false,true);}
    public Timetable create(Input input,UUID operation) {
        var in=normalize(input);
        return operations.execute(key(operation),kind("create",in),Timetable.class,()->{
            UUID id=UUID.randomUUID();
            Integer order=db.queryForObject("select coalesce(max(sort_order),-1)+1 from calendar_timetables where owner_id=?",Integer.class,owner());
            db.update("insert into calendar_timetables(id,owner_id,title,description,goal,memo,default_color,checklist,sort_order) values (?,?,?,?,?,?,?,?,?)",id,owner(),in.title(),in.description(),in.goal(),in.memo(),in.defaultColor(),encode(in.checklist()),order);
            return get(id);
        },r->true);
    }
    public Timetable update(UUID id,Input input) {
        var in=normalize(input);var t=owned(id,true,false);version(t.version(),in.version());
        db.update("update calendar_timetables set title=?,description=?,goal=?,memo=?,default_color=?,checklist=?,version=version+1,updated_at=now() where id=? and owner_id=?",in.title(),in.description(),in.goal(),in.memo(),in.defaultColor(),encode(in.checklist()),id,owner());
        return get(id);
    }
    public Timetable archive(UUID id,ArchiveInput in) {
        lockOwner();var t=owned(id,true,true);version(t.version(),in.version());
        db.update("update calendar_timetables set archived_at=?,version=version+1,updated_at=now() where id=? and owner_id=?",in.archived()?Timestamp.from(Instant.now()):null,id,owner());return get(id);
    }
    public List<Timetable> reorder(ReorderInput in) {
        lockOwner();var active=list().stream().filter(t->t.archivedAt()==null).map(Timetable::id).toList();
        if(in==null||in.ids()==null||in.ids().size()!=active.size()||new HashSet<>(in.ids()).size()!=active.size()||!new HashSet<>(in.ids()).equals(new HashSet<>(active)))throw new InvalidRequestException("활성 시간표 전체를 중복 없이 지정하세요.");
        for(int i=0;i<in.ids().size();i++)db.update("update calendar_timetables set sort_order=?,version=version+1,updated_at=now() where id=? and owner_id=?",i,in.ids().get(i),owner());
        return list();
    }
    @Transactional(readOnly=true) public Philosophy philosophy(UUID id) {
        owned(id,false,true);return db.queryForObject("select philosophy,philosophy_version,updated_at from calendar_timetables where id=? and owner_id=?",(r,n)->new Philosophy(r.getString(1),r.getLong(2),r.getTimestamp(3).toInstant()),id,owner());
    }
    public Philosophy savePhilosophy(UUID id,PhilosophyInput in) {
        if(in==null||in.content()==null)throw new InvalidRequestException("운영 철학 본문이 필요합니다.");
        owned(id,true,false);var before=philosophy(id);version(before.version(),in.version());String content=text(in.content(),1000000);
        db.update("update calendar_timetables set philosophy=?,philosophy_version=philosophy_version+1,updated_at=now() where id=? and owner_id=?",content,id,owner());return philosophy(id);
    }
    public Timetable duplicate(UUID id,VersionInput in,UUID operation) {
        return operations.execute(key(operation),kind("duplicate:"+id,in),Timetable.class,()->{
            var t=owned(id,true,false);version(t.version(),in.version());UUID copy=UUID.randomUUID();
            db.update("insert into calendar_timetables(id,owner_id,title,description,goal,memo,default_color,checklist,philosophy,sort_order) select ?,owner_id,?,description,goal,memo,default_color,checklist,philosophy,(select coalesce(max(sort_order),-1)+1 from calendar_timetables where owner_id=?) from calendar_timetables where id=? and owner_id=?",copy,t.title().substring(0,Math.min(t.title().length(),195))+" (복사)",owner(),id,owner());
            // IDs of auxiliary items are local to the owning timetable; assign fresh ones as well.
            var items=t.checklist().stream().map(c->new CheckItem(UUID.randomUUID(),c.title(),c.checked())).toList();
            db.update("update calendar_timetables set checklist=? where id=?",encode(items),copy);
            for(var b:blocks(id))db.update("insert into calendar_timetable_blocks(id,timetable_id,title,weekday,start_minute,duration_minutes,memo,color) values (?,?,?,?,?,?,?,?)",UUID.randomUUID(),copy,b.title(),b.weekday(),b.startMinute(),b.durationMinutes(),b.memo(),b.color());
            return get(copy);
        },r->true);
    }
    @Transactional(readOnly=true) public List<Block> blocks(UUID id) {owned(id,false,true);return db.query("select * from calendar_timetable_blocks where timetable_id=? and deleted_at is null order by weekday,start_minute,id",this::blockRow,id);}
    private Block block(UUID timetable,UUID id,boolean deleted) {
        var found=db.query("select * from calendar_timetable_blocks where id=? and timetable_id=?"+(deleted?"":" and deleted_at is null"),this::blockRow,id,timetable);
        if(found.isEmpty())throw new ResourceNotFoundException("시간 블록을 찾을 수 없습니다.");return found.getFirst();
    }
    BlockInput normalizeBlock(BlockInput in) {
        if(in==null||in.weekday()==null||in.weekday()<1||in.weekday()>7||in.startMinute()==null||in.startMinute()<0||in.startMinute()>1439||in.durationMinutes()==null||in.durationMinutes()<1||in.durationMinutes()>1440)throw new InvalidRequestException("요일·시작 시각과 1분~24시간 길이를 확인하세요.");
        return new BlockInput(in.version(),title(in.title()),in.weekday(),in.startMinute(),in.durationMinutes(),text(in.memo(),20000),color(in.color()));
    }
    public Blocks createBlocks(UUID id,CreateBlocks input,UUID operation) {
        var in=normalizeBlock(input.block());var days=input.weekdays();
        if(days==null||days.isEmpty()||days.size()>7||days.stream().anyMatch(d->d==null||d<1||d>7)||new HashSet<>(days).size()!=days.size())throw new InvalidRequestException("생성할 요일을 중복 없이 선택하세요.");
        return operations.execute(key(operation),kind("blocks:"+id,input),Blocks.class,()->{
            owned(id,true,false);var added=new ArrayList<Block>();
            for(int day:days){UUID block=UUID.randomUUID();db.update("insert into calendar_timetable_blocks(id,timetable_id,title,weekday,start_minute,duration_minutes,memo,color) values (?,?,?,?,?,?,?,?)",block,id,in.title(),day,in.startMinute(),in.durationMinutes(),in.memo(),in.color());added.add(block(id,block,false));}
            return new Blocks(added);
        },r->true);
    }
    public Block updateBlock(UUID timetable,UUID id,BlockInput input) {
        var in=normalizeBlock(input);owned(timetable,true,false);var b=block(timetable,id,false);version(b.version(),in.version());
        db.update("update calendar_timetable_blocks set title=?,weekday=?,start_minute=?,duration_minutes=?,memo=?,color=?,version=version+1,updated_at=now() where id=? and timetable_id=?",in.title(),in.weekday(),in.startMinute(),in.durationMinutes(),in.memo(),in.color(),id,timetable);return block(timetable,id,false);
    }
    public Block deleteBlock(UUID timetable,UUID id,VersionInput in) {owned(timetable,true,false);var b=block(timetable,id,false);version(b.version(),in.version());db.update("update calendar_timetable_blocks set deleted_at=now(),version=version+1,updated_at=now() where id=? and timetable_id=?",id,timetable);return block(timetable,id,true);}
    public Block restoreBlock(UUID timetable,UUID id,VersionInput in) {owned(timetable,true,false);var b=block(timetable,id,true);version(b.version(),in.version());if(b.deletedAt()==null)throw new InvalidRequestException("이미 복원된 블록입니다.");db.update("update calendar_timetable_blocks set deleted_at=null,version=version+1,updated_at=now() where id=? and timetable_id=?",id,timetable);return block(timetable,id,false);}
}
