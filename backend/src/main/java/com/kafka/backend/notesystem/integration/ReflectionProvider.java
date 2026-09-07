package com.kafka.backend.notesystem.integration;

import java.time.*;
import java.util.*;

/** Boundary only: implementations belong to WORK_OS. No Note-owned reflection table. */
public interface ReflectionProvider {
    enum DisplayMode { COMPARE, ACTUAL_ONLY, PLAN_ONLY, TEXT_ONLY }
    record TimeBlock(String sourceId,LocalTime startTime,LocalTime endTime,int durationMinutes,String label,String categoryId,String categoryLabel,String semanticType) {}
    record WorkSummary(int plannedMinutes,int actualMinutes) {}
    record ChecklistSummary(int completed,int total) {}
    record Snapshot(LocalDate date,Instant generatedAt,List<TimeBlock> plannedBlocks,List<TimeBlock> actualBlocks,WorkSummary workSummary,ChecklistSummary checklistSummary) {
        public Snapshot {plannedBlocks=List.copyOf(plannedBlocks);actualBlocks=List.copyOf(actualBlocks);}
    }
    record Entry(UUID id,LocalDate date,String content,long version,Snapshot snapshot,String workOsRoute) {}
    Optional<Entry> findMain(UUID owner,LocalDate date);
    Entry createMain(UUID owner,LocalDate date);
    Entry updateMain(UUID owner,UUID reflectionId,String content,long expectedVersion);
    Snapshot frozenSnapshot(UUID owner,UUID reflectionId);
}
