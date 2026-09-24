package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.ObjectMapper;
import java.sql.*;
import java.time.LocalDate;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Workflow owns tasks and workpads; projects and phases retain their existing identities. */
@Service
@Transactional
public class WorkflowService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    private record MoveUndo(UUID owner, Day source, Day target, long sourceRevision, long targetRevision,
                            List<UUID> movedIds, Instant expiresAt) {}
    private final Map<UUID,MoveUndo> moveUndos = new ConcurrentHashMap<>();
    public WorkflowService(JdbcTemplate db, CurrentUserProvider users, ObjectMapper json) { this.db=db; this.users=users; this.json=json; }
    private UUID owner() { return users.getCurrentUserId(); }
    // One owner row serializes mutations (including first-day creation) without locking auth.users.
    private void lock() {
        db.update("insert into workflow_preferences(user_id) values(?) on conflict do nothing",owner());
        db.queryForList("select user_id from workflow_preferences where user_id=? for update",owner());
    }
    private static LocalDate date(ResultSet r,String name) throws SQLException { var d=r.getDate(name); return d==null?null:d.toLocalDate(); }
    private static UUID id(ResultSet r,String name) throws SQLException { return r.getObject(name,UUID.class); }
    private static String title(String s) { if(s==null||s.isBlank()||s.length()>200)throw new InvalidRequestException("Title must contain 1–200 characters"); return s.trim(); }
    private static String choice(String s,String fallback,String... values) { s=s==null?fallback:s; if(!List.of(values).contains(s))throw new InvalidRequestException("Invalid value: "+s);return s; }
    private static void dates(LocalDate a,LocalDate b) { if(a!=null&&b!=null&&b.isBefore(a))throw new InvalidRequestException("End date must not precede start date"); }
    private static int order(Integer n) { return n==null?0:n; }
    private static String memo(String s) { if(s!=null&&s.length()>100000)throw new InvalidRequestException("Memo is too long");return s; }
    private String color(String s) { if(s==null||s.isBlank())return "#6366f1";if(s.length()>30)throw new InvalidRequestException("Invalid color");return s; }
    private Project projectRow(ResultSet r,int n)throws SQLException {return new Project(id(r,"id"),r.getString("name"),r.getString("status"),date(r,"start_date"),date(r,"end_date"),r.getString("color_token"),r.getString("memo"),r.getInt("sort_order"));}
    private Phase phaseRow(ResultSet r,int n)throws SQLException {return new Phase(id(r,"id"),id(r,"project_id"),r.getString("title"),r.getString("status"),date(r,"start_date"),date(r,"end_date"),r.getString("memo"),r.getInt("sort_order"));}
    private Task taskRow(ResultSet r,int n)throws SQLException {return new Task(id(r,"id"),r.getString("title"),r.getString("status"),id(r,"project_id"),id(r,"phase_id"),r.getString("priority"),date(r,"start_date"),date(r,"due_date"),r.getString("memo"),r.getInt("sort_order"));}
    public Aggregate all() { return new Aggregate(db.query("select * from projects where user_id=? order by sort_order,created_at,id",this::projectRow,owner()),db.query("select * from phases where user_id=? order by sort_order,created_at,id",this::phaseRow,owner()),db.query("select * from work_tasks where user_id=? order by sort_order,created_at,id",this::taskRow,owner())); }
    public Project project(UUID id) {var rows=db.query("select * from projects where id=? and user_id=?",this::projectRow,id,owner());if(rows.isEmpty())throw new ResourceNotFoundException("Project not found");return rows.getFirst();}
    public Phase phase(UUID id) {var rows=db.query("select * from phases where id=? and user_id=?",this::phaseRow,id,owner());if(rows.isEmpty())throw new ResourceNotFoundException("Phase not found");return rows.getFirst();}
    public Task task(UUID id) {var rows=db.query("select * from work_tasks where id=? and user_id=?",this::taskRow,id,owner());if(rows.isEmpty())throw new ResourceNotFoundException("Task not found");return rows.getFirst();}
    public Project saveProject(UUID id, Project p) {
        lock(); dates(p.startDate(),p.endDate());String title=title(p.title()),status=choice(p.status(),"ACTIVE","ACTIVE","PAUSED","DONE"),color=color(p.color());memo(p.memo());
        if(id==null){id=UUID.randomUUID();db.update("insert into projects(id,user_id,name,status,start_date,end_date,color_token,memo,sort_order) values(?,?,?,?,?,?,?,?,?)",id,owner(),title,status,p.startDate(),p.endDate(),color,p.memo(),order(p.order()));}
        else {project(id);db.update("update projects set name=?,status=?,start_date=?,end_date=?,color_token=?,memo=?,sort_order=?,updated_at=current_timestamp where id=? and user_id=?",title,status,p.startDate(),p.endDate(),color,p.memo(),order(p.order()),id,owner());}
        return project(id);
    }
    public Phase savePhase(UUID id,Phase p) {
        lock();if(p.projectId()==null)throw new InvalidRequestException("Project is required");project(p.projectId());dates(p.startDate(),p.endDate());String title=title(p.title()),status=choice(p.status(),"TODO","TODO","DOING","DONE");memo(p.memo());
        if(id==null){id=UUID.randomUUID();db.update("insert into phases(id,user_id,project_id,title,status,start_date,end_date,memo,sort_order) values(?,?,?,?,?,?,?,?,?)",id,owner(),p.projectId(),title,status,p.startDate(),p.endDate(),p.memo(),order(p.order()));}
        else {var old=phase(id);if(!old.projectId().equals(p.projectId()))throw new InvalidRequestException("A phase belongs to its original project");db.update("update phases set title=?,status=?,start_date=?,end_date=?,memo=?,sort_order=?,updated_at=current_timestamp where id=? and user_id=?",title,status,p.startDate(),p.endDate(),p.memo(),order(p.order()),id,owner());}
        return phase(id);
    }
    public Task saveTask(UUID id,Task t) {
        lock();dates(t.startDate(),t.dueDate());String title=title(t.title()),status=choice(t.status(),"TODO","TODO","DOING","DONE"),priority=choice(t.priority(),"NORMAL","LOW","NORMAL","HIGH");memo(t.memo());
        if(t.projectId()!=null)project(t.projectId());
        if(t.phaseId()!=null&&!Objects.equals(phase(t.phaseId()).projectId(),t.projectId()))throw new InvalidRequestException("Phase must belong to the selected project");
        if(id==null){id=UUID.randomUUID();db.update("insert into work_tasks(id,user_id,title,status,project_id,phase_id,priority,start_date,due_date,memo,sort_order) values(?,?,?,?,?,?,?,?,?,?,?)",id,owner(),title,status,t.projectId(),t.phaseId(),priority,t.startDate(),t.dueDate(),t.memo(),order(t.order()));}
        else {task(id);db.update("update work_tasks set title=?,status=?,project_id=?,phase_id=?,priority=?,start_date=?,due_date=?,memo=?,sort_order=?,updated_at=current_timestamp where id=? and user_id=?",title,status,t.projectId(),t.phaseId(),priority,t.startDate(),t.dueDate(),t.memo(),order(t.order()),id,owner());}
        return task(id);
    }
    public void deleteProject(UUID id) {
        lock();project(id);
        if(db.queryForObject("select count(*) from phases where project_id=?",Long.class,id)>0||db.queryForObject("select count(*) from work_tasks where project_id=?",Long.class,id)>0)throw new InvalidRequestException("Remove or move this project's phases and tasks first");
        db.update("delete from projects where id=? and user_id=?",id,owner());
    }
    public void deletePhase(UUID id) {
        lock();phase(id);
        if(db.queryForObject("select count(*) from work_tasks where phase_id=?",Long.class,id)>0)throw new InvalidRequestException("Move or remove this phase's tasks first");
        for(String table:List.of("planned_time_blocks","work_time_entries","supplemental_work_entries"))if(db.queryForObject("select count(*) from "+table+" where phase_id=?",Long.class,id)>0)throw new InvalidRequestException("Phase is referenced by existing records");
        db.update("delete from phases where id=? and user_id=?",id,owner());
    }
    public void deleteTask(UUID id) {
        lock();var task=task(id);
        // Keep journal content and completion when a task is explicitly removed.
        db.update("update workpad_days set revision=revision+1 where user_id=? and day in(select day from workpad_blocks where user_id=? and work_task_id=?)",owner(),owner(),id);
        db.update("update workpad_blocks set checked=?,work_task_id=null where user_id=? and work_task_id=?",task.status().equals("DONE"),owner(),id);
        db.update("delete from work_tasks where id=? and user_id=?",id,owner());
    }
    @SuppressWarnings("unchecked") private Map<String,Object> metadata(String data) {return json.readValue(data,Map.class);}
    private Block block(ResultSet r,int n)throws SQLException {
        UUID task=id(r,"work_task_id");String status=r.getString("task_status");
        return new Block(id(r,"id"),id(r,"parent_id"),r.getInt("sort_order"),r.getString("type"),r.getString("content"),task==null?r.getBoolean("checked"):"DONE".equals(status),task,id(r,"source_block_id"),date(r,"source_date"),metadata(r.getString("metadata")));
    }
    public Day day(LocalDate day) {
        var revisions=db.queryForList("select revision from workpad_days where user_id=? and day=?",Long.class,owner(),day);
        var blocks=db.query("select b.*,t.status as task_status from workpad_blocks b left join work_tasks t on t.id=b.work_task_id and t.user_id=b.user_id where b.user_id=? and b.day=? order by b.sort_order,b.id",this::block,owner(),day);
        return new Day(day,revisions.isEmpty()?0:revisions.getFirst(),blocks);
    }
    public Day saveDay(LocalDate date,Day in) {
        return saveDay(date,new DaySave(in.date(),in.revision(),in.blocks(),null));
    }
    public Day saveDay(LocalDate date,DaySave in) {
        lock();if(in.date()!=null&&!date.equals(in.date()))throw new InvalidRequestException("Day must match route");var current=day(date);
        if(in.revision()!=current.revision())throw new OptimisticLockConflictException("Workpad changed in another window. Reload before saving.");
        validateBlocks(in.blocks());
        var oldIds=new HashSet<>(current.blocks().stream().map(Block::id).toList());
        for(var b:in.blocks()){
            if(!oldIds.contains(b.id())&&db.queryForObject("select count(*) from workpad_blocks where id=?",Long.class,b.id())>0)throw new InvalidRequestException("Block identity already belongs to another day");
            if(b.workTaskId()!=null)task(b.workTaskId());validateMedia(b.metadata());
            if(b.sourceBlockId()!=null){if(b.sourceDate()==null)throw new InvalidRequestException("Source date is required");
                if(db.queryForObject("select count(*) from workpad_blocks where user_id=? and id=? and day=?",Long.class,owner(),b.sourceBlockId(),b.sourceDate())==0) {
                    // Existing provenance remains useful after its source is deleted.
                    boolean retained=current.blocks().stream().anyMatch(old->old.id().equals(b.id())&&Objects.equals(old.sourceBlockId(),b.sourceBlockId())&&Objects.equals(old.sourceDate(),b.sourceDate()));
                    if(!retained)throw new InvalidRequestException("Source block not found");
                }
            }
        }
        var taskTitles=validateTaskTitles(in);
        for(var patch:taskTitles.entrySet())
            db.update("update work_tasks set title=?,updated_at=current_timestamp where id=? and user_id=?",patch.getValue(),patch.getKey(),owner());
        db.update("insert into workpad_days(user_id,day) values(?,?) on conflict do nothing",owner(),date);
        db.update("delete from workpad_blocks where user_id=? and day=?",owner(),date);
        for(var b:in.blocks())db.update("insert into workpad_blocks(id,user_id,day,parent_id,sort_order,type,content,checked,work_task_id,source_block_id,source_date,metadata) values(?,?,?,?,?,?,?,?,?,?,?,?)",b.id(),owner(),date,b.parentId(),b.order(),b.type(),Objects.requireNonNullElse(b.content(),""),b.checked(),b.workTaskId(),b.sourceBlockId(),b.sourceDate(),json.writeValueAsString(b.metadata()==null?Map.of():b.metadata()));
        new WorklogNotesService(db,users).sync(date,in.blocks());
        db.update("update workpad_days set revision=revision+1 where user_id=? and day=?",owner(),date);return day(date);
    }
    private static Map<UUID,String> validateTaskTitles(DaySave in) {
        if(in.taskTitles()==null||in.taskTitles().isEmpty())return Map.of();
        if(in.taskTitles().size()>5000)throw new InvalidRequestException("At most 5000 task titles can be saved");
        var titles=new LinkedHashMap<UUID,String>();
        for(var patch:in.taskTitles().entrySet()) {
            if(patch.getKey()==null)throw new InvalidRequestException("Task identity is required");
            String value=title(patch.getValue());
            var linked=in.blocks().stream().filter(b->patch.getKey().equals(b.workTaskId())).toList();
            if(linked.isEmpty())throw new InvalidRequestException("Task title must belong to a checklist in this Workpad");
            if(linked.stream().anyMatch(b->!"CHECKLIST".equals(b.type())||b.content()==null||!value.equals(b.content().trim())))
                throw new InvalidRequestException("Task title must match every linked checklist; resolve conflicting block titles first");
            titles.put(patch.getKey(),value);
        }
        return titles;
    }
    static void validateBlocks(List<Block> blocks) {
        if(blocks==null||blocks.size()>5000)throw new InvalidRequestException("At most 5000 blocks are supported per day");
        Map<UUID,Block> byId=new HashMap<>();
        for(var b:blocks){if(b==null||b.id()==null||byId.put(b.id(),b)!=null)throw new InvalidRequestException("Block IDs must be unique");choice(b.type(),"TEXT","TEXT","NUMBERED","BULLET","CHECKLIST","H1","H2","H3","CALLOUT","IMAGE","IMAGE_GROUP","DIVIDER");if(b.type()==null)throw new InvalidRequestException("Block type is required");if(b.content()!=null&&b.content().length()>100000)throw new InvalidRequestException("Block text is too long");if(b.workTaskId()!=null&&!"CHECKLIST".equals(b.type()))throw new InvalidRequestException("Only checklists can link tasks");}
        for(var b:blocks){Set<UUID> ancestors=new HashSet<>();ancestors.add(b.id());UUID parent=b.parentId();while(parent!=null){if(!ancestors.add(parent)||!byId.containsKey(parent))throw new InvalidRequestException("Invalid block hierarchy");if(ancestors.size()>100)throw new InvalidRequestException("Hierarchy is too deep");parent=byId.get(parent).parentId();}}
    }
    private void validateMedia(Object metadata) {
        if(metadata==null)return;if(json.writeValueAsString(metadata).length()>200000)throw new InvalidRequestException("Image metadata is too large");
        if(metadata instanceof Map<?,?> map){
            if(map.get("images") instanceof List<?> images)for(Object value:images){if(!(value instanceof Map<?,?> image)||image.get("id")==null)throw new InvalidRequestException("Image identity is required");UUID imageId;try{imageId=UUID.fromString(image.get("id").toString());}catch(IllegalArgumentException ex){throw new InvalidRequestException("Invalid image identity");}if(db.queryForObject("select count(*) from journal_media where id=? and workflow_owner_id=?",Long.class,imageId,owner())==0)throw new ResourceNotFoundException("Image not found");}
        }
    }
    public Task promote(LocalDate date,UUID blockId) {
        lock();var day=day(date);var b=findBlock(day,blockId);if(b.workTaskId()!=null)return task(b.workTaskId());if(!b.type().equals("CHECKLIST"))throw new InvalidRequestException("Convert the block to a checklist first");
        var task=saveTask(null,new Task(null,title(b.content()),b.checked()?"DONE":"TODO",null,null,"NORMAL",null,null,null,0));
        var blocks=day.blocks().stream().map(x->x.id().equals(blockId)?new Block(x.id(),x.parentId(),x.order(),"CHECKLIST",x.content(),x.checked(),task.id(),x.sourceBlockId(),x.sourceDate(),x.metadata()):x).toList();
        saveDay(date,new Day(date,day.revision(),blocks));return task;
    }
    public Day unlink(LocalDate date,UUID blockId) {
        lock();var day=day(date);findBlock(day,blockId);
        return saveDay(date,new Day(date,day.revision(),day.blocks().stream().map(x->x.id().equals(blockId)?new Block(x.id(),x.parentId(),x.order(),"CHECKLIST",x.content(),x.checked(),null,x.sourceBlockId(),x.sourceDate(),x.metadata()):x).toList()));
    }
    private static Block findBlock(Day day,UUID id){return day.blocks().stream().filter(b->b.id().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Block not found"));}
    public Day addToday(UUID taskId,LocalDate date) {
        lock();if(date==null)throw new InvalidRequestException("Date is required");var task=task(taskId);var day=day(date);
        if(day.blocks().stream().anyMatch(b->taskId.equals(b.workTaskId())))return day;
        var blocks=new ArrayList<>(day.blocks());blocks.add(new Block(UUID.randomUUID(),null,blocks.stream().mapToInt(Block::order).max().orElse(-1)+1,"CHECKLIST",task.title(),task.status().equals("DONE"),task.id(),null,null,Map.of()));
        return saveDay(date,new Day(date,day.revision(),blocks));
    }
    public Day carry(LocalDate date,Carry in) {
        lock();if(in.targetDate()==null||in.targetDate().equals(date))throw new InvalidRequestException("Choose a different destination date");var source=day(date);var target=day(in.targetDate());
        var copied=carryBlocks(source,in.blockIds(),target.blocks().stream().mapToInt(Block::order).max().orElse(-1)+1);
        var blocks=new ArrayList<>(target.blocks());blocks.addAll(copied);return saveDay(in.targetDate(),new Day(in.targetDate(),target.revision(),blocks));
    }
    public MoveResult move(LocalDate date, Move in) {
        lock();
        if (in.targetDate() == null || in.targetDate().equals(date))
            throw new InvalidRequestException("Choose a different destination date");
        if (in.expectedSourceRevision() == null || in.expectedTargetRevision() == null)
            throw new InvalidRequestException("Source and target revisions are required");
        var source = day(date);
        var target = day(in.targetDate());
        if (source.revision() != in.expectedSourceRevision() || target.revision() != in.expectedTargetRevision())
            throw new OptimisticLockConflictException("A Workpad changed before the move. Your blocks have not been moved.");
        var plan = WorkpadMoves.plan(source, target, in);
        replaceDayPair(new Day(date, source.revision(), plan.source()), new Day(target.date(), target.revision(), plan.target()));
        var savedSource = day(date);
        var savedTarget = day(target.date());
        UUID token = UUID.randomUUID();
        var undo = new MoveUndo(owner(), source, target, savedSource.revision(), savedTarget.revision(), plan.movedIds(), Instant.now().plusSeconds(300));
        afterCommit(() -> {
            moveUndos.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(Instant.now()));
            moveUndos.put(token, undo);
        });
        return new MoveResult(savedSource, savedTarget, plan.movedIds(), token);
    }
    public MoveResult undoMove(UUID token) {
        lock();
        var undo = moveUndos.get(token);
        if (undo == null || !undo.owner().equals(owner()) || undo.expiresAt().isBefore(Instant.now()))
            throw new ResourceNotFoundException("Move undo has expired or is unavailable");
        if (day(undo.source().date()).revision() != undo.sourceRevision()
            || day(undo.target().date()).revision() != undo.targetRevision())
            throw new OptimisticLockConflictException("A Workpad changed after this move. Undo cannot overwrite newer edits.");
        replaceDayPair(undo.source(), undo.target());
        afterCommit(() -> moveUndos.remove(token, undo));
        return new MoveResult(day(undo.source().date()), day(undo.target().date()), undo.movedIds(), null);
    }
    /** Both removals precede insertion because block IDs are globally unique. The enclosing transaction
     * restores both documents and backlinks if any write fails, including a destination write. */
    private void replaceDayPair(Day source, Day target) {
        for (var day : List.of(source, target)) {
            db.update("insert into workpad_days(user_id,day) values(?,?) on conflict do nothing", owner(), day.date());
            db.update("delete from workpad_blocks where user_id=? and day=?", owner(), day.date());
        }
        for (var day : List.of(source, target)) {
            for (var b : day.blocks()) db.update("insert into workpad_blocks(id,user_id,day,parent_id,sort_order,type,content,checked,work_task_id,source_block_id,source_date,metadata) values(?,?,?,?,?,?,?,?,?,?,?,?)",
                b.id(), owner(), day.date(), b.parentId(), b.order(), b.type(), Objects.requireNonNullElse(b.content(), ""),
                b.checked(), b.workTaskId(), b.sourceBlockId(), b.sourceDate(), json.writeValueAsString(Objects.requireNonNullElse(b.metadata(), Map.of())));
            new WorklogNotesService(db, users).sync(day.date(), day.blocks());
            db.update("update workpad_days set revision=revision+1 where user_id=? and day=?", owner(), day.date());
        }
    }
    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        } else action.run();
    }
    static List<Block> carryBlocks(Day source,List<UUID> selected,int firstOrder) {
        if(selected==null||selected.isEmpty())throw new InvalidRequestException("Select blocks to carry");
        Map<UUID,Block> byId=new LinkedHashMap<>();source.blocks().forEach(b->byId.put(b.id(),b));Set<UUID> executable=new HashSet<>(selected);
        if(!byId.keySet().containsAll(executable))throw new InvalidRequestException("Selected block not found");
        boolean changed;do{changed=false;for(var b:source.blocks())if(executable.contains(b.parentId()))changed|=executable.add(b.id());}while(changed);
        Set<UUID> included=new HashSet<>(executable);for(UUID selectedId:executable){UUID parent=byId.get(selectedId).parentId();while(parent!=null){included.add(parent);parent=byId.get(parent).parentId();}}
        Map<UUID,UUID> copies=new HashMap<>();included.forEach(id->copies.put(id,UUID.randomUUID()));var result=new ArrayList<Block>();
        for(var b:source.blocks())if(included.contains(b.id())){
            boolean context=!executable.contains(b.id()),completed=b.type().equals("CHECKLIST")&&b.checked();boolean reference=context||completed;
            result.add(new Block(copies.get(b.id()),copies.get(b.parentId()),firstOrder++,reference?"TEXT":b.type(),completed?"Completed: "+b.content():b.content(),reference?false:b.checked(),reference?null:b.workTaskId(),b.id(),source.date(),b.metadata()));
        }
        return result;
    }
    public List<LocalDate> recordedDates(LocalDate before,LocalDate after) {
        return db.query("select day from workpad_days where user_id=?"+(before==null?"":" and day<?")+(after==null?"":" and day>?")+" and exists(select 1 from workpad_blocks b where b.user_id=workpad_days.user_id and b.day=workpad_days.day) order by day "+(after==null?"desc":"asc")+" limit 20",
            (r,i)->r.getDate("day").toLocalDate(),before!=null?new Object[]{owner(),before}:after!=null?new Object[]{owner(),after}:new Object[]{owner()});
    }
    public record FixedTab(UUID id,String title,long revision,List<Block> blocks) {}
    private FixedTab fixedRow(ResultSet r,int n)throws SQLException {
        return new FixedTab(id(r,"id"),r.getString("title"),r.getLong("revision"),Arrays.asList(json.readValue(r.getString("blocks"),Block[].class)));
    }
    public List<FixedTab> fixedTabs(){return db.query("select * from workflow_fixed_tabs where user_id=? order by created_at,id",this::fixedRow,owner());}
    public FixedTab fixedTab(UUID id){return fixedTabs().stream().filter(t->t.id().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Fixed tab not found"));}
    public FixedTab saveFixedTab(UUID id,FixedTab in) {
        lock();String title=title(in.title());if(title.length()>120)throw new InvalidRequestException("Tab title is too long");
        validateBlocks(in.blocks());for(var block:in.blocks()){if(block.workTaskId()!=null||block.sourceDate()!=null)throw new InvalidRequestException("Fixed workflows cannot own daily task or carry references");validateMedia(block.metadata());}
        if(id==null){if(fixedTabs().size()>=5)throw new InvalidRequestException("At most five fixed tabs");id=UUID.randomUUID();db.update("insert into workflow_fixed_tabs(id,user_id,title,blocks) values(?,?,?,?)",id,owner(),title,json.writeValueAsString(in.blocks()));}
        else {fixedTab(id);if(db.update("update workflow_fixed_tabs set title=?,blocks=?,revision=revision+1 where id=? and user_id=? and revision=?",title,json.writeValueAsString(in.blocks()),id,owner(),in.revision())!=1)throw new OptimisticLockConflictException("Fixed workflow changed; your draft is retained");}
        return fixedTab(id);
    }
    public Map<String,Object> preferences() {
        var rows=db.queryForList("select preferences from workflow_preferences where user_id=?",String.class,owner());return rows.isEmpty()?Map.of():metadata(rows.getFirst());
    }
    public Map<String,Object> preferences(Map<String,Object> in) {
        lock();if(in==null||json.writeValueAsString(in).length()>100000)throw new InvalidRequestException("Invalid view preferences");
        db.update("update workflow_preferences set preferences=? where user_id=?",json.writeValueAsString(in),owner());return in;
    }
}
