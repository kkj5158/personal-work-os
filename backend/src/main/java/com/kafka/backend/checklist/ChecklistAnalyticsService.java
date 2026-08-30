package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Backs the three checklist analytics views (Overall Achievement Trend,
 * Achievement by Item, Individual Item Tracking). The one policy every
 * method here shares: the DAY is the equal-weight evaluation unit — period
 * rates are always the mean of each valid day's own rate, never a pooled
 * count across days (see docs/backend/checklist.md §"Achievement
 * calculation").
 */
@Service
public class ChecklistAnalyticsService {

    private final ChecklistDailyEntryRepository dailyEntryRepository;
    private final ChecklistItemRepository itemRepository;
    private final ChecklistItemVersionRepository versionRepository;
    private final ChecklistCategoryRepository categoryRepository;
    private final ChecklistGoalService goalService;
    private final WorkRecordRepository workRecordRepository;
    private final CurrentUserProvider currentUserProvider;

    public ChecklistAnalyticsService(
            ChecklistDailyEntryRepository dailyEntryRepository,
            ChecklistItemRepository itemRepository,
            ChecklistItemVersionRepository versionRepository,
            ChecklistCategoryRepository categoryRepository,
            ChecklistGoalService goalService,
            WorkRecordRepository workRecordRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.dailyEntryRepository = dailyEntryRepository;
        this.itemRepository = itemRepository;
        this.versionRepository = versionRepository;
        this.categoryRepository = categoryRepository;
        this.goalService = goalService;
        this.workRecordRepository = workRecordRepository;
        this.currentUserProvider = currentUserProvider;
    }

    public static AchievementResolution resolveResolution(LocalDate from, LocalDate to) {
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        if (days <= 31) return AchievementResolution.DAILY;
        if (days <= 186) return AchievementResolution.WEEKLY;
        return AchievementResolution.MONTHLY;
    }

    // --- View 1: Overall Achievement Trend ---

    public List<AchievementPoint> overallTrend(LocalDate from, LocalDate to) {
        validateRange(from, to);
        UUID userId = currentUserProvider.getCurrentUserId();
        AchievementResolution resolution = resolveResolution(from, to);
        List<DayAchievement> days = computeDailyAchievements(userId, from, to);

        Map<LocalDate, List<DayAchievement>> buckets = groupByBucket(days, resolution);
        List<AchievementPoint> points = new ArrayList<>();
        LocalDate bucketStart = bucketStart(from, resolution);
        LocalDate lastBucket = bucketStart(to, resolution);
        while (!bucketStart.isAfter(lastBucket)) {
            LocalDate bucketEnd = bucketEnd(bucketStart, resolution);
            List<DayAchievement> bucketDays = buckets.getOrDefault(bucketStart, List.of());

            Double overall = meanRate(bucketDays, DayAchievement::achievedTotal, DayAchievement::applicableTotal);
            Double core = meanRate(bucketDays, DayAchievement::achievedCore, DayAchievement::applicableCore);
            Double secondary = meanRate(bucketDays, DayAchievement::achievedSecondary, DayAchievement::applicableSecondary);
            int goalPercent = goalService.effectiveGoalPercent(userId, bucketEnd);

            points.add(new AchievementPoint(label(bucketStart, resolution), bucketStart, bucketEnd, overall, core, secondary, goalPercent, bucketDays.size()));
            bucketStart = advanceBucket(bucketStart, resolution);
        }
        return points;
    }

    // --- View 2: Achievement by Item ---

    public List<ItemBreakdownEntry> byItem(LocalDate from, LocalDate to, ChecklistPriority filter, boolean includeDeleted) {
        validateRange(from, to);
        UUID userId = currentUserProvider.getCurrentUserId();
        Map<LocalDate, WorkRecord> recordsByDate = loadWorkdayRecordsByDate(userId, from, to);

        List<ChecklistDailyEntry> entries = dailyEntryRepository.findByUserIdAndWorkDateBetween(userId, from, to);
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);

        Map<UUID, int[]> countsByItem = new HashMap<>(); // [achieved, applicable]
        Map<UUID, ChecklistDailyEntry> latestEntryByItem = new HashMap<>();
        for (ChecklistDailyEntry entry : entries) {
            if (entry.getWorkDate().equals(today)) continue;
            if (!recordsByDate.containsKey(entry.getWorkDate())) continue;
            if (filter != null && entry.getPriority() != filter) continue;

            int[] counts = countsByItem.computeIfAbsent(entry.getItemId(), k -> new int[2]);
            counts[1]++;
            if (entry.isAchieved()) counts[0]++;

            ChecklistDailyEntry latest = latestEntryByItem.get(entry.getItemId());
            if (latest == null || entry.getWorkDate().isAfter(latest.getWorkDate())) {
                latestEntryByItem.put(entry.getItemId(), entry);
            }
        }

        List<UUID> itemIds = itemRepository.findByUserId(userId).stream()
                .filter(i -> includeDeleted || !i.isDeleted())
                .map(ChecklistItem::getId)
                .toList();

        List<ItemBreakdownEntry> result = new ArrayList<>();
        Map<UUID, Boolean> deletedFlags = new HashMap<>();
        Map<UUID, ChecklistItem> itemsById = new HashMap<>();
        for (ChecklistItem item : itemRepository.findByUserId(userId)) {
            deletedFlags.put(item.getId(), item.isDeleted());
            itemsById.put(item.getId(), item);
        }

        for (Map.Entry<UUID, int[]> entry : countsByItem.entrySet()) {
            UUID itemId = entry.getKey();
            if (!itemIds.contains(itemId)) continue;
            int[] counts = entry.getValue();
            ChecklistDailyEntry latest = latestEntryByItem.get(itemId);
            ChecklistItem item = itemsById.get(itemId);
            double rate = counts[1] == 0 ? 0.0 : (double) counts[0] / counts[1];

            result.add(new ItemBreakdownEntry(
                    itemId,
                    item != null ? item.getCategoryId() : null,
                    item != null ? item.getPosition() : Integer.MAX_VALUE,
                    latest.getName(),
                    latest.getEmoji(),
                    latest.getPriority(),
                    counts[0],
                    counts[1],
                    rate,
                    latest.getGoalPercent(),
                    Boolean.TRUE.equals(deletedFlags.get(itemId))
            ));
        }

        // Canonical order only — never sorted by achievement rate. Matches
        // the exact (category.position, item.position) compound order
        // ChecklistDailyService.getMatrix already uses, so this view, the
        // record table, and the Individual Tracking selector never disagree
        // on "what order are my items in." No leaderboard, no ranking.
        Map<UUID, Integer> categoryPositionById = new HashMap<>();
        for (ChecklistCategory category : categoryRepository.findByUserIdOrderByPositionAscNameAsc(userId)) {
            categoryPositionById.put(category.getId(), category.getPosition());
        }
        result.sort(
                Comparator.<ItemBreakdownEntry>comparingInt(e -> e.categoryId() != null ? categoryPositionById.getOrDefault(e.categoryId(), Integer.MAX_VALUE - 1) : Integer.MAX_VALUE)
                        .thenComparingInt(ItemBreakdownEntry::position)
        );
        return result;
    }

    // --- View 3: Individual Item Tracking ---

    public List<ItemTrendPoint> itemTrend(UUID itemId, LocalDate from, LocalDate to) {
        validateRange(from, to);
        UUID userId = currentUserProvider.getCurrentUserId();
        AchievementResolution resolution = resolveResolution(from, to);
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);

        List<ChecklistDailyEntry> entries = dailyEntryRepository
                .findByUserIdAndItemIdAndWorkDateBetweenOrderByWorkDateAsc(userId, itemId, from, to)
                .stream()
                .filter(e -> !e.getWorkDate().equals(today))
                .toList();

        Map<LocalDate, WorkRecord> recordsByDate = loadWorkdayRecordsByDate(userId, from, to);
        List<ChecklistDailyEntry> applicableEntries = entries.stream()
                .filter(e -> recordsByDate.containsKey(e.getWorkDate()))
                .toList();

        Map<LocalDate, List<ChecklistDailyEntry>> buckets = new TreeMap<>();
        for (ChecklistDailyEntry entry : applicableEntries) {
            LocalDate bucketStart = bucketStart(entry.getWorkDate(), resolution);
            buckets.computeIfAbsent(bucketStart, k -> new ArrayList<>()).add(entry);
        }

        List<ItemTrendPoint> points = new ArrayList<>();
        LocalDate cursor = bucketStart(from, resolution);
        LocalDate lastBucket = bucketStart(to, resolution);
        while (!cursor.isAfter(lastBucket)) {
            LocalDate bucketEnd = bucketEnd(cursor, resolution);
            List<ChecklistDailyEntry> bucketEntries = buckets.get(cursor);
            if (bucketEntries == null || bucketEntries.isEmpty()) {
                points.add(new ItemTrendPoint(label(cursor, resolution), cursor, bucketEnd, null, null, null, null, "NO_DATA"));
            } else {
                int achieved = (int) bucketEntries.stream().filter(ChecklistDailyEntry::isAchieved).count();
                int applicable = bucketEntries.size();
                int goalPercent = bucketEntries.get(bucketEntries.size() - 1).getGoalPercent();
                points.add(new ItemTrendPoint(label(cursor, resolution), cursor, bucketEnd,
                        achieved, applicable, (double) achieved / applicable, goalPercent, "ACTIVE"));
            }
            cursor = advanceBucket(cursor, resolution);
        }
        return points;
    }

    // --- Shared day-level computation ---

    private record DayAchievement(LocalDate date, int achievedCore, int applicableCore, int achievedSecondary, int applicableSecondary) {
        int achievedTotal() {
            return achievedCore + achievedSecondary;
        }

        int applicableTotal() {
            return applicableCore + applicableSecondary;
        }
    }

    private List<DayAchievement> computeDailyAchievements(UUID userId, LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        Map<LocalDate, WorkRecord> recordsByDate = loadWorkdayRecordsByDate(userId, from, to);
        List<ChecklistDailyEntry> entries = dailyEntryRepository.findByUserIdAndWorkDateBetween(userId, from, to);

        Map<LocalDate, List<ChecklistDailyEntry>> entriesByDate = new HashMap<>();
        for (ChecklistDailyEntry entry : entries) {
            entriesByDate.computeIfAbsent(entry.getWorkDate(), k -> new ArrayList<>()).add(entry);
        }

        List<DayAchievement> result = new ArrayList<>();
        for (Map.Entry<LocalDate, WorkRecord> recordEntry : recordsByDate.entrySet()) {
            LocalDate date = recordEntry.getKey();
            if (date.equals(today)) continue; // today is never a confirmed day yet

            List<ChecklistDailyEntry> dayEntries = entriesByDate.getOrDefault(date, List.of());
            int achievedCore = 0, applicableCore = 0, achievedSecondary = 0, applicableSecondary = 0;
            for (ChecklistDailyEntry entry : dayEntries) {
                if (entry.getPriority() == ChecklistPriority.CORE) {
                    applicableCore++;
                    if (entry.isAchieved()) achievedCore++;
                } else {
                    applicableSecondary++;
                    if (entry.isAchieved()) achievedSecondary++;
                }
            }
            if (applicableCore + applicableSecondary == 0) continue; // fully inactive day — excluded
            result.add(new DayAchievement(date, achievedCore, applicableCore, achievedSecondary, applicableSecondary));
        }
        return result;
    }

    private Map<LocalDate, WorkRecord> loadWorkdayRecordsByDate(UUID userId, LocalDate from, LocalDate to) {
        Map<LocalDate, WorkRecord> map = new HashMap<>();
        for (WorkRecord record : workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to)) {
            if (record.getStatus().isWorkday()) {
                map.put(record.getWorkDate(), record);
            }
        }
        return map;
    }

    private Double meanRate(List<DayAchievement> days, java.util.function.ToIntFunction<DayAchievement> achieved, java.util.function.ToIntFunction<DayAchievement> applicable) {
        double sum = 0;
        int count = 0;
        for (DayAchievement day : days) {
            int a = applicable.applyAsInt(day);
            if (a == 0) continue;
            sum += (double) achieved.applyAsInt(day) / a;
            count++;
        }
        return count == 0 ? null : sum / count;
    }

    private Map<LocalDate, List<DayAchievement>> groupByBucket(List<DayAchievement> days, AchievementResolution resolution) {
        Map<LocalDate, List<DayAchievement>> buckets = new TreeMap<>();
        for (DayAchievement day : days) {
            buckets.computeIfAbsent(bucketStart(day.date(), resolution), k -> new ArrayList<>()).add(day);
        }
        return buckets;
    }

    private LocalDate bucketStart(LocalDate date, AchievementResolution resolution) {
        return switch (resolution) {
            case DAILY -> date;
            case WEEKLY -> date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            case MONTHLY -> YearMonth.from(date).atDay(1);
        };
    }

    private LocalDate bucketEnd(LocalDate bucketStart, AchievementResolution resolution) {
        return switch (resolution) {
            case DAILY -> bucketStart;
            case WEEKLY -> bucketStart.plusDays(6);
            case MONTHLY -> YearMonth.from(bucketStart).atEndOfMonth();
        };
    }

    private LocalDate advanceBucket(LocalDate bucketStart, AchievementResolution resolution) {
        return switch (resolution) {
            case DAILY -> bucketStart.plusDays(1);
            case WEEKLY -> bucketStart.plusWeeks(1);
            case MONTHLY -> bucketStart.plusMonths(1);
        };
    }

    private String label(LocalDate bucketStart, AchievementResolution resolution) {
        return switch (resolution) {
            case DAILY -> bucketStart.format(DateTimeFormatter.ISO_LOCAL_DATE);
            case WEEKLY -> bucketStart.format(DateTimeFormatter.ISO_LOCAL_DATE);
            case MONTHLY -> YearMonth.from(bucketStart).toString();
        };
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
    }
}
