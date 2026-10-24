package com.kafka.backend.timetable;

import java.time.Instant;
import java.util.*;

public final class TimetableTypes {
    private TimetableTypes() {}
    public record CheckItem(UUID id, String title, boolean checked) {}
    public record Input(Long version, String title, String description, String goal, String memo, String defaultColor, List<CheckItem> checklist) {}
    public record Timetable(UUID id, String title, String description, String goal, String memo, String defaultColor,
                            List<CheckItem> checklist, int sortOrder, Instant archivedAt, long version, Instant createdAt, Instant updatedAt) {}
    public record Philosophy(String content, long version, Instant updatedAt) {}
    public record PhilosophyInput(Long version, String content) {}
    public record VersionInput(Long version) {}
    public record ArchiveInput(Long version, boolean archived) {}
    public record ReorderInput(List<UUID> ids) {}
    public record BlockInput(Long version, String title, Integer weekday, Integer startMinute, Integer durationMinutes, String memo, String color) {}
    public record CreateBlocks(List<Integer> weekdays, BlockInput block) {}
    public record MemberVersion(UUID id, Long version) {}
    public record UpdateGroup(List<Integer> weekdays, BlockInput block, List<MemberVersion> members) {}
    public record Block(UUID id, UUID timetableId, String title, int weekday, int startMinute, int durationMinutes,
                        String memo, String color, long version, Instant deletedAt, UUID creationGroupId) {}
    public record Blocks(List<Block> blocks) {}
}
