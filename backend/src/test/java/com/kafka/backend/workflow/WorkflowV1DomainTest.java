package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** WORK FLOW V1 Batch 2 domain: revisions, deadline, WAITING, plan days, weeks, references, archive, resources, projections. */
class WorkflowV1DomainTest {
    SingleConnectionDataSource source; JdbcTemplate db; UUID user = UUID.randomUUID();
    WorkflowService service; WorkflowPlanningService planning; WorkflowProjectionService projections; WorkflowResourceService resources;
    LocalDate monday = LocalDate.of(2026, 9, 28), today = monday.plusDays(2);

    @BeforeEach void setup() throws Exception {
        source = new SingleConnectionDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;NON_KEYWORDS=DAY", "sa", "", true); db = new JdbcTemplate(source);
        db.execute("create schema auth"); db.execute("create table auth.users(id uuid primary key)"); db.update("insert into auth.users values(?)", user);
        WorkflowTestSchema.externalTables(db);
        WorkflowTestSchema.apply(db, "V26__create_projects_and_phases.sql", "V38__work_flow_v1.sql", "V61__work_flow_v1_core.sql","V64__work_flow_project_groups.sql","V67__work_flow_waiting_revision.sql");
        wire(user);
    }
    void wire(UUID owner) {
        var json = JsonMapper.builder().build();
        service = new WorkflowService(db, () -> owner, json); planning = new WorkflowPlanningService(db, () -> owner);
        projections = new WorkflowProjectionService(db, () -> owner, json); resources = new WorkflowResourceService(db, () -> owner);
    }
    @AfterEach void close() { source.destroy(); }
    Project project() { return service.saveProject(null, new Project(null, "Project", null, null, null, "#123456", null, 0)); }
    Task task(Project p) { return service.saveTask(null, new Task(null, "Task", "TODO", p == null ? null : p.id(), null, "NORMAL", null, null, null, 0)); }
    Map<String,Object> patch(Task t, Object... kv) { var m = new HashMap<String,Object>(); m.put("expectedRevision", t.revision()); for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]); return m; }
    List<String> events(UUID task) { return service.events(task).stream().map(WorkflowService.TaskEvent::kind).toList(); }

    @Test void newProjectsDefaultReadyWhileExistingStatusesStayValid() {
        var p = project();
        assertThat(p.status()).isEqualTo("READY"); assertThat(p.projectType()).isEqualTo("GENERAL"); assertThat(p.revision()).isZero();
        var legacy = service.saveProject(null, new Project(null, "Legacy", "PAUSED", null, null, null, null, 1));
        assertThat(legacy.status()).isEqualTo("PAUSED");
        var edited = service.patchProject(p.id(), Map.of("expectedRevision", 0, "status", "ACTIVE", "projectType", "DEVELOPMENT", "goal", "Ship V1"));
        assertThat(edited.status()).isEqualTo("ACTIVE"); assertThat(edited.goal()).isEqualTo("Ship V1"); assertThat(edited.revision()).isEqualTo(1);
        // A legacy full-object PUT keeps V1 fields it does not carry.
        var put = service.saveProject(p.id(), new Project(p.id(), "Renamed", "ACTIVE", null, null, "#123456", null, 0));
        assertThat(put.goal()).isEqualTo("Ship V1"); assertThat(put.projectType()).isEqualTo("DEVELOPMENT");
        assertThatThrownBy(() -> service.patchProject(p.id(), Map.of("expectedRevision", put.revision(), "priority", "HIGH"))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void deletingAPhaseMovesItsTasksToUnassignedAndKeepsTheirRelations() {
        var p = project();
        var phase = service.savePhase(null, new Phase(null, p.id(), "Build", "TODO", null, null, null, 0));
        var t = service.saveTask(null, new Task(null, "Grouped", "DOING", p.id(), phase.id(), "HIGH", null, null, null, 0));
        planning.addPlanDay(t.id(), today); planning.selectTask(monday, t.id());
        service.addToday(t.id(), today);
        service.deletePhase(phase.id());
        var after = service.task(t.id());
        assertThat(after.phaseId()).isNull(); assertThat(after.projectId()).isEqualTo(p.id()); assertThat(after.status()).isEqualTo("DOING");
        assertThat(after.revision()).isEqualTo(t.revision() + 1);
        assertThat(planning.planDays(t.id())).extracting(PlanDay::date).containsExactly(today);
        assertThat(planning.week(monday).tasks()).anyMatch(w -> w.taskId().equals(t.id()) && w.selected());
        assertThat(service.day(today).blocks()).anyMatch(b -> t.id().equals(b.workTaskId()));
        assertThat(service.all().phases()).noneMatch(item -> item.id().equals(phase.id()));
    }

    @Test void staleRevisionIsRejectedAndNeverOverwritesNewerValues() {
        var t = task(project());
        var windowA = service.patchTask(t.id(), patch(t, "title", "Title from window A"));
        assertThat(windowA.revision()).isEqualTo(t.revision() + 1);
        assertThatThrownBy(() -> service.patchTask(t.id(), patch(t, "memo", "stale memo from window B"))).isInstanceOf(OptimisticLockConflictException.class);
        var current = service.task(t.id());
        assertThat(current.title()).isEqualTo("Title from window A"); assertThat(current.memo()).isNull();
        var merged = service.patchTask(t.id(), patch(current, "memo", "retried memo"));
        assertThat(merged.title()).isEqualTo("Title from window A"); assertThat(merged.memo()).isEqualTo("retried memo");
        assertThatThrownBy(() -> service.patchTask(t.id(), Map.of("memo", "no revision"))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void semanticDeadlineIsIndependentOfTheLegacyRange() {
        var p = project();
        var t = service.saveTask(null, new Task(null, "Legacy ranged", "TODO", p.id(), null, "HIGH", today.minusDays(3), today.plusDays(3), null, 0));
        assertThat(t.dueDate()).isEqualTo(today.plusDays(3)); assertThat(t.deadlineDate()).isNull();
        var dated = service.patchTask(t.id(), patch(t, "deadlineDate", today.minusDays(10).toString()));
        assertThat(dated.deadlineDate()).isEqualTo(today.minusDays(10));
        assertThat(dated.startDate()).isEqualTo(today.minusDays(3)); assertThat(dated.dueDate()).isEqualTo(today.plusDays(3));
        assertThat(events(t.id())).containsExactly("DEADLINE_CHANGED");
        // Moving plan days never changes the deadline.
        planning.addPlanDay(t.id(), today); planning.movePlanDay(new WorkflowPlanningService.PlanDayMove(t.id(), today, today.plusDays(1)));
        assertThat(service.task(t.id()).deadlineDate()).isEqualTo(today.minusDays(10));
    }

    @Test void completionReopenAndWaitingKeepHistory() {
        var t = task(project());
        var done = service.changeStatus(t.id(), new StatusChange("DONE", t.revision(), null, null, null, null));
        assertThat(done.completedAt()).isNotNull(); assertThat(done.previousStatus()).isEqualTo("TODO");
        var reopened = service.changeStatus(t.id(), new StatusChange("DOING", done.revision(), null, null, null, null));
        assertThat(reopened.completedAt()).isNull(); assertThat(reopened.status()).isEqualTo("DOING");
        var waiting = service.changeStatus(t.id(), new StatusChange("WAITING", reopened.revision(), "Waiting for QA", "Merge", today, false));
        assertThat(waiting.waitingReason()).isEqualTo("Waiting for QA"); assertThat(waiting.previousStatus()).isEqualTo("DOING");
        var other = service.changeStatus(task(null).id(), new StatusChange("WAITING", 0L, "Vendor", null, today.plusDays(5), false));
        var flagged = service.changeStatus(task(null).id(), new StatusChange("WAITING", 0L, null, null, null, true));
        var view = projections.waiting(today);
        assertThat(view.readyToCheck()).extracting(Task::id).containsExactly(t.id());
        assertThat(view.waiting()).extracting(Task::id).containsExactlyInAnyOrder(other.id(), flagged.id());
        var resumed = service.changeStatus(t.id(), new StatusChange("TODO", waiting.revision(), null, null, null, null));
        assertThat(resumed.status()).isEqualTo("TODO"); assertThat(resumed.waitingReason()).isNull();
        assertThat(events(t.id())).containsExactly("COMPLETED", "REOPENED", "WAITING", "RESUMED");
        assertThat(service.events(t.id()).getLast().payload()).containsEntry("waitingReason", "Waiting for QA");
        assertThatThrownBy(() -> service.changeStatus(t.id(), new StatusChange("DONE", 0L, null, null, null, null))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> service.changeStatus(t.id(), new StatusChange("CHECK_REQUIRED", resumed.revision(), null, null, null, null))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void waitingRevisionKeepsAgentCompletedHistoryAndReactivatesTheSameTask() {
        var p = project(); var t = task(p);
        var waiting = service.changeStatus(t.id(), new StatusChange("WAITING", t.revision(), "Review", "Apply", today.minusDays(1), false, "CLAUDE_CODE", null, null));
        assertThat(waiting.waitingAgent()).isEqualTo("CLAUDE_CODE"); assertThat(waiting.waitingSince()).isNotNull(); assertThat(waiting.waitingCompletedAt()).isNull();
        // Agent is editable Waiting metadata; UNASSIGNED / null clears it; anything else is rejected.
        var patched = service.patchTask(t.id(), patch(waiting, "waitingAgent", "CODEX"));
        assertThat(patched.waitingAgent()).isEqualTo("CODEX");
        assertThat(service.patchTask(t.id(), patch(patched, "waitingAgent", "UNASSIGNED")).waitingAgent()).isNull();
        assertThatThrownBy(() -> service.patchTask(t.id(), patch(service.task(t.id()), "waitingAgent", "SOMEONE"))).isInstanceOf(InvalidRequestException.class);
        var agent = service.patchTask(t.id(), patch(service.task(t.id()), "waitingAgent", "CHATGPT"));
        // Completion from the Waiting queue is not deletion: same Task, DONE, waiting context kept as history.
        var done = service.changeStatus(t.id(), new StatusChange("DONE", agent.revision(), null, null, null, null, null, null, true));
        assertThat(done.id()).isEqualTo(t.id()); assertThat(done.status()).isEqualTo("DONE");
        assertThat(done.waitingCompletedAt()).isNotNull(); assertThat(done.completedAt()).isNotNull();
        assertThat(done.waitingReason()).isEqualTo("Review"); assertThat(done.waitingNextAction()).isEqualTo("Apply");
        assertThat(done.waitingAgent()).isEqualTo("CHATGPT"); assertThat(done.waitingCheckDate()).isEqualTo(today.minusDays(1)); assertThat(done.projectId()).isEqualTo(p.id());
        assertThat(projections.waiting(today).readyToCheck()).isEmpty();
        // 다시 대기하기: the same Task returns with a new date; reason / next action / Agent / Project are retained.
        var again = service.changeStatus(t.id(), new StatusChange("WAITING", done.revision(), null, null, today.plusDays(3), null, null, null, null));
        assertThat(again.id()).isEqualTo(t.id()); assertThat(again.status()).isEqualTo("WAITING"); assertThat(again.waitingCompletedAt()).isNull();
        assertThat(again.waitingCheckDate()).isEqualTo(today.plusDays(3)); assertThat(again.waitingReason()).isEqualTo("Review"); assertThat(again.waitingAgent()).isEqualTo("CHATGPT");
        assertThat(events(t.id())).containsExactly("WAITING", "COMPLETED", "WAITING");
        assertThat(service.events(t.id()).getLast().payload()).containsEntry("reactivated", true);
        assertThat(service.events(t.id()).get(1).payload()).containsEntry("waitingAgent", "CHATGPT");
        // Resume clears the live waiting fields; an Undo can restore them, including the original waiting start.
        var since = again.waitingSince();
        var resumed = service.changeStatus(t.id(), new StatusChange("TODO", again.revision(), null, null, null, null, null, null, null));
        assertThat(resumed.waitingAgent()).isNull(); assertThat(resumed.waitingSince()).isNull(); assertThat(resumed.waitingReason()).isNull();
        var undone = service.changeStatus(t.id(), new StatusChange("WAITING", resumed.revision(), "Review", "Apply", today.plusDays(3), false, "CHATGPT", since, null));
        assertThat(undone.waitingSince()).isEqualTo(since); assertThat(undone.waitingAgent()).isEqualTo("CHATGPT");
        // A plain completion (not from the Waiting queue) keeps the earlier behaviour: no completed Waiting history.
        var plain = service.changeStatus(t.id(), new StatusChange("DONE", undone.revision(), null, null, null, null));
        assertThat(plain.waitingCompletedAt()).isNull(); assertThat(plain.waitingReason()).isNull();
        // Reopening a completed Waiting item as ordinary work leaves the history and clears the kept context.
        var other = service.changeStatus(task(null).id(), new StatusChange("WAITING", 0L, "Vendor", null, null, false, "DIRECT", null, null));
        var otherDone = service.changeStatus(other.id(), new StatusChange("DONE", other.revision(), null, null, null, null, null, null, true));
        var reopened = service.changeStatus(other.id(), new StatusChange("TODO", otherDone.revision(), null, null, null, null));
        assertThat(reopened.waitingCompletedAt()).isNull(); assertThat(reopened.waitingReason()).isNull(); assertThat(reopened.waitingAgent()).isNull();
    }

    @Test void planDaysAllowManyDistinctDatesAndMergeOnCollision() {
        var t = task(project());
        planning.addPlanDay(t.id(), monday); planning.addPlanDay(t.id(), monday.plusDays(2));
        assertThat(planning.addPlanDay(t.id(), monday)).extracting(PlanDay::date).containsExactly(monday, monday.plusDays(2));
        var merged = planning.movePlanDay(new WorkflowPlanningService.PlanDayMove(t.id(), monday, monday.plusDays(2)));
        assertThat(merged.merged()).isTrue(); assertThat(merged.planDays()).extracting(PlanDay::date).containsExactly(monday.plusDays(2));
        var moved = planning.movePlanDay(new WorkflowPlanningService.PlanDayMove(t.id(), monday.plusDays(2), monday.plusDays(4)));
        assertThat(moved.merged()).isFalse();
        planning.addPlanDay(t.id(), monday.plusDays(1));
        assertThat(planning.removePlanDay(t.id(), monday.plusDays(4))).extracting(PlanDay::date).containsExactly(monday.plusDays(1));
        assertThat(service.all().tasks()).hasSize(1);
        assertThatThrownBy(() -> planning.movePlanDay(new WorkflowPlanningService.PlanDayMove(t.id(), monday.plusDays(6), monday))).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test void weeklySelectionAndPlanDaysStayDistinctInTheUnion() {
        var p = project(); var selected = task(p); var planned = task(p); var both = task(p); var outside = task(p);
        planning.selectTask(monday, selected.id()); planning.selectTask(monday, both.id());
        planning.addPlanDay(planned.id(), monday.plusDays(1)); planning.addPlanDay(both.id(), monday.plusDays(3)); planning.addPlanDay(both.id(), monday.plusDays(4));
        planning.addPlanDay(outside.id(), monday.plusDays(7));
        var week = planning.includeProject(monday, p.id(), new WorkflowPlanningService.ProjectInclusion("Finish the core"));
        assertThat(week.projects()).extracting(WorkflowPlanningService.WeekProject::scopeLine).containsExactly("Finish the core");
        var byId = new HashMap<UUID, WorkflowPlanningService.WeekTask>(); week.tasks().forEach(w -> byId.put(w.taskId(), w));
        assertThat(byId).containsOnlyKeys(selected.id(), planned.id(), both.id());
        assertThat(byId.get(selected.id()).selected()).isTrue(); assertThat(byId.get(selected.id()).plannedDates()).isEmpty();
        assertThat(byId.get(planned.id()).selected()).isFalse(); assertThat(byId.get(planned.id()).plannedDates()).containsExactly(monday.plusDays(1));
        assertThat(byId.get(both.id()).plannedDates()).containsExactly(monday.plusDays(3), monday.plusDays(4));
        var unselected = planning.unselectTask(monday, both.id());
        assertThat(unselected.tasks()).filteredOn(w -> w.taskId().equals(both.id())).singleElement()
            .satisfies(w -> { assertThat(w.selected()).isFalse(); assertThat(w.plannedDates()).hasSize(2); });
        assertThat(planning.excludeProject(monday, p.id()).projects()).isEmpty();
        assertThatThrownBy(() -> planning.week(monday.plusDays(1))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void focusAreaAlwaysHasExactlyThreeOrderedSlots() {
        var empty = planning.week(monday);
        assertThat(empty.focusSlots()).hasSize(3).allSatisfy(s -> { assertThat(s.title()).isEmpty(); assertThat(s.memo()).isEmpty(); });
        var slots = List.of(new WorkflowPlanningService.FocusSlot(0, "", ""), new WorkflowPlanningService.FocusSlot(1, "Second", "memo"), new WorkflowPlanningService.FocusSlot(2, "Third", ""));
        var saved = planning.saveContent(monday, new WorkflowPlanningService.WeekContent(0L, slots, List.of(new WorkflowPlanningService.WeekGoal(null, "Goal", false, 0))));
        assertThat(saved.focusSlots()).extracting(WorkflowPlanningService.FocusSlot::title).containsExactly("", "Second", "Third");
        assertThat(saved.goals()).extracting(WorkflowPlanningService.WeekGoal::text).containsExactly("Goal");
        var reordered = List.of(slots.get(2), slots.get(0), slots.get(1));
        assertThat(planning.saveContent(monday, new WorkflowPlanningService.WeekContent(saved.revision(), reordered, List.of())).focusSlots())
            .extracting(WorkflowPlanningService.FocusSlot::title).containsExactly("Third", "", "Second");
        assertThatThrownBy(() -> planning.saveContent(monday, new WorkflowPlanningService.WeekContent(saved.revision(), slots, List.of()))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> planning.saveContent(monday, new WorkflowPlanningService.WeekContent(2L, slots.subList(0, 2), List.of()))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void addToTodayIsIdempotentAndCreatesOnePrimaryReferenceAndPlacement() {
        var t = task(project());
        var first = service.addToday(t.id(), today);
        assertThat(first.created()).isTrue(); assertThat(first.planDayCreated()).isTrue();
        var again = service.addToday(t.id(), today);
        assertThat(again.created()).isFalse(); assertThat(again.planDayCreated()).isFalse(); assertThat(again.blockId()).isEqualTo(first.blockId());
        var refs = service.day(today).blocks().stream().filter(b -> t.id().equals(b.workTaskId())).toList();
        assertThat(refs).singleElement().satisfies(b -> assertThat(b.metadata()).containsEntry("taskRef", "primary"));
        assertThat(planning.planDays(t.id())).extracting(PlanDay::date).containsExactly(today);
        assertThat(service.all().tasks()).hasSize(1);
        assertThat(projections.plan(today, today)).singleElement().satisfies(p -> assertThat(p.task().id()).isEqualTo(t.id()));
    }

    @Test void continuePreservesTheSourceWorkpadAndCopiesNothing() {
        var p = project(); var created = task(p);
        var t = service.patchTask(created.id(), patch(created, "deadlineDate", today.plusDays(9).toString()));
        var ref = service.addToday(t.id(), today);
        var child = new Block(UUID.randomUUID(), ref.blockId(), 0, "TEXT", "Research notes", false, null, null, null, Map.of());
        var source = service.day(today); var blocks = new ArrayList<>(source.blocks()); blocks.add(child);
        var savedSource = service.saveDay(today, new Day(today, source.revision(), blocks));
        var next = service.continueTask(t.id(), today.plusDays(1));
        assertThat(next.created()).isTrue();
        assertThat(service.day(today)).isEqualTo(savedSource);
        assertThat(next.day().blocks()).singleElement().satisfies(b -> { assertThat(b.workTaskId()).isEqualTo(t.id()); assertThat(b.parentId()).isNull(); });
        assertThat(service.continueTask(t.id(), today.plusDays(1)).created()).isFalse();
        assertThat(planning.planDays(t.id())).extracting(PlanDay::date).containsExactly(today, today.plusDays(1));
        assertThat(service.task(t.id()).deadlineDate()).isEqualTo(today.plusDays(9));
        // Recent records derive from TaskReferences, newest Workpad date first, with the first meaningful child line.
        var records = projections.recentForProject(p.id(), 10);
        assertThat(records).extracting(WorkflowProjectionService.RecentRecord::date).containsExactly(today.plusDays(1), today);
        assertThat(records.get(1).excerpt()).isEqualTo("Research notes"); assertThat(records.get(1).href()).contains("date=" + today);
        assertThat(projections.recentForTask(t.id(), 1)).hasSize(1);
    }

    @Test void archiveIsSeparateFromDone() {
        var t = task(project());
        var archived = service.archiveTask(t.id(), new ArchiveChange(true, t.revision()));
        assertThat(archived.archivedAt()).isNotNull(); assertThat(archived.status()).isEqualTo("TODO"); assertThat(archived.completedAt()).isNull();
        var restored = service.archiveTask(t.id(), new ArchiveChange(false, archived.revision()));
        assertThat(restored.archivedAt()).isNull();
        assertThat(events(t.id())).containsExactly("ARCHIVED", "RESTORED");
        var waiting = service.changeStatus(t.id(), new StatusChange("WAITING", restored.revision(), null, null, today, false));
        service.archiveTask(t.id(), new ArchiveChange(true, waiting.revision()));
        assertThat(projections.waiting(today).readyToCheck()).isEmpty();
        var copy = service.duplicateTask(t.id());
        assertThat(copy.id()).isNotEqualTo(t.id()); assertThat(copy.status()).isEqualTo("TODO"); assertThat(copy.archivedAt()).isNull();
    }

    @Test void resourceLinksReferenceNotesOrUrlsWithinTheOwnerScope() {
        var p = project(); var t = task(p);
        UUID note = UUID.randomUUID(), foreignNote = UUID.randomUUID(), other = UUID.randomUUID();
        db.update("insert into journal_notes(id,workflow_owner_id,title) values(?,?,?)", note, user, "Design decisions");
        db.update("insert into auth.users values(?)", other);
        db.update("insert into journal_notes(id,workflow_owner_id,title) values(?,?,?)", foreignNote, other, "Private");
        var noteLink = resources.create(new WorkflowResourceService.ResourceInput(p.id(), null, note, null, null, null, null, true));
        assertThat(noteLink.type()).isEqualTo("NOTE"); assertThat(noteLink.title()).isEqualTo("Design decisions"); assertThat(noteLink.noteId()).isEqualTo(note);
        var drive = resources.create(new WorkflowResourceService.ResourceInput(null, t.id(), null, "https://docs.google.com/document/d/abc", "Spec", null, "latest", null));
        assertThat(drive.type()).isEqualTo("DRIVE");
        var pr = resources.create(new WorkflowResourceService.ResourceInput(null, t.id(), null, "https://github.com/o/r/pull/1", null, null, null, null));
        assertThat(pr.type()).isEqualTo("GIT");
        assertThat(resources.list(null, t.id())).extracting(WorkflowResourceService.Resource::id).containsExactly(drive.id(), pr.id());
        assertThatThrownBy(() -> resources.create(new WorkflowResourceService.ResourceInput(p.id(), null, foreignNote, null, null, null, null, null))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> resources.create(new WorkflowResourceService.ResourceInput(p.id(), null, null, "javascript:alert(1)", null, null, null, null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> resources.create(new WorkflowResourceService.ResourceInput(p.id(), t.id(), null, "https://example.com", null, null, null, null))).isInstanceOf(InvalidRequestException.class);
        planning.reorder(new WorkflowPlanningService.Reorder("resources:task:" + t.id(), List.of(pr.id(), drive.id())));
        assertThat(resources.list(null, t.id())).extracting(WorkflowResourceService.Resource::id).containsExactly(pr.id(), drive.id());
        wire(other);
        assertThatThrownBy(() -> resources.list(p.id(), null)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> resources.get(noteLink.id())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test void reorderIsTransactionalAndRequiresTheCompleteScope() {
        var p = project(); var a = task(p); var b = task(p); var c = task(p);
        planning.reorder(new WorkflowPlanningService.Reorder("tasks:" + p.id() + ":none", List.of(c.id(), a.id(), b.id())));
        assertThat(service.all().tasks()).extracting(Task::id).containsExactly(c.id(), a.id(), b.id());
        assertThat(service.task(a.id()).revision()).isEqualTo(a.revision() + 1);
        assertThatThrownBy(() -> planning.reorder(new WorkflowPlanningService.Reorder("tasks:" + p.id() + ":none", List.of(a.id(), b.id())))).isInstanceOf(OptimisticLockConflictException.class);
        planning.addPlanDay(a.id(), today); planning.addPlanDay(b.id(), today);
        planning.reorder(new WorkflowPlanningService.Reorder("day:" + today, List.of(b.id(), a.id())));
        assertThat(projections.plan(today, today)).extracting(pt -> pt.task().id()).containsExactly(b.id(), a.id());
        assertThatThrownBy(() -> planning.reorder(new WorkflowPlanningService.Reorder("bogus", List.of()))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void phaseWeightOverrideAndLegacyStatusPatchAreRevisionChecked() {
        var p = project();
        var ph = service.savePhase(null, new Phase(null, p.id(), "기획", null, null, null, null, 0));
        assertThat(ph.weight()).isNull(); assertThat(ph.progressOverride()).isNull();
        var edited = service.patchPhase(ph.id(), Map.of("expectedRevision", 0, "weight", 25, "progressOverride", 60, "status", "DOING"));
        assertThat(edited.weight()).isEqualByComparingTo("25"); assertThat(edited.progressOverride()).isEqualTo(60); assertThat(edited.status()).isEqualTo("DOING");
        var cleared = service.patchPhase(ph.id(), new HashMap<>(Map.of("expectedRevision", 1)) {{ put("progressOverride", null); }});
        assertThat(cleared.progressOverride()).isNull();
        assertThatThrownBy(() -> service.patchPhase(ph.id(), Map.of("expectedRevision", 0, "title", "stale"))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> service.patchPhase(ph.id(), Map.of("expectedRevision", 2, "weight", 120))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void workpadLinkedTitleSaveBumpsTaskRevision() {
        var t = task(project());
        var ref = service.addToday(t.id(), today);
        var revision = service.task(t.id()).revision();
        var day = service.day(today);
        var renamed = day.blocks().stream().map(b -> b.id().equals(ref.blockId()) ? new Block(b.id(), b.parentId(), b.order(), b.type(), "Renamed in Workpad", b.checked(), b.workTaskId(), null, null, b.metadata()) : b).toList();
        service.saveDay(today, new DaySave(today, day.revision(), renamed, Map.of(t.id(), "Renamed in Workpad")));
        assertThat(service.task(t.id()).revision()).isGreaterThan(revision);
    }
}
