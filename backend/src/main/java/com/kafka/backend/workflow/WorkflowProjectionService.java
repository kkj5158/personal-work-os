package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Read-only projections over the canonical Task, plan days and Workpad TaskReferences. Nothing here stores copies. */
@Service
@Transactional(readOnly = true)
public class WorkflowProjectionService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    public WorkflowProjectionService(JdbcTemplate db, CurrentUserProvider users, ObjectMapper json) { this.db = db; this.users = users; this.json = json; }
    private UUID owner() { return users.getCurrentUserId(); }

    public record PlannedTask(LocalDate date, int order, Task task) {}
    /** Tasks placed on each date of the range (e.g. Workpad "Today planned"). Never inserts into a Workpad. */
    public List<PlannedTask> plan(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) throw new InvalidRequestException("A valid date range is required");
        if (to.isAfter(from.plusDays(400))) throw new InvalidRequestException("Date range is too long");
        var tasks = new HashMap<UUID, Task>();
        db.query("select t.* from work_tasks t where t.user_id=? and exists(select 1 from work_task_plan_days p where p.task_id=t.id and p.day between ? and ?)",
            (org.springframework.jdbc.core.RowCallbackHandler) r -> { var t = WorkflowRows.task(r, 0); tasks.put(t.id(), t); }, owner(), from, to);
        return db.query("select * from work_task_plan_days where user_id=? and day between ? and ? order by day,sort_order,task_id", WorkflowRows::planDay, owner(), from, to)
            .stream().map(p -> new PlannedTask(p.date(), p.order(), tasks.get(p.taskId()))).filter(p -> p.task() != null).toList();
    }

    public record RecentRecord(LocalDate date, UUID blockId, UUID taskId, String taskTitle, String excerpt, boolean hasImage, boolean hasNote, String href) {}
    /** Project/Task recent records come from Workpad TaskReferences, newest Workpad date first. No separate log exists. */
    public List<RecentRecord> recentForProject(UUID projectId, int limit) {
        if (db.queryForObject("select count(*) from projects where id=? and user_id=?", Long.class, projectId, owner()) == 0) throw new ResourceNotFoundException("Project not found");
        return recent("t.project_id=?", projectId, limit);
    }
    public List<RecentRecord> recentForTask(UUID taskId, int limit) {
        if (db.queryForObject("select count(*) from work_tasks where id=? and user_id=?", Long.class, taskId, owner()) == 0) throw new ResourceNotFoundException("Task not found");
        return recent("t.id=?", taskId, limit);
    }
    private record Ref(UUID blockId, LocalDate day, UUID taskId, String title, boolean primary) {}
    private List<RecentRecord> recent(String filter, UUID value, int limit) {
        int max = Math.max(1, Math.min(limit, 50));
        var refs = db.query("select b.id,b.day,b.work_task_id,b.metadata,t.title from workpad_blocks b join work_tasks t on t.id=b.work_task_id and t.user_id=b.user_id where b.user_id=? and " + filter + " order by b.day desc,b.sort_order,b.id",
            (r, n) -> new Ref(WorkflowRows.id(r, "id"), WorkflowRows.date(r, "day"), WorkflowRows.id(r, "work_task_id"), r.getString("title"), metadata(r.getString("metadata")).get("taskRef") != null), owner(), value);
        // One record per Workpad date and Task; the primary reference represents duplicates of that pair.
        var chosen = new LinkedHashMap<String, Ref>();
        for (var ref : refs) {
            String key = ref.day() + "/" + ref.taskId();
            var existing = chosen.get(key);
            if (existing == null || (!existing.primary() && ref.primary())) chosen.put(key, ref);
        }
        var result = new ArrayList<RecentRecord>();
        for (var ref : chosen.values()) {
            if (result.size() >= max) break;
            result.add(describe(ref));
        }
        return result;
    }
    private record Child(UUID id, UUID parentId, String type, String content, Map<String,Object> metadata) {}
    private RecentRecord describe(Ref ref) {
        var blocks = db.query("select id,parent_id,type,content,metadata from workpad_blocks where user_id=? and day=? order by sort_order,id",
            (r, n) -> new Child(WorkflowRows.id(r, "id"), WorkflowRows.id(r, "parent_id"), r.getString("type"), r.getString("content"), metadata(r.getString("metadata"))), owner(), ref.day());
        var descendants = new ArrayList<Child>();
        var frontier = new ArrayDeque<UUID>(List.of(ref.blockId()));
        while (!frontier.isEmpty()) {
            UUID parent = frontier.poll();
            for (var b : blocks) if (parent.equals(b.parentId())) { descendants.add(b); frontier.add(b.id()); }
        }
        String excerpt = descendants.stream().filter(b -> !List.of("IMAGE", "IMAGE_GROUP", "DIVIDER").contains(b.type()))
            .map(b -> Objects.requireNonNullElse(b.content(), "").strip()).filter(s -> !s.isEmpty()).findFirst().orElse("");
        if (excerpt.length() > 200) excerpt = excerpt.substring(0, 200) + "…";
        boolean image = descendants.stream().anyMatch(b -> b.type().startsWith("IMAGE"));
        boolean note = descendants.stream().anyMatch(b -> b.metadata().get("wikiLinks") instanceof List<?> l && !l.isEmpty());
        return new RecentRecord(ref.day(), ref.blockId(), ref.taskId(), ref.title(), excerpt, image, note, "/workflow/today?date=" + ref.day() + "&block=" + ref.blockId());
    }
    @SuppressWarnings("unchecked") private Map<String,Object> metadata(String data) { return data == null ? Map.of() : json.readValue(data, Map.class); }

    public record Waiting(LocalDate today, List<Task> readyToCheck, List<Task> waiting) {}
    /** "Ready to check" is a projection of WAITING Tasks, not a status. Archived Tasks are excluded. */
    public Waiting waiting(LocalDate today) {
        LocalDate day = today == null ? LocalDate.now(AppTimeZone.ZONE) : today;
        var all = db.query("select * from work_tasks where user_id=? and status='WAITING' and archived_at is null order by waiting_check_date nulls last,sort_order,id", WorkflowRows::task, owner());
        // Waiting revision 2026-10-01: the projection is by check date only (a legacy flag alone does not promote).
        var ready = all.stream().filter(t -> t.waitingCheckDate() != null && !t.waitingCheckDate().isAfter(day)).toList();
        var rest = all.stream().filter(t -> !ready.contains(t)).toList();
        return new Waiting(day, ready, rest);
    }
}
