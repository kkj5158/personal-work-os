package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Management operations for {@link ChecklistItem} + its effective-dated
 * {@link ChecklistItemVersion} history. See docs/backend/checklist.md for
 * the full design, especially the immutability rule (a version whose
 * {@code effectiveFrom} is strictly before today has already applied and
 * can never be edited or deleted — only a new, later-dated version can
 * change it going forward) and the max-6-simultaneously-active invariant.
 */
@Service
public class ChecklistItemService {

    public static final int MAX_ACTIVE_ITEMS = 6;

    private final ChecklistItemRepository itemRepository;
    private final ChecklistItemVersionRepository versionRepository;
    private final ChecklistCategoryRepository categoryRepository;
    private final CurrentUserProvider currentUserProvider;

    public ChecklistItemService(
            ChecklistItemRepository itemRepository,
            ChecklistItemVersionRepository versionRepository,
            ChecklistCategoryRepository categoryRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.itemRepository = itemRepository;
        this.versionRepository = versionRepository;
        this.categoryRepository = categoryRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<ChecklistItem> listManaged() {
        return itemRepository.findByUserIdAndDeletedAtIsNull(currentUserProvider.getCurrentUserId());
    }

    @Transactional(readOnly = true)
    public List<ChecklistItem> listAll() {
        return itemRepository.findByUserId(currentUserProvider.getCurrentUserId());
    }

    @Transactional(readOnly = true)
    public List<ChecklistItemVersion> versionHistory(UUID itemId) {
        UUID userId = currentUserProvider.getCurrentUserId();
        itemRepository.findByIdAndUserId(itemId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist item not found: " + itemId));
        return versionRepository.findByItemIdOrderByEffectiveFromAsc(itemId);
    }

    /** The applicable definition as of {@code asOf}, or empty if the item
     *  did not exist yet on that date. */
    @Transactional(readOnly = true)
    public Optional<ChecklistItemVersion> versionAsOf(UUID itemId, LocalDate asOf) {
        return versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(itemId, asOf);
    }

    /** Batched equivalent of {@link #versionAsOf} for a set of items — one
     *  query instead of one per item, used by the controller when rendering
     *  a whole list/history response. */
    @Transactional(readOnly = true)
    public Map<UUID, ChecklistItemVersion> versionsAsOf(List<UUID> itemIds, LocalDate asOf) {
        if (itemIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, ChecklistItemVersion> latestByItem = new HashMap<>();
        for (ChecklistItemVersion version : versionRepository.findByItemIdIn(itemIds)) {
            if (version.getEffectiveFrom().isAfter(asOf)) {
                continue;
            }
            ChecklistItemVersion current = latestByItem.get(version.getItemId());
            if (current == null || version.getEffectiveFrom().isAfter(current.getEffectiveFrom())) {
                latestByItem.put(version.getItemId(), version);
            }
        }
        return latestByItem;
    }

    @Transactional(readOnly = true)
    public int countCurrentlyActive() {
        return countCurrentActive(currentUserProvider.getCurrentUserId(), null);
    }

    @Transactional
    public ChecklistItem create(String name, String emoji, ChecklistPriority priority, UUID categoryId, Integer goalOverridePercent) {
        validateName(name);
        validateEmoji(emoji);
        validatePriority(priority);
        validateGoalOverride(goalOverridePercent);

        UUID userId = currentUserProvider.getCurrentUserId();
        if (categoryId != null) {
            categoryRepository.findByIdAndUserId(categoryId, userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Checklist category not found: " + categoryId));
        }
        if (countCurrentActive(userId, null) >= MAX_ACTIVE_ITEMS) {
            throw new InvalidRequestException("At most " + MAX_ACTIVE_ITEMS + " checklist items can be active at once");
        }

        int nextPosition = (int) (categoryId == null
                ? itemRepository.countByUserIdAndCategoryIdIsNull(userId)
                : itemRepository.countByUserIdAndCategoryId(userId, categoryId));

        ChecklistItem item = itemRepository.save(new ChecklistItem(userId, categoryId, nextPosition));
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        versionRepository.save(new ChecklistItemVersion(item.getId(), today, name.trim(), emoji, priority, true, goalOverridePercent));
        return item;
    }

    /**
     * Creates or edits the version effective on {@code effectiveFrom}. A
     * date strictly before today is rejected outright (the past cannot be
     * rewritten); a date of today or later either updates the already
     * existing version at that exact date in place, or creates a new one.
     */
    @Transactional
    public ChecklistItemVersion scheduleVersion(
            UUID itemId,
            LocalDate effectiveFrom,
            String name,
            String emoji,
            ChecklistPriority priority,
            boolean active,
            Integer goalOverridePercent
    ) {
        validateName(name);
        validateEmoji(emoji);
        validatePriority(priority);
        validateGoalOverride(goalOverridePercent);

        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistItem item = itemRepository.findByIdAndUserId(itemId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist item not found: " + itemId));
        if (item.isDeleted()) {
            throw new InvalidRequestException("A deleted checklist item cannot be modified");
        }

        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        if (effectiveFrom.isBefore(today)) {
            throw new InvalidRequestException("Effective date must not be in the past");
        }

        if (active && effectiveFrom.equals(today)) {
            boolean alreadyActiveToday = versionAsOf(itemId, today).map(ChecklistItemVersion::isActive).orElse(false);
            if (!alreadyActiveToday && countCurrentActive(userId, itemId) >= MAX_ACTIVE_ITEMS) {
                throw new InvalidRequestException("At most " + MAX_ACTIVE_ITEMS + " checklist items can be active at once");
            }
        }

        Optional<ChecklistItemVersion> existing = versionRepository.findByItemIdAndEffectiveFrom(itemId, effectiveFrom);
        if (existing.isPresent()) {
            existing.get().update(name.trim(), emoji, priority, active, goalOverridePercent);
            return versionRepository.save(existing.get());
        }
        return versionRepository.save(new ChecklistItemVersion(itemId, effectiveFrom, name.trim(), emoji, priority, active, goalOverridePercent));
    }

    /** Only a version that has not begun applying yet may be deleted. */
    @Transactional
    public void deleteFutureVersion(UUID itemId, UUID versionId) {
        UUID userId = currentUserProvider.getCurrentUserId();
        itemRepository.findByIdAndUserId(itemId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist item not found: " + itemId));

        ChecklistItemVersion version = versionRepository.findById(versionId)
                .filter(v -> v.getItemId().equals(itemId))
                .orElseThrow(() -> new ResourceNotFoundException("Checklist item version not found: " + versionId));

        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        if (!version.getEffectiveFrom().isAfter(today)) {
            throw new InvalidRequestException("Only a version that has not begun applying yet can be deleted");
        }
        versionRepository.delete(version);
    }

    /** Irreversible tombstone — historical checklist_daily_entries rows
     *  referencing this item are preserved untouched. */
    @Transactional
    public void softDelete(UUID itemId) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistItem item = itemRepository.findByIdAndUserId(itemId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist item not found: " + itemId));
        if (item.isDeleted()) {
            return;
        }
        item.softDelete(OffsetDateTime.now(AppTimeZone.ZONE));
        itemRepository.save(item);
    }

    @Transactional
    public void reorder(UUID categoryId, List<UUID> orderedIds) {
        if (orderedIds == null || orderedIds.isEmpty()) {
            throw new InvalidRequestException("orderedIds must not be empty");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        List<ChecklistItem> siblings = categoryId == null
                ? itemRepository.findByUserIdAndCategoryIdIsNull(userId)
                : itemRepository.findByUserIdAndCategoryId(userId, categoryId);
        siblings = siblings.stream().filter(i -> !i.isDeleted()).toList();

        Map<UUID, ChecklistItem> byId = siblings.stream().collect(Collectors.toMap(ChecklistItem::getId, i -> i));
        if (orderedIds.size() != byId.size() || !byId.keySet().containsAll(orderedIds)) {
            throw new InvalidRequestException("orderedIds must contain exactly the current sibling set");
        }
        for (int i = 0; i < orderedIds.size(); i++) {
            byId.get(orderedIds.get(i)).reorder(i);
        }
        itemRepository.saveAll(byId.values());
    }

    @Transactional
    public ChecklistItem moveToCategory(UUID itemId, UUID newCategoryId) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistItem item = itemRepository.findByIdAndUserId(itemId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist item not found: " + itemId));

        if (newCategoryId != null) {
            categoryRepository.findByIdAndUserId(newCategoryId, userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Checklist category not found: " + newCategoryId));
        }

        int nextPosition = (int) (newCategoryId == null
                ? itemRepository.countByUserIdAndCategoryIdIsNull(userId)
                : itemRepository.countByUserIdAndCategoryId(userId, newCategoryId));
        item.moveToCategory(newCategoryId, nextPosition);
        return itemRepository.save(item);
    }

    /** Active count as of today, excluding one item (used when evaluating
     *  whether activating/keeping that same item active would exceed the
     *  limit). Pass {@code null} to count every active item. */
    private int countCurrentActive(UUID userId, UUID excludeItemId) {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        List<ChecklistItem> items = itemRepository.findByUserIdAndDeletedAtIsNull(userId);
        int count = 0;
        for (ChecklistItem item : items) {
            if (excludeItemId != null && item.getId().equals(excludeItemId)) {
                continue;
            }
            boolean active = versionAsOf(item.getId(), today).map(ChecklistItemVersion::isActive).orElse(false);
            if (active) {
                count++;
            }
        }
        return count;
    }

    private void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Checklist item name must not be blank");
        }
    }

    private void validateEmoji(String emoji) {
        if (emoji == null || emoji.isBlank()) {
            throw new InvalidRequestException("An emoji is required");
        }
    }

    private void validatePriority(ChecklistPriority priority) {
        if (priority == null) {
            throw new InvalidRequestException("Priority (CORE or SECONDARY) is required");
        }
    }

    private void validateGoalOverride(Integer goalOverridePercent) {
        if (goalOverridePercent != null && (goalOverridePercent < 0 || goalOverridePercent > 100)) {
            throw new InvalidRequestException("Goal override must be between 0 and 100");
        }
    }
}
