package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/checklist-items")
public class ChecklistItemController {

    private final ChecklistItemService itemService;
    private final ChecklistGoalService goalService;

    public ChecklistItemController(ChecklistItemService itemService, ChecklistGoalService goalService) {
        this.itemService = itemService;
        this.goalService = goalService;
    }

    @GetMapping
    public List<ChecklistItemResponse> list() {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        return toResponses(itemService.listManaged(), today);
    }

    /** Historical catalog for read-only analytics/settings selectors. */
    @GetMapping("/history")
    public List<ChecklistItemResponse> history() {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        return toResponses(itemService.listAll(), today);
    }

    @GetMapping("/active-count")
    public Map<String, Object> activeCount() {
        return Map.of("active", itemService.countCurrentlyActive(), "max", ChecklistItemService.MAX_ACTIVE_ITEMS);
    }

    @PostMapping
    public ResponseEntity<ChecklistItemResponse> create(@RequestBody ChecklistItemCreateRequest request) {
        ChecklistItem created = itemService.create(request.name(), request.emoji(), request.priority(), request.categoryId(), request.goalOverridePercent());
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(created, LocalDate.now(AppTimeZone.ZONE)));
    }

    @GetMapping("/{id}/versions")
    public List<ChecklistItemVersionResponse> versionHistory(@PathVariable UUID id) {
        return itemService.versionHistory(id).stream().map(ChecklistItemVersionResponse::from).toList();
    }

    @PutMapping("/{id}/versions")
    public ChecklistItemVersionResponse scheduleVersion(@PathVariable UUID id, @RequestBody ChecklistItemVersionRequest request) {
        ChecklistItemVersion version = itemService.scheduleVersion(
                id,
                request.effectiveFrom(),
                request.name(),
                request.emoji(),
                request.priority(),
                Boolean.TRUE.equals(request.active()),
                request.goalOverridePercent()
        );
        return ChecklistItemVersionResponse.from(version);
    }

    @DeleteMapping("/{id}/versions/{versionId}")
    public ResponseEntity<Void> deleteFutureVersion(@PathVariable UUID id, @PathVariable UUID versionId) {
        itemService.deleteFutureVersion(id, versionId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/parent")
    public ChecklistItemResponse moveToCategory(@PathVariable UUID id, @RequestBody ChecklistItemMoveRequest request) {
        ChecklistItem moved = itemService.moveToCategory(id, request.categoryId());
        return toResponse(moved, LocalDate.now(AppTimeZone.ZONE));
    }

    @PutMapping("/reorder")
    public List<ChecklistItemResponse> reorder(@RequestBody ChecklistItemReorderRequest request) {
        itemService.reorder(request.categoryId(), request.orderedIds());
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        return toResponses(itemService.listManaged(), today);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        itemService.softDelete(id);
        return ResponseEntity.noContent().build();
    }

    private ChecklistItemResponse toResponse(ChecklistItem item, LocalDate today) {
        ChecklistItemVersion current = itemService.versionAsOf(item.getId(), today)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist item has no current definition: " + item.getId()));
        int effectiveGoal = current.getGoalOverridePercent() != null
                ? current.getGoalOverridePercent()
                : goalService.effectiveGoalPercent(item.getUserId(), today);
        return ChecklistItemResponse.from(item, current, effectiveGoal);
    }

    /** Batched equivalent of {@link #toResponse} for a whole list — fetches
     *  every item's current version in one query and the shared default
     *  goal once, instead of once per item. */
    private List<ChecklistItemResponse> toResponses(List<ChecklistItem> items, LocalDate today) {
        List<UUID> itemIds = items.stream().map(ChecklistItem::getId).toList();
        Map<UUID, ChecklistItemVersion> versionsByItemId = itemService.versionsAsOf(itemIds, today);
        int defaultGoal = goalService.effectiveGoalPercentForCurrentUser(today);
        return items.stream().map(item -> {
            ChecklistItemVersion current = versionsByItemId.get(item.getId());
            if (current == null) {
                throw new ResourceNotFoundException("Checklist item has no current definition: " + item.getId());
            }
            int effectiveGoal = current.getGoalOverridePercent() != null ? current.getGoalOverridePercent() : defaultGoal;
            return ChecklistItemResponse.from(item, current, effectiveGoal);
        }).toList();
    }
}
