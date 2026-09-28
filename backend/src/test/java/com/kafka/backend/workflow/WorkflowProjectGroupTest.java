package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** V64 Project Groups + Projects catalog order: grouping never touches Project semantics; moves are atomic and owner-scoped. */
class WorkflowProjectGroupTest {
    SingleConnectionDataSource source; JdbcTemplate db; UUID user = UUID.randomUUID(), other = UUID.randomUUID();
    WorkflowService service; WorkflowPlanningService planning; WorkflowProjectGroupService groups;

    @BeforeEach void setup() throws Exception {
        source = new SingleConnectionDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;NON_KEYWORDS=DAY", "sa", "", true); db = new JdbcTemplate(source);
        db.execute("create schema auth"); db.execute("create table auth.users(id uuid primary key)");
        db.update("insert into auth.users values(?)", user); db.update("insert into auth.users values(?)", other);
        WorkflowTestSchema.externalTables(db);
        WorkflowTestSchema.apply(db, "V26__create_projects_and_phases.sql", "V38__work_flow_v1.sql", "V61__work_flow_v1_core.sql", "V64__work_flow_project_groups.sql");
        wire(user);
    }
    void wire(UUID owner) {
        service = new WorkflowService(db, () -> owner, JsonMapper.builder().build());
        planning = new WorkflowPlanningService(db, () -> owner);
        groups = new WorkflowProjectGroupService(db, () -> owner);
    }
    @AfterEach void close() { source.destroy(); }
    Project project(String title, int order) { return service.saveProject(null, new Project(null, title, "ACTIVE", null, null, "#123456", null, order)); }
    /** Catalog order: groups by sort_order, then 그룹 없음 (null) last; projects by sort_order inside each group. */
    List<String> catalog() {
        var all = service.all(); var out = new ArrayList<String>();
        var groupIds = new ArrayList<UUID>(); for (var g : all.groups()) groupIds.add(g.id()); groupIds.add(null);
        for (UUID g : groupIds) all.projects().stream().filter(p -> Objects.equals(p.groupId(), g)).sorted(Comparator.comparingInt(Project::order)).forEach(p -> out.add((g == null ? "-" : name(all, g)) + "/" + p.title()));
        return out;
    }
    static String name(Aggregate all, UUID id) { return all.groups().stream().filter(g -> g.id().equals(id)).findFirst().orElseThrow().name(); }

    @Test void existingProjectsResolveToNoGroupAndGroupsAreOwnerScoped() {
        var a = project("A", 0);
        assertThat(service.project(a.id()).groupId()).isNull();
        var g = groups.create(new GroupInput("  Work  ", null));
        assertThat(g.name()).isEqualTo("Work"); assertThat(g.order()).isZero();
        assertThat(groups.create(new GroupInput("Life", null)).order()).isEqualTo(1);
        assertThatThrownBy(() -> groups.create(new GroupInput("  ", null))).isInstanceOf(InvalidRequestException.class);
        wire(other);
        assertThat(groups.groups()).isEmpty();
        assertThatThrownBy(() -> groups.rename(g.id(), new GroupInput("x", 0L))).isInstanceOf(ResourceNotFoundException.class);
        var mine = project("Other's", 0);
        assertThatThrownBy(() -> groups.move(mine.id(), new ProjectMove(g.id(), null, null))).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test void moveWithinAcrossAndOutOfGroupsKeepsAUniqueOrderAndProjectSemantics() {
        var a = project("A", 0); var b = project("B", 1); var c = project("C", 2);
        var work = groups.create(new GroupInput("Work", null));
        groups.move(b.id(), new ProjectMove(work.id(), null, b.revision()));
        groups.move(c.id(), new ProjectMove(work.id(), b.id(), null));            // before B in Work
        assertThat(catalog()).containsExactly("Work/C", "Work/B", "-/A");
        groups.move(b.id(), new ProjectMove(work.id(), c.id(), null));            // reorder inside the group
        assertThat(catalog()).containsExactly("Work/B", "Work/C", "-/A");
        groups.move(c.id(), new ProjectMove(null, a.id(), null));                 // out to 그룹 없음, before A
        assertThat(catalog()).containsExactly("Work/B", "-/C", "-/A");
        var moved = service.project(c.id());
        assertThat(moved.status()).isEqualTo("ACTIVE"); assertThat(moved.title()).isEqualTo("C"); assertThat(moved.color()).isEqualTo("#123456");
        var orders = service.all().projects().stream().filter(p -> p.groupId() == null).map(Project::order).toList();
        assertThat(new HashSet<>(orders)).hasSize(orders.size());
    }

    @Test void hiddenArchivedProjectsKeepTheirPlaceAndRestoreKeepsGroupAndOrder() {
        var work = groups.create(new GroupInput("Work", null));
        var a = project("A", 0); var b = project("B", 1); var c = project("C", 2);
        for (var p : List.of(a, b, c)) groups.move(p.id(), new ProjectMove(work.id(), null, null));
        var archived = service.archiveProject(b.id(), new ArchiveChange(true, service.project(b.id()).revision()));
        // The visible list is A, C; dropping C before A must not jump over the archived B's slot relative to A.
        groups.move(c.id(), new ProjectMove(work.id(), a.id(), null));
        assertThat(catalog()).containsExactly("Work/C", "Work/A", "Work/B");
        assertThat(archived.archivedAt()).isNotNull();
        var restored = service.archiveProject(b.id(), new ArchiveChange(false, service.project(b.id()).revision()));
        assertThat(restored.groupId()).isEqualTo(work.id()); assertThat(restored.archivedAt()).isNull();
        assertThat(catalog()).containsExactly("Work/C", "Work/A", "Work/B");
    }

    @Test void staleMoveConflictsButARetriedIdenticalMoveSucceeds() {
        var a = project("A", 0); var b = project("B", 1);
        var work = groups.create(new GroupInput("Work", null));
        groups.move(a.id(), new ProjectMove(work.id(), null, a.revision()));
        // Retrying the same request (same stale revision) is idempotent: already in place, nothing written.
        assertThatCode(() -> groups.move(a.id(), new ProjectMove(work.id(), null, a.revision()))).doesNotThrowAnyException();
        // A different move built on the stale revision is refused.
        assertThatThrownBy(() -> groups.move(a.id(), new ProjectMove(null, b.id(), a.revision()))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> groups.move(a.id(), new ProjectMove(work.id(), UUID.randomUUID(), null))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> groups.move(a.id(), new ProjectMove(work.id(), a.id(), null))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void groupReorderRenameAndDeleteNeverDeleteProjects() {
        var a = project("A", 0); var b = project("B", 1); var loose = project("Loose", 5);
        var work = groups.create(new GroupInput("Work", null)); var life = groups.create(new GroupInput("Life", null));
        groups.move(a.id(), new ProjectMove(work.id(), null, null)); groups.move(b.id(), new ProjectMove(work.id(), null, null));
        planning.reorder(new WorkflowPlanningService.Reorder("project-groups", List.of(life.id(), work.id())));
        assertThat(groups.groups()).extracting(ProjectGroup::name).containsExactly("Life", "Work");
        assertThatThrownBy(() -> planning.reorder(new WorkflowPlanningService.Reorder("project-groups", List.of(work.id())))).isInstanceOf(OptimisticLockConflictException.class);
        var renamed = groups.rename(work.id(), new GroupInput("Build", groups.group(work.id()).revision()));
        assertThat(renamed.name()).isEqualTo("Build");
        assertThatThrownBy(() -> groups.rename(work.id(), new GroupInput("Stale", 0L))).isInstanceOf(OptimisticLockConflictException.class);
        groups.delete(work.id());
        assertThat(groups.groups()).extracting(ProjectGroup::name).containsExactly("Life");
        // Deleted group's Projects follow the existing 그룹 없음 Projects, in their previous order.
        assertThat(catalog()).containsExactly("-/Loose", "-/A", "-/B");
        assertThat(service.all().projects()).hasSize(3);
    }
}
