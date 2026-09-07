package com.kafka.backend.notesystem;

import java.time.*;
import java.util.*;
import jakarta.validation.constraints.*;

public final class NoteTypes {
    private NoteTypes() {}
    public enum Module { DAILY_NOTES, ALL_NOTES, RECENT_NOTES, TAGS, CONNECTED_NOTES, GRAPH }
    public record ModuleSetting(Module module, boolean enabled, int position, boolean isDefault) {}
    public record Workspace(UUID id,String name,String description,String icon,Instant archivedAt, List<ModuleSetting> modules) {}
    public record WorkspaceInput(@NotBlank @Size(max=120) String name,@Size(max=1000) String description,@Size(max=40) String icon,boolean archived,List<ModuleSetting> modules) {}
    public record Note(UUID id,UUID workspaceId,String type,LocalDate journalDate,String title,String content,long version,Instant pinnedAt,Instant deletedAt,Instant createdAt,Instant updatedAt,List<String> aliases,List<Tag> tags) {}
    public record NoteInput(@NotNull UUID id, LocalDate journalDate,@Size(max=240) String title,@NotNull @Size(max=1000000) String content,@Min(0) long expectedVersion) {}
    public record Tag(UUID id,String name,long usageCount) {}
    public record TagInput(@NotBlank @Size(max=80) String name) {}
    public record VersionInput(@Min(0) long expectedVersion,boolean value) {}
    public record RenameInput(@NotBlank @Size(max=240) String title,@Min(0) long expectedVersion) {}
    public record Summary(UUID id,String type,LocalDate journalDate,String title,String excerpt,Instant updatedAt,Instant pinnedAt,Instant lastOpenedAt,List<Tag> tags) {}
    public record Page<T>(List<T> items,int offset,boolean hasMore) {}
    public record Reference(UUID sourceNoteId,String title,LocalDate journalDate,String context,int position,Instant createdAt) {}
    public record Metric(UUID id,String title,String type,long connectedNotes,long dailyDates,long mentions,long growth30Days,Instant lastConnection,long incoming,long outgoing) {}
    public record Pending(String title,String normalizedTitle,long mentions,Instant firstMention,Instant latestMention) {}
    public record GraphNode(String id,String title,String type,long connectedNotes,boolean orphan) {}
    public record GraphEdge(String source,String target,long weight) {}
    public record Graph(List<GraphNode> nodes,List<GraphEdge> edges) {}
    public record SearchResult(String id,String type,String title,String excerpt) {}
    public record Settings(@Min(400) @Max(3000) int autosaveDelay,boolean markdownAssistance,boolean imagePaste,boolean wikiAutocomplete,boolean graphDaily,boolean graphOrphans,@Min(10) @Max(100) int searchLimit) {
        public static Settings defaults(){return new Settings(800,true,true,true,false,false,30);}
    }
}
