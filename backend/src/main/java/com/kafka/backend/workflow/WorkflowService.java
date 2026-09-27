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
    private void lock() { WorkflowRows.lock(db,owner()); }
    private static LocalDate date(ResultSet r,String name) throws SQLException { return WorkflowRows.date(r,name); }
    private static UUID id(ResultSet r,String name) throws SQLException { return WorkflowRows.id(r,name); }
    private static String title(String s) { return WorkflowRows.title(s); }
    private static String choice(String s,String fallback,String... values) { return WorkflowRows.choice(s,fallback,List.of(values)); }
    private static void dates(LocalDate a,LocalDate b) { WorkflowRows.range(a,b); }
    private static int order(Integer n) { return n==null?0:n; }
    private static String memo(String s) { return WorkflowRows.text(s,100000,"Memo"); }
    private String color(String s) { if(s==null||s.isBlank())return "#6366f1";if(s.length()>30)throw new InvalidRequestException("Invalid color");return s; }
    private static final Set<String> TASK_PATCH=Set.of("title","projectId","phaseId","priority","startDate","dueDate","deadlineDate","memo","nextStep","order",
        "waitingReason","waitingNextAction","waitingCheckDate","waitingFlagged");
    private static final Set<String> PROJECT_PATCH=Set.of("title","status","projectType","goal","startDate","endDate","color","memo","order","nextTaskId","unassignedWeight");
    private static final Set<String> PHASE_PATCH=Set.of("title","status","startDate","endDate","memo","order","weight","progressOverride");

    public Aggregate all() {
        return new Aggregate(db.query("select * from projects where user_id=? order by sort_order,created_at,id",WorkflowRows::project,owner()),
            db.query("select * from phases where user_id=? order by sort_order,created_at,id",WorkflowRows::phase,owner()),
            db.query("select * from work_tasks where user_id=? order by sort_order,created_at,id",WorkflowRows::task,owner()),
            db.query("select * from work_task_plan_days where user_id=? order by day,sort_order,task_id",WorkflowRows::planDay,owner()));
    }
    public Project project(UUID id) {var rows=db.query("select * from projects where id=? and user_id=?",WorkflowRows::project,id,owner());if(rows.isEmpty())throw new ResourceNotFoundException("Project not found");return rows.getFirst();}
    public Phase phase(UUID id) {var rows=db.query("select * from phases where id=? and user_id=?",WorkflowRows::phase,id,owner());if(rows.isEmpty())throw new ResourceNotFoundException("Phase not found");return rows.getFirst();}
    public Task task(UUID id) {var rows=db.query("select * from work_tasks where id=? and user_id=?",WorkflowRows::task,id,owner());if(rows.isEmpty())throw new ResourceNotFoundException("Task not found");return rows.getFirst();}

    /** Legacy full-object create/PUT. V1 fields change only when supplied; a supplied revision is enforced. */
    public Project saveProject(UUID id, Project p) {
        lock(); dates(p.startDate(),p.endDate());String title=title(p.title()),color=color(p.color());memo(p.memo());
        String type=WorkflowRows.choice(p.projectType(),id==null?"GENERAL":project(id).projectType(),WorkflowRows.PROJECT_TYPES);
        WorkflowRows.percent(p.unassignedWeight(),"Unassigned weight");WorkflowRows.text(p.goal(),2000,"Goal");
        if(id==null){
            // WORK FLOW creates new projects as READY unless a status is explicitly chosen.
            String status=WorkflowRows.choice(p.status(),"READY",WorkflowRows.PROJECT_STATUSES);
            id=UUID.randomUUID();db.update("insert into projects(id,user_id,name,status,start_date,end_date,color_token,memo,sort_order,project_type,goal,unassigned_weight) values(?,?,?,?,?,?,?,?,?,?,?,?)",id,owner(),title,status,p.startDate(),p.endDate(),color,p.memo(),order(p.order()),type,p.goal(),p.unassignedWeight());
            if(p.nextTaskId()!=null)setNextTask(id,p.nextTaskId());
        } else {
            var old=project(id);String status=WorkflowRows.choice(p.status(),old.status(),WorkflowRows.PROJECT_STATUSES);
            int changed=db.update("update projects set name=?,status=?,start_date=?,end_date=?,color_token=?,memo=?,sort_order=?,project_type=?,goal=?,unassigned_weight=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?"+(p.revision()==null?"":" and revision=?"),
                concat(new Object[]{title,status,p.startDate(),p.endDate(),color,p.memo(),order(p.order()),type,p.goal()!=null?p.goal():old.goal(),p.unassignedWeight()!=null?p.unassignedWeight():old.unassignedWeight(),id,owner()},p.revision()));
            if(changed==0)throw new OptimisticLockConflictException("Project changed in another window. Reload before saving.");
            if(p.nextTaskId()!=null)setNextTask(id,p.nextTaskId());
        }
        return project(id);
    }
    public Phase savePhase(UUID id,Phase p) {
        lock();if(p.projectId()==null)throw new InvalidRequestException("Project is required");project(p.projectId());dates(p.startDate(),p.endDate());String title=title(p.title()),status=choice(p.status(),"TODO","TODO","DOING","DONE");memo(p.memo());
        WorkflowRows.percent(p.weight(),"Weight");progress(p.progressOverride());
        if(id==null){id=UUID.randomUUID();db.update("insert into phases(id,user_id,project_id,title,status,start_date,end_date,memo,sort_order,weight,progress_override) values(?,?,?,?,?,?,?,?,?,?,?)",id,owner(),p.projectId(),title,status,p.startDate(),p.endDate(),p.memo(),order(p.order()),p.weight(),p.progressOverride());}
        else {var old=phase(id);if(!old.projectId().equals(p.projectId()))throw new InvalidRequestException("A phase belongs to its original project");
            int changed=db.update("update phases set title=?,status=?,start_date=?,end_date=?,memo=?,sort_order=?,weight=?,progress_override=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?"+(p.revision()==null?"":" and revision=?"),
                concat(new Object[]{title,status,p.startDate(),p.endDate(),p.memo(),order(p.order()),p.weight()!=null?p.weight():old.weight(),p.progressOverride()!=null?p.progressOverride():old.progressOverride(),id,owner()},p.revision()));
            if(changed==0)throw new OptimisticLockConflictException("Phase changed in another window. Reload before saving.");}
        return phase(id);
    }
    public Task saveTask(UUID id,Task t) {
        lock();dates(t.startDate(),t.dueDate());String title=title(t.title()),status=WorkflowRows.choice(t.status(),"TODO",WorkflowRows.TASK_STATUSES),priority=choice(t.priority(),"NORMAL","LOW","NORMAL","HIGH");memo(t.memo());
        if(t.projectId()!=null)project(t.projectId());
        if(t.phaseId()!=null&&!Objects.equals(phase(t.phaseId()).projectId(),t.projectId()))throw new InvalidRequestException("Phase must belong to the selected project");
        if(id==null){id=UUID.randomUUID();db.update("insert into work_tasks(id,user_id,title,status,project_id,phase_id,priority,start_date,due_date,memo,sort_order,deadline_date,next_step,completed_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            id,owner(),title,status,t.projectId(),t.phaseId(),priority,t.startDate(),t.dueDate(),t.memo(),order(t.order()),t.deadlineDate(),WorkflowRows.text(t.nextStep(),2000,"Next step"),status.equals("DONE")?java.sql.Timestamp.from(Instant.now()):null);}
        else {var old=task(id);
            int changed=db.update("update work_tasks set title=?,project_id=?,phase_id=?,priority=?,start_date=?,due_date=?,memo=?,sort_order=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?"+(t.revision()==null?"":" and revision=?"),
                concat(new Object[]{title,t.projectId(),t.phaseId(),priority,t.startDate(),t.dueDate(),t.memo(),order(t.order()),id,owner()},t.revision()));
            if(changed==0)throw new OptimisticLockConflictException("Task changed in another window. Reload before saving.");
            if(t.deadlineDate()!=null&&!t.deadlineDate().equals(old.deadlineDate()))setDeadline(old,t.deadlineDate());
            if(!status.equals(old.status()))transition(task(id),new StatusChange(status,null,null,null,null,null));}
        return task(id);
    }
    private static Object[] concat(Object[] args,Long revision){if(revision==null)return args;var all=Arrays.copyOf(args,args.length+1);all[args.length]=revision;return all;}
    private static void progress(Integer v){if(v!=null&&(v<0||v>100))throw new InvalidRequestException("Progress must be between 0 and 100");}
    private void setNextTask(UUID projectId,UUID taskId){
        if(taskId!=null&&!projectId.equals(task(taskId).projectId()))throw new InvalidRequestException("The next task must belong to this project");
        db.update("update projects set next_task_id=? where id=? and user_id=?",taskId,projectId,owner());
    }

    /** Revision-checked partial update: only supplied fields change, and a stale revision never overwrites. */
    public Task patchTask(UUID id,Map<String,Object> body) {
        lock();var patch=new WorkflowRows.Patch(body,TASK_PATCH);long expected=patch.expectedRevision();var old=task(id);var u=new WorkflowRows.Updates();
        if(patch.has("title"))u.set("title",title(patch.string("title")));
        UUID projectId=patch.has("projectId")?patch.uuid("projectId"):old.projectId(),phaseId=patch.has("phaseId")?patch.uuid("phaseId"):old.phaseId();
        if(patch.has("projectId")&&!patch.has("phaseId")&&!Objects.equals(projectId,old.projectId()))phaseId=null;
        if(projectId!=null)project(projectId);
        if(phaseId!=null&&!Objects.equals(phase(phaseId).projectId(),projectId))throw new InvalidRequestException("Phase must belong to the selected project");
        if(patch.has("projectId")||patch.has("phaseId")){u.set("project_id",projectId);u.set("phase_id",phaseId);}
        if(patch.has("priority"))u.set("priority",choice(patch.string("priority"),null,"LOW","NORMAL","HIGH"));
        LocalDate start=patch.has("startDate")?patch.date("startDate"):old.startDate(),due=patch.has("dueDate")?patch.date("dueDate"):old.dueDate();dates(start,due);
        if(patch.has("startDate"))u.set("start_date",start);
        if(patch.has("dueDate"))u.set("due_date",due);
        if(patch.has("deadlineDate"))u.set("deadline_date",patch.date("deadlineDate"));
        if(patch.has("memo"))u.set("memo",memo(patch.string("memo")));
        if(patch.has("nextStep"))u.set("next_step",WorkflowRows.text(patch.string("nextStep"),2000,"Next step"));
        if(patch.has("order"))u.set("sort_order",order(patch.integer("order")));
        if(patch.has("waitingReason"))u.set("waiting_reason",WorkflowRows.text(patch.string("waitingReason"),2000,"Waiting reason"));
        if(patch.has("waitingNextAction"))u.set("waiting_next_action",WorkflowRows.text(patch.string("waitingNextAction"),2000,"Next action"));
        if(patch.has("waitingCheckDate"))u.set("waiting_check_date",patch.date("waitingCheckDate"));
        if(patch.has("waitingFlagged"))u.set("waiting_flagged",patch.bool("waitingFlagged"));
        if(u.isEmpty())throw new InvalidRequestException("No changes");
        updateRevisioned("work_tasks",id,expected,u,"Task");
        if(patch.has("deadlineDate")&&!Objects.equals(old.deadlineDate(),patch.date("deadlineDate")))
            event(id,"DEADLINE_CHANGED",old.status(),old.status(),Map.of("from",String.valueOf(old.deadlineDate()),"to",String.valueOf(patch.date("deadlineDate"))));
        return task(id);
    }
    public Project patchProject(UUID id,Map<String,Object> body) {
        lock();var patch=new WorkflowRows.Patch(body,PROJECT_PATCH);long expected=patch.expectedRevision();var old=project(id);var u=new WorkflowRows.Updates();
        if(patch.has("title"))u.set("name",title(patch.string("title")));
        if(patch.has("status"))u.set("status",WorkflowRows.choice(patch.string("status"),null,WorkflowRows.PROJECT_STATUSES));
        if(patch.has("projectType"))u.set("project_type",WorkflowRows.choice(patch.string("projectType"),null,WorkflowRows.PROJECT_TYPES));
        if(patch.has("goal"))u.set("goal",WorkflowRows.text(patch.string("goal"),2000,"Goal"));
        LocalDate start=patch.has("startDate")?patch.date("startDate"):old.startDate(),end=patch.has("endDate")?patch.date("endDate"):old.endDate();dates(start,end);
        if(patch.has("startDate"))u.set("start_date",start);
        if(patch.has("endDate"))u.set("end_date",end);
        if(patch.has("color"))u.set("color_token",color(patch.string("color")));
        if(patch.has("memo"))u.set("memo",memo(patch.string("memo")));
        if(patch.has("order"))u.set("sort_order",order(patch.integer("order")));
        if(patch.has("unassignedWeight"))u.set("unassigned_weight",WorkflowRows.percent(patch.decimal("unassignedWeight"),"Unassigned weight"));
        if(patch.has("nextTaskId")){UUID next=patch.uuid("nextTaskId");if(next!=null&&!id.equals(task(next).projectId()))throw new InvalidRequestException("The next task must belong to this project");u.set("next_task_id",next);}
        if(u.isEmpty())throw new InvalidRequestException("No changes");
        updateRevisioned("projects",id,expected,u,"Project");return project(id);
    }
    public Phase patchPhase(UUID id,Map<String,Object> body) {
        lock();var patch=new WorkflowRows.Patch(body,PHASE_PATCH);long expected=patch.expectedRevision();var old=phase(id);var u=new WorkflowRows.Updates();
        if(patch.has("title"))u.set("title",title(patch.string("title")));
        // Legacy phase status is kept for compatibility; a work group is not a sequential gate in V1.
        if(patch.has("status"))u.set("status",choice(patch.string("status"),null,"TODO","DOING","DONE"));
        LocalDate start=patch.has("startDate")?patch.date("startDate"):old.startDate(),end=patch.has("endDate")?patch.date("endDate"):old.endDate();dates(start,end);
        if(patch.has("startDate"))u.set("start_date",start);
        if(patch.has("endDate"))u.set("end_date",end);
        if(patch.has("memo"))u.set("memo",memo(patch.string("memo")));
        if(patch.has("order"))u.set("sort_order",order(patch.integer("order")));
        if(patch.has("weight"))u.set("weight",WorkflowRows.percent(patch.decimal("weight"),"Weight"));
        if(patch.has("progressOverride")){Integer v=patch.integer("progressOverride");progress(v);u.set("progress_override",v);}
        if(u.isEmpty())throw new InvalidRequestException("No changes");
        updateRevisioned("phases",id,expected,u,"Phase");return phase(id);
    }
    private void updateRevisioned(String table,UUID id,long expected,WorkflowRows.Updates u,String label) {
        var args=new ArrayList<>(u.args);args.add(id);args.add(owner());args.add(expected);
        if(db.update("update "+table+" set "+String.join(",",u.columns)+",revision=revision+1,updated_at=current_timestamp where id=? and user_id=? and revision=?",args.toArray())==0)
            throw new OptimisticLockConflictException(label+" changed in another window. Your edit was not saved; reload and retry.");
    }

    /** Explicit lifecycle command. Completion, reopen, waiting and resume keep history in work_task_events. */
    public Task changeStatus(UUID id,StatusChange in) {
        lock();if(in==null||in.expectedRevision()==null)throw new InvalidRequestException("expectedRevision is required");
        var current=task(id);if(current.revision()!=in.expectedRevision().longValue())throw new OptimisticLockConflictException("Task changed in another window. Your status change was not saved; reload and retry.");
        transition(current,in);return task(id);
    }
    private void transition(Task current,StatusChange in) {
        String from=current.status(),to=WorkflowRows.choice(in.status(),null,WorkflowRows.TASK_STATUSES);UUID id=current.id();
        if(to.equals("WAITING")){
            String reason=in.waitingReason()!=null?WorkflowRows.text(in.waitingReason(),2000,"Waiting reason"):current.waitingReason();
            String next=in.waitingNextAction()!=null?WorkflowRows.text(in.waitingNextAction(),2000,"Next action"):current.waitingNextAction();
            LocalDate check=in.waitingCheckDate()!=null?in.waitingCheckDate():current.waitingCheckDate();
            boolean flagged=in.waitingFlagged()!=null?in.waitingFlagged():Boolean.TRUE.equals(current.waitingFlagged());
            db.update("update work_tasks set status='WAITING',previous_status=?,completed_at=null,waiting_reason=?,waiting_next_action=?,waiting_check_date=?,waiting_flagged=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",
                from.equals("WAITING")?current.previousStatus():from,reason,next,check,flagged,id,owner());
            if(!from.equals("WAITING"))event(id,"WAITING",from,to,waitingContext(reason,next,check,flagged));
            return;
        }
        if(to.equals(from))return;
        if(to.equals("DONE")){
            db.update("update work_tasks set status='DONE',previous_status=?,completed_at=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",from,java.sql.Timestamp.from(Instant.now()),id,owner());
            if(from.equals("WAITING"))resumeCleared(current,to);
            event(id,"COMPLETED",from,to,Map.of());return;
        }
        db.update("update work_tasks set status=?,previous_status=?,completed_at=null,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",to,from,id,owner());
        if(from.equals("DONE"))event(id,"REOPENED",from,to,Map.of("completedAt",String.valueOf(current.completedAt())));
        else if(from.equals("WAITING"))resumeCleared(current,to);
    }
    /** Leaving WAITING keeps its context in history and clears the live waiting fields. */
    private void resumeCleared(Task previous,String to) {
        db.update("update work_tasks set waiting_reason=null,waiting_next_action=null,waiting_check_date=null,waiting_flagged=false where id=? and user_id=?",previous.id(),owner());
        event(previous.id(),"RESUMED","WAITING",to,waitingContext(previous.waitingReason(),previous.waitingNextAction(),previous.waitingCheckDate(),Boolean.TRUE.equals(previous.waitingFlagged())));
    }
    private static Map<String,Object> waitingContext(String reason,String next,LocalDate check,boolean flagged) {
        var m=new LinkedHashMap<String,Object>();m.put("waitingReason",reason);m.put("waitingNextAction",next);m.put("waitingCheckDate",check==null?null:check.toString());m.put("waitingFlagged",flagged);return m;
    }
    private void setDeadline(Task old,LocalDate deadline) {
        db.update("update work_tasks set deadline_date=? where id=? and user_id=?",deadline,old.id(),owner());
        event(old.id(),"DEADLINE_CHANGED",old.status(),old.status(),Map.of("from",String.valueOf(old.deadlineDate()),"to",String.valueOf(deadline)));
    }
    private void event(UUID taskId,String kind,String from,String to,Map<String,?> payload) {
        db.update("insert into work_task_events(id,user_id,task_id,kind,from_status,to_status,payload) values(?,?,?,?,?,?,?)",UUID.randomUUID(),owner(),taskId,kind,from,to,json.writeValueAsString(payload));
    }
    public record TaskEvent(UUID id,String kind,String fromStatus,String toStatus,Map<String,Object> payload,Instant createdAt) {}
    public List<TaskEvent> events(UUID taskId) {
        task(taskId);
        return db.query("select * from work_task_events where user_id=? and task_id=? order by created_at,id",(r,n)->new TaskEvent(id(r,"id"),r.getString("kind"),r.getString("from_status"),r.getString("to_status"),metadata(r.getString("payload")),WorkflowRows.instant(r,"created_at")),owner(),taskId);
    }

    /** Archive is independent of completion: it hides the Task from active views without changing status. */
    public Task archiveTask(UUID id,ArchiveChange in) {
        lock();if(in==null||in.expectedRevision()==null)throw new InvalidRequestException("expectedRevision is required");var old=task(id);
        var u=new WorkflowRows.Updates();u.set("archived_at",in.archived()?java.sql.Timestamp.from(Instant.now()):null);updateRevisioned("work_tasks",id,in.expectedRevision(),u,"Task");
        if(in.archived()!=(old.archivedAt()!=null))event(id,in.archived()?"ARCHIVED":"RESTORED",old.status(),old.status(),Map.of());
        return task(id);
    }
    public Project archiveProject(UUID id,ArchiveChange in) {
        lock();if(in==null||in.expectedRevision()==null)throw new InvalidRequestException("expectedRevision is required");project(id);
        var u=new WorkflowRows.Updates();u.set("archived_at",in.archived()?java.sql.Timestamp.from(Instant.now()):null);updateRevisioned("projects",id,in.expectedRevision(),u,"Project");
        return project(id);
    }
    /** Explicit "new independent task" copy: same classification and text, fresh lifecycle, no plans or references. */
    public Task duplicateTask(UUID id) {
        lock();var t=task(id);
        int next=db.queryForObject("select coalesce(max(sort_order),-1)+1 from work_tasks where user_id=? and project_id is not distinct from ? and phase_id is not distinct from ?",Integer.class,owner(),t.projectId(),t.phaseId());
        UUID copy=UUID.randomUUID();
        db.update("insert into work_tasks(id,user_id,title,status,project_id,phase_id,priority,memo,sort_order,deadline_date,next_step) values(?,?,?,'TODO',?,?,?,?,?,?,?)",
            copy,owner(),t.title(),t.projectId(),t.phaseId(),t.priority(),t.memo(),next,t.deadlineDate(),t.nextStep());
        return task(copy);
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
            db.update("update work_tasks set title=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",patch.getValue(),patch.getKey(),owner());
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
    /** Add to Today: ensure the plan placement and exactly one primary TaskReference on that date. Idempotent. */
    public TaskReferenceResult addToday(UUID taskId,LocalDate date) { return ensureReference(taskId,date); }
    /** Continue on another date: same canonical Task, new placement/reference; the source date is never touched. */
    public TaskReferenceResult continueTask(UUID taskId,LocalDate date) { return ensureReference(taskId,date); }
    private TaskReferenceResult ensureReference(UUID taskId,LocalDate date) {
        lock();if(date==null)throw new InvalidRequestException("Date is required");var task=task(taskId);
        boolean planned=WorkflowPlanningService.upsertPlanDay(db,owner(),taskId,date);
        var day=day(date);
        var existing=day.blocks().stream().filter(b->taskId.equals(b.workTaskId())).toList();
        if(!existing.isEmpty()){
            var primary=existing.stream().filter(b->"primary".equals(b.metadata()==null?null:b.metadata().get("taskRef"))).findFirst().orElse(existing.getFirst());
            return new TaskReferenceResult(day,primary.id(),false,planned);
        }
        var blocks=new ArrayList<>(day.blocks());UUID blockId=UUID.randomUUID();
        blocks.add(new Block(blockId,null,blocks.stream().mapToInt(Block::order).max().orElse(-1)+1,"CHECKLIST",task.title(),task.status().equals("DONE"),task.id(),null,null,Map.of("taskRef","primary")));
        return new TaskReferenceResult(saveDay(date,new Day(date,day.revision(),blocks)),blockId,true,planned);
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
