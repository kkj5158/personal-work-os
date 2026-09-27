package com.kafka.backend.workflow;

import org.springframework.jdbc.core.JdbcTemplate;
import java.nio.file.*;
import java.util.*;

/** Applies the real WORK FLOW migrations to an isolated H2 (PostgreSQL mode) database. */
final class WorkflowTestSchema {
    private WorkflowTestSchema() {}
    static void apply(JdbcTemplate db, String... files) throws Exception {
        for (String file : files) {
            if (file.startsWith("V61")) nameChecksLikePostgres(db);
            String sql = Files.readString(Path.of("src/main/resources/db/migration", file)).replaceAll("(?m)--.*$", "").replace("TIMESTAMPTZ", "TIMESTAMP WITH TIME ZONE");
            for (String statement : sql.split(";")) if (!statement.isBlank() && !statement.contains("ENABLE ROW LEVEL SECURITY")) db.execute(statement);
        }
    }
    /** H2 auto-names inline CHECKs differently; give them PostgreSQL's generated names (verified by a PG replay) so V61 runs verbatim. */
    private static void nameChecksLikePostgres(JdbcTemplate db) {
        rename(db, "PROJECTS", "PAUSED", "projects_status_check");
        rename(db, "WORK_TASKS", "DOING", "work_tasks_status_check");
    }
    private static void rename(JdbcTemplate db, String table, String marker, String name) {
        var names = db.queryForList("select c.constraint_name from information_schema.check_constraints c join information_schema.table_constraints t on t.constraint_name=c.constraint_name where t.table_name=? and c.check_clause like ?",
            String.class, table, "%" + marker + "%");
        if (names.size() != 1) throw new IllegalStateException("Expected one " + table + " status check, found " + names);
        db.execute("alter table " + table + " rename constraint \"" + names.getFirst() + "\" to " + name);
    }
    /** Minimal stand-ins for tables owned by other systems that V38/V61 reference. */
    static void externalTables(JdbcTemplate db) {
        db.execute("create table journal_media(id uuid primary key,workspace_id uuid not null,mime_type varchar(40),width int,height int,data bytea)");
        db.execute("create table note_workspaces(id uuid primary key,owner_id uuid,name varchar)");
        db.execute("create table journal_notes(id uuid primary key,workspace_id uuid,workflow_owner_id uuid,type varchar default 'NOTE',title varchar,content text default '',version bigint default 0,deleted_at timestamp,updated_at timestamp default current_timestamp)");
        for (String table : List.of("planned_time_blocks", "work_time_entries", "supplemental_work_entries")) db.execute("create table " + table + "(phase_id uuid)");
        db.execute("create table worklog_note_references(user_id uuid,day date,block_id uuid,normalized_name varchar,ordinal int,note_id uuid,excerpt text)");
    }
}
