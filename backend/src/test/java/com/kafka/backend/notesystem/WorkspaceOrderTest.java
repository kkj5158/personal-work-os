package com.kafka.backend.notesystem;

import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.notesystem.NoteTypes.*;

class WorkspaceOrderTest {
    final UUID owner = UUID.randomUUID();
    JdbcTemplate db;
    NoteSystemService service;
    @BeforeEach void setup() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        db = new JdbcTemplate(ds) {
            // PostgreSQL advisory locks are not available in isolated H2 tests.
            @Override public List<Map<String,Object>> queryForList(String sql, Object... args) {
                if (sql.contains("pg_advisory_xact_lock")) return List.of();
                return super.queryForList(sql, args);
            }
        };
        db.execute("create table note_workspaces(id uuid primary key, owner_id uuid not null, name varchar, normalized_name varchar, description varchar, icon varchar, archived_at timestamp, created_at timestamp default current_timestamp, updated_at timestamp default current_timestamp, sort_order int default 0 not null)");
        db.execute("create table workspace_module_settings(workspace_id uuid, module varchar, enabled boolean default true, position int, is_default boolean)");
        service = new NoteSystemService(db, () -> owner, JsonMapper.builder().build());
    }
    UUID create(String name) { return service.createWorkspace(new WorkspaceInput(name,"","notebook",false,null)); }
    @Test void orderPersistsAcrossServiceReloadAndNewWorkspaceAppends() {
        UUID a = create("A"), b = create("B"), c = create("C");
        service.reorderWorkspaces(List.of(c,a,b));
        var reloaded = new NoteSystemService(db, () -> owner, JsonMapper.builder().build());
        assertThat(reloaded.workspaces()).extracting(Workspace::id).containsExactly(c,a,b);
        assertThat(reloaded.workspaces()).extracting(Workspace::sortOrder).containsExactly(0,1,2);
        UUID d = create("D");
        assertThat(reloaded.workspaces()).extracting(Workspace::id).containsExactly(c,a,b,d);
    }
    @Test void rejectsDuplicatesForeignArchivedAndStaleSetsWithoutPartialWrites() {
        UUID a = create("A"), b = create("B"), archived = create("archived");
        db.update("update note_workspaces set archived_at=current_timestamp where id=?", archived);
        var foreign = new NoteSystemService(db, UUID::randomUUID, JsonMapper.builder().build());
        UUID other = UUID.randomUUID();
        for (List<UUID> invalid : List.of(List.of(a,a),List.of(a,other),List.of(a),List.of(a,b,archived))) {
            assertThatThrownBy(() -> service.reorderWorkspaces(invalid)).isInstanceOf(InvalidRequestException.class);
        }
        assertThat(service.workspaces()).extracting(Workspace::id).containsExactly(a,b,archived);
        service.reorderWorkspaces(List.of(b,a));
        assertThat(service.workspaces()).extracting(Workspace::id).containsExactly(b,a,archived);
        assertThat(db.queryForObject("select sort_order from note_workspaces where id=?",Integer.class,archived)).isEqualTo(2);
    }
}
