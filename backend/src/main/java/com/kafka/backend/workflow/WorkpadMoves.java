package com.kafka.backend.workflow;

import com.kafka.backend.common.InvalidRequestException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Pure tree transformation. Actual blocks move with their identities; context is cloned. */
final class WorkpadMoves {
    private WorkpadMoves() {}
    record Plan(List<Block> source, List<Block> target, List<UUID> movedIds) {}

    static Plan plan(Day source, Day target, Move request) {
        WorkflowService.validateBlocks(source.blocks());
        WorkflowService.validateBlocks(target.blocks());
        var original = new LinkedHashMap<UUID,Block>();
        source.blocks().forEach(b -> original.put(b.id(), b));
        if (request.blockIds() == null || request.blockIds().isEmpty())
            throw new InvalidRequestException("Confirm the blocks to move first");
        var moving = new HashSet<>(request.blockIds());
        if (!original.keySet().containsAll(moving)) throw new InvalidRequestException("Selected block not found");
        if (request.incompleteOnly()) moving.removeIf(id -> completed(original.get(id)));
        boolean changed;
        do {
            changed = false;
            for (var b : source.blocks())
                if (moving.contains(b.parentId()) && !(request.incompleteOnly() && completed(b)))
                    changed |= moving.add(b.id());
        } while (changed);
        if (moving.isEmpty()) throw new InvalidRequestException("No incomplete blocks to move");

        var targetBlocks = new ArrayList<>(target.blocks());
        var targetParents = new HashMap<UUID,UUID>();
        moving.forEach(id -> targetParents.put(id, id));
        String timestamp = Instant.now().toString();
        for (var b : source.blocks()) if (moving.contains(b.id())) {
            UUID parent = context(b.parentId(), original, targetParents, targetBlocks, source.date(), true);
            var metadata = new LinkedHashMap<String,Object>(Objects.requireNonNullElse(b.metadata(), Map.of()));
            // Retain a bounded movement trail without changing task/note/media identity.
            var history = new ArrayList<Object>();
            if (metadata.get("moveHistory") instanceof List<?> existing) history.addAll(existing);
            history.add(Map.of("sourceDate", source.date().toString(), "targetDate", target.date().toString(),
                "blockId", b.id().toString(), "movedAt", timestamp));
            if (history.size() > 20) history = new ArrayList<>(history.subList(history.size() - 20, history.size()));
            metadata.put("moveHistory", history);
            targetBlocks.add(new Block(b.id(), parent, nextOrder(targetBlocks, parent), b.type(), b.content(),
                b.checked(), b.workTaskId(), b.sourceBlockId(), b.sourceDate(), metadata));
        }

        var sourceBlocks = new ArrayList<Block>();
        var sourceParents = new HashMap<UUID,UUID>();
        original.keySet().stream().filter(id -> !moving.contains(id)).forEach(id -> sourceParents.put(id, id));
        for (var b : source.blocks()) if (!moving.contains(b.id())) {
            // Automatic carry leaves completed descendants behind, with context if their parent moved.
            UUID parent = context(b.parentId(), original, sourceParents, sourceBlocks, source.date(), false);
            sourceBlocks.add(new Block(b.id(), parent, b.order(), b.type(), b.content(), b.checked(),
                b.workTaskId(), b.sourceBlockId(), b.sourceDate(), b.metadata()));
        }
        WorkflowService.validateBlocks(sourceBlocks);
        WorkflowService.validateBlocks(targetBlocks);
        return new Plan(sourceBlocks, targetBlocks, source.blocks().stream().map(Block::id).filter(moving::contains).toList());
    }

    private static boolean completed(Block block) { return "CHECKLIST".equals(block.type()) && block.checked(); }
    private static int nextOrder(List<Block> blocks, UUID parent) {
        return blocks.stream().filter(b -> Objects.equals(b.parentId(), parent)).mapToInt(Block::order).max().orElse(-1) + 1;
    }
    private static UUID context(UUID id, Map<UUID,Block> original, Map<UUID,UUID> mapped,
                                List<Block> destination, LocalDate date, boolean deduplicate) {
        if (id == null) return null;
        if (mapped.containsKey(id)) return mapped.get(id);
        Block b = original.get(id);
        UUID parent = context(b.parentId(), original, mapped, destination, date, deduplicate);
        String type = "CHECKLIST".equals(b.type()) ? "TEXT" : b.type();
        // Full content/type/metadata + same parent is deliberately stricter than title-only matching.
        if (deduplicate) for (var candidate : destination) {
            if (Objects.equals(candidate.parentId(), parent) && candidate.workTaskId() == null
                && candidate.type().equals(type) && Objects.equals(candidate.content(), b.content())
                && !candidate.checked() && contextMetadata(candidate.metadata()).equals(contextMetadata(b.metadata()))) {
                mapped.put(id, candidate.id());
                return candidate.id();
            }
        }
        UUID copy = UUID.randomUUID();
        var metadata = new LinkedHashMap<String,Object>(contextMetadata(b.metadata()));
        metadata.put("contextClone", true);
        destination.add(new Block(copy, parent, deduplicate ? nextOrder(destination, parent) : b.order(), type,
            b.content(), false, null, b.id(), date, metadata));
        mapped.put(id, copy);
        return copy;
    }
    private static Map<String,Object> contextMetadata(Map<String,Object> metadata) {
        var result = new LinkedHashMap<String,Object>(Objects.requireNonNullElse(metadata, Map.of()));
        result.remove("contextClone");
        result.remove("moveHistory");
        return result;
    }
}
