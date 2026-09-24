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
    private final ChecklistSnapshotService snapshotService;
    private final CurrentUserProvider currentUserProvider;

    public ChecklistDailyService(
            ChecklistDailyEntryRepository dailyEntryRepository,
            WorkRecordRepository workRecordRepository,
            ChecklistItemRepository itemRepository,
            ChecklistItemVersionRepository versionRepository,
            ChecklistCategoryRepository categoryRepository,
            ChecklistSnapshotService snapshotService,
            CurrentUserProvider currentUserProvider
    ) {
        this.dailyEntryRepository = dailyEntryRepository;
        this.workRecordRepository = workRecordRepository;
        this.itemRepository = itemRepository;
        this.versionRepository = versionRepository;
        this.categoryRepository = categoryRepository;
        this.snapshotService = snapshotService;
        this.currentUserProvider = currentUserProvider;
    }

    /**
     * Not read-only: a currently-applicable date may need
     * {@link ChecklistSnapshotService#ensureSnapshot} to backfill an item
     * that became eligible after this WorkRecord's last save (e.g. a new
     * item created with today's start date, read before any other save
     * touches today's record) — see docs/backend/checklist.md §5/§6.
     */
    @Transactional
    public ChecklistDailyResponse getForDate(LocalDate date) {
        UUID userId = currentUserProvider.getCurrentUserId();
        Optional<WorkRecord> record = workRecordRepository.findByUserIdAndWorkDate(userId, date);
        if (record.isEmpty()) {
            return new ChecklistDailyResponse(date, false, List.of());
        }

        boolean applicable = record.get().getStatus().isWorkday();
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        if (applicable && !date.isBefore(today)) {
            snapshotService.ensureSnapshot(record.get());
        }

        List<ChecklistDailyEntryResponse> entries = dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.get().getId())
                .stream()
                .map(ChecklistDailyEntryResponse::from)
                .toList();
        return new ChecklistDailyResponse(date, applicable, entries);
    }

    /**
     * PASS/FAIL/UNSET action — saves immediately. UNSET means "not yet
     * determined"; FAIL is an explicit "did not follow this item," distinct
     * from UNSET (see docs/backend/checklist.md).
     */
    @Transactional
    public ChecklistDailyEntryResponse setResult(UUID entryId, ChecklistResult result) {
        return setResults(List.of(entryId), result).getFirst();
    }

    /** Validates every owned, applicable entry before changing any result. */
    @Transactional
    public List<ChecklistDailyEntryResponse> setResults(List<UUID> entryIds, ChecklistResult result) {
        if (result == null || entryIds == null || entryIds.isEmpty() || entryIds.size() > 500 || entryIds.stream().anyMatch(java.util.Objects::isNull)) {
            throw new InvalidRequestException("Select 1–500 entries and a result");
        }
        return applyResults(entryIds.stream().distinct().map(id -> new ChecklistResultChangesRequest.Change(id, result)).toList());
    }

    /** Mixed per-entry results (bulk/date-level/undo) — all validated before any change, one transaction. */
    @Transactional
    public List<ChecklistDailyEntryResponse> setResultChanges(List<ChecklistResultChangesRequest.Change> changes) {
        if (changes == null || changes.isEmpty() || changes.size() > 2000
                || changes.stream().anyMatch(c -> c == null || c.entryId() == null || c.result() == null)
                || changes.stream().map(ChecklistResultChangesRequest.Change::entryId).distinct().count() != changes.size()) {
            throw new InvalidRequestException("Select 1–2000 distinct entries, each with a result");
        }
        return applyResults(changes);
    }

    private List<ChecklistDailyEntryResponse> applyResults(List<ChecklistResultChangesRequest.Change> changes) {
        List<UUID> entryIds = changes.stream().map(ChecklistResultChangesRequest.Change::entryId).toList();
        UUID userId = currentUserProvider.getCurrentUserId();
        // Two batched reads instead of two lookups per entry (bulk/month-wide actions).
        Map<UUID, ChecklistDailyEntry> byId = new HashMap<>();
        for (ChecklistDailyEntry entry : dailyEntryRepository.findAllById(entryIds)) {
            if (userId.equals(entry.getUserId())) byId.put(entry.getId(), entry);
        }
        Map<UUID, WorkRecord> recordById = new HashMap<>();
        for (WorkRecord record : workRecordRepository.findAllById(byId.values().stream().map(ChecklistDailyEntry::getWorkRecordId).distinct().toList())) {
            recordById.put(record.getId(), record);
        }
        List<ChecklistDailyEntry> entries = new ArrayList<>();
        for (UUID entryId : entryIds.stream().distinct().toList()) {
            ChecklistDailyEntry entry = byId.get(entryId);
            if (entry == null) {
                throw new ResourceNotFoundException("Checklist daily entry not found: " + entryId);
            }
            WorkRecord record = recordById.get(entry.getWorkRecordId());
            if (record == null) {
                throw new ResourceNotFoundException("Work record not found for checklist entry: " + entryId);
            }
            if (!record.getStatus().isWorkday()) {
                throw new InvalidRequestException("Checklist is not applicable for this date's current attendance status");
            }
            entries.add(entry);
        }
        Map<UUID, ChecklistResult> resultById = new HashMap<>();
        changes.forEach(change -> resultById.put(change.entryId(), change.result()));
        entries.forEach(entry -> entry.setResult(resultById.get(entry.getId())));
        return dailyEntryRepository.saveAll(entries).stream().map(ChecklistDailyEntryResponse::from).toList();
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
    @Transactional
    public ChecklistMatrixResponse getMatrix(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);

        List<WorkRecord> records = workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to);
        // Only today/future rows can ever gain a newly-eligible item (a new
        // item's first version is always effective today at the earliest —
        // see ChecklistItemService) — backfill those before reading entries
        // so a same-day new item shows up without waiting for another save.
        for (WorkRecord record : records) {
            if (!record.getWorkDate().isBefore(today) && record.getStatus().isWorkday()) {
                snapshotService.ensureSnapshot(record);
            }
        }
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

        List<UUID> liveItemIds = latestEntryByItem.keySet().stream()
                .filter(itemId -> {
                    ChecklistItem item = itemById.get(itemId);
                    return item != null && !item.isDeleted();
                })
                .toList();
        Map<UUID, ChecklistItemVersion> currentVersionByItemId = new HashMap<>();
        if (!liveItemIds.isEmpty()) {
            for (ChecklistItemVersion version : versionRepository.findByItemIdIn(liveItemIds)) {
                if (version.getEffectiveFrom().isAfter(today)) {
                    continue;
                }
                ChecklistItemVersion current = currentVersionByItemId.get(version.getItemId());
                if (current == null || version.getEffectiveFrom().isAfter(current.getEffectiveFrom())) {
                    currentVersionByItemId.put(version.getItemId(), version);
                }
            }
        }

        List<ChecklistMatrixColumn> columns = new ArrayList<>();
        for (Map.Entry<UUID, ChecklistDailyEntry> latest : latestEntryByItem.entrySet()) {
            UUID itemId = latest.getKey();
            ChecklistDailyEntry lastSeen = latest.getValue();
            ChecklistItem item = itemById.get(itemId);

            Optional<ChecklistItemVersion> currentVersion = Optional.ofNullable(currentVersionByItemId.get(itemId));

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
                    .map(e -> new ChecklistMatrixCell(e.getId(), e.getItemId(), e.getResult()))
                    .toList();
            rows.add(new ChecklistMatrixRow(record.getWorkDate(), record.getStatus(), record.getStatus().isWorkday(), cells));
        }

        return new ChecklistMatrixResponse(columns, rows);
    }
}
