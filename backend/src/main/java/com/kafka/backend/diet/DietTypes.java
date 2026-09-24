package com.kafka.backend.diet;

import java.time.LocalDate;
import java.util.*;

public final class DietTypes {
    private DietTypes() {}
    public enum Importance { CORE, SECONDARY, OPTIONAL }
    public enum CheckState { SUCCESS, FAILURE, MISSING, UNRECORDED }
    public enum ChallengeType { WEIGHT, CHECKLIST, MANUAL }
    public enum ChallengeStatus { WAITING, ACTIVE, COMPLETED, STOPPED }
    public enum ChallengeRole { CURRENT_FOCUS, NEXT_FOCUS, FINAL_GOAL }
    public enum GoalMode { RATE, COUNT }
    public enum GoalKind { SHORT_TERM, WEEKLY, MONTHLY, FINAL }
    public record DailyRecord(LocalDate date, Double morningWeight, Double targetWeight,
        Double morningGlucose, Double morningBreathKetone, Double bedtimeGlucose, Double bedtimeBreathKetone,
        Double morningBloodKetone, Double bedtimeBloodKetone, Double waistCircumference, Double fastingHours) {}
    public record ChecklistItem(UUID id, String title, Importance importance, String keyPoint, int sortOrder,
        Integer weeklyReference, Integer monthlyReference, boolean active, LocalDate startDate) {}
    public record DailyCheck(LocalDate date, UUID itemId, CheckState state, String memo) {}
    /** Batch state change; memo is preserved. MISSING clears the result back to untouched. */
    public record CheckChange(LocalDate date, UUID itemId, CheckState state) {}
    public record CheckChanges(List<CheckChange> changes) {}
    /** Inactive interval [archivedOn, restoredOn) — untouched dates inside it are not missing data. */
    public record ArchivePeriod(UUID itemId, LocalDate archivedOn, LocalDate restoredOn) {}
    public record Challenge(UUID id, String title, ChallengeType type, ChallengeStatus status,
        LocalDate startDate, LocalDate endDate, String color, String keyPoint, List<String> notes, int sortOrder,
        Double startWeight, Double targetWeight, List<UUID> itemIds, GoalMode goalMode, boolean includeMissing,
        Double currentValue, Double targetValue, ChallengeRole role, Integer homeSortOrder) {}
    public record WeightGoal(UUID id, GoalKind kind, LocalDate targetDate, Double targetWeight, String core, List<String> memoItems, LocalDate baselineDate, Double baselineWeight) {
        public WeightGoal(UUID id, GoalKind kind, LocalDate targetDate, Double targetWeight, String core, List<String> memoItems) {
            this(id, kind, targetDate, targetWeight, core, memoItems, null, null);
        }
    }
    public record Milestone(UUID id, UUID challengeId, LocalDate date, Double value, String title, String memo, List<String> memoItems) {}
    public record HomeOrderInput(ChallengeType type, List<UUID> ids) {}
    public record OrderInput(List<UUID> ids) {}
    public record Data(List<DailyRecord> days, List<ChecklistItem> items, List<DailyCheck> checks,
        List<Challenge> challenges, List<WeightGoal> goals, List<Milestone> milestones, Map<String,Object> settings,
        List<ArchivePeriod> archivePeriods) {
        public Data(List<DailyRecord> days, List<ChecklistItem> items, List<DailyCheck> checks,
            List<Challenge> challenges, List<WeightGoal> goals, List<Milestone> milestones, Map<String,Object> settings) {
            this(days, items, checks, challenges, goals, milestones, settings, List.of());
        }
    }
}
