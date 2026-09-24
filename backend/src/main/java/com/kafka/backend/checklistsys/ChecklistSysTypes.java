package com.kafka.backend.checklistsys;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ChecklistSysTypes {
    private ChecklistSysTypes() {}

    /** Classification/filter only — never a scoring weight or ordering key. */
    public enum Importance { CORE, SECONDARY, OPTIONAL }

    /** Stored states. UNTOUCHED is the absence of a record (a null state in a change). */
    public enum RecordState { SUCCESS, FAILURE, NOT_RECORDED }

    public record Identity(UUID id, String name, String description, String color, int sortOrder) {}
    public record Area(UUID id, UUID identityId, String name, String description, String color, int sortOrder) {}
    /** {@code archivedOn} and {@code lastRecordOn} are read-only; archive/restore have their own commands. */
    public record Item(UUID id, UUID areaId, String name, String description, Importance importance, String icon,
                       int sortOrder, LocalDate startDate, LocalDate archivedOn, LocalDate lastRecordOn) {}
    public record ArchivePeriod(UUID itemId, LocalDate archivedOn, LocalDate restoredOn) {}
    public record Catalog(List<Identity> identities, List<Area> areas, List<Item> items, List<ArchivePeriod> archivePeriods) {}

    public record DailyRecord(UUID itemId, LocalDate date, RecordState state) {}
    /** One cell mutation; {@code state == null} clears the cell back to UNTOUCHED. */
    public record RecordChange(UUID itemId, LocalDate date, RecordState state) {}
    public record RecordChanges(List<RecordChange> changes) {}
    public record OrderInput(UUID parentId, List<UUID> ids) {}
}
