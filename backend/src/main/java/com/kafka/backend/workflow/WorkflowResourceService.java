package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.net.URI;
import java.util.*;

/**
 * Linked resources for a Project or Task. Internal notes are referenced by their stable Shared Note Core
 * id (journal_notes); external documents keep their original URL. No content is copied into WORK FLOW.
 */
@Service
@Transactional
public class WorkflowResourceService {
    static final List<String> TYPES = List.of("NOTE", "DRIVE", "DESIGN", "GIT", "AI_CHAT", "WEB");
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public WorkflowResourceService(JdbcTemplate db, CurrentUserProvider users) { this.db = db; this.users = users; }
    private UUID owner() { return users.getCurrentUserId(); }

    public record Resource(UUID id, UUID projectId, UUID taskId, UUID noteId, String url, String title, String type, String memo, int order, boolean pinned) {}
    public record ResourceInput(UUID projectId, UUID taskId, UUID noteId, String url, String title, String type, String memo, Boolean pinned) {}
    public record ResourcePatch(String title, String memo, Boolean pinned, String url, String type) {}

    private Resource row(java.sql.ResultSet r, int n) throws java.sql.SQLException {
        return new Resource(WorkflowRows.id(r, "id"), WorkflowRows.id(r, "project_id"), WorkflowRows.id(r, "task_id"), WorkflowRows.id(r, "note_id"), r.getString("url"),
            r.getString("title"), r.getString("type"), r.getString("memo"), r.getInt("sort_order"), r.getBoolean("pinned"));
    }
    public List<Resource> list(UUID projectId, UUID taskId) {
        if ((projectId == null) == (taskId == null)) throw new InvalidRequestException("Choose a project or a task");
        owned(projectId, taskId);
        return db.query("select * from workflow_resource_links where user_id=? and " + (projectId != null ? "project_id=?" : "task_id=?") + " order by pinned desc,sort_order,created_at,id",
            this::row, owner(), projectId != null ? projectId : taskId);
    }
    public Resource get(UUID id) {
        var rows = db.query("select * from workflow_resource_links where id=? and user_id=?", this::row, id, owner());
        if (rows.isEmpty()) throw new ResourceNotFoundException("Resource not found");
        return rows.getFirst();
    }
    public Resource create(ResourceInput in) {
        WorkflowRows.lock(db, owner());
        if (in == null || (in.projectId() == null) == (in.taskId() == null)) throw new InvalidRequestException("A resource belongs to exactly one project or task");
        if ((in.noteId() == null) == (in.url() == null || in.url().isBlank())) throw new InvalidRequestException("Link either a note or an external URL");
        owned(in.projectId(), in.taskId());
        String type, title = in.title() == null ? "" : in.title().trim(), url = null;
        if (in.noteId() != null) {
            var titles = db.queryForList("select n.title from journal_notes n left join note_workspaces w on w.id=n.workspace_id where n.id=? and (w.owner_id=? or n.workflow_owner_id=?)", String.class, in.noteId(), owner(), owner());
            if (titles.isEmpty()) throw new ResourceNotFoundException("Note not found");
            type = "NOTE";
            if (title.isEmpty()) title = titles.getFirst();
        } else {
            url = url(in.url());
            type = WorkflowRows.choice(in.type() == null ? classify(url) : in.type(), null, TYPES);
            if (type.equals("NOTE")) throw new InvalidRequestException("Internal notes are linked by note id");
            if (title.isEmpty()) title = url;
        }
        if (title.length() > 240) title = title.substring(0, 240);
        String scope = in.projectId() != null ? "project_id" : "task_id";
        int next = db.queryForObject("select coalesce(max(sort_order),-1)+1 from workflow_resource_links where user_id=? and " + scope + "=?", Integer.class, owner(), in.projectId() != null ? in.projectId() : in.taskId());
        UUID id = UUID.randomUUID();
        db.update("insert into workflow_resource_links(id,user_id,project_id,task_id,note_id,url,title,type,memo,sort_order,pinned) values(?,?,?,?,?,?,?,?,?,?,?)",
            id, owner(), in.projectId(), in.taskId(), in.noteId(), url, title, type, WorkflowRows.text(in.memo(), 2000, "Memo"), next, Boolean.TRUE.equals(in.pinned()));
        return get(id);
    }
    public Resource patch(UUID id, ResourcePatch in) {
        WorkflowRows.lock(db, owner());
        var old = get(id);
        if (in == null) throw new InvalidRequestException("Patch body is required");
        String title = in.title() == null ? old.title() : in.title().trim();
        if (title.isEmpty() || title.length() > 240) throw new InvalidRequestException("Title must contain 1–240 characters");
        String url = old.url(), type = old.type();
        if (old.noteId() == null) {
            if (in.url() != null) url = url(in.url());
            if (in.type() != null) { type = WorkflowRows.choice(in.type(), null, TYPES); if (type.equals("NOTE")) throw new InvalidRequestException("Internal notes are linked by note id"); }
        } else if (in.url() != null || (in.type() != null && !in.type().equals("NOTE"))) throw new InvalidRequestException("A note link keeps its note identity");
        db.update("update workflow_resource_links set title=?,memo=?,pinned=?,url=?,type=? where id=? and user_id=?",
            title, in.memo() == null ? old.memo() : WorkflowRows.text(in.memo(), 2000, "Memo"), in.pinned() == null ? old.pinned() : in.pinned(), url, type, id, owner());
        return get(id);
    }
    public void delete(UUID id) {
        WorkflowRows.lock(db, owner());
        get(id);
        db.update("delete from workflow_resource_links where id=? and user_id=?", id, owner());
    }
    private void owned(UUID projectId, UUID taskId) {
        if (projectId != null && db.queryForObject("select count(*) from projects where id=? and user_id=?", Long.class, projectId, owner()) == 0) throw new ResourceNotFoundException("Project not found");
        if (taskId != null && db.queryForObject("select count(*) from work_tasks where id=? and user_id=?", Long.class, taskId, owner()) == 0) throw new ResourceNotFoundException("Task not found");
    }
    /** Only absolute http(s) links are stored; opening a link never grants or executes anything. */
    static String url(String raw) {
        String value = raw == null ? "" : raw.trim();
        try {
            var uri = new URI(value);
            if (value.length() > 2000 || uri.getHost() == null || !List.of("http", "https").contains(String.valueOf(uri.getScheme()).toLowerCase(Locale.ROOT)))
                throw new InvalidRequestException("Use an absolute http(s) URL");
            return value;
        } catch (java.net.URISyntaxException e) { throw new InvalidRequestException("Use an absolute http(s) URL"); }
    }
    /** Suggests a type from the host when the client does not choose one. */
    static String classify(String url) {
        String host = URI.create(url).getHost().toLowerCase(Locale.ROOT);
        if (host.endsWith("docs.google.com") || host.endsWith("drive.google.com")) return "DRIVE";
        if (host.endsWith("figma.com")) return "DESIGN";
        if (host.endsWith("github.com") || host.endsWith("gitlab.com")) return "GIT";
        if (host.endsWith("chatgpt.com") || host.endsWith("chat.openai.com") || host.endsWith("claude.ai")) return "AI_CHAT";
        return "WEB";
    }
}
