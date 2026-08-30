package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class ChecklistDailyService {

    private final ChecklistDailyEntryRepository dailyEntryRepository;
    private final WorkRecordRepository workRecordRepository;
    private final ChecklistItemRepository itemRepository;
    private final ChecklistItemVersionRepository versionRepository;
    private final ChecklistCategoryRepository categoryRepository;
    private final CurrentUserProvider currentUserProvider;

    public ChecklistDailyService(
            ChecklistDailyEntryRepository dailyEntryRepository,
            WorkRecordRepository workRecordRepository,
            ChecklistItemRepository itemRepository,
            ChecklistItemVersionRepository versionRepository,
            ChecklistCategoryRepository categoryRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.dailyEntryRepository = dailyEntryRepository;
        this.workRecordRepository = workRecordRepository;
        this.itemRepository = itemRepository;
        this.versionRepository = versionRepository;
        this.categoryRepository = categoryRepository;
        this.currentUserProvider = currentUserProvider;
    }

    public ChecklistDailyResponse getForDate(LocalDate date) {
        UUID userId = currentUserProvider.getCurrentUserId();
        Optional<WorkRecord> record = workRecordRepository.findByUserIdAndWorkDate(userId, date);
        if (record.isEmpty()) {
            return new ChecklistDailyResponse(date, false, List.of());
        }

        boolean applicable = record.get().getStatus().isWorkday();
        List<ChecklistDailyEntryResponse> entries = dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.get().getId())
                .stream()
                .map(ChecklistDailyEntryResponse::from)
                .toList();
        return new ChecklistDailyResponse(date, applicable, entries);
    }

    /**
     * Checkbox toggle — saves immediately. Past + achieved=true means
     * "was achieved"; past + achieved=false means "was not achieved"; for
     * today, achieved=false simply means "not yet determined" — that
     * distinction lives entirely in how callers interpret the value, not in
     * a third stored state (see docs/backend/checklist.md).
     */
    @Transactional
    public ChecklistDailyEntryResponse setAchieved(UUID entryId, boolean achieved) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistDailyEntry entry = dailyEntryRepository.findByIdAndUserId(entryId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist daily entry not found: " + entryId));

        WorkRecord record = workRecordRepository.findById(entry.getWorkRecordId())
                .orElseThrow(() -> new ResourceNotFoundException("Work record not found for checklist entry: " + entryId));
        if (!record.getStatus().isWorkday()) {
            throw new InvalidRequestException("Checklist is not applicable for this date's current attendance status");
        }

        entry.setAchieved(achieved);
        return ChecklistDailyEntryResponse.from(dailyEntryRepository.save(entry));
    }

    /** Per-date x per-item bullet memo — debounced autosave target from the
     *  Day view. Same applicability guard as {@link #setAchieved}: a date
     *  whose attendance has since become non-work can no longer be edited. */
    @Transactional
    public ChecklistDailyEntryResponse setMemo(UUID entryId, String memo) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistDailyEntry entry = dailyEntryRepository.findByIdAndUserId(entryId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist daily entry not found: " + entryId));

        WorkRecord record = workRecordRepository.findById(entry.getWorkRecordId())
                .orElseThrow(() -> new ResourceNotFoundException("Work record not found for checklist entry: " + entryId));
        if (!record.getStatus().isWorkday()) {
            throw new InvalidRequestException("Checklist is not applicable for this date's current attendance status");
        }

        entry.setMemo(memo);
        return ChecklistDailyEntryResponse.from(dailyEntryRepository.save(entry));
    }

    /**
     * Batch matrix read for the checklist record table (date rows × item
     * columns) — a single range query instead of one request per date. One
     * row per {@code WorkRecord} that exists in {@code [from, to]}
     * (mirroring the Work Record table's own "no row = 미입력" convention;
     * the frontend fills in the rest of the selected period locally).
     * Columns are the union of every item that appears in at least one
     * entry across the whole range, ordered by the item's own persisted
     * {@code position} — the exact same field the checklist management
     * screen's drag-and-drop reorders, so management order and matrix
     * column order are always the same value, never two models to keep in
     * sync.
     */
    public ChecklistMatrixResponse getMatrix(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);

        List<WorkRecord> records = workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to);
        List<ChecklistDailyEntry> entries = dailyEntryRepository.findByUserIdAndWorkDateBetween(userId, from, to);

        Map<UUID, List<ChecklistDailyEntry>> entriesByRecord = new HashMap<>();
        Map<UUID, ChecklistDailyEntry> latestEntryByItem = new HashMap<>();
        for (ChecklistDailyEntry entry : entries) {
            entriesByRecord.computeIfAbsent(entry.getWorkRecordId(), k -> new ArrayList<>()).add(entry);
            ChecklistDailyEntry current = latestEntryByItem.get(entry.getItemId());
            if (current == null || entry.getWorkDate().isAfter(current.getWorkDate())) {
                latestEntryByItem.put(entry.getItemId(), entry);
            }
        }

        Map<UUID, ChecklistItem> itemById = new HashMap<>();
        for (ChecklistItem item : itemRepository.findByUserId(userId)) {
            itemById.put(item.getId(), item);
        }

        List<ChecklistMatrixColumn> columns = new ArrayList<>();
        for (Map.Entry<UUID, ChecklistDailyEntry> latest : latestEntryByItem.entrySet()) {
            UUID itemId = latest.getKey();
            ChecklistDailyEntry lastSeen = latest.getValue();
            ChecklistItem item = itemById.get(itemId);

            Optional<ChecklistItemVersion> currentVersion = (item != null && !item.isDeleted())
                    ? versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(itemId, today)
                    : Optional.empty();

            if (currentVersion.isPresent()) {
                ChecklistItemVersion v = currentVersion.get();
                columns.add(new ChecklistMatrixColumn(itemId, item.getCategoryId(), item.getPosition(), v.getName(), v.getEmoji(), v.getPriority(), false, v.isActive()));
            } else {
                // Deleted item (or, defensively, no resolvable current
                // version) — fall back to the most recent historical
                // snapshot actually seen within this range.
                columns.add(new ChecklistMatrixColumn(itemId, item != null ? item.getCategoryId() : null,
                        item != null ? item.getPosition() : Integer.MAX_VALUE,
                        lastSeen.getName(), lastSeen.getEmoji(), lastSeen.getPriority(), true, false));
            }
        }
        // Column order = the exact same compound order the management
        // screen already displays (category.position, then item.position
        // within that category; "Uncategorized" sorts last) — never a
        // separate matrix-only ordering. item.position alone is NOT a valid
        // global sort key: it is scoped per category (each category's own
        // children are independently numbered 0..N-1), so items from
        // different categories can share the same position value.
        Map<UUID, Integer> categoryPositionById = new HashMap<>();
        for (ChecklistCategory category : categoryRepository.findByUserIdOrderByPositionAscNameAsc(userId)) {
            categoryPositionById.put(category.getId(), category.getPosition());
        }
        columns.sort(
                Comparator.comparing((ChecklistMatrixColumn c) -> {
                    ChecklistItem item = itemById.get(c.itemId());
                    UUID categoryId = item != null ? item.getCategoryId() : null;
                    // Uncategorized (or a since-deleted category) sorts last,
                    // matching ChecklistManagementModal's own grouping.
                    return categoryId != null ? categoryPositionById.getOrDefault(categoryId, Integer.MAX_VALUE - 1) : Integer.MAX_VALUE;
                }).thenComparing(c -> {
                    ChecklistItem item = itemById.get(c.itemId());
                    return item != null ? item.getPosition() : Integer.MAX_VALUE;
                })
        );

        List<ChecklistMatrixRow> rows = new ArrayList<>();
        for (WorkRecord record : records) {
            List<ChecklistMatrixCell> cells = entriesByRecord.getOrDefault(record.getId(), List.of()).stream()
                    .map(e -> new ChecklistMatrixCell(e.getId(), e.getItemId(), e.isAchieved()))
                    .toList();
            rows.add(new ChecklistMatrixRow(record.getWorkDate(), record.getStatus(), record.getStatus().isWorkday(), cells));
        }

        return new ChecklistMatrixResponse(columns, rows);
    }
}
