package com.kafka.backend.authoring;

import java.time.Instant;
import java.util.*;
import static com.kafka.backend.authoring.AuthoringTypes.*;

/** Deterministic snapshots of authored answers. No inferred psychological or recovery scoring. */
final class AuthoringReports {
    private AuthoringReports() {}

    static Map<String, Object> create(Session session, Instant completedAt) {
        var questions = AuthoringAnswers.questions(session.definition());
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("programKey", session.programKey());
        report.put("specVersion", session.specVersion());
        report.put("completedAt", completedAt.toString());
        List<Map<String, Object>> sections = new ArrayList<>();
        for (var section : session.definition().reportSections()) {
            List<Map<String, Object>> items = new ArrayList<>();
            for (String key : section.questionKeys()) {
                var question = questions.get(key);
                if (question == null) throw new IllegalStateException("Unknown report question in definition");
                items.add(item(question, AuthoringAnswers.value(question, session.answers())));
            }
            sections.add(Map.of("title", section.title(), "items", items));
        }
        report.put("sections", sections);
        var scan = scan(session);
        if (!scan.isEmpty()) report.put("scanSummary", scan);
        if ("recovery".equals(session.programKey())) report.put("recoveryExport", recovery(session, completedAt));
        return report;
    }

    private static Map<String, Object> item(Question question, Object value) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("questionKey", question.questionKey()); item.put("prompt", question.prompt());
        item.put("type", question.type()); item.put("value", value);
        return item;
    }

    private static Map<String, Object> scan(Session session) {
        List<Map<String, Object>> scores = new ArrayList<>();
        for (var section : session.definition().sections()) {
            if (!"scan".equals(section.sectionKey())) continue;
            for (var question : section.questions()) {
                if ("SCORE".equals(question.type()) && session.answers().get(question.questionKey()) instanceof Map<?, ?> answer
                        && answer.get("value") instanceof Number number) {
                    scores.add(Map.of("questionKey", question.questionKey(), "prompt", question.prompt(), "value", number.intValue()));
                }
            }
        }
        if (scores.isEmpty()) return Map.of();
        var stats = scores.stream().mapToInt(s -> (Integer) s.get("value")).summaryStatistics();
        return Map.of("count", stats.getCount(), "average", stats.getAverage(), "spread", stats.getMax() - stats.getMin(),
                "highest", scores.stream().sorted(Comparator.comparingInt(s -> -(Integer) s.get("value"))).limit(3).toList(),
                "lowest", scores.stream().sorted(Comparator.comparingInt(s -> (Integer) s.get("value"))).limit(3).toList());
    }

    private static Map<String, Object> recovery(Session session, Instant completedAt) {
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("contractVersion", 1); export.put("sourceSessionId", session.id().toString());
        export.put("specVersion", session.specVersion()); export.put("completedAt", completedAt.toString());
        export.put("opsAvailable", false);
        for (String key : List.of("level", "axis", "firstAction", "today", "tomorrow", "notYet")) {
            export.put(key, session.answers().get(key));
        }
        List<Object> must = new ArrayList<>();
        if (session.answers().get("triage") instanceof List<?> rows) for (Object row : rows) {
            if (row instanceof Map<?, ?> value && AuthoringAnswers.meaningful(value.get("text"))
                    && "MUST".equals(value.get("classification"))) must.add(row);
        }
        export.put("must", must);
        export.put("minimumOperatingState", AuthoringAnswers.questions(session.definition()).values().stream()
                .filter(q -> q.questionKey().equals("base") || q.questionKey().startsWith("base."))
                .map(q -> item(q, session.answers().get(q.questionKey()))).toList());
        return export;
    }
}
