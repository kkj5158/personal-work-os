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
            Object value = entry.getValue();
            if (value == null) continue;
            switch (question.type()) {
                case "FREE_TEXT" -> text(value);
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

    private static int maxItems(Question question) {
        if (question.metadata() != null && question.metadata().get("maxItems") instanceof Number n) return n.intValue();
        return 500;
    }

    static void requireComplete(Definition definition, Map<String, Object> answers) {
        Set<String> required = new LinkedHashSet<>();
        if (definition.completionKeys() != null) required.addAll(definition.completionKeys());
        questions(definition).values().stream().filter(q -> Boolean.TRUE.equals(q.required())).forEach(q -> required.add(q.questionKey()));
        for (String key : required) if (!meaningful(answers.get(key))) {
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
