package com.kafka.backend.workflow;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

public final class WorkflowTypes {
    private WorkflowTypes() {}
    /** V1 fields are nullable on input so legacy full-object writes never erase them. */
    public record Project(UUID id, String title, String status, LocalDate startDate, LocalDate endDate, String color, String memo, Integer order,
                          String projectType, String goal, Instant archivedAt, UUID nextTaskId, BigDecimal unassignedWeight, Long revision, UUID groupId) {
        public Project(UUID id, String title, String status, LocalDate startDate, LocalDate endDate, String color, String memo, Integer order) {
            this(id, title, status, startDate, endDate, color, memo, order, null, null, null, null, null, null, null);
        }
    }
    public record Phase(UUID id, UUID projectId, String title, String status, LocalDate startDate, LocalDate endDate, String memo, Integer order,
                        BigDecimal weight, Integer progressOverride, Long revision) {
        public Phase(UUID id, UUID projectId, String title, String status, LocalDate startDate, LocalDate endDate, String memo, Integer order) {
            this(id, projectId, title, status, startDate, endDate, memo, order, null, null, null);
        }
    }
    /** startDate/dueDate are the legacy Timeline range. deadlineDate is the V1 real deadline. */
    public record Task(UUID id, String title, String status, UUID projectId, UUID phaseId, String priority, LocalDate startDate, LocalDate dueDate, String memo, Integer order,
                       LocalDate deadlineDate, String waitingReason, String waitingNextAction, LocalDate waitingCheckDate, Boolean waitingFlagged,
                       String nextStep, Instant completedAt, String previousStatus, Instant archivedAt, Long revision, Instant updatedAt,
                       String waitingAgent, Instant waitingSince, Instant waitingCompletedAt) {
        public Task(UUID id, String title, String status, UUID projectId, UUID phaseId, String priority, LocalDate startDate, LocalDate dueDate, String memo, Integer order) {
            this(id, title, status, projectId, phaseId, priority, startDate, dueDate, memo, order, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        }
    }
    public record PlanDay(UUID taskId, LocalDate date, int order) {}
    public record Aggregate(List<Project> projects, List<Phase> phases, List<Task> tasks, List<PlanDay> planDays, List<ProjectGroup> groups) {
        public Aggregate(List<Project> projects, List<Phase> phases, List<Task> tasks) { this(projects, phases, tasks, List.of(), List.of()); }
    }
    /** Projects catalog grouping only; "그룹 없음" is the null groupId projection, never a stored group. */
    public record ProjectGroup(UUID id, String name, int order, long revision) {}
    public record GroupInput(String name, Long expectedRevision) {}
    /** Places a Project in a group (null = 그룹 없음) before another Project of that group (null = at the end). */
    public record ProjectMove(UUID groupId, UUID beforeProjectId, Long expectedRevision) {}
    public record Block(UUID id, UUID parentId, int order, String type, String content, boolean checked, UUID workTaskId, UUID sourceBlockId, LocalDate sourceDate, Map<String,Object> metadata) {}
    public record Day(LocalDate date, long revision, List<Block> blocks) {}
    public record DaySave(LocalDate date, long revision, List<Block> blocks, Map<UUID,String> taskTitles) {}
    public record BlockAction(UUID blockId) {}
    public record Carry(List<UUID> blockIds, LocalDate targetDate) {}
    public record Move(List<UUID> blockIds, LocalDate targetDate, Long expectedSourceRevision, Long expectedTargetRevision, Boolean incompleteOnly) {}
    public record MoveResult(Day source, Day target, List<UUID> movedBlockIds, UUID undoToken) {}
    public record AddToday(LocalDate date) {}
    /** Result of Add to Today / Continue: the reference is reused when it already exists. */
    public record TaskReferenceResult(Day day, UUID blockId, boolean created, boolean planDayCreated) {}
    /**
     * waitingAgent / waitingSince apply when entering WAITING (waitingSince lets an Undo restore the original waiting start).
     * completeWaiting = complete from the Waiting queue: the waiting context stays on the Task as completed Waiting history.
     */
    public record StatusChange(String status, Long expectedRevision, String waitingReason, String waitingNextAction,
                               LocalDate waitingCheckDate, Boolean waitingFlagged, String waitingAgent, Instant waitingSince, Boolean completeWaiting) {
        public StatusChange(String status, Long expectedRevision, String waitingReason, String waitingNextAction, LocalDate waitingCheckDate, Boolean waitingFlagged) {
            this(status, expectedRevision, waitingReason, waitingNextAction, waitingCheckDate, waitingFlagged, null, null, null);
        }
    }
    public record ArchiveChange(boolean archived, Long expectedRevision) {}
}
