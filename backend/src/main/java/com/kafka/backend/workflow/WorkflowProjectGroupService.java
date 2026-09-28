package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/**
 * Projects catalog organization: owner-scoped Project Groups and the catalog order
 * (group sort_order, then projects.sort_order inside the group). "그룹 없음" is the NULL group projection.
 * Nothing here touches Phase, status, progress, dates, This Week or Task data.
 */
@Service
@Transactional
public class WorkflowProjectGroupService {
    private static final int NAME_MAX = 80;
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public WorkflowProjectGroupService(JdbcTemplate db, CurrentUserProvider users) { this.db = db; this.users = users; }
    private UUID owner() { return users.getCurrentUserId(); }
    private void lock() { WorkflowRows.lock(db, owner()); }

    public List<ProjectGroup> groups() {
        return db.query("select * from workflow_project_groups where user_id=? order by sort_order,created_at,id", WorkflowRows::group, owner());
    }
    public ProjectGroup group(UUID id) {
        var rows = db.query("select * from workflow_project_groups where id=? and user_id=?", WorkflowRows::group, id, owner());
        if (rows.isEmpty()) throw new ResourceNotFoundException("Project group not found");
        return rows.getFirst();
    }
    private static String name(String raw) {
        String value = raw == null ? "" : raw.strip();
        if (value.isEmpty()) throw new InvalidRequestException("Group name is required");
        if (value.length() > NAME_MAX) throw new InvalidRequestException("Group name must be at most " + NAME_MAX + " characters");
        return value;
    }

    /** New groups go to the end of the group order. */
    public ProjectGroup create(GroupInput in) {
        lock();
        String value = name(in == null ? null : in.name());
        int next = db.queryForObject("select coalesce(max(sort_order),-1)+1 from workflow_project_groups where user_id=?", Integer.class, owner());
        UUID id = UUID.randomUUID();
        db.update("insert into workflow_project_groups(id,user_id,name,sort_order) values(?,?,?,?)", id, owner(), value, next);
        return group(id);
    }
    public ProjectGroup rename(UUID id, GroupInput in) {
        lock();
        if (in == null || in.expectedRevision() == null) throw new InvalidRequestException("expectedRevision is required");
        group(id);
        if (db.update("update workflow_project_groups set name=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=? and revision=?",
            name(in.name()), id, owner(), in.expectedRevision()) == 0)
            throw new OptimisticLockConflictException("Project group changed in another window. Reload and retry.");
        return group(id);
    }
    /** Deleting a group never deletes Projects: its Projects (archived ones included) move to the end of 그룹 없음 in their current order. */
    public List<Project> delete(UUID id) {
        lock(); group(id);
        var members = db.queryForList("select id from projects where user_id=? and group_id=? order by sort_order,created_at,id", UUID.class, owner(), id);
        int base = db.queryForObject("select coalesce(max(sort_order),-1)+1 from projects where user_id=? and group_id is null", Integer.class, owner());
        for (int i = 0; i < members.size(); i++)
            db.update("update projects set group_id=null,sort_order=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?", base + i, members.get(i), owner());
        db.update("delete from workflow_project_groups where id=? and user_id=?", id, owner());
        return projects();
    }

    /**
     * Atomic catalog move. The Project is inserted before {@code beforeProjectId} in the target group's full list
     * (hidden, filtered and archived Projects keep their relative places), or appended when it is null.
     * Only the target list is renumbered; the moved Project's revision guards against a stale drag.
     * A move whose result is already in place writes nothing, so a retried request succeeds.
     */
    public List<Project> move(UUID projectId, ProjectMove in) {
        lock();
        if (in == null) throw new InvalidRequestException("Move target is required");
        var rows = db.query("select * from projects where id=? and user_id=?", WorkflowRows::project, projectId, owner());
        if (rows.isEmpty()) throw new ResourceNotFoundException("Project not found");
        var project = rows.getFirst();
        UUID target = in.groupId();
        if (target != null) group(target);
        var list = new ArrayList<>(db.queryForList("select id from projects where user_id=? and group_id is not distinct from ? and id<>? order by sort_order,created_at,id",
            UUID.class, owner(), target, projectId));
        int at = list.size();
        if (in.beforeProjectId() != null) {
            if (in.beforeProjectId().equals(projectId)) throw new InvalidRequestException("A Project cannot be placed before itself");
            at = list.indexOf(in.beforeProjectId());
            if (at < 0) throw new OptimisticLockConflictException("The target position changed in another window. Reload before reordering.");
        }
        list.add(at, projectId);
        // Current placement of every row in the target list (the moved Project may still be in its old group).
        var placed = new HashMap<UUID, Integer>();
        db.query("select id,group_id,sort_order from projects where user_id=? and (group_id is not distinct from ? or id=?)",
            (org.springframework.jdbc.core.RowCallbackHandler) r -> { if (Objects.equals(WorkflowRows.id(r, "group_id"), target)) placed.put(WorkflowRows.id(r, "id"), r.getInt("sort_order")); },
            owner(), target, projectId);
        var changes = new ArrayList<Integer>();
        for (int i = 0; i < list.size(); i++) if (!Objects.equals(placed.get(list.get(i)), i)) changes.add(i);
        if (changes.isEmpty()) return projects(); // already in place: a retried move succeeds without another write
        if (in.expectedRevision() != null && project.revision() != in.expectedRevision().longValue())
            throw new OptimisticLockConflictException("Project changed in another window. Reload before reordering.");
        for (int i : changes)
            db.update("update projects set group_id=?,sort_order=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?", target, i, list.get(i), owner());
        return projects();
    }
    private List<Project> projects() {
        return db.query("select * from projects where user_id=? order by sort_order,created_at,id", WorkflowRows::project, owner());
    }
}
