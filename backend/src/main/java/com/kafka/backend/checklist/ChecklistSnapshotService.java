package com.kafka.backend.checklist;

import com.kafka.backend.workrecord.WorkRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Ensures a WorkRecord's daily checklist has an entry for every currently
 * eligible item — called both when a date's attendance is saved
 * (WorkRecordService.applyUpsert) and defensively on every checklist read
 * (ChecklistDailyService), so an item that becomes eligible (created, or
 * scheduled active as of this date) *after* the record's first save still
 * appears, without a full re-snapshot.
 *
 * Idempotent per (record, item) pair, not per record: an item that already
 * has a {@link ChecklistDailyEntry} for this record — whether from an
 * earlier call here, or preserved from a previous work-included period
 * before a non-work detour — is left untouched (never re-created, never
 * duplicated; {@code checklist_daily_entries} also enforces this with a
 * unique (work_record_id, item_id) constraint). This is what makes
 * "returning to a work-included status restores the preserved results"
 * fall out for free, with no explicit restore step needed.
 */
@Service
public class ChecklistSnapshotService {

    private final ChecklistItemRepository itemRepository;
    private final ChecklistItemVersionRepository versionRepository;
    private final ChecklistGoalService goalService;
    private final ChecklistDailyEntryRepository dailyEntryRepository;

    public ChecklistSnapshotService(
            ChecklistItemRepository itemRepository,
            ChecklistItemVersionRepository versionRepository,
            ChecklistGoalService goalService,
            ChecklistDailyEntryRepository dailyEntryRepository
    ) {
        this.itemRepository = itemRepository;
        this.versionRepository = versionRepository;
        this.goalService = goalService;
        this.dailyEntryRepository = dailyEntryRepository;
    }

    @Transactional
    public void ensureSnapshot(WorkRecord record) {
        if (!record.getStatus().isWorkday()) {
            return;
        }

        UUID userId = record.getUserId();
        LocalDate workDate = record.getWorkDate();
        List<ChecklistItem> items = itemRepository.findByUserIdAndDeletedAtIsNullOrderByPositionAsc(userId);
        if (items.isEmpty()) {
            return;
        }

        List<ChecklistDailyEntry> existing = dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.getId());
        Set<UUID> existingItemIds = new HashSet<>();
        for (ChecklistDailyEntry entry : existing) {
            existingItemIds.add(entry.getItemId());
        }
        int nextPosition = existing.size();

        for (ChecklistItem item : items) {
            if (existingItemIds.contains(item.getId())) {
                continue;
            }
            Optional<ChecklistItemVersion> version = versionRepository
                    .findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(item.getId(), workDate);
            if (version.isEmpty() || !version.get().isActive()) {
                continue;
            }
            ChecklistItemVersion applicable = version.get();
            int goalPercent = applicable.getGoalOverridePercent() != null
                    ? applicable.getGoalOverridePercent()
                    : goalService.effectiveGoalPercent(userId, workDate);

            dailyEntryRepository.insertIfAbsent(
                    UUID.randomUUID(),
                    record.getId(),
                    item.getId(),
                    userId,
                    workDate,
                    applicable.getName(),
                    applicable.getEmoji(),
                    applicable.getPriority().name(),
                    goalPercent,
                    nextPosition
            );
            nextPosition++;
        }
    }
}
