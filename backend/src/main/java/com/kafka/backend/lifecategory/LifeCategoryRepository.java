package com.kafka.backend.lifecategory;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LifeCategoryRepository extends JpaRepository<LifeCategory, UUID> {

    List<LifeCategory> findByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<LifeCategory> findByIdAndUserId(UUID id, UUID userId);

    Optional<LifeCategory> findByUserIdAndIsDefaultTrue(UUID userId);
}
