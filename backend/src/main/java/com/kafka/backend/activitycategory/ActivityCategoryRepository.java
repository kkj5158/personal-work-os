package com.kafka.backend.activitycategory;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ActivityCategoryRepository extends JpaRepository<ActivityCategory, UUID> {

    List<ActivityCategory> findByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<ActivityCategory> findByIdAndUserId(UUID id, UUID userId);
}
