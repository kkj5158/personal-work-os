package com.kafka.backend.checklist;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ChecklistCategoryService {

    private final ChecklistCategoryRepository repository;
    private final ChecklistItemRepository itemRepository;
    private final CurrentUserProvider currentUserProvider;

    public ChecklistCategoryService(
            ChecklistCategoryRepository repository,
            ChecklistItemRepository itemRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.repository = repository;
        this.itemRepository = itemRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<ChecklistCategory> list() {
        return repository.findByUserIdOrderByPositionAscNameAsc(currentUserProvider.getCurrentUserId());
    }

    public ChecklistCategory create(String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Category name must not be blank");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        int nextPosition = repository.findByUserIdOrderByPositionAscNameAsc(userId).size();
        return repository.save(new ChecklistCategory(userId, name.trim(), nextPosition));
    }

    public ChecklistCategory rename(UUID id, String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Category name must not be blank");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistCategory category = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist category not found: " + id));
        category.rename(name.trim());
        return repository.save(category);
    }

    @Transactional
    public void reorder(List<UUID> orderedIds) {
        if (orderedIds == null || orderedIds.isEmpty()) {
            throw new InvalidRequestException("orderedIds must not be empty");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        List<ChecklistCategory> current = repository.findByUserIdOrderByPositionAscNameAsc(userId);
        Map<UUID, ChecklistCategory> byId = current.stream().collect(Collectors.toMap(ChecklistCategory::getId, c -> c));

        if (orderedIds.size() != byId.size() || !byId.keySet().containsAll(orderedIds)) {
            throw new InvalidRequestException("orderedIds must contain exactly the current category set");
        }
        for (int i = 0; i < orderedIds.size(); i++) {
            byId.get(orderedIds.get(i)).reorder(i);
        }
        repository.saveAll(byId.values());
    }

    /**
     * Deletes only the category itself — its items are moved to
     * "Uncategorized" ({@code categoryId = null}), never deleted. The
     * caller (frontend) is responsible for confirming this with the user
     * first when the category still has items.
     */
    @Transactional
    public void delete(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistCategory category = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist category not found: " + id));

        List<ChecklistItem> items = itemRepository.findByUserIdAndCategoryId(userId, id);
        for (ChecklistItem item : items) {
            item.setCategoryId(null);
        }
        itemRepository.saveAll(items);
        repository.delete(category);
    }
}
