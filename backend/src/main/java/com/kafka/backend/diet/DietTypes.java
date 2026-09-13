package com.kafka.backend.diet;

import java.time.LocalDate;
import java.util.*;

public final class DietTypes {
    private DietTypes() {}
    public enum Importance { CORE, SECONDARY, OPTIONAL }
    public enum CheckState { SUCCESS, FAILURE, MISSING }
    public enum ChallengeType { WEIGHT, CHECKLIST, MANUAL }
    public enum ChallengeStatus { WAITING, ACTIVE, COMPLETED, STOPPED }
    public enum GoalMode { RATE, COUNT }
    public enum GoalKind { SHORT_TERM, WEEKLY, MONTHLY, FINAL }
    public record DailyRecord(LocalDate date, Double morningWeight, Double targetWeight,
        Double morningGlucose, Double morningBreathKetone, Double bedtimeGlucose, Double bedtimeBreathKetone,
        Double morningBloodKetone, Double bedtimeBloodKetone, Double waistCircumference, Double fastingHours) {}
    public record ChecklistItem(UUID id, String title, Importance importance, String keyPoint, int sortOrder,
        Integer weeklyReference, Integer monthlyReference, boolean active, LocalDate startDate) {}
    public record DailyCheck(LocalDate date, UUID itemId, CheckState state, String memo) {}
    public record Challenge(UUID id, String title, ChallengeType type, ChallengeStatus status,
        LocalDate startDate, LocalDate endDate, String color, String keyPoint, List<String> notes, int sortOrder,
        Double startWeight, Double targetWeight, List<UUID> itemIds, GoalMode goalMode, boolean includeMissing,
        Double currentValue, Double targetValue) {}
    public record WeightGoal(UUID id, UUID challengeId, GoalKind kind, LocalDate date, Double value) {}
    public record Milestone(UUID id, UUID challengeId, LocalDate date, Double value, String title, String memo) {}
    public record OrderInput(List<UUID> ids) {}
    public record Data(List<DailyRecord> days, List<ChecklistItem> items, List<DailyCheck> checks,
        List<Challenge> challenges, List<WeightGoal> goals, List<Milestone> milestones, Map<String,Object> settings) {}
}
