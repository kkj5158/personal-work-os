package com.kafka.backend.authoring;

import java.util.*;
import static com.kafka.backend.authoring.AuthoringTypes.*;

final class AuthoringFixtures {
    private AuthoringFixtures() {}

    static List<Map<String, Object>> goals(int count) {
        var goals = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < count; i++) goals.add(new LinkedHashMap<>(Map.of(
                "id", "goal-" + i, "title", "Goal " + i, "description", "Description " + i,
                "why", "내 이유 " + i, "impact", "Impact " + i, "strategy", "Weekly action " + i,
                "obstacles", "Plan B " + i, "benchmark", "Measure by October " + i)));
        return goals;
    }

    static List<Map<String, Object>> epochs() {
        var epochs = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < 7; i++) epochs.add(new LinkedHashMap<>(Map.of(
                "id", "epoch-" + i, "title", "Epoch " + i, "experiences", new ArrayList<>(List.of(new LinkedHashMap<>(Map.of(
                        "id", "experience-" + i, "title", "Experience " + i, "event", "What happened " + i,
                        "effects", "How it shaped me " + i, "critical", i < 2)))))));
        return epochs;
    }

    static Map<String, Object> required(Session session) {
        var answers = new LinkedHashMap<String, Object>();
        var questions = AuthoringAnswers.questions(session.definition());
        var keys = new HashSet<>(session.definition().completionKeys());
        questions.values().stream().filter(q -> Boolean.TRUE.equals(q.required())).forEach(q -> keys.add(q.questionKey()));
        for (String key : keys) {
            var question = questions.get(key);
            if (AuthoringAnswers.virtual(question)) continue;
            answers.put(key, switch (question.type()) {
                case "SINGLE_SELECT" -> question.options().getFirst();
                case "MULTI_SELECT" -> List.of(question.options().getFirst());
                case "SCORE" -> Map.of("value", 5);
                case "CLASSIFICATION" -> List.of(Map.of("text", "Required item", "classification", question.options().getFirst(), "timing", "오늘"));
                case "GOALS" -> goals(6);
                case "EPOCHS" -> epochs();
                default -> "원문 reflection\nSecond line";
            });
        }
        return answers;
    }
}
