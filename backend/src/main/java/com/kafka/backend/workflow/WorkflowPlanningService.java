package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/**
 * Plan days and weekly planning. Both only reference work_tasks/projects; neither clones a Task.
 * A plan placement and an explicit weekly selection are independent relations.
 */
@Service
@Transactional
public class WorkflowPlanningService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public WorkflowPlanningService(JdbcTemplate db, CurrentUserProvider users) { this.db = db; this.users = users; }
    private UUID owner() { return users.getCurrentUserId(); }
    private void lock() { WorkflowRows.lock(db, owner()); }

    public record FocusSlot(int slot, String title, String memo) {}
    public record WeekGoal(UUID id, String text, boolean checked, int order) {}
    public record WeekProject(UUID projectId, int order, String scopeLine) {}
    /** One row per Task in the week: explicit selection and plan dates stay distinguishable. */
    public record WeekTask(UUID taskId, boolean selected, Integer selectionOrder, List<LocalDate> plannedDates) {}
    public record Week(LocalDate weekStart, long revision, List<FocusSlot> focusSlots, List<WeekGoal> goals,
                       List<WeekProject> projects, List<WeekTask> tasks, List<PlanDay> planDays) {}
    public record WeekContent(Long expectedRevision, List<FocusSlot> focusSlots, List<WeekGoal> goals) {}
    public record ProjectInclusion(String scopeLine) {}
    public record PlanDayMove(UUID taskId, LocalDate from, LocalDate to) {}
    public record PlanDayMoveResult(boolean merged, List<PlanDay> planDays) {}
    public record Reorder(String scope, List<UUID> ids) {}

    private void ownTask(UUID taskId) {
        if (taskId == null || db.queryForObject("select count(*) from work_tasks where id=? and user_id=?", Long.class, taskId, owner()) == 0)
            throw new ResourceNotFoundException("Task not found");
    }
    private void ownProject(UUID projectId) {
        if (projectId == null || db.queryForObject("select count(*) from projects where id=? and user_id=?", Long.class, projectId, owner()) == 0)
            throw new ResourceNotFoundException("Project not found");
    }
    static LocalDate monday(LocalDate weekStart) {
        if (weekStart == null || weekStart.getDayOfWeek() != DayOfWeek.MONDAY) throw new InvalidRequestException("A week starts on Monday");
        return weekStart;
    }

    /** Idempotent placement; a new placement goes to the end of that day. Callers hold the owner lock. */
    static boolean upsertPlanDay(JdbcTemplate db, UUID owner, UUID taskId, LocalDate day) {
        if (day == null) throw new InvalidRequestException("Date is required");
        if (db.queryForObject("select count(*) from work_task_plan_days where task_id=? and day=?", Long.class, taskId, day) > 0) return false;
        int next = db.queryForObject("select coalesce(max(sort_order),-1)+1 from work_task_plan_days where user_id=? and day=?", Integer.class, owner, day);
        db.update("insert into work_task_plan_days(task_id,user_id,day,sort_order) values(?,?,?,?)", taskId, owner, day, next);
        return true;
    }
    public List<PlanDay> planDays(UUID taskId) {
        ownTask(taskId);
        return db.query("select * from work_task_plan_days where user_id=? and task_id=? order by day", WorkflowRows::planDay, owner(), taskId);
    }
    public List<PlanDay> addPlanDay(UUID taskId, LocalDate day) { lock(); ownTask(taskId); upsertPlanDay(db, owner(), taskId, day); return planDays(taskId); }
    /** Removes only this placement; other dates, the deadline and Workpad history are untouched. */
    public List<PlanDay> removePlanDay(UUID taskId, LocalDate day) {
        lock(); ownTask(taskId);
        db.update("delete from work_task_plan_days where user_id=? and task_id=? and day=?", owner(), taskId, day);
        return planDays(taskId);
    }
    /** Moves one placement. When the target already holds this Task the two placements merge. */
    public PlanDayMoveResult movePlanDay(PlanDayMove in) {
        lock();
        if (in == null || in.from() == null || in.to() == null) throw new InvalidRequestException("Source and target dates are required");
        ownTask(in.taskId());
        if (db.queryForObject("select count(*) from work_task_plan_days where user_id=? and task_id=? and day=?", Long.class, owner(), in.taskId(), in.from()) == 0)
            throw new ResourceNotFoundException("Plan day not found");
        if (in.from().equals(in.to())) return new PlanDayMoveResult(false, planDays(in.taskId()));
        db.update("delete from work_task_plan_days where user_id=? and task_id=? and day=?", owner(), in.taskId(), in.from());
        boolean merged = !upsertPlanDay(db, owner(), in.taskId(), in.to());
        return new PlanDayMoveResult(merged, planDays(in.taskId()));
    }

    private void ensureWeek(LocalDate week) {
        db.update("insert into work_weeks(user_id,week_start) values(?,?) on conflict do nothing", owner(), week);
    }
    public Week week(LocalDate weekStart) {
        LocalDate week = monday(weekStart), end = week.plusDays(6);
        var revisions = db.queryForList("select revision from work_weeks where user_id=? and week_start=?", Long.class, owner(), week);
        var stored = new HashMap<Integer, FocusSlot>();
        db.query("select slot,title,memo from work_week_focus_slots where user_id=? and week_start=?", (org.springframework.jdbc.core.RowCallbackHandler) r ->
            stored.put(r.getInt("slot"), new FocusSlot(r.getInt("slot"), r.getString("title"), r.getString("memo"))), owner(), week);
        var slots = new ArrayList<FocusSlot>();
        for (int i = 0; i < 3; i++) slots.add(stored.getOrDefault(i, new FocusSlot(i, "", "")));
        var goals = db.query("select * from work_week_goals where user_id=? and week_start=? order by sort_order,id",
            (r, n) -> new WeekGoal(WorkflowRows.id(r, "id"), r.getString("text"), r.getBoolean("checked"), r.getInt("sort_order")), owner(), week);
        var projects = db.query("select * from work_week_projects where user_id=? and week_start=? order by sort_order,project_id",
            (r, n) -> new WeekProject(WorkflowRows.id(r, "project_id"), r.getInt("sort_order"), r.getString("scope_line")), owner(), week);
        var planDays = db.query("select p.* from work_task_plan_days p where p.user_id=? and p.day between ? and ? order by p.day,p.sort_order,p.task_id",
            WorkflowRows::planDay, owner(), week, end);
        var items = new LinkedHashMap<UUID, WeekTask>();
        db.query("select task_id,sort_order from work_week_tasks where user_id=? and week_start=? order by sort_order,task_id", (org.springframework.jdbc.core.RowCallbackHandler) r -> {
            UUID id = WorkflowRows.id(r, "task_id");
            items.put(id, new WeekTask(id, true, r.getInt("sort_order"), new ArrayList<>()));
        }, owner(), week);
        for (var plan : planDays) {
            items.computeIfAbsent(plan.taskId(), id -> new WeekTask(id, false, null, new ArrayList<>())).plannedDates().add(plan.date());
        }
        return new Week(week, revisions.isEmpty() ? 0 : revisions.getFirst(), slots, goals, projects, List.copyOf(items.values()), planDays);
    }
    public Week includeProject(LocalDate weekStart, UUID projectId, ProjectInclusion in) {
        lock(); LocalDate week = monday(weekStart); ownProject(projectId); ensureWeek(week);
        String scope = in == null ? null : WorkflowRows.text(in.scopeLine(), 500, "Scope line");
        if (db.queryForObject("select count(*) from work_week_projects where user_id=? and week_start=? and project_id=?", Long.class, owner(), week, projectId) > 0) {
            if (in != null) db.update("update work_week_projects set scope_line=? where user_id=? and week_start=? and project_id=?", scope, owner(), week, projectId);
        } else {
            int next = db.queryForObject("select coalesce(max(sort_order),-1)+1 from work_week_projects where user_id=? and week_start=?", Integer.class, owner(), week);
            db.update("insert into work_week_projects(user_id,week_start,project_id,sort_order,scope_line) values(?,?,?,?,?)", owner(), week, projectId, next, scope);
        }
        return week(week);
    }
    /** Excluding a project changes only weekly inclusion; its Tasks, selections and plan days remain. */
    public Week excludeProject(LocalDate weekStart, UUID projectId) {
        lock(); LocalDate week = monday(weekStart); ownProject(projectId);
        db.update("delete from work_week_projects where user_id=? and week_start=? and project_id=?", owner(), week, projectId);
        return week(week);
    }
    public Week selectTask(LocalDate weekStart, UUID taskId) {
        lock(); LocalDate week = monday(weekStart); ownTask(taskId); ensureWeek(week);
        if (db.queryForObject("select count(*) from work_week_tasks where user_id=? and week_start=? and task_id=?", Long.class, owner(), week, taskId) == 0) {
            int next = db.queryForObject("select coalesce(max(sort_order),-1)+1 from work_week_tasks where user_id=? and week_start=?", Integer.class, owner(), week);
            db.update("insert into work_week_tasks(user_id,week_start,task_id,sort_order) values(?,?,?,?)", owner(), week, taskId, next);
        }
        return week(week);
    }
    /** Removes only the explicit weekly focus; plan days in the week are preserved. */
    public Week unselectTask(LocalDate weekStart, UUID taskId) {
        lock(); LocalDate week = monday(weekStart); ownTask(taskId);
        db.update("delete from work_week_tasks where user_id=? and week_start=? and task_id=?", owner(), week, taskId);
        return week(week);
    }
    /** Focus slots (exactly three positions) and weekly goals are saved together under the week revision. */
    public Week saveContent(LocalDate weekStart, WeekContent in) {
        lock(); LocalDate week = monday(weekStart);
        if (in == null || in.expectedRevision() == null) throw new InvalidRequestException("expectedRevision is required");
        if (in.focusSlots() == null || in.focusSlots().size() != 3) throw new InvalidRequestException("Exactly three focus slots are required");
        var goals = in.goals() == null ? List.<WeekGoal>of() : in.goals();
        if (goals.size() > 50) throw new InvalidRequestException("At most 50 weekly goals");
        ensureWeek(week);
        if (db.update("update work_weeks set revision=revision+1 where user_id=? and week_start=? and revision=?", owner(), week, in.expectedRevision()) == 0)
            throw new OptimisticLockConflictException("This week's plan changed in another window. Your draft is retained; reload and retry.");
        db.update("delete from work_week_focus_slots where user_id=? and week_start=?", owner(), week);
        for (int i = 0; i < 3; i++) {
            var slot = in.focusSlots().get(i);
            String title = Objects.requireNonNullElse(slot == null ? null : slot.title(), ""), memo = Objects.requireNonNullElse(slot == null ? null : slot.memo(), "");
            WorkflowRows.text(title, 200, "Focus title"); WorkflowRows.text(memo, 4000, "Focus memo");
            if (!title.isEmpty() || !memo.isEmpty())
                db.update("insert into work_week_focus_slots(user_id,week_start,slot,title,memo) values(?,?,?,?,?)", owner(), week, i, title, memo);
        }
        db.update("delete from work_week_goals where user_id=? and week_start=?", owner(), week);
        for (int i = 0; i < goals.size(); i++) {
            var g = goals.get(i);
            String text = g == null || g.text() == null ? "" : g.text().trim();
            if (text.isEmpty() || text.length() > 500) throw new InvalidRequestException("Weekly goals need 1–500 characters");
            db.update("insert into work_week_goals(id,user_id,week_start,text,checked,sort_order) values(?,?,?,?,?,?)", UUID.randomUUID(), owner(), week, text, g.checked(), i);
        }
        return week(week);
    }

    /**
     * Transactional ordering for one scope. The id list must contain every member exactly once, so a
     * partial or stale list never produces an ambiguous order. Supported scopes:
     * projects, project-groups, phases:{projectId}, tasks:{projectId|none}:{phaseId|none}, week-projects:{week},
     * week-tasks:{week}, day:{date}, resources:project:{id}, resources:task:{id}.
     */
    public List<UUID> reorder(Reorder in) {
        lock();
        if (in == null || in.scope() == null || in.ids() == null) throw new InvalidRequestException("Scope and ids are required");
        var ids = in.ids();
        if (new HashSet<>(ids).size() != ids.size() || ids.size() > 2000) throw new InvalidRequestException("Order ids must be unique");
        String[] part = in.scope().split(":");
        String table, idColumn, filter; List<Object> args = new ArrayList<>(List.of(owner()));
        boolean revisioned = false;
        switch (part[0]) {
            case "projects" -> { table = "projects"; idColumn = "id"; filter = ""; revisioned = true; }
            case "project-groups" -> { table = "workflow_project_groups"; idColumn = "id"; filter = ""; revisioned = true; }
            case "phases" -> { need(part, 2); table = "phases"; idColumn = "id"; filter = " and project_id=?"; args.add(uuid(part[1])); revisioned = true; }
            case "tasks" -> {
                need(part, 3); table = "work_tasks"; idColumn = "id"; revisioned = true;
                filter = (part[1].equals("none") ? " and project_id is null" : " and project_id=?") + (part[2].equals("none") ? " and phase_id is null" : " and phase_id=?");
                if (!part[1].equals("none")) args.add(uuid(part[1]));
                if (!part[2].equals("none")) args.add(uuid(part[2]));
            }
            case "week-projects" -> { need(part, 2); table = "work_week_projects"; idColumn = "project_id"; filter = " and week_start=?"; args.add(monday(day(part[1]))); }
            case "week-tasks" -> { need(part, 2); table = "work_week_tasks"; idColumn = "task_id"; filter = " and week_start=?"; args.add(monday(day(part[1]))); }
            case "day" -> { need(part, 2); table = "work_task_plan_days"; idColumn = "task_id"; filter = " and day=?"; args.add(day(part[1])); }
            case "resources" -> {
                need(part, 3); table = "workflow_resource_links"; idColumn = "id";
                if (part[1].equals("project")) filter = " and project_id=?"; else if (part[1].equals("task")) filter = " and task_id=?"; else throw new InvalidRequestException("Unsupported order scope");
                args.add(uuid(part[2]));
            }
            default -> throw new InvalidRequestException("Unsupported order scope");
        }
        var members = new HashSet<>(db.queryForList("select " + idColumn + " from " + table + " where user_id=?" + filter, UUID.class, args.toArray()));
        if (!members.equals(new HashSet<>(ids))) throw new OptimisticLockConflictException("The list changed in another window. Reload before reordering.");
        for (int i = 0; i < ids.size(); i++) {
            var row = new ArrayList<Object>(); row.add(i); row.add(ids.get(i)); row.addAll(args);
            db.update("update " + table + " set sort_order=?" + (revisioned ? ",revision=revision+1" : "") + " where " + idColumn + "=? and user_id=?" + filter, row.toArray());
        }
        return ids;
    }
    private static void need(String[] part, int n) { if (part.length != n) throw new InvalidRequestException("Invalid order scope"); }
    private static UUID uuid(String s) { try { return UUID.fromString(s); } catch (IllegalArgumentException e) { throw new InvalidRequestException("Invalid order scope"); } }
    private static LocalDate day(String s) { try { return LocalDate.parse(s); } catch (RuntimeException e) { throw new InvalidRequestException("Invalid order scope"); } }
}
