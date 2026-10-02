package com.kafka.backend.authoring;

import com.kafka.backend.common.InvalidRequestException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.kafka.backend.authoring.AuthoringTypes.*;

/** Current code-controlled content. Each session stores its own immutable definition snapshot. */
@Component
public class AuthoringDefinitions {
    private final Map<String, Definition> definitions = new LinkedHashMap<>();

    public AuthoringDefinitions(ObjectMapper json) throws IOException {
        var current = Map.ofEntries(Map.entry("quick-motivation", "2026-09-24"), Map.entry("recovery", "2026-09-24"), Map.entry("reality", "2026-09-24"),
                Map.entry("grounded-future", "2026-09-24"), Map.entry("past", "2026-09-24"), Map.entry("review", "2026-09-24"),
                Map.entry("sexual-pattern", "2026-09-24"), Map.entry("responsibility", "2026-09-24"), Map.entry("present-life", "2026-09-24"),
                Map.entry("present-future-identity", "2026-10-01"), Map.entry("earning-a-living", "2026-10-02"));
        for (String key : List.of("quick-motivation", "recovery", "reality", "present-life", "grounded-future", "past", "review", "sexual-pattern", "responsibility", "present-future-identity", "earning-a-living")) {
            try (var stream = new ClassPathResource("authoring/" + key + "/" + current.get(key) + ".json").getInputStream()) {
                var definition = json.readValue(stream, Definition.class);
                if (!key.equals(definition.programKey()) || definition.sections().isEmpty()
                        || !Set.of("QUICK", "CORE", "TOPIC").contains(definition.group())) {
                    throw new IllegalStateException("Invalid Authoring definition: " + key);
                }
                definitions.put(key, definition);
            }
        }
    }

    public List<Definition> all() { return List.copyOf(definitions.values()); }

    /** Current display name; stored sessions keep their frozen definition but show today's name. */
    public String title(String key) {
        var definition = definitions.get(key);
        return definition == null ? null : definition.title();
    }

    public Definition current(String key) {
        var definition = definitions.get(key);
        if (definition == null) throw new InvalidRequestException("Unknown Authoring program");
        return definition;
    }
}
