package com.kafka.backend.workflow;

import java.time.LocalDate;
import java.util.*;

public final class WorkflowTypes {
    private WorkflowTypes() {}
    public record Project(UUID id, String title, String status, LocalDate startDate, LocalDate endDate, String color, String memo, Integer order) {}
    public record Phase(UUID id, UUID projectId, String title, String status, LocalDate startDate, LocalDate endDate, String memo, Integer order) {}
    public record Task(UUID id, String title, String status, UUID projectId, UUID phaseId, String priority, LocalDate startDate, LocalDate dueDate, String memo, Integer order) {}
    public record Aggregate(List<Project> projects, List<Phase> phases, List<Task> tasks) {}
    public record Block(UUID id, UUID parentId, int order, String type, String content, boolean checked, UUID workTaskId, UUID sourceBlockId, LocalDate sourceDate, Map<String,Object> metadata) {}
    public record Day(LocalDate date, long revision, List<Block> blocks) {}
    public record DaySave(LocalDate date, long revision, List<Block> blocks, Map<UUID,String> taskTitles) {}
    public record BlockAction(UUID blockId) {}
    public record Carry(List<UUID> blockIds, LocalDate targetDate) {}
    public record Move(List<UUID> blockIds, LocalDate targetDate, Long expectedSourceRevision, Long expectedTargetRevision, Boolean incompleteOnly) {}
    public record MoveResult(Day source, Day target, List<UUID> movedBlockIds, UUID undoToken) {}
    public record AddToday(LocalDate date) {}
}
