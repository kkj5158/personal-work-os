package com.kafka.backend.workflow;

import com.kafka.backend.common.InvalidRequestException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.math.BigDecimal;
import java.sql.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Shared row mapping, owner locking and PATCH value parsing for the WORK FLOW services. */
final class WorkflowRows {
    private WorkflowRows() {}
    static final List<String> TASK_STATUSES = List.of("TODO","DOING","WAITING","DONE");
    static final List<String> PROJECT_STATUSES = List.of("READY","ACTIVE","PAUSED","DONE");
    static final List<String> PROJECT_TYPES = List.of("GENERAL","DEVELOPMENT","CONTENT","PERSONAL");

    /** One owner row serializes mutations (including first-row creation) without locking auth.users. */
    static void lock(JdbcTemplate db, UUID owner) {
        db.update("insert into workflow_preferences(user_id) values(?) on conflict do nothing", owner);
        db.queryForList("select user_id from workflow_preferences where user_id=? for update", owner);
    }
    static LocalDate date(ResultSet r, String name) throws SQLException { var d = r.getDate(name); return d == null ? null : d.toLocalDate(); }
    static UUID id(ResultSet r, String name) throws SQLException { return r.getObject(name, UUID.class); }
    static Instant instant(ResultSet r, String name) throws SQLException { var t = r.getTimestamp(name); return t == null ? null : t.toInstant(); }
    static Project project(ResultSet r, int n) throws SQLException {
        return new Project(id(r,"id"), r.getString("name"), r.getString("status"), date(r,"start_date"), date(r,"end_date"), r.getString("color_token"), r.getString("memo"), r.getInt("sort_order"),
            r.getString("project_type"), r.getString("goal"), instant(r,"archived_at"), id(r,"next_task_id"), r.getBigDecimal("unassigned_weight"), r.getLong("revision"), id(r,"group_id"));
    }
    static ProjectGroup group(ResultSet r, int n) throws SQLException {
        return new ProjectGroup(id(r,"id"), r.getString("name"), r.getInt("sort_order"), r.getLong("revision"));
    }
    static Phase phase(ResultSet r, int n) throws SQLException {
        int stored = r.getInt("progress_override");
        Integer override = r.wasNull() ? null : stored; // NULL = automatic progress, distinct from a manual 0
        return new Phase(id(r,"id"), id(r,"project_id"), r.getString("title"), r.getString("status"), date(r,"start_date"), date(r,"end_date"), r.getString("memo"), r.getInt("sort_order"),
            r.getBigDecimal("weight"), override, r.getLong("revision"));
    }
    static Task task(ResultSet r, int n) throws SQLException {
        return new Task(id(r,"id"), r.getString("title"), r.getString("status"), id(r,"project_id"), id(r,"phase_id"), r.getString("priority"), date(r,"start_date"), date(r,"due_date"), r.getString("memo"), r.getInt("sort_order"),
            date(r,"deadline_date"), r.getString("waiting_reason"), r.getString("waiting_next_action"), date(r,"waiting_check_date"), r.getBoolean("waiting_flagged"),
            r.getString("next_step"), instant(r,"completed_at"), r.getString("previous_status"), instant(r,"archived_at"), r.getLong("revision"), instant(r,"updated_at"),
            r.getString("waiting_agent"), instant(r,"waiting_since"), instant(r,"waiting_completed_at"));
    }
    static PlanDay planDay(ResultSet r, int n) throws SQLException { return new PlanDay(id(r,"task_id"), date(r,"day"), r.getInt("sort_order")); }

    static String title(String s) { if (s == null || s.isBlank() || s.length() > 200) throw new InvalidRequestException("Title must contain 1–200 characters"); return s.trim(); }
    static String choice(String s, String fallback, List<String> values) { s = s == null ? fallback : s; if (!values.contains(s)) throw new InvalidRequestException("Invalid value: " + s); return s; }
    static String text(String s, int max, String label) { if (s != null && s.length() > max) throw new InvalidRequestException(label + " is too long"); return s; }
    static void range(LocalDate a, LocalDate b) { if (a != null && b != null && b.isBefore(a)) throw new InvalidRequestException("End date must not precede start date"); }
    static BigDecimal percent(BigDecimal v, String label) {
        if (v != null && (v.signum() < 0 || v.compareTo(BigDecimal.valueOf(100)) > 0)) throw new InvalidRequestException(label + " must be between 0 and 100");
        return v;
    }

    /** Field-level PATCH input: only present keys change, and expectedRevision is mandatory. */
    static final class Patch {
        private final Map<String,Object> values;
        Patch(Map<String,Object> values, Set<String> allowed) {
            if (values == null) throw new InvalidRequestException("Patch body is required");
            this.values = values;
            for (String key : values.keySet()) if (!key.equals("expectedRevision") && !allowed.contains(key)) throw new InvalidRequestException("Unsupported field: " + key);
        }
        long expectedRevision() {
            if (!(values.get("expectedRevision") instanceof Number n)) throw new InvalidRequestException("expectedRevision is required");
            return n.longValue();
        }
        boolean has(String key) { return values.containsKey(key); }
        String string(String key) {
            Object v = values.get(key);
            if (v != null && !(v instanceof String)) throw new InvalidRequestException("Invalid " + key);
            return (String) v;
        }
        LocalDate date(String key) {
            String v = string(key);
            try { return v == null || v.isBlank() ? null : LocalDate.parse(v); } catch (RuntimeException e) { throw new InvalidRequestException("Invalid date for " + key); }
        }
        UUID uuid(String key) {
            String v = string(key);
            try { return v == null || v.isBlank() ? null : UUID.fromString(v); } catch (IllegalArgumentException e) { throw new InvalidRequestException("Invalid identifier for " + key); }
        }
        Integer integer(String key) {
            Object v = values.get(key);
            if (v == null) return null;
            if (!(v instanceof Number n) || n.doubleValue() != Math.rint(n.doubleValue())) throw new InvalidRequestException("Invalid " + key);
            return n.intValue();
        }
        BigDecimal decimal(String key) {
            Object v = values.get(key);
            if (v == null) return null;
            if (!(v instanceof Number n)) throw new InvalidRequestException("Invalid " + key);
            return new BigDecimal(n.toString());
        }
        boolean bool(String key) {
            if (!(values.get(key) instanceof Boolean b)) throw new InvalidRequestException("Invalid " + key);
            return b;
        }
    }

    /** Collects SET clauses so an UPDATE touches only the fields a client actually changed. */
    static final class Updates {
        final List<String> columns = new ArrayList<>();
        final List<Object> args = new ArrayList<>();
        void set(String column, Object value) { columns.add(column + "=?"); args.add(value); }
        boolean isEmpty() { return columns.isEmpty(); }
    }
}
