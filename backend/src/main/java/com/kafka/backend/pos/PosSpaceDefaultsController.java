package com.kafka.backend.pos;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pos/preferences/space-defaults")
public class PosSpaceDefaultsController {
    private static final Map<String, List<String>> SYSTEMS = Map.of(
            "work", List.of("WORK FLOW", "WORK OS", "Calendar"),
            "knowledge", List.of("NOTE SYS", "BLOG", "NAVER ARCHIVE"),
            "growth", List.of("STUDY", "AUTHORING"),
            "life", List.of("LIFE CODE", "CHECKLIST SYS"),
            "finance", List.of("MONEY SYS"),
            "diet", List.of("DIET SYS"));
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    private final JdbcTemplate db;
    private final CurrentUserProvider users;

    public PosSpaceDefaultsController(JdbcTemplate db, CurrentUserProvider users) {
        this.db = db;
        this.users = users;
    }

    public record Preference(Map<String, String> defaults, long revision) {}

    @GetMapping
    public Preference get() {
        var rows = db.query("select defaults, revision from pos_space_defaults where owner_id=?",
                (row, index) -> new Preference(normalizeStored(row.getString("defaults")), row.getLong("revision")),
                users.getCurrentUserId());
        return rows.isEmpty() ? new Preference(normalize(null), 0) : rows.getFirst();
    }

    @PutMapping(consumes = "application/json")
    public Preference save(@RequestBody String body) {
        var owner = users.getCurrentUserId();
        var preference = parse(body);
        long revision = preference.revision();
        String defaults = JSON.valueToTree(preference.defaults()).toString();
        int changed = revision == 0
                ? db.update("""
                        insert into pos_space_defaults(owner_id, defaults, revision) values (?, cast(? as jsonb), 1)
                        on conflict (owner_id) do nothing
                        """, owner, defaults)
                : db.update("""
                        update pos_space_defaults set defaults=cast(? as jsonb), revision=revision+1
                        where owner_id=? and revision=?
                        """, defaults, owner, revision);
        if (changed != 1) throw new OptimisticLockConflictException("기본 Space 설정이 변경되었습니다. 최신 설정을 불러오세요.");
        return new Preference(preference.defaults(), revision + 1);
    }

    static Preference parse(String body) {
        try {
            JsonNode root = JSON.readTree(body);
            if (root != null && root.isObject() && root.size() == 2) {
                JsonNode defaults = root.path("defaults"), revision = root.path("revision");
                if (revision.isIntegralNumber() && revision.canConvertToLong() && revision.longValue() >= 0
                        && revision.longValue() < Long.MAX_VALUE && defaults.isObject() && acceptsDefaults(defaults)) {
                    return new Preference(normalize(defaults), revision.longValue());
                }
            }
        } catch (JsonProcessingException ignored) {
            // Use the same response for invalid structure, duplicate keys and malformed JSON.
        }
        throw new InvalidRequestException("기본 Space 설정을 확인하세요.");
    }

    private static boolean acceptsDefaults(JsonNode defaults) {
        // Older tabs can submit the original five Space keys during rollout.
        boolean legacy = defaults.size() == SYSTEMS.size() - 1 && !defaults.has("diet");
        if (!legacy && defaults.size() != SYSTEMS.size()) return false;
        return SYSTEMS.entrySet().stream().allMatch(entry -> {
            String space = entry.getKey();
            JsonNode id = defaults.get(space);
            return accepts(id, entry.getValue())
                    || (legacy && ("diet".equals(space) || ("life".equals(space) && "DIET SYS".equals(defaults.path(space).asText()))));
        });
    }

    static Map<String, String> normalizeStored(String stored) {
        try {
            return normalize(stored == null ? null : JSON.readTree(stored));
        } catch (JsonProcessingException ignored) {
            return normalize(null);
        }
    }

    private static Map<String, String> normalize(JsonNode defaults) {
        Map<String, String> result = new LinkedHashMap<>();
        SYSTEMS.forEach((space, systems) -> {
            JsonNode id = defaults == null ? null : defaults.get(space);
            result.put(space, accepts(id, systems) ? id.textValue() : systems.getFirst());
        });
        return result;
    }

    private static boolean accepts(JsonNode id, List<String> systems) {
        return id != null && id.isTextual() && systems.contains(id.textValue());
    }
}
