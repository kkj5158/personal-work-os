package com.kafka.backend.activitycategory;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class ActivityCategoryService {

    private final ActivityCategoryRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public ActivityCategoryService(ActivityCategoryRepository repository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    public List<ActivityCategory> list() {
        return repository.findByUserIdOrderBySortOrderAscNameAsc(currentUserProvider.getCurrentUserId());
    }

    public ActivityCategory create(String name, UUID parentId) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Category name must not be blank");
        }

        UUID userId = currentUserProvider.getCurrentUserId();

        if (parentId != null) {
            ActivityCategory parent = repository.findByIdAndUserId(parentId, userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Parent category not found: " + parentId));

            if (parent.getParentId() != null) {
                throw new InvalidRequestException(
                        "Category depth cannot exceed 2 levels; '" + parent.getName() + "' is already a child category"
                );
            }
        }

        return repository.save(new ActivityCategory(userId, name.trim(), parentId));
    }
}
