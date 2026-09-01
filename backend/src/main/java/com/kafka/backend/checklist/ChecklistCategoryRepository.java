package com.kafka.backend.checklist;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChecklistCategoryRepository extends JpaRepository<ChecklistCategory, UUID> {

    List<ChecklistCategory> findByUserIdOrderByPositionAscNameAsc(UUID userId);

    Optional<ChecklistCategory> findByIdAndUserId(UUID id, UUID userId);
}
