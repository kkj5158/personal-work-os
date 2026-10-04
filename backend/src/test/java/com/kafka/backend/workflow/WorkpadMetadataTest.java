package com.kafka.backend.workflow;

import com.kafka.backend.common.InvalidRequestException;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

class WorkpadMetadataTest {
    private Block block(UUID parent, String type, Map<String,Object> metadata) {
        return new Block(UUID.randomUUID(), parent, 0, type, "Work", false, null, null, null, metadata);
    }

    @Test void rootColumnsAndChecklistHeadingsRemainCompatibleWithOrdinaryDescendants() {
        var root = block(null, "CHECKLIST", Map.of("columnGroup", UUID.randomUUID().toString(), "column", 2, "textStyle", "H2"));
        var child = block(root.id(), "IMAGE", Map.of("images", List.of()));
        assertThatCode(() -> WorkflowService.validateBlocks(List.of(root, child))).doesNotThrowAnyException();
        // Sparse fragments are valid during cross-date carry/move; the editor cleans empty columns.
        for (var style : List.of("TEXT", "H1", "H2", "H3"))
            assertThatCode(() -> WorkpadMetadata.validate(block(null, "CHECKLIST", Map.of("textStyle", style)))).doesNotThrowAnyException();
        assertThatCode(() -> WorkpadMetadata.validate(block(null, "H2", Map.of("wikiLinks", List.of())))).doesNotThrowAnyException();
    }

    @Test void columnPairsRejectFourthColumnsFractionsMissingIdentityAndNestedLayouts() {
        String group = UUID.randomUUID().toString();
        var invalid = List.<Map<String,Object>>of(Map.of("column", 0), Map.of("columnGroup", group),
            Map.of("columnGroup", "bad", "column", 0), Map.of("columnGroup", "1-1-1-1-1", "column", 0),
            Map.of("columnGroup", group, "column", -1), Map.of("columnGroup", group, "column", 3),
            Map.of("columnGroup", group, "column", 1.0), Map.of("columnGroup", group, "column", "1"));
        for (var metadata : invalid)
            assertThatThrownBy(() -> WorkpadMetadata.validate(block(null, "TEXT", metadata))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> WorkpadMetadata.validate(block(UUID.randomUUID(), "TEXT", Map.of("columnGroup", group, "column", 0))))
            .isInstanceOf(InvalidRequestException.class);
    }

    @Test void invalidHeadingMetadataCannotBypassTaskTypeRules() {
        assertThatThrownBy(() -> WorkpadMetadata.validate(block(null, "TEXT", Map.of("textStyle", "H2")))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> WorkpadMetadata.validate(block(null, "CHECKLIST", Map.of("textStyle", "H4")))).isInstanceOf(InvalidRequestException.class);
    }
}
