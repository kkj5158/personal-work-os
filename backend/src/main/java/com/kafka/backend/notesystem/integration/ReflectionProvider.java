package com.kafka.backend.notesystem.integration;

import java.time.*;
import java.util.*;

/** Boundary only: implementations belong to WORK_OS. No Note-owned reflection table. */
public interface ReflectionProvider {
    enum DisplayMode { COMPARE, ACTUAL_ONLY, PLAN_ONLY, TEXT_ONLY }
    enum ReflectionEntryStatus { EDITING, COMPLETED }
    record TimeBlock(String sourceId,LocalTime startTime,LocalTime endTime,int durationMinutes,String label,String categoryId,String categoryLabel,String semanticType) {}
    /** planned/actual minutes for one domain slice (WORK or LIFE) of the day. */
    record TimeSummary(int plannedMinutes,int actualMinutes) {}
    record StateSegment(LocalTime startTime,LocalTime endTime,String stateGroup,String label) {}
    record WorkSummary(int plannedMinutes,int actualMinutes) {}
    record ChecklistSummary(int completed,int total) {}
    record Snapshot(
            LocalDate date,Instant generatedAt,
            List<TimeBlock> plannedBlocks,List<TimeBlock> actualBlocks,List<StateSegment> stateBlocks,
            WorkSummary workSummary,TimeSummary lifeSummary,ChecklistSummary checklistSummary
    ) {
        public Snapshot {plannedBlocks=List.copyOf(plannedBlocks);actualBlocks=List.copyOf(actualBlocks);stateBlocks=List.copyOf(stateBlocks);}
    }
    record Entry(UUID id,LocalDate date,String content,ReflectionEntryStatus status,long version,Snapshot snapshot,String workOsRoute) {}
    Optional<Entry> findMain(UUID owner,LocalDate date);
    Entry createMain(UUID owner,LocalDate date);
    Entry updateMain(UUID owner,UUID reflectionId,String content,long expectedVersion);
    Entry complete(UUID owner,UUID reflectionId,long expectedVersion);
    Entry reopen(UUID owner,UUID reflectionId,long expectedVersion);
    Snapshot frozenSnapshot(UUID owner,UUID reflectionId);
}
