package com.kafka.backend.activitycategory;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ActivityCategoryRepository extends JpaRepository<ActivityCategory, UUID> {

    List<ActivityCategory> findByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<ActivityCategory> findByIdAndUserId(UUID id, UUID userId);

    /** Scoped strictly to one user and one parent — never used to look up
     *  another user's or another parent's default. */
    Optional<ActivityCategory> findByUserIdAndParentIdAndIsDefaultTrue(UUID userId, UUID parentId);

    /** Used by deletion: a root with at least one remaining child (active or
     *  inactive) must never be physically deleted. */
    boolean existsByUserIdAndParentId(UUID userId, UUID parentId);

    /** Sibling scope for reorder/move — top-level categories (no parent). */
    List<ActivityCategory> findByUserIdAndParentIdIsNull(UUID userId);

    /** Sibling scope for reorder/move — children of one specific parent. */
    List<ActivityCategory> findByUserIdAndParentId(UUID userId, UUID parentId);
}
