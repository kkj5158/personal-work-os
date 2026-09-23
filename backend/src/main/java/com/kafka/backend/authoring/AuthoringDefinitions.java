package com.kafka.backend.authoring;

import com.kafka.backend.common.InvalidRequestException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.kafka.backend.authoring.AuthoringTypes.*;

/** Current code-controlled content. Each session stores its own immutable definition snapshot. */
@Component
public class AuthoringDefinitions {
    private final Map<String, Definition> definitions = new LinkedHashMap<>();

    public AuthoringDefinitions(ObjectMapper json) throws IOException {
        var current = Map.of("quick-motivation", "2026-09-21", "recovery", "2026-09-21", "reality", "2026-09-21",
                "grounded-future", "2026-09-21", "past", "2026-09-21", "review", "2026-09-21",
                "sexual-pattern", "2026-09-23");
        for (String key : List.of("quick-motivation", "recovery", "reality", "grounded-future", "past", "review", "sexual-pattern")) {
            try (var stream = new ClassPathResource("authoring/" + key + "/" + current.get(key) + ".json").getInputStream()) {
                var definition = json.readValue(stream, Definition.class);
                if (!key.equals(definition.programKey()) || definition.sections().isEmpty()) {
                    throw new IllegalStateException("Invalid Authoring definition: " + key);
                }
                definitions.put(key, definition);
            }
        }
    }

    public List<Definition> all() { return List.copyOf(definitions.values()); }

    public Definition current(String key) {
        var definition = definitions.get(key);
        if (definition == null) throw new InvalidRequestException("Unknown Authoring program");
        return definition;
    }
}
