package com.kafka.backend.authoring;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AuthoringTypes {
    private AuthoringTypes() {}

    public record Definition(String programKey, String version, String title, String description, String guidance,
            String sourceUrl, List<Section> sections, List<String> stoppingRules,
            List<String> completionKeys, List<ReportSection> reportSections, String subtitle, String reportTitle, String group) {}
    public record Section(String sectionKey, String title, String description, List<Question> questions) {}
    public record Question(String questionKey, String type, String prompt, String helperText,
            List<String> options, Map<String, Object> metadata, Boolean required) {}
    public record ReportSection(String title, List<String> questionKeys) {}
    public record CreateSession(String programKey, UUID sourceSessionId) {}
    public record SaveSession(Long expectedVersion, String currentSectionKey, Map<String, Object> answers, String title, String memo) {}
    public record SaveMetadata(Long expectedVersion, String title, String memo) {}
    public record CompleteSession(Long expectedVersion) {}
    public record Session(UUID id, String programKey, String specVersion, String status,
            String currentSectionKey, Map<String, Object> answers, Map<String, Object> report,
            UUID sourceSessionId, Instant startedAt, Instant updatedAt, Instant completedAt,
            long version, Definition definition, String title, String memo, String programTitle) {}
    public record Summary(UUID id, String programKey, String specVersion, String status,
            String currentSectionKey, UUID sourceSessionId, Instant startedAt, Instant updatedAt,
            Instant completedAt, long version, String title, String memo) {}
}
