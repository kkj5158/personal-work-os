package com.kafka.backend.authoring;

import com.kafka.backend.common.InvalidRequestException;
import java.util.*;
import static com.kafka.backend.authoring.AuthoringTypes.*;

/** Validates storage shape without requiring unfinished writing to be complete. */
final class AuthoringAnswers {
    private AuthoringAnswers() {}

    static Map<String, Question> questions(Definition definition) {
        Map<String, Question> questions = new LinkedHashMap<>();
        for (var section : definition.sections()) for (var question : section.questions()) {
            if (questions.put(question.questionKey(), question) != null) {
                throw new IllegalStateException("Duplicate Authoring question key");
            }
        }
        return questions;
    }

    static void validate(Definition definition, String section, Map<String, Object> answers) {
        if (section == null || definition.sections().stream().noneMatch(s -> s.sectionKey().equals(section))) {
            throw new InvalidRequestException("Unknown Authoring section");
        }
        if (answers == null) throw new InvalidRequestException("Answers are required");
        var questions = questions(definition);
        for (var entry : answers.entrySet()) {
            var question = questions.get(entry.getKey());
            if (question == null) throw new InvalidRequestException("Unknown Authoring question");
            if (virtual(question)) throw new InvalidRequestException("Save repeated writing through its source question");
            Object value = entry.getValue();
            if (value == null) continue;
            switch (question.type()) {
                case "FREE_TEXT" -> text(value);
                case "GOALS" -> goals(value);
                case "EPOCHS" -> epochs(value);
                case "SINGLE_SELECT" -> option(question, value);
                case "MULTI_SELECT" -> {
                    if (!(value instanceof List<?> values) || values.size() > 100) invalid();
                    else {
                        if (new HashSet<>(values).size() != values.size()) invalid();
                        values.forEach(item -> option(question, item));
                    }
                }
                case "SCORE" -> {
                    if (!(value instanceof Map<?, ?> score)) invalid();
                    else {
                        fields(score, Set.of("value", "memo"));
                        Object number = score.get("value");
                        if (number != null && (!(number instanceof Number n) || !Double.isFinite(n.doubleValue())
                                || n.doubleValue() < 1 || n.doubleValue() > 10 || n.doubleValue() != n.intValue())) invalid();
                        if (score.get("memo") != null) text(score.get("memo"));
                    }
                }
                case "CLASSIFICATION" -> {
                    if (!(value instanceof List<?> rows) || rows.size() > maxItems(question)) invalid();
                    else for (Object item : rows) {
                        if (!(item instanceof Map<?, ?> row)) invalid();
                        else {
                            fields(row, Set.of("text", "classification", "timing", "memo"));
                            if (row.get("text") != null) text(row.get("text"));
                            if (row.get("classification") != null) option(question, row.get("classification"));
                            if (row.get("memo") != null) text(row.get("memo"));
                            if (row.get("timing") != null) text(row.get("timing"));
                        }
                    }
                }
                default -> throw new InvalidRequestException("Unsupported Authoring question type");
            }
        }
    }

    static boolean virtual(Question question) {
        return Set.of("GOAL_DEEP_DIVE", "EXPERIENCES", "EFFECTS", "CRITICAL").contains(question.type());
    }

    static Object value(Question question, Map<String, Object> answers) {
        String key = virtual(question) && question.metadata() != null
                && question.metadata().get("sourceQuestionKey") instanceof String source ? source : question.questionKey();
        return answers.get(key);
    }

    private static void identity(Map<?, ?> row, Set<String> ids) {
        if (!(row.get("id") instanceof String id) || id.isBlank() || id.length() > 100 || !ids.add(id)) invalid();
    }

    private static void strings(Map<?, ?> row, Set<String> keys) {
        for (String key : keys) if (row.get(key) != null) text(row.get(key));
    }

    private static void goals(Object value) {
        if (!(value instanceof List<?> rows) || rows.size() > 8) { invalid(); return; }
        Set<String> ids = new HashSet<>();
        for (Object item : rows) {
            if (!(item instanceof Map<?, ?> row)) { invalid(); continue; }
            fields(row, Set.of("id", "title", "description", "why", "impact", "strategy", "obstacles", "benchmark"));
            identity(row, ids);
            strings(row, Set.of("title", "description", "why", "impact", "strategy", "obstacles", "benchmark"));
        }
    }

    private static void epochs(Object value) {
        if (!(value instanceof List<?> rows) || rows.size() != 7) { invalid(); return; }
        Set<String> epochIds = new HashSet<>(), experienceIds = new HashSet<>();
        int critical = 0;
        for (Object item : rows) {
            if (!(item instanceof Map<?, ?> row)) { invalid(); continue; }
            fields(row, Set.of("id", "title", "experiences"));
            identity(row, epochIds); strings(row, Set.of("title"));
            if (!(row.get("experiences") instanceof List<?> experiences) || experiences.size() > 6) { invalid(); continue; }
            for (Object experience : experiences) {
                if (!(experience instanceof Map<?, ?> entry)) { invalid(); continue; }
                fields(entry, Set.of("id", "title", "event", "effects", "critical"));
                identity(entry, experienceIds); strings(entry, Set.of("title", "event", "effects"));
                if (entry.get("critical") != null && !(entry.get("critical") instanceof Boolean)) invalid();
                if (Boolean.TRUE.equals(entry.get("critical"))) critical++;
            }
        }
        if (critical > 10) invalid();
    }

    private static int maxItems(Question question) {
        if (question.metadata() != null && question.metadata().get("maxItems") instanceof Number n) return n.intValue();
        return 500;
    }

    static void requireComplete(Definition definition, Map<String, Object> answers) {
        Set<String> required = new LinkedHashSet<>();
        if (definition.completionKeys() != null) required.addAll(definition.completionKeys());
        questions(definition).values().stream().filter(q -> Boolean.TRUE.equals(q.required())).forEach(q -> required.add(q.questionKey()));
        var allQuestions = questions(definition);
        for (String key : required) if (!complete(allQuestions.get(key), value(allQuestions.get(key), answers))) {
            throw new InvalidRequestException("Complete the required closing answers before finishing: " + key);
        }
        for (var question : questions(definition).values()) {
            if (!"CLASSIFICATION".equals(question.type()) || !(answers.get(question.questionKey()) instanceof List<?> rows)) continue;
            for (Object item : rows) {
                if (!(item instanceof Map<?, ?> row) || !meaningful(row.get("text"))) continue;
                if (!meaningful(row.get("classification"))) {
                    throw new InvalidRequestException("Classify each written item before finishing");
                }
                if (question.metadata() != null && Boolean.TRUE.equals(question.metadata().get("timing"))
                        && "MUST".equals(row.get("classification"))
                        && (!(row.get("timing") instanceof String timing) || !List.of("오늘", "내일", "48시간 내").contains(timing))) {
                    throw new InvalidRequestException("Choose today, tomorrow, or within 48 hours for each MUST item");
                }
            }
        }
    }

    static boolean complete(Question question, Object value) {
        if (Set.of("GOALS", "GOAL_DEEP_DIVE").contains(question.type())) {
            if (!(value instanceof List<?> goals) || goals.size() < 6 || goals.size() > 8) return false;
            List<String> keys = "GOALS".equals(question.type()) ? List.of("title", "description")
                    : List.of("why", "impact", "strategy", "obstacles", "benchmark");
            return goals.stream().allMatch(item -> item instanceof Map<?, ?> goal && keys.stream().allMatch(k -> meaningful(goal.get(k))));
        }
        if (Set.of("EPOCHS", "EXPERIENCES", "EFFECTS", "CRITICAL").contains(question.type())) {
            if (!(value instanceof List<?> epochs) || epochs.size() != 7) return false;
            if ("EPOCHS".equals(question.type())) return epochs.stream().allMatch(item -> item instanceof Map<?, ?> epoch && meaningful(epoch.get("title")));
            int critical = 0;
            for (Object item : epochs) {
                if (!(item instanceof Map<?, ?> epoch) || !(epoch.get("experiences") instanceof List<?> experiences) || experiences.isEmpty()) return false;
                for (Object entry : experiences) {
                    if (!(entry instanceof Map<?, ?> experience)) return false;
                    if ("EXPERIENCES".equals(question.type()) && (!meaningful(experience.get("title")) || !meaningful(experience.get("event")))) return false;
                    if ("EFFECTS".equals(question.type()) && !meaningful(experience.get("effects"))) return false;
                    if (Boolean.TRUE.equals(experience.get("critical"))) critical++;
                }
            }
            return !"CRITICAL".equals(question.type()) || critical > 0 && critical <= 10;
        }
        return meaningful(value);
    }

    static boolean meaningful(Object value) {
        if (value instanceof String text) return !text.isBlank();
        if (value instanceof List<?> list) return !list.isEmpty() && list.stream().allMatch(item -> {
            if (item instanceof Map<?, ?> row) return meaningful(row.get("text")) && meaningful(row.get("classification"));
            return meaningful(item);
        });
        if (value instanceof Map<?, ?> map) return map.get("value") instanceof Number;
        return false;
    }

    private static void option(Question question, Object value) {
        text(value);
        if (value instanceof String option && !option.isBlank()
                && (question.options() == null || !question.options().contains(option))) invalid();
    }
    private static void fields(Map<?, ?> value, Set<String> allowed) {
        if (!allowed.containsAll(value.keySet())) invalid();
    }
    private static void text(Object value) {
        if (!(value instanceof String text) || text.length() > 100_000) invalid();
    }
    private static void invalid() { throw new InvalidRequestException("Invalid Authoring answer shape or option"); }
}
