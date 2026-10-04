package com.kafka.backend.workflow;

import com.kafka.backend.common.InvalidRequestException;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Layout/style metadata extends the existing blocks without introducing container identities. */
final class WorkpadMetadata {
    private WorkpadMetadata() {}

    static void validate(Block block) {
        var metadata = Objects.requireNonNullElse(block.metadata(), Map.<String,Object>of());
        if (metadata.containsKey("textStyle")) {
            if (!"CHECKLIST".equals(block.type()) || !(metadata.get("textStyle") instanceof String style)
                || !Set.of("TEXT", "H1", "H2", "H3").contains(style))
                throw new InvalidRequestException("Checklist text style must be TEXT, H1, H2 or H3");
        }
        if (!metadata.containsKey("columnGroup") && !metadata.containsKey("column")) return;
        if (block.parentId() != null) throw new InvalidRequestException("Column layout belongs to root blocks only");
        if (!(metadata.get("columnGroup") instanceof String group))
            throw new InvalidRequestException("Column group identity is required");
        try {
            if (!UUID.fromString(group).toString().equalsIgnoreCase(group)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException ex) {
            throw new InvalidRequestException("Column group identity must be a UUID");
        }
        Object column = metadata.get("column");
        if (!(column instanceof Integer || column instanceof Long) || ((Number) column).longValue() < 0
            || ((Number) column).longValue() > 2)
            throw new InvalidRequestException("Column index must be an integer from 0 to 2");
    }

    static String plainType(Block block) {
        var style = block.metadata() == null ? null : block.metadata().get("textStyle");
        return "CHECKLIST".equals(block.type()) && style instanceof String value
            && Set.of("H1", "H2", "H3").contains(value) ? value : "TEXT";
    }

    static Map<String,Object> plainMetadata(Map<String,Object> metadata) {
        var result = new LinkedHashMap<String,Object>(Objects.requireNonNullElse(metadata, Map.of()));
        result.remove("textStyle");
        return result;
    }
}
