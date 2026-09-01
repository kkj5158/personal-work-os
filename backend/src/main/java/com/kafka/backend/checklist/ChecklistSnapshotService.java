package com.kafka.backend.checklist;

import com.kafka.backend.workrecord.WorkRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Populates a WorkRecord's daily checklist the first time it becomes
 * work-included. Idempotent by design: if the record already has any
 * {@link ChecklistDailyEntry} rows (whether from an earlier snapshot, or
 * preserved from a previous work-included period before a non-work
 * detour), nothing happens — this is exactly what makes "returning to a
 * work-included status restores the preserved results, without duplicating
 * them" fall out for free, with no explicit restore step needed.
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
        if (dailyEntryRepository.existsByWorkRecordId(record.getId())) {
            return;
        }

        UUID userId = record.getUserId();
        LocalDate workDate = record.getWorkDate();
        List<ChecklistItem> items = itemRepository.findByUserIdAndDeletedAtIsNullOrderByPositionAsc(userId);

        int position = 0;
        for (ChecklistItem item : items) {
            Optional<ChecklistItemVersion> version = versionRepository
                    .findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(item.getId(), workDate);
            if (version.isEmpty() || !version.get().isActive()) {
                continue;
            }
            ChecklistItemVersion applicable = version.get();
            int goalPercent = applicable.getGoalOverridePercent() != null
                    ? applicable.getGoalOverridePercent()
                    : goalService.effectiveGoalPercent(userId, workDate);

            dailyEntryRepository.save(new ChecklistDailyEntry(
                    record.getId(),
                    item.getId(),
                    userId,
                    workDate,
                    applicable.getName(),
                    applicable.getEmoji(),
                    applicable.getPriority(),
                    goalPercent,
                    position
            ));
            position++;
        }
    }
}
