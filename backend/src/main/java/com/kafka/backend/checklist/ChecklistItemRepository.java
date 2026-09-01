package com.kafka.backend.checklist;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, UUID> {

    Optional<ChecklistItem> findByIdAndUserId(UUID id, UUID userId);

    List<ChecklistItem> findByUserIdAndDeletedAtIsNull(UUID userId);

    List<ChecklistItem> findByUserIdAndDeletedAtIsNullOrderByPositionAsc(UUID userId);

    List<ChecklistItem> findByUserId(UUID userId);

    List<ChecklistItem> findByUserIdAndCategoryId(UUID userId, UUID categoryId);

    List<ChecklistItem> findByUserIdAndCategoryIdIsNull(UUID userId);

    long countByUserIdAndCategoryId(UUID userId, UUID categoryId);

    long countByUserIdAndCategoryIdIsNull(UUID userId);

    long countByUserIdAndDeletedAtIsNull(UUID userId);
}
