package com.kafka.backend.workflow;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.workflow.WorkflowTypes.Project;
import com.kafka.backend.workflow.WorkflowTypes.Task;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * DB-side paging over canonical WORK FLOW rows for ORBIT.
 * Same row mapper, same authenticated owner, no extra persistence.
 */
@Service
@Transactional(readOnly = true)
public class WorkflowOrbitReadService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;

    public WorkflowOrbitReadService(JdbcTemplate db, CurrentUserProvider users) {
        this.db = db;
        this.users = users;
    }

    public record Page<T>(List<T> items, long total) {}

    static String status(String input, List<String> allowed) {
        if (input == null || input.isBlank()) return null;
        String value = input.trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(value)) {
            throw new InvalidRequestException("지원하지 않는 상태입니다.");
        }
        return value;
    }

    public Page<Project> projects(String status, int limit, int offset) {
        String filtered = status(status, WorkflowRows.PROJECT_STATUSES);
        List<Object> args = new ArrayList<>();
        args.add(users.getCurrentUserId());
        String where = " where user_id=?";
        if (filtered != null) {
            where += " and status=?";
            args.add(filtered);
        }
        long total = db.queryForObject("select count(*) from projects" + where,
                Long.class, args.toArray());
        args.add(limit);
        args.add(offset);
        var items = db.query("select * from projects" + where +
                " order by sort_order,created_at,id limit ? offset ?",
                WorkflowRows::project, args.toArray());
        return new Page<>(items, total);
    }

    public Page<Task> tasks(String status, int limit, int offset) {
        String filtered = status(status, WorkflowRows.TASK_STATUSES);
        List<Object> args = new ArrayList<>();
        args.add(users.getCurrentUserId());
        String where = " where user_id=?";
        if (filtered != null) {
            where += " and status=?";
            args.add(filtered);
        }
        long total = db.queryForObject("select count(*) from work_tasks" + where,
                Long.class, args.toArray());
        args.add(limit);
        args.add(offset);
        var items = db.query("select * from work_tasks" + where +
                " order by sort_order,created_at,id limit ? offset ?",
                WorkflowRows::task, args.toArray());
        return new Page<>(items, total);
    }
}
